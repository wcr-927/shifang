import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocumentSaveDriver, type SaveStatus } from "../../src/features/editor/documentSaveDriver.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  let current = { body: "原稿", dirty: false, saveStatus: "saved" as SaveStatus };
  let revision = 0, active = true, writes: string[] = [], checkpoints = 0, error = "";
  let persist = async (_body: string): Promise<void> => {};
  let checkpoint = async (): Promise<void> => {};
  const driver = createDocumentSaveDriver({
    snapshot: () => current, dirty: snapshot => snapshot.dirty, token: () => revision, active: () => active,
    persist: snapshot => { writes.push(snapshot.body); return persist(snapshot.body); },
    saving: () => { current = { ...current, saveStatus: "saving" }; },
    saved: () => { current = { ...current, dirty: false, saveStatus: "saved" }; error = ""; },
    failed: message => { current = { ...current, saveStatus: "error" }; error = message; },
    checkpoint: () => { checkpoints++; return checkpoint(); },
    checkpointSaved: () => { current = { ...current, saveStatus: "saved" }; error = ""; },
  });
  return {
    driver, get current() { return current; }, get writes() { return writes; }, get checkpoints() { return checkpoints; }, get error() { return error; },
    edit(body: string) { revision++; current = { body, dirty: true, saveStatus: "dirty" }; },
    persist(fn: typeof persist) { persist = fn; }, checkpoint(fn: typeof checkpoint) { checkpoint = fn; }, unmount() { active = false; },
  };
}

test("one shared writer drains new revisions for simultaneous autosave, navigation and close flush without manual checkpoints", async () => {
  const h = harness(), gate = deferred<void>();
  h.edit("  𠀀第一稿\n\n尾行  \n"); h.persist(async () => { if (h.writes.length === 1) await gate.promise; });
  const first = h.driver.flush(), second = h.driver.flush(); assert.equal(first, second);
  await Promise.resolve(); assert.equal(h.current.saveStatus, "saving");
  h.edit("  𠀀第二稿\n\n附记一起保存  \n"); gate.resolve();
  assert.deepEqual(await first, { status: "saved" }); assert.equal(h.writes.length, 2);
  assert.equal(h.current.dirty, false); assert.equal(h.checkpoints, 0);
});

test("save failure retains the exact document and failed flush blocks leaving; explicit retry creates one checkpoint", async () => {
  const h = harness(); h.edit("  原文\n\t不丢失  \n"); h.persist(async () => { throw Error("隔离写入失败"); });
  assert.deepEqual(await h.driver.flush(), { status: "failed", message: "隔离写入失败" });
  assert.equal(h.current.body, "  原文\n\t不丢失  \n"); assert.equal(h.current.dirty, true); assert.equal(h.current.saveStatus, "error");
  h.persist(async () => {}); assert.equal(await h.driver.saveNow(), true);
  assert.equal(h.checkpoints, 1); assert.equal(h.current.saveStatus, "saved"); assert.equal(h.error, "");
});

test("a failed older write cannot put newer input into error; the writer saves the new revision", async () => {
  const h = harness(), gate = deferred<void>();
  h.edit("旧稿"); h.persist(async () => { if (h.writes.length === 1) await gate.promise; });
  const saving = h.driver.flush(); await Promise.resolve(); h.edit("新稿"); gate.reject(Error("旧请求失败"));
  assert.deepEqual(await saving, { status: "saved" }); assert.deepEqual(h.writes, ["旧稿", "新稿"]); assert.equal(h.error, "");
});

test("concurrent explicit saves share one checkpoint and a late success cannot clear newly dirty input", async () => {
  const h = harness(), gate = deferred<void>(), started = deferred<void>();
  h.edit("旧稿"); h.checkpoint(async () => { started.resolve(); await gate.promise; });
  const first = h.driver.saveNow(), second = h.driver.saveNow(); assert.equal(first, second);
  await started.promise; h.edit("快照期间的新稿"); gate.resolve(); assert.equal(await first, true);
  assert.equal(h.checkpoints, 1); assert.equal(h.current.dirty, true); assert.equal(h.current.saveStatus, "dirty");
  assert.equal(h.current.body, "快照期间的新稿");
});

test("a late checkpoint failure cannot overwrite a newer revision status, while a current failure supports retry without rewriting body", async () => {
  const h = harness(), gate = deferred<void>(), started = deferred<void>();
  h.edit("旧稿"); h.checkpoint(async () => { started.resolve(); await gate.promise; });
  const saving = h.driver.saveNow(); await started.promise; h.edit("新稿"); gate.reject(Error("历史失败"));
  assert.equal(await saving, false); assert.equal(h.current.saveStatus, "dirty"); assert.equal(h.current.dirty, true); assert.equal(h.error, "");
  h.checkpoint(async () => { throw Error("当前历史失败"); }); assert.equal(await h.driver.saveNow(), false);
  assert.equal(h.current.saveStatus, "error"); assert.equal(h.current.dirty, false); assert.equal(h.writes.length, 2);
  h.checkpoint(async () => {}); assert.equal(await h.driver.saveNow(), true); assert.equal(h.writes.length, 2);
  assert.equal(h.current.saveStatus, "saved");
});

test("unmounted sessions ignore late save success and late checkpoint errors and do not checkpoint after failed flush", async () => {
  const h = harness(), gate = deferred<void>(); h.edit("未确认保存的稿"); h.persist(async () => gate.promise);
  const saving = h.driver.saveNow(); await Promise.resolve(); h.unmount(); gate.resolve(); assert.equal(await saving, false);
  assert.equal(h.current.dirty, true); assert.equal(h.current.saveStatus, "saving"); assert.equal(h.checkpoints, 0);
  const second = harness(), checkpoint = deferred<void>(), started = deferred<void>();
  second.checkpoint(async () => { started.resolve(); await checkpoint.promise; });
  const explicit = second.driver.saveNow(); await started.promise; second.unmount(); checkpoint.reject(Error("卸载后的历史错误"));
  assert.equal(await explicit, false); assert.equal(second.error, ""); assert.equal(second.current.saveStatus, "saved");
});

test("a newer explicit save during a pending checkpoint drains its body and checkpoint before both callers complete", async () => {
  for (const failOlder of [false, true]) {
    const h = harness(), gate = deferred<void>(), started = deferred<void>();
    h.edit("A"); h.checkpoint(async () => { if (h.checkpoints === 1) { started.resolve(); await gate.promise; } });
    const first = h.driver.saveNow(); await started.promise;
    h.edit("B"); const second = h.driver.saveNow(); assert.equal(first, second);
    if (failOlder) gate.reject(Error("旧快照失败")); else gate.resolve();
    assert.equal(await second, true); assert.equal(await first, true);
    assert.deepEqual(h.writes, ["A", "B"]); assert.equal(h.checkpoints, 2);
    assert.equal(h.current.dirty, false); assert.equal(h.current.saveStatus, "saved"); assert.equal(h.error, "");
  }
});
