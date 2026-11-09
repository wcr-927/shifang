import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  analyzePoem,
  normalizePoemText,
  type MetreDataset,
} from "../../src/poetry/analysis/poemAnalyzer.ts";
import type {
  PingzeDataset,
  ReadingRulesDataset,
} from "../../src/poetry/analysis/readingResolver.ts";

const load = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const metre = load<MetreDataset>("src/rules/metre.json");
const pingze = load<PingzeDataset>("src/rules/pingze.json");
const readingRules = load<ReadingRulesDataset>("src/rules/reading_rules.json");

const DENG_GUAN_QUE_LOU = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";

test("normalizes punctuation, newlines, whitespace and bracketed annotations", () => {
  assert.deepEqual(
    normalizePoemText("白日依山尽（仄韵）\n黄河 入海流；欲穷千里目，更上一层楼。"),
    ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"].map((text, index) => ({
      index,
      text,
      characters: Array.from(text),
    })),
  );
});

test("recognizes the Wang Li form of 登鹳雀楼 and becomes valid after reading confirmation", () => {
  const result = analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
    templateId: "wujue",
    overrides: [
      { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
    ],
  });
  assert.equal(result.variantId, "zeqi-first-unrhymed");
  assert.equal(result.status, "valid");
  assert.equal(result.rhyme.status, "compatible");
  assert.deepEqual(result.rhyme.commonGroupIds, ["ping-11you"]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.summary.confirmedCompliancePercent, 100);
  assert.equal(result.summary.resolutionCoveragePercent, 100);
  assert.ok(result.relations.every((relation) => relation.status === "match"));
});

test("accepts every configured MVP variant with fully resolved synthetic tones", () => {
  for (const template of metre.templates) {
    for (const variant of template.variants) {
      const poem = variant.patterns
        .map((pattern) => Array.from(pattern, (tone) => (tone === "平" ? "春" : "夜")).join(""))
        .join("，");
      const result = analyzePoem(poem, metre, pingze, readingRules, {
        templateId: template.id,
        variantId: variant.id,
      });
      assert.equal(result.status, "valid", `${template.id}/${variant.id}`);
      assert.equal(result.rhyme.status, "compatible", `${template.id}/${variant.id}`);
      assert.ok(result.lines.every((line) => line.toneStatus === "match"));
      assert.ok(result.relations.every((relation) => relation.status === "match"));
    }
  }
});

test("ranks the expected forms first for Wang Li book examples", () => {
  const examples = [
    {
      templateId: "qijue",
      expected: "pingqi-first-rhymed",
      text: "朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。",
    },
    {
      templateId: "wulv",
      expected: "pingqi-first-unrhymed",
      text: "空山新雨后，天气晚来秋。明月松间照，清泉石上流。竹喧归浣女，莲动下渔舟。随意春芳歇，王孙自可留。",
    },
    {
      templateId: "qilv",
      expected: "pingqi-first-rhymed",
      text: "孤山寺北贾亭西，水面初平云脚低。几处早莺争暖树，谁家新燕啄春泥。乱花渐欲迷人眼，浅草才能没马蹄。最爱湖东行不足，绿杨阴里白沙堤。",
    },
  ];
  for (const example of examples) {
    const result = analyzePoem(example.text, metre, pingze, readingRules, {
      templateId: example.templateId,
    });
    assert.equal(result.variantRanking[0].variantId, example.expected);
  }
});

test("keeps source-attested unmodeled seven-character lines out of hard-conflict claims without freeing every fifth position", () => {
  const lines = [
    "风急天高猿啸哀",
    "渚清沙白鸟飞回",
    "无边落木萧萧下",
    "不尽长江滚滚来",
    "万里悲秋常作客",
    "百年多病独登台",
    "艰难苦恨繁霜鬓",
    "潦倒新停浊酒杯",
  ];
  const result = analyzePoem(lines.join("\n"), metre, pingze, readingRules, { templateId: "qilv" });
  assert.equal(result.variantId, "zeqi-first-rhymed");
  assert.notEqual(result.status, "invalid");
  assert.ok(result.issues.some(issue => issue.code === "RULE_SCOPE_UNMODELED" && issue.lineIndex === 0 && issue.characterIndex === 4));
  assert.equal(result.issues.some(issue => issue.code === "TONE_MISMATCH" && issue.lineIndex === 0 && issue.characterIndex === 4), false);
  assert.equal(result.issues.some(issue => issue.code === "READING_UNRESOLVED" && issue.lineIndex === 6 && issue.characterIndex === 1), false);
  assert.equal(result.summary.confirmedMismatches, 0);

  const strictMismatch = [...lines];
  strictMismatch[0] = "风急天夜猿啸哀";
  const invalid = analyzePoem(strictMismatch.join("\n"), metre, pingze, readingRules, { templateId: "qilv" });
  assert.equal(invalid.status, "invalid");
  assert.ok(invalid.issues.some(issue => issue.code === "TONE_MISMATCH" && issue.lineIndex === 0 && issue.characterIndex === 3));

  const unrelatedFifthMismatch = analyzePoem("春春夜夜夜春夜", metre, pingze, readingRules, {
    templateId: "qijue",
    variantId: "pingqi-first-unrhymed",
  });
  assert.equal(unrelatedFifthMismatch.status, "incomplete");
  assert.ok(unrelatedFifthMismatch.issues.some(issue => issue.code === "TONE_MISMATCH" && issue.characterIndex === 4));
  assert.equal(unrelatedFifthMismatch.issues.some(issue => issue.code === "RULE_SCOPE_UNMODELED"), false);
});

