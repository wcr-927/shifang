import assert from "node:assert/strict";
import { test } from "node:test";

import { flushBeforeClose, registerCloseFlush } from "../../src/services/closeCoordinator.ts";

test("close coordinator flushes registered editor and unregisters cleanly", async () => {
  let calls = 0;
  const dispose = registerCloseFlush(async () => { calls += 1; return { status: "saved" }; });
  assert.deepEqual(await flushBeforeClose(), { status: "saved" });
  assert.equal(calls, 1);
  dispose();
  assert.deepEqual(await flushBeforeClose(), { status: "clean" });
  assert.equal(calls, 1);
});

test("close coordinator propagates a failed flush as a close veto", async () => {
  const dispose = registerCloseFlush(async () => ({ status: "failed", message: "保存失败" }));
  assert.deepEqual(await flushBeforeClose(), { status: "failed", message: "保存失败" });
  dispose();
});
