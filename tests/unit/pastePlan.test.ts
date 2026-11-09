import assert from "node:assert/strict";
import { test } from "node:test";
import { linePastePlan, applyLinePaste } from "../../src/features/editor/pastePlan.ts";

for (const delimiter of ["\n", "\r\n", "\r"]) test(`clipboard ${JSON.stringify(delimiter)} preserves blanks, tail and overflow in one reviewed plan`, () => {
  const source = ["  原句𠀀  ", "旧二", "旧三", "旧四", "谱外旧稿", ""];
  const plan = linePastePlan(source, 1, ["  甲𠀀  ", "", "乙", ""].join(delimiter));
  assert.deepEqual(plan.changes, [
    { lineIndex: 1, previous: "旧二", next: "  甲𠀀  " },
    { lineIndex: 2, previous: "旧三", next: "" },
    { lineIndex: 3, previous: "旧四", next: "乙" },
    { lineIndex: 4, previous: "谱外旧稿", next: "" },
  ]);
  assert.deepEqual(source, ["  原句𠀀  ", "旧二", "旧三", "旧四", "谱外旧稿", ""]);
  assert.deepEqual(applyLinePaste(source, plan), ["  原句𠀀  ", "  甲𠀀  ", "", "乙", "", ""]);
  assert.deepEqual(applyLinePaste(source, linePastePlan(source, 5, `谱外${delimiter}${delimiter}`)).slice(4), ["谱外旧稿", "谱外", "", ""]);
});
