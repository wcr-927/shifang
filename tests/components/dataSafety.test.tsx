import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import type { WorkRecord } from "../../src/shared/work.ts";
import type { SaveEditorStateRequest } from "../../src/shared/ipc.ts";
import type { FlushResult } from "../../src/shared/close.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? dom.window : (dom.window as any)[key], configurable: true });
}
const { render, fireEvent, screen, waitFor, cleanup, act } = await import("@testing-library/react");
const {installVerseDom,changeVerse}=await import('../support/verseDom.ts');installVerseDom(dom.window);
const { App } = await import("../../src/app/App.tsx");
const { navigate } = await import("../../src/app/routes.ts");
const { registerCloseFlush } = await import("../../src/services/closeCoordinator.ts");
const { RuleService } = await import("../../electron/services/RuleService.ts");
const { AnalysisService } = await import("../../electron/services/AnalysisService.ts");
const rules = new RuleService(`${process.cwd()}/src/rules`);
const analysis = new AnalysisService(rules);
const bundle = rules.load();
const id = "123e4567-e89b-12d3-a456-426614174000";
const otherId = "123e4567-e89b-12d3-a456-426614174001";
const workHash = `#/works/${id}`;
let records: Map<string, WorkRecord>;
let saves: SaveEditorStateRequest[];
let analysisCalls: number;
let beforeClose: ((id: number) => void | Promise<void>) | undefined;
let closeResults: Array<{ id: number; result: FlushResult }>;
let save: (request: SaveEditorStateRequest) => Promise<any>;