test("does not guess the unresolved reading of 更", () => {
  const result = analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
  });
  assert.equal(result.status, "valid");
  assert.equal(result.lines[3].characters[0].reading.status, "ambiguous");
  assert.equal(result.lines[3].characters[0].reading.selectedCandidate, null);
  assert.equal(result.lines[3].characters[0].readingConfirmation, "optional");
  assert.equal(
    result.issues.some(
      (issue) =>
        issue.code === "READING_UNRESOLVED" && issue.lineIndex === 3 && issue.characterIndex === 0,
    ), false,
  );
  assert.equal(result.lines[3].isolatedPing.status, "clear");
});

test("reports rhyme-group mismatch independently of tone pattern", () => {
  const result = analyzePoem(
    "白日依山尽，黄河入海流。欲穷千里目，更上一层山。",
    metre,
    pingze,
    readingRules,
    {
      templateId: "wujue",
      variantId: "zeqi-first-unrhymed",
      overrides: [
        { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
      ],
    },
  );
  assert.equal(result.rhyme.status, "mismatch");
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((issue) => issue.code === "RHYME_GROUP"));
});

test("keeps a cross-tone rhyme foot uncertain even with one possible ping rhyme group", () => {
  const result = analyzePoem(
    "朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。",
    metre,
    pingze,
    readingRules,
    { templateId: "qijue", variantId: "pingqi-first-rhymed" },
  );
  assert.equal(result.rhyme.status, "ambiguous");
  assert.equal(result.rhyme.feet[0].selectedGroupId, null);
  assert.equal(result.rhyme.feet[0].toneStatus, "uncertain");
});

test("detects the Wang Li isolated-ping core but not the standard 仄仄仄平平 line", () => {
  const isolated = analyzePoem("晚风入夜深", metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
    overrides: [
      { lineIndex: 0, characterIndex: 4, character: "深", candidateId: "深:ping-12qin" },
    ],
  });
  assert.equal(isolated.lines[0].isolatedPing.status, "detected");
  assert.ok(isolated.issues.some((issue) => issue.code === "ISOLATED_PING"));

  const standard = analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
    overrides: [
      { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
    ],
  });
  assert.equal(standard.lines[3].isolatedPing.status, "clear");
});

test("detects a three-ping tail", () => {
  const result = analyzePoem("晚夜山河春", metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
  });
  assert.equal(result.lines[0].triplePingTail.status, "detected");
  assert.ok(result.issues.some((issue) => issue.code === "TRIPLE_PING_TAIL"));
});

