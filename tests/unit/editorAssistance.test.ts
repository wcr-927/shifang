import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreOverrides, describeRestoreReasons } from "../../src/features/editor/editorAssistance.ts";
const lines = ["更上一层楼", "黄河入海流"];
const valid = { lineIndex: 0, characterIndex: 0, character: "更", candidateId: "更:ping-08geng", sourceText: lines[0], sourceOffset: 0 };

test("restore diagnostics distinguish legacy, invalid and stale records while retaining safe choices", () => {
  const { sourceText, sourceOffset, ...legacy } = valid;
  const result = restoreOverrides([valid, legacy, null, { ...valid, sourceText: "旧正文" }], lines);
  assert.deepEqual(result.overrides, [valid]);
  assert.deepEqual(result.reasons, { legacy: 1, invalid: 1, stale: 1, duplicate: 0, excess: 0 });
  assert.match(describeRestoreReasons(result.reasons), /缺少原文定位/);
  assert.match(describeRestoreReasons(result.reasons), /与当前原文不一致/);
  assert.equal(result.ignored, true);
});
test("duplicate anchored choices remain rejected, without silently choosing one", () => {
  const result = restoreOverrides([valid, { ...valid, candidateId: "更:qu-24jing" }], lines);
  assert.equal(result.overrides.length, 0);
  assert.equal(result.reasons.duplicate, 2);
  assert.match(describeRestoreReasons(result.reasons), /字位重复/);
});
test("clean and absent saved choices produce no restore warning", () => {
  for (const values of [[], [valid]]) {
    const result = restoreOverrides(values, lines);
    assert.equal(result.ignored, false);
    assert.equal(describeRestoreReasons(result.reasons), "");
  }
});
test("oversized recovery input is bounded and its rejected tail is explained", () => {
  const result = restoreOverrides(Array(1001).fill(null), lines);
  assert.equal(result.reasons.invalid, 1000);
  assert.equal(result.reasons.excess, 1);
  assert.match(describeRestoreReasons(result.reasons), /超过数量上限/);
});
