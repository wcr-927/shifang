import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleService } from "../../electron/services/RuleService.ts";
import { AnalysisService } from "../../electron/services/AnalysisService.ts";
import { analyzePoemRequestSchema } from "../../src/shared/ipc.ts";
import type { PoemReadingOverride } from "../../src/poetry/analysis/poemAnalyzer.ts";

const service = new AnalysisService(new RuleService(`${process.cwd()}/src/rules`));
function analyze(lines: string[], overrides: PoemReadingOverride[] = [], genre: "wujue" | "wulv" = "wujue") {
  return service.analyze(analyzePoemRequestSchema.parse({ requestId: "rhyme-safety", text: lines.join("\n"), editorLines: lines, templateId: genre, variantId: "zeqi-first-unrhymed", overrides }));
}
const cases = [
  { name: "only one required rhyme exists", lines: ["", "黄河入海流", "", ""], status: "missing", missing: [3] },
  { name: "last rhyme is missing", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", ""], status: "missing", missing: [3] },
  { name: "partial last line is not a finished rhyme foot", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上"], status: "missing", missing: [3] },
  { name: "overlong filled slot has an unknown foot rather than a missing line", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼，又上一层山。"], status: "unknown", missing: [] },
  { name: "unknown Han at rhyme position", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层𫠡"], status: "unknown", missing: [] },
  { name: "ambiguous rhyme cannot become a definite group conflict", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层行"], status: "ambiguous", missing: [] },
  { name: "two certain compatible rhymes", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"], status: "compatible", missing: [] },
  { name: "two certain incompatible rhymes", lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层山"], status: "mismatch", missing: [] },
];
for (const item of cases) {
  test(`rhyme evidence: ${item.name}`, () => {
    const result = analyze(item.lines);
    assert.equal(result.rhyme.status, item.status);
    assert.deepEqual(result.rhyme.missingLineIndexes, item.missing);
    assert.equal(result.issues.some((issue) => issue.code === "RHYME_GROUP"), item.status === "mismatch");
    if (item.status === "missing") assert.equal(result.status, "incomplete");
  });
}

test("complete fixed-slot poem retains correct normal metre and rhyme result", () => {
  const lines = ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"];
  const result = analyze(lines, [{ lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing", sourceText: lines[3], sourceOffset: 0 }]);
  assert.equal(result.status, "valid"); assert.equal(result.rhyme.status, "compatible");
  assert.deepEqual(result.rhyme.commonGroupIds, ["ping-11you"]);
  assert.equal(result.rhyme.evidence.feasibility, "common");
  assert.equal(result.scope.complete, true);
  assert.equal(result.requestId, "rhyme-safety");
});

test("an unfinished lushi still reports a genuinely confirmed incompatible pair", () => {
  const result = analyze(["", "黄河入海流", "", "春风入远山", "", "", "", ""], [], "wulv");
  assert.equal(result.status, "incomplete");
  assert.equal(result.rhyme.status, "mismatch");
  assert.deepEqual(result.rhyme.missingLineIndexes, [5, 7]);
  assert.ok(result.issues.some((issue) => issue.code === "RHYME_GROUP"));
});

test("analysis IPC schema preserves source anchors and ignores an expired candidate individually", () => {
  const lines = ["行风入夜深", "行风入夜深", "", ""];
  const overrides = [0, 1].map((lineIndex) => ({ lineIndex, characterIndex: 0, character: "行", candidateId: lineIndex === 0 ? "expired" : "行:qu-24jing", sourceText: lines[lineIndex], sourceOffset: 0 }));
  const result = analyze(lines, overrides);
  assert.equal(result.ignoredOverrideCount, 1);
  assert.equal(result.lines[0].characters[0].reading.source, "unresolved");
  assert.equal(result.lines[1].characters[0].reading.source, "user-override");
});

test("same Han and index cannot revive an override whose full source line changed", () => {
  const result = analyze(["行云入夜深", "", "", ""], [{ lineIndex: 0, characterIndex: 0, character: "行", candidateId: "行:qu-24jing", sourceText: "行风入夜深", sourceOffset: 0 }]);
  assert.equal(result.ignoredOverrideCount, 1);
  assert.equal(result.lines[0].characters[0].reading.source, "unresolved");
});