test("checks dui and nian explicitly for jueju", () => {
  const result = analyzePoem(
    "白日依山尽，黄日入海流。欲穷千里目，更上一层楼。",
    metre,
    pingze,
    readingRules,
    {
      templateId: "wujue",
      variantId: "zeqi-first-unrhymed",
      overrides: [
        { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
      ],
    },
  );
  assert.ok(
    result.relations.some(
      (relation) => relation.kind === "dui" && relation.leftLineIndex === 0 && relation.status === "mismatch",
    ),
  );
  assert.ok(result.issues.some((issue) => issue.code === "DUI_MISMATCH"));

  const nianResult = analyzePoem(
    "白日依山尽，黄河入海流。欲日千里目，更上一层楼。",
    metre,
    pingze,
    readingRules,
    {
      templateId: "wujue",
      variantId: "zeqi-first-unrhymed",
      overrides: [
        { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
      ],
    },
  );
  assert.ok(nianResult.relations.some((relation) => relation.kind === "nian" && relation.status === "mismatch"));
  assert.ok(nianResult.issues.some((issue) => issue.code === "NIAN_MISMATCH"));
});

test("reports a non-ping rhyme foot", () => {
  const result = analyzePoem(
    "白日依山尽，黄河入海流。欲穷千里目，更上一层夜。",
    metre,
    pingze,
    readingRules,
    {
      templateId: "wujue",
      variantId: "zeqi-first-unrhymed",
      overrides: [
        { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
      ],
    },
  );
  assert.equal(result.rhyme.feet[1].toneStatus, "mismatch");
  assert.ok(result.issues.some((issue) => issue.code === "RHYME_TONE"));
});

test("returns incomplete structural analysis for unfinished drafts", () => {
  const result = analyzePoem("秋风吹入小楼深", metre, pingze, readingRules, {
    templateId: "qijue",
  });
  assert.equal(result.status, "incomplete");
  assert.ok(result.issues.some((issue) => issue.code === "LINE_COUNT"));
});

test("returns invalid rather than incomplete when structure exceeds the template", () => {
  const result = analyzePoem(
    "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。春春春春春。",
    metre,
    pingze,
    readingRules,
    { templateId: "wujue", variantId: "zeqi-first-unrhymed" },
  );
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((issue) => issue.code === "LINE_COUNT"));
});

test("reports unsupported non-Han content instead of silently swallowing it", () => {
  const result = analyzePoem("白日依山尽A，黄河入海流。欲穷千里目，更上一层楼。", metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
  });
  assert.ok(result.issues.some((issue) => issue.code === "UNSUPPORTED_INPUT"));
  assert.equal(result.normalizedLines[0].text, "白日依山尽");
});

test("keeps an unknown Han character visible in analysis", () => {
  const result = analyzePoem("𠀀日依山尽", metre, pingze, readingRules, {
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
  });
  assert.equal(result.lines[0].characters[0].status, "unknown");
  assert.equal(result.lines[0].characters[0].reading.source, "unknown-character");
});

test("rejects unknown templates and variants", () => {
  assert.throws(
    () => analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, { templateId: "unknown" }),
    /unknown metre template/,
  );
  assert.throws(
    () =>
      analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
        templateId: "wujue",
        variantId: "unknown",
      }),
    /unknown metre variant/,
  );
});

