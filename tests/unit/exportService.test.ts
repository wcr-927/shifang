import assert from "node:assert/strict";
import { test } from "node:test";

import { ExportService } from "../../electron/services/ExportService.ts";

const request = { workId: "123e4567-e89b-12d3-a456-426614174000", title: "春/秋", body: "春风", genre: "wujue" as const, status: "draft" as const, location: "", notes: "", tags: [], format: "txt" as const };

test("ExportService returns cancelled without writing", async () => {
  let writes = 0;
  const service = new ExportService(async () => ({ canceled: true }), async () => { writes += 1; });
  assert.deepEqual(await service.export(undefined, request), { status: "cancelled" });
  assert.equal(writes, 0);
});

test("ExportService writes UTF-8 content to the user-selected path", async () => {
  let written: { path: string; content: string } | null = null;
  const service = new ExportService(async (_window, options) => ({ canceled: false, filePath: `/tmp/${options.defaultPath}` }), async (path, content) => { written = { path, content }; });
  const result = await service.export(undefined, request);
  assert.equal(result.status, "exported");
  assert.equal(result.path, "/tmp/春-秋.txt");
  assert.deepEqual(written, { path: "/tmp/春-秋.txt", content: "春/秋\n\n春风" });
});

test("ExportService propagates write failures", async () => {
  const service = new ExportService(async () => ({ canceled: false, filePath: "/tmp/fail.txt" }), async () => { throw new Error("disk full"); });
  await assert.rejects(() => service.export(undefined, request), /disk full/);
});