function work(workId = id, body = "旧正文"): WorkRecord {
  return { id: workId, title: workId === id ? "旧题" : "第二首", body, genre: "wujue", status: "draft", collectionId: null, location: "", notes: "", tags: [], rhymeGroupId: null, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
}
function persisted(request: SaveEditorStateRequest) {
  const saved = { ...records.get(request.workId)!, ...request, id: request.workId };
  records.set(request.workId, saved);
  return { work: saved, analysisState: { workId: request.workId, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: saved.updatedAt } };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function open() { render(<App />); return await screen.findByLabelText("第1句") as HTMLInputElement; }
async function edit(input: HTMLElement, value = "最新正文") { await changeVerse(input,value); }
function sidebar(name:string){if(name==='首页')fireEvent.click(screen.getByLabelText('诗房首页'));else fireEvent.click(screen.getByRole('button',{name:name==='诗稿'?'创作':name==='资料'?'阅读':name,exact:true}));}

beforeEach(() => {
  records = new Map([[id, work()], [otherId, work(otherId)]]);
  saves = []; analysisCalls = 0; closeResults = [];
  window.history.replaceState(null, "", workHash);
  save = async (request) => persisted(request);
  window.shifang = {
    app: {
      health: async () => ({ name: "诗房", version: "test", packaged: false }),
      onBeforeClose: (handler) => { beforeClose = handler; return () => { beforeClose = undefined; }; },
      completeClose: (requestId, result) => { closeResults.push({ id: requestId, result }); },
      onCloseCancelled: () => () => {},
    },
    rules: { listTemplates: async () => ({ templates: bundle.metre.templates, datasetVersion: "1.0.0" }), getReadingCandidates: async () => ({ character: "", candidates: [] }) },
    analysis: { analyzePoem: async (request) => { analysisCalls += 1; return analysis.analyze(request); } },
    works: {
      get: async ({ id: workId }) => records.get(workId) ?? null,
      list: async () => [...records.values()],
      getAnalysisState: async () => null,
      saveEditorState: async (request) => { saves.push(request); return save(request); },
      create: async () => work(otherId), update: async () => work(), archive: async () => work(),
      saveAnalysisState: async (request) => ({ ...request, updatedAt: "2026-09-20T00:00:00Z" }),
      export: async () => ({ status: "cancelled" }),
    },
  };
});
afterEach(() => { cleanup(); });

const exits = [
  { name: "top back", target: "#/works", leave: () => fireEvent.click(document.querySelector(".back-button")!) },
  { name: "navigation home", target: "#/", leave: () => sidebar("首页") },
  { name: "navigation works", target: "#/works", leave: () => sidebar("诗稿") },
  { name: "navigation reference", target: "#/reference", leave: () => sidebar("资料") },
  { name: "brand home", target: "#/", leave: () => fireEvent.click(screen.getByLabelText("诗房首页")) },
  { name: "hash navigation", target: "#/reference", leave: () => { window.location.hash = "#/reference"; } },
  { name: "work switch", target: `#/works/${otherId}`, leave: () => navigate({ kind: "work", workId: otherId }) },
];
for (const exit of exits) {
  test(`navigation saves before leaving: ${exit.name}`, async () => {
    const gate = deferred();
    save = async (request) => { await gate.promise; return persisted(request); };
    const input = await open();
    await edit(input);
    exit.leave();
    await waitFor(() => assert.equal(saves.length, 1));
    assert.equal(window.location.hash, workHash);
    assert.equal((screen.getByLabelText("第1句") as HTMLInputElement).textContent, "最新正文");
    await act(async () => { gate.resolve(); });
    await waitFor(() => assert.equal(window.location.hash, exit.target));
    assert.equal(records.get(id)!.body, "最新正文");
    assert.equal(saves.length, 1);
  });
}

test("failed navigation keeps editor, input and save error", async () => {
  save = async () => { throw new Error("磁盘写入失败"); };
  const input = await open(); await edit(input); sidebar("首页");
  await screen.findAllByText("磁盘写入失败");
  assert.equal(window.location.hash, workHash);
  assert.equal(input.textContent, "最新正文");
  assert.ok(document.querySelector(".save-status.is-error"));
  assert.equal(records.get(id)!.body, "旧正文");
});

test("save during navigation follows edits made while an older revision is in flight", async () => {
  const gates = [deferred(), deferred()];
  save = async (request) => { const gate = gates[saves.length - 1]; await gate.promise; return persisted(request); };
  const input = await open(); await edit(input, "第一版"); sidebar("首页");
  await waitFor(() => assert.equal(saves.length, 1));
  await edit(input, "第二版稿");
  await act(async () => { gates[0].resolve(); });
  await waitFor(() => assert.equal(saves.length, 2));
  assert.equal(window.location.hash, workHash);
  assert.equal(input.textContent, "第二版稿");
  assert.equal((document.querySelector(".save-status.is-saved")) === (null), true, "DOM identity or absence matches");
  await act(async () => { gates[1].resolve(); });
  await waitFor(() => assert.equal(window.location.hash, "#/"));
  assert.equal(records.get(id)!.body, "第二版稿");
});

test("rapid navigation clicks share one save and commit only the final target", async () => {
  const gate = deferred();
  save = async (request) => { await gate.promise; return persisted(request); };
  const input = await open(); await edit(input); sidebar("首页");
  await waitFor(() => assert.equal(saves.length, 1));
  sidebar("诗稿"); sidebar("资料"); sidebar("首页"); sidebar("资料");
  assert.equal(saves.length, 1);
  assert.equal(window.location.hash, workHash);
  await act(async () => { gate.resolve(); });
  await waitFor(() => assert.equal(window.location.hash, "#/reference"));
  assert.equal(saves.length, 1);
});

test("history back waits for save and forward restores the saved editor", async () => {
  window.history.replaceState(null, "", "#/");
  const gate = deferred();
  save = async (request) => { await gate.promise; return persisted(request); };
  render(<App />);
  act(() => navigate({ kind: "work", workId: id }));
  const input = await screen.findByLabelText("第1句") as HTMLInputElement; await edit(input);
  window.history.back();
  await waitFor(() => assert.equal(saves.length, 1));
  assert.equal(window.location.hash, workHash);
  assert.equal(input.textContent, "最新正文");
  await act(async () => { gate.resolve(); });
  await waitFor(() => assert.equal(window.location.hash, "#/"));
  window.history.forward();
  assert.equal((await screen.findByLabelText("第1句") as HTMLInputElement).textContent, "最新正文");
});

test("failed hash navigation restores the current route without unmounting the draft", async () => {
  save = async () => { throw new Error("不能保存"); };
  const input = await open(); await edit(input);
  window.location.hash = "#/reference";
  await screen.findAllByText("不能保存");
  assert.equal(window.location.hash, workHash);
  assert.equal(input.textContent, "最新正文");
});

test("close flush waits for the newest editor revision", async () => {
  const gates = [deferred(), deferred()];
  save = async (request) => { await gates[saves.length - 1].promise; return persisted(request); };
  const input = await open(); await edit(input, "第一版");
  let closing!: Promise<void>;
  act(() => { closing = Promise.resolve(beforeClose!(7)); });
  await waitFor(() => assert.equal(saves.length, 1));
  await edit(input, "最后一版");
  await act(async () => { gates[0].resolve(); });
  await waitFor(() => assert.equal(saves.length, 2));
  assert.equal(closeResults.length, 0);
  await act(async () => { gates[1].resolve(); await closing; });
  assert.deepEqual(closeResults, [{ id: 7, result: { status: "saved" } }]);
  assert.equal(records.get(id)!.body, "最后一版");
});

test("close failure and thrown flush keep the editor and show understandable errors", async () => {
  save = async () => { throw new Error("磁盘不可写"); };
  const input = await open(); await edit(input);
  await act(async () => { await beforeClose!(1); });
  assert.equal(closeResults[0].result.status, "failed");
  assert.equal(input.textContent, "最新正文");
  const dispose = registerCloseFlush(async () => { throw new Error("unexpected implementation detail"); });
  try {
    await act(async () => { await beforeClose!(2); });
    assert.equal(closeResults[1].result.status, "failed");
    assert.ok(screen.getByText("保存未完成，已保留当前诗稿，请重试。"));
    assert.equal(window.location.hash, workHash);
  } finally { dispose(); }
});

for (const state of ["clean editor", "no editor", "not found", "load error"] as const) {
  test(`close allows ${state}`, async () => {
    if (state === "no editor") window.history.replaceState(null, "", "#/");
    if (state === "not found") records.delete(id);
    if (state === "load error") window.shifang.works.get = async () => { throw new Error("无法打开"); };
    render(<App />);
    if (state === "clean editor") await screen.findByLabelText("第1句");
    if (state === "not found") await screen.findByText("未找到这首诗稿");
    if (state === "load error") await screen.findByText("诗稿暂时无法取阅，请重试。");
    await act(async () => { await beforeClose!(3); });
    assert.deepEqual(closeResults, [{ id: 3, result: { status: "clean" } }]);
    assert.equal(saves.length, 0);
  });
}

const rawBodies = ["  白日依山尽，黄河入海流。  ", "\r\n\r\n 白日依山尽 \r\n\r\n黄河入海流。\r\n", "\n\n\n", "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。"];
for (const [index, body] of rawBodies.entries()) {
  test(`body remains byte-for-byte unchanged after analysis, save and metadata edit: case ${index + 1}`, async () => {
    records.set(id, work(id, body));
    window.shifang.works.getAnalysisState = async () => ({ workId: id, templateId: "wujue", variantId: null, readingOverrides: [], ruleDatasetVersions: { metre: "older" }, updatedAt: work().updatedAt });
    await open();
    await waitFor(() => assert.ok(analysisCalls > 0));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
    assert.equal(saves.length, 0, "analysis/version refresh must not schedule a body write");
    fireEvent.keyDown(document,{key:"s",metaKey:true});
    await act(async () => {});
    assert.equal(records.get(id)!.body, body);
    assert.equal(saves.length, 0);
    fireEvent.change(screen.getByLabelText("诗稿题名"), { target: { value: "只改题名" } });
    fireEvent.keyDown(document,{key:"s",metaKey:true});
    await waitFor(() => assert.equal(saves.length, 1));
    assert.equal(saves[0].body, body);
    assert.equal(records.get(id)!.body, body);
    assert.equal(records.get(id)!.title, "只改题名");
    assert.deepEqual(saves[0].ruleDatasetVersions, bundle.datasetVersions);
    document.querySelector<HTMLDetailsElement>(".editor-tools")!.open=true;document.querySelector<HTMLDetailsElement>(".editor-status-choice")!.open=true;fireEvent.click(screen.getByRole("button",{name:"已完成",exact:true}));
    sidebar("首页");
    await waitFor(() => assert.equal(window.location.hash, "#/"));
    assert.equal(records.get(id)!.body, body);
    assert.equal(records.get(id)!.status, "completed");
  });
}

test("leaving an untouched old manuscript does not write the body", async () => {
  const body = "  旧稿，同行。 \r\n\r\n";
  records.set(id, work(id, body));
  await open();
  await waitFor(() => assert.ok(analysisCalls > 0));
  sidebar("首页");
  await waitFor(() => assert.equal(window.location.hash, "#/"));
  assert.equal(saves.length, 0);
  assert.equal(records.get(id)!.body, body);
});


test("failed history back preserves its destination for a successful retry", async () => {
  window.history.replaceState(null, "", "#/");
  render(<App />);
  act(() => navigate({ kind: "work", workId: id }));
  const input = await screen.findByLabelText("第1句") as HTMLInputElement;
  await edit(input);
  save = async () => { throw new Error("暂时不能保存"); };
  window.history.back();
  await screen.findAllByText("暂时不能保存");
  assert.equal(window.location.hash, workHash);
  assert.equal(input.textContent, "最新正文");
  save = async (request) => persisted(request);
  window.history.back();
  await waitFor(() => assert.equal(window.location.hash, "#/"));
  await screen.findByLabelText("诗房首页");
  assert.equal(records.get(id)!.body, "最新正文");
});

test("renderer close timeout retains input and late persistence does not confirm close", async () => {
  const gate = deferred();
  save = async (request) => { await gate.promise; return persisted(request); };
  const input = await open(); await edit(input);
  await act(async () => { await beforeClose!(99); });
  assert.equal(closeResults.length, 1);
  assert.equal(closeResults[0].result.status, "timeout");
  assert.ok(screen.getByText(/等待保存超时/u));
  assert.equal(input.textContent, "最新正文");
  assert.equal(window.location.hash, workHash);
  await act(async () => { gate.resolve(); });
  await waitFor(() => assert.equal(records.get(id)!.body, "最新正文"));
  assert.equal(closeResults.length, 1);
  assert.equal(closeResults[0].result.status, "timeout");
});
