import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleService } from "../../electron/services/RuleService.ts";
import { analyzePoem } from "../../src/poetry/analysis/poemAnalyzer.ts";
import { editorLineCharacters } from "../../src/poetry/analysis/editorCoordinates.ts";
import { ciToneMarkers, metreToneMarkers } from "../../src/features/editor/toneMarkers.ts";
import { analyzeCi, rhymeVersion } from "../../src/ci/analyze.ts";
import { ciForms } from "../../src/ci/catalogue.ts";

const bundle = new RuleService(`${process.cwd()}/src/rules`).load();
function analyze(source: string) {
  return analyzePoem(source, bundle.metre, bundle.pingze, bundle.readingRules, {
    templateId: "wujue", variantId: "zeqi-first-unrhymed", editorLines: [source, "", "", ""],
  }).lines[0];
}

test("historical entering tone stays ze in the expected-only marker", () => {
  const line = analyze("白日依山尽");
  assert.deepEqual(line.characters[0].actualTones, ["ze"]);
  const markers = metreToneMarkers("白日依山尽", line, line.expectedPattern);
  assert.equal(markers[0].expected, "中");
  assert.equal(markers[0].state, "match");
  assert.equal(markers[0].kind, "tone");
});

test("punctuation, annotations, whitespace and supplementary Han map back to UTF-16 source", () => {
  const source = "  白，（注𠀀）日 𠀀山尽。 ";
  const line = analyze(source);
  const markers = metreToneMarkers(source, line, line.expectedPattern);
  assert.deepEqual(markers.map(item => source.slice(item.start, item.end)), ["白", "日", "𠀀", "山", "尽"]);
  assert.deepEqual(markers.map(item => item.start), editorLineCharacters(source).map(item => item.sourceOffset));
  assert.equal(markers[2].end - markers[2].start, 2);
  assert.equal(markers[2].state, "uncovered");
});

test("missing slots retain the expected requirement and distinct array positions", () => {
  const source = "春， ", markers = metreToneMarkers(source, null, "仄仄平平仄");
  assert.equal(markers.length, 5);
  assert.equal(markers[0].state, "pending");
  assert.deepEqual(markers.slice(1).map(item => [item.start, item.end, item.expected, item.state]), [
    [source.length, source.length, "仄", "empty"], [source.length, source.length, "平", "empty"],
    [source.length, source.length, "平", "empty"], [source.length, source.length, "仄", "empty"],
  ]);
});

test("stale analyzed text, offsets and format only retain expected requirements", () => {
  const line = analyze("白日依山尽");
  for (const markers of [
    metreToneMarkers("春日依山尽", line, line.expectedPattern),
    metreToneMarkers(" 白日依山尽", line, line.expectedPattern),
    metreToneMarkers("白日依山尽", line, "平平仄仄平"),
  ]) assert.ok(markers.every(item => item.state === "pending"));
});

test("line-level tone and structural risks never color individual tone markers", () => {
  const line = analyze("白日依山尽"), original = metreToneMarkers("白日依山尽", line, line.expectedPattern);
  const changed = { ...line, toneStatus: "mismatch" as const, isolatedPing: { status: "detected" as const, evidence: ["句级问题"] } };
  assert.deepEqual(metreToneMarkers("白日依山尽", changed, line.expectedPattern), original);
});

test("unmodeled positions and ambiguous readings do not claim a confirmed conflict", () => {
  const line = analyze("白日依山尽");
  line.characters[0] = { ...line.characters[0], ruleCoverage: "unmodeled-special-position", status: "mismatch" };
  line.characters[1] = { ...line.characters[1], status: "uncertain", actualTones: ["ping", "ze"] };
  const markers = metreToneMarkers(line.text, line, line.expectedPattern);
  assert.equal(markers[0].state, "uncovered");
  assert.equal(markers[1].state, "pending");
});

test("ci markers use engine source offsets and ignore rhyme and sentence issues", () => {
  const form = ciForms.find(item => item.name === "浣溪沙")!, source = "  山，𠀀月";
  const analysis = analyzeCi(source, form, { formId: form.id, version: form.version, rhymeVersion, choices: [] });
  const before = ciToneMarkers(source, form.lines[0].pattern, analysis, 0);
  assert.deepEqual(before.slice(0, 3).map(item => source.slice(item.start, item.end)), ["山", "𠀀", "月"]);
  assert.equal(before[1].end - before[1].start, 2);
  const changed = { ...analysis, issues: [...analysis.issues, { kind: "conflict" as const, line: 0, message: "韵脚不同部" }] };
  assert.deepEqual(ciToneMarkers(source, form.lines[0].pattern, changed, 0), before);
  assert.ok(ciToneMarkers("春，𠀀月", form.lines[0].pattern, analysis, 0).slice(0, 3).every(item => item.state === "pending"));
});


test("confirmed local metre rules display their effective requirements and stale lines retain template fallback", () => {
  for (const [source, variantId, effective] of [
    ["仍怜故乡水", "pingqi-first-unrhymed", "平平仄平仄"],
    ["月光明素盘", "pingqi-first-rhymed", "仄平平仄平"],
  ]) {
    const line = analyzePoem(source, bundle.metre, bundle.pingze, bundle.readingRules, {
      templateId: "wujue", variantId, editorLines: [source, "", "", ""],
    }).lines[0];
    assert.equal(line.metreAdjustment?.status, "confirmed");
    const markers = metreToneMarkers(source, line, line.expectedPattern, [0]);
    assert.equal(markers.map(item => item.expected).join(""), effective);
    assert.ok(markers.every(item => item.state === "match"));
    assert.ok(markers.every((item, index) => item.message.includes(`预期${effective[index]}`)));
    const stale = metreToneMarkers(` ${source}`, line, line.expectedPattern, [0]);
    assert.equal(stale.map(item => item.expected).join(""), "中" + line.expectedPattern.slice(1));
    assert.ok(stale.every(item => item.state === "pending"));
  }
});

test("possible local metre rules keep the regular requirements and never choose a reading", () => {
  const source = "长春夜春夜";
  const line = analyzePoem(source, bundle.metre, bundle.pingze, bundle.readingRules, {
    templateId: "wujue", variantId: "pingqi-first-unrhymed", editorLines: [source, "", "", ""],
  }).lines[0];
  assert.equal(line.metreAdjustment?.status, "possible");
  const markers = metreToneMarkers(source, line, line.expectedPattern, [0]);
  assert.equal(markers.map(item => item.expected).join(""), "中平平仄仄");
  assert.equal(markers[0].state, "pending");
  assert.equal(line.characters[0].reading.selectedCandidate, null);
});
