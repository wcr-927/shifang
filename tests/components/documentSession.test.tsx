import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import type { CiWorkRecord, FreeWorkRecord } from "../../src/shared/work.ts";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event"]) Object.defineProperty(globalThis, key, { value: key === "window" ? dom.window : (dom.window as any)[key], configurable: true });
const { render, fireEvent, screen, cleanup, act, waitFor } = await import("@testing-library/react");
const { useFreeEditor } = await import("../../src/features/editor/useFreeEditor.ts");
const { useCiEditor } = await import("../../src/features/editor/useCiEditor.ts");
const { flushBeforeClose } = await import("../../src/services/closeCoordinator.ts");
const common = { id: "123e4567-e89b-12d3-a456-426614174000", title: "会话", body: "", notes: "", status: "draft" as const, collectionId: null, location: "", rhymeGroupId: null, tags: [], createdAt: "t", updatedAt: "t" };
const free: FreeWorkRecord = { ...common, genre: "free", room: "poetry" };
const ci: CiWorkRecord = { ...common, genre: "ci", room: "ci", ci: { formId: "legacy-unavailable", version: "old", rhymeVersion: "old", choices: [] } };
function View({ session }: { session: ReturnType<typeof useFreeEditor> | ReturnType<typeof useCiEditor> }) {
  return <><textarea aria-label="正文" value={session.editor.body} onChange={event => session.patch({ body: event.target.value })} /><output>{session.editor.saveStatus}</output><button onClick={() => void session.save()}>保存</button></>;
}
function Free() { return <View session={useFreeEditor(free)} />; }
function Ci() { return <View session={useCiEditor(ci)} />; }
afterEach(cleanup);

test("both session adapters autosave after 800ms; close/navigation flush writes raw text and only explicit saves request manual versions", async () => {
  for (const Editor of [Free, Ci]) {
    cleanup(); const writes: any[] = []; let checkpoints = 0;
    window.shifang = { works: {
      saveFreeWork: async (request: any) => { writes.push(request); return { ...free, ...request }; },
      saveCiWork: async (request: any) => { writes.push(request); return { ...ci, ...request }; },
      saveVersion: async () => { checkpoints++; return true; },
    } } as any;
    render(<Editor />); const input = screen.getByLabelText("正文") as HTMLTextAreaElement;
    const raw = "  𠀀原文\n\n\t末行  \n";
    fireEvent.change(input, { target: { value: raw } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 860)); });
    assert.equal(writes.length, 1); assert.equal(writes[0].body, raw); assert.equal(checkpoints, 0);
    fireEvent.change(input, { target: { value: raw + "离开前" } });
    await act(async () => { assert.equal((await flushBeforeClose()).status, "saved"); });
    assert.equal(writes.length, 2); assert.equal(checkpoints, 0); assert.equal(writes[1].body, raw + "离开前");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await waitFor(() => assert.equal(checkpoints, 1));
    assert.equal(writes.length, 2); assert.equal((screen.getByLabelText("正文")) === (input), true, "DOM identity or absence matches");
    cleanup(); assert.equal((await flushBeforeClose()).status, "clean");
  }
});