test("validates poem-level override coordinates and duplicates", () => {
  assert.throws(
    () =>
      analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
        templateId: "wujue",
        overrides: [{ lineIndex: -1, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" }],
      }),
    /coordinates must be non-negative integers/,
  );
  assert.throws(
    () =>
      analyzePoem(DENG_GUAN_QUE_LOU, metre, pingze, readingRules, {
        templateId: "wujue",
        overrides: [
          { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
          { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:ping-08geng" },
        ],
      }),
    /duplicate poem reading override/,
  );
});

test("Wang Li special lvju admits classic five- and seven-character lines with mandatory core first ping", () => {
  const cases = [
    { templateId: "wulv", text: "渡远荆门外，来从楚国游。山随平野尽，江入大荒流。月下飞天镜，云生结海楼。仍怜故乡水，万里送行舟。", line: 6 },
    { templateId: "qilv", text: "夫因兵死守蓬茅，麻苎衣衫鬓发焦。桑柘废来犹纳税，田园荒尽尚征苗。时挑野菜和根煮，旋斫生柴带叶烧。任是深山更深处，也应无计避征徭。", line: 6 },
  ];
  for (const item of cases) {
    const overrides = item.templateId === "qilv" ? [
      { lineIndex: 6, characterIndex: 2, character: "深", candidateId: "深:ping-12qin" },
      { lineIndex: 6, characterIndex: 4, character: "更", candidateId: "更:qu-24jing" },
      { lineIndex: 6, characterIndex: 5, character: "深", candidateId: "深:ping-12qin" },
    ] : [];
    const result = analyzePoem(item.text, metre, pingze, readingRules, { templateId: item.templateId, overrides });
    assert.equal(result.lines[item.line].metreAdjustment?.rule, "special-lvju");
    assert.equal(result.lines[item.line].metreAdjustment?.status, "confirmed");
    assert.equal(result.lines[item.line].toneStatus, "match");
    const normalized = normalizePoemText(item.text).map(line => line.text);
    const chars = [...normalized[item.line]];
    chars[chars.length - 5] = "夜";
    normalized[item.line] = chars.join("");
    const broken = analyzePoem(normalized.join("，"), metre, pingze, readingRules, { templateId: item.templateId, variantId: result.variantId, overrides });
    assert.equal(broken.lines[item.line].metreAdjustment, undefined);
    assert.ok(broken.issues.some(issue => issue.lineIndex === item.line && issue.code === "TONE_MISMATCH"));
  }
});

test("Wang Li isolated-ping self rescue accepts 月光明素盘 and rejects lost rescue", () => {
  const poem = "我宿五松下，寂寥无所欢。田家秋作苦，邻女夜舂寒。跪进雕胡饭，月光明素盘。令人惭漂母，三谢不能餐。";
  const options = { templateId: "wulv", variantId: "zeqi-first-unrhymed" };
  const result = analyzePoem(poem, metre, pingze, readingRules, options);
  assert.equal(result.lines[5].metreAdjustment?.rule, "isolated-ping-self-rescue");
  assert.equal(result.lines[5].metreAdjustment?.status, "confirmed");
  assert.equal(result.lines[5].toneStatus, "match");
  assert.equal(result.lines[5].isolatedPing.status, "clear");
  const broken = analyzePoem(poem.replace("月光明素盘", "月光夜素盘"), metre, pingze, readingRules, options);
  assert.equal(broken.lines[5].metreAdjustment, undefined);
  assert.ok(broken.issues.some(issue => issue.lineIndex === 5 && issue.code === "ISOLATED_PING"));
});

test("local metre rules never choose a reading to certify their own preconditions", () => {
  const options = { templateId: "wujue", variantId: "pingqi-first-unrhymed" };
  const result = analyzePoem("长春夜春夜，夜夜夜春春。夜夜春春夜，春春夜夜春。", metre, pingze, readingRules, options);
  assert.equal(result.lines[0].metreAdjustment?.status, "possible");
  assert.equal(result.lines[0].toneStatus, "uncertain");
  assert.equal(result.lines[0].characters[0].readingConfirmation, "required");
  assert.equal(result.lines[0].characters[0].reading.selectedCandidate, null);
  assert.equal(result.issues.some(issue => issue.lineIndex === 0 && issue.code === "TONE_MISMATCH"), false);
  const unknown = analyzePoem("龘春夜春夜，夜夜夜春春。夜夜春春夜，春春夜夜春。", metre, { ...pingze, characters: { ...pingze.characters, 龘: undefined } } as unknown as PingzeDataset, readingRules, options);
  assert.equal(unknown.lines[0].metreAdjustment?.status, "possible");
  assert.notEqual(unknown.lines[0].toneStatus, "match");
});

test("seven-character self rescue is conditional and retains the prefix and rhyme-foot requirements", () => {
  const text = "一上高楼万里愁，蒹葭杨柳似汀洲。溪云初起日沉阁，山雨欲来风满楼。鸟下绿芜秦苑夕，蝉鸣黄叶汉宫秋。行人莫问当年事，故国东来渭水流。";
  const options = { templateId: "qilv", variantId: "zeqi-first-rhymed" };
  const result = analyzePoem(text, metre, pingze, readingRules, options);
  assert.equal(result.lines[3].metreAdjustment?.status, "confirmed");
  assert.equal(result.lines[3].metreAdjustment?.rule, "isolated-ping-self-rescue");
  assert.equal(result.lines[3].toneStatus, "match");
  for (const replacement of ["山雨欲来夜满楼", "山春欲来风满楼", "山雨欲来风满夜"]) {
    const broken = analyzePoem(text.replace("山雨欲来风满楼", replacement), metre, pingze, readingRules, options);
    assert.ok(broken.issues.some(issue => issue.lineIndex === 3 && issue.severity === "error"));
  }
});

test("possible local metre rules report their premise separately from known character readings", () => {
  const result = analyzePoem("长春夜春夜，夜夜夜春春。夜夜春春夜，春春夜夜春。", metre, pingze, readingRules,
    { templateId: "wujue", variantId: "pingqi-first-unrhymed" });
  assert.equal(result.lines[0].metreAdjustment?.status, "possible");
  assert.equal(result.lines[0].characters[0].readingConfirmation, "required");
  for (const index of [2, 3]) {
    assert.equal(result.lines[0].characters[index].actualTones.length, 1);
    assert.notEqual(result.lines[0].characters[index].readingConfirmation, "required");
    assert.ok(!result.issues.some(issue => issue.lineIndex === 0 && issue.characterIndex === index && issue.code === "READING_UNRESOLVED"));
  }
  assert.ok(result.issues.some(issue => issue.lineIndex === 0 && issue.code === "RULE_PRECONDITION_UNRESOLVED"));
  assert.ok(result.issues.some(issue => issue.lineIndex === 0 && issue.characterIndex === 0 && issue.code === "READING_UNRESOLVED"));
  assert.equal(result.status, "needs-confirmation");
});
