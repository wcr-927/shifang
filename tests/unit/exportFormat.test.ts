import assert from "node:assert/strict";
import { test } from "node:test";

import { formatMarkdown, formatPlainText, sanitizeExportFilename } from "../../src/features/export/exportFormat.ts";

const snapshot = { title: "秋夜", body: "行到水穷处\n坐看云起时", genre: "qijue" as const, status: "draft" as const, location: "江南", notes: "记一场秋雨", tags: ["秋", "旅思"] };

test("formats a readable Markdown export with metadata while excluding creation notes", () => {
  const output = formatMarkdown(snapshot);
  assert.match(output, /^# 秋夜/m);
  assert.match(output, /体裁：七绝/);
  assert.match(output, /状态：草稿/);
  assert.match(output, /地点：江南/);
  assert.match(output, /标签：秋、旅思/);
  assert.equal(output.includes("记一场秋雨"), false);
  assert.match(output, /行到水穷处\n坐看云起时/);
});

test("formats TXT without JSON metadata and preserves Unicode", () => {
  const output = formatPlainText({ ...snapshot, title: "𠀀秋", notes: "" });
  assert.equal(output, "𠀀秋\n\n行到水穷处\n坐看云起时");
  assert.equal(output.includes("candidateId"), false);
});

test("omits empty title and notes sections", () => {
  const output = formatMarkdown({ ...snapshot, title: "", notes: "", location: "", tags: [] });
  assert.match(output, /^# 未题/m);
  assert.equal(output.includes("## 笔记"), false);
  assert.equal(output.includes("地点"), false);
});

test("sanitizes filesystem-invalid title characters without changing the stored title", () => {
  assert.equal(sanitizeExportFilename('春/秋:*?"<>|  '), "春-秋-------");
  assert.equal(sanitizeExportFilename("   "), "未题");
  assert.ok(sanitizeExportFilename("a".repeat(200)).length <= 120);
});
