import assert from "node:assert/strict";
import { test } from "node:test";

import { analysisLineSlots, bodyToLines, genreLineCounts, hasOverflowLines, lineSlots, linesToBody } from "../../src/features/editor/editorModel.ts";

test("converts body to stable line slots while preserving punctuation", () => {
  const lines = bodyToLines("白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。", 4);
  assert.deepEqual(lines, ["白日依山尽，黄河入海流。", "欲穷千里目，更上一层楼。", "", ""]);
  assert.equal(linesToBody(lines), "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。\n\n");
});

test("creates empty slots for a fresh four-line draft", () => {
  assert.deepEqual(bodyToLines("", genreLineCounts.qijue), ["", "", "", ""]);
  assert.deepEqual(lineSlots(["春风"], 4), ["春风", "", "", ""]);
});

test("keeps overflow lines instead of silently discarding user text", () => {
  const lines = bodyToLines("甲\n乙\n丙\n丁\n戊", 4);
  assert.equal(hasOverflowLines(lines, 4), true);
  assert.equal(linesToBody(lines), "甲\n乙\n丙\n丁\n戊");
});

test("handles CRLF and Unicode extension characters by code point", () => {
  const lines = bodyToLines("𠀀日\r\n春风", 4);
  assert.deepEqual(lines, ["𠀀日", "春风", "", ""]);
  assert.equal(Array.from(lines[0]).length, 2);
});


test("analysis pads the expanded genre without changing stored lines, anchors or overflow", () => {
  const raw = ['（注）春', '', '江水', ''];
  const view = analysisLineSlots(raw, 8);
  assert.deepEqual(view, ['（注）春', '', '江水', '', '', '', '', '']);
  assert.equal(linesToBody(raw), '（注）春\n\n江水\n');
  assert.notEqual(view, raw);
  assert.deepEqual(analysisLineSlots([...view, '尾句'], 4), [...view, '尾句']);
});
