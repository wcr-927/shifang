import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { readFileSync } from "node:fs";
import { analyzePoem } from "../../src/poetry/analysis/poemAnalyzer.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/#/" });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  Event: { value: dom.window.Event, configurable: true },
  MouseEvent: { value: dom.window.MouseEvent, configurable: true },
});
Object.defineProperty(globalThis,"innerWidth",{value:1280,configurable:true});Object.defineProperty(globalThis,"innerHeight",{value:800,configurable:true});
const {installVerseDom,changeVerse}=await import('../support/verseDom.ts');installVerseDom(dom.window);
Object.defineProperty(dom.window, "shifang", {
  value: {
    app: { health: async () => ({ name: "诗房", version: "test", packaged: false }) },
    rules: {
      listTemplates: async () => ({ templates: [
        { id: "wujue", name: "五言绝句", shortName: "五绝", lineCount: 4, lineLength: 5, recommendedVariantId: "auto", variants: [] },
        { id: "qijue", name: "七言绝句", shortName: "七绝", lineCount: 4, lineLength: 7, recommendedVariantId: "auto", variants: [] },
        { id: "wulv", name: "五言律诗", shortName: "五律", lineCount: 8, lineLength: 5, recommendedVariantId: "auto", variants: [] },
        { id: "qilv", name: "七言律诗", shortName: "七律", lineCount: 8, lineLength: 7, recommendedVariantId: "auto", variants: [] },
      ], datasetVersion: "test" }),
      getReadingCandidates: async () => ({ character: "", candidates: [] }),
    },
    analysis: { analyzePoem: async () => { throw new Error("analysis disabled in view test"); } },
    works: {
      create: async () => work(),
      get: async () => null,
      list: async () => [],
      update: async () => work(),
      archive: async () => work({ status: "archived" }),
      saveAnalysisState: async () => ({}),
      getAnalysisState: async () => null,
      saveEditorState: async () => ({ work: work(), analysisState: {} }),
      export: async () => ({ status: "cancelled" }),
    },
  },
  configurable: true,
});

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { HomePage } = await import("../../src/pages/HomePage.tsx");
const { WorksPage } = await import("../../src/pages/WorksPage.tsx");
const { WorkDetailPage } = await import("../../src/pages/WorkDetailPage.tsx");
const { desktopApi } = await import("../../src/services/desktopApi.ts");
const metre = JSON.parse(readFileSync("src/rules/metre.json", "utf8"));
const pingze = JSON.parse(readFileSync("src/rules/pingze.json", "utf8"));
const readingRules = JSON.parse(readFileSync("src/rules/reading_rules.json", "utf8"));
type WorkRecord = import("../../src/shared/work.ts").WorkRecord;

const originalWorksApi = { ...desktopApi.works };

function work(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    collectionId: null,
    title: "春望",
    body: "国破山河在",
    genre: "wulv",
    status: "draft",
    location: "",
    notes: "",
    rhymeGroupId: null,
    tags: ["春"],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

const editorTemplates = [
  { id: "wujue", name: "五言绝句", shortName: "五绝", lineCount: 4, lineLength: 5, recommendedVariantId: "zeqi-first-unrhymed", variants: [{ id: "zeqi-first-unrhymed", name: "仄起首句不入韵", style: "仄起" }] },
  { id: "qijue", name: "七言绝句", shortName: "七绝", lineCount: 4, lineLength: 7, recommendedVariantId: "pingqi-first-rhymed", variants: [{ id: "pingqi-first-rhymed", name: "平起首句入韵", style: "平起" }] },
  { id: "wulv", name: "五言律诗", shortName: "五律", lineCount: 8, lineLength: 5, recommendedVariantId: "zeqi-first-unrhymed", variants: [{ id: "zeqi-first-unrhymed", name: "仄起首句不入韵", style: "仄起" }] },
  { id: "qilv", name: "七言律诗", shortName: "七律", lineCount: 8, lineLength: 7, recommendedVariantId: "zeqi-first-rhymed", variants: [{ id: "zeqi-first-rhymed", name: "仄起首句入韵", style: "仄起" }] },
];

afterEach(() => {
  cleanup();
  Object.assign(desktopApi.works, originalWorksApi);
  document.body.innerHTML = "";
});

test("works page filters and refreshes after archive through the selected action row",async()=>{
 let records=[work(),work({id:'123e4567-e89b-12d3-a456-426614174001',title:'秋句',status:'completed'})];desktopApi.works.query=queryFixture(()=>records);
 desktopApi.works.archive=async id=>{const item={...records.find(r=>r.id===id)!,status:'archived' as const};records=records.map(r=>r.id===id?item:r);return item;};
 render(<WorksPage onOpenWork={()=>{}} onCreateWork={()=>{}}/>);await screen.findByText('春望');
 fireEvent.click(screen.getByRole('button',{name:'操作：春望'}));fireEvent.click(screen.getByRole('button',{name:'归档',exact:true}));await waitFor(()=>assert.equal(screen.queryByText('春望')===null,true));
 fireEvent.click(screen.getByText('已归档'));await screen.findByText('春望');assert.equal(screen.queryByText('秋句')===null,true);
 fireEvent.click(screen.getByText('全部作品'));await screen.findByText('秋句');fireEvent.click(screen.getByRole('button',{name:'查找',exact:true}));fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'不存在'}});await screen.findByText('没有相合的作品');
});

test("works page displays archive failure without removing the work", async () => {
  desktopApi.works.query = queryFixture(() => [work()]);
  desktopApi.works.archive = async () => { throw new Error("archive unavailable"); };
  render(<WorksPage onOpenWork={() => undefined} onCreateWork={() => undefined} />);
  assert.ok(await screen.findByText("春望"));
  fireEvent.click(screen.getAllByRole("button",{name:/^操作：/})[0]);fireEvent.click(screen.getByRole("button",{name:"归档",exact:true}));
  assert.ok(await screen.findByText("archive unavailable"));
  assert.ok(screen.getByText("春望"));
});

test("home displays IPC failure with retry", async () => {
  desktopApi.works.query = async () => { throw new Error("database unavailable"); };
  render(<HomePage onOpenWork={() => undefined} onCreateWork={() => undefined} />);
  assert.ok(await screen.findByText("最近诗稿暂不可用"));
  assert.ok(screen.getByText("重试"));
});

test("work detail handles loading, success, not found and error", async (context) => {
  await context.test("success", async () => {
    let resolveWork!: (value: WorkRecord) => void;
    desktopApi.works.get = () => new Promise((resolve) => { resolveWork = resolve; });
    render(<WorkDetailPage workId={work().id} onBack={() => undefined} onArchived={() => undefined} />);
    assert.ok(screen.getByText("正在打开诗稿"));
    resolveWork(work());
    assert.equal((await screen.findByLabelText("诗稿题名") as HTMLTextAreaElement).value, "春望");
    assert.equal((await screen.findByLabelText("第1句")).textContent, "国破山河在");
    cleanup();
  });
  await context.test("not found", async () => {
    desktopApi.works.get = async () => null;
    render(<WorkDetailPage workId={work().id} onBack={() => undefined} onArchived={() => undefined} />);
    assert.ok(await screen.findByText("未找到这首诗稿"));
    cleanup();
  });
  await context.test("error", async () => {
    desktopApi.works.get = async () => { throw new Error("database unavailable"); };
    render(<WorkDetailPage workId={work().id} onBack={() => undefined} onArchived={() => undefined} />);
    assert.ok(await screen.findByText("诗稿暂时无法取阅，请重试。"));
  });
});

test("editor restores title, body, locked variant and stable line slots", async () => {
  const restored = work({ genre: "wujue", title: "旧稿", body: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。" });
  desktopApi.works.get = async () => restored;
  desktopApi.works.getAnalysisState = async () => ({ workId: restored.id, templateId: "wujue", variantId: "zeqi-first-unrhymed", readingOverrides: [], ruleDatasetVersions: {}, updatedAt: restored.updatedAt });
  desktopApi.rules.listTemplates = async () => ({ templates: editorTemplates, datasetVersion: "1.0.0" });
  desktopApi.analysis.analyzePoem = async (request) => ({ ...analyzePoem(request.text, metre, pingze, readingRules, request), requestId: request.requestId, datasetVersions: {} });
  render(<WorkDetailPage workId={restored.id} onBack={() => undefined} onArchived={() => undefined} />);
  assert.equal((await screen.findByLabelText("诗稿题名") as HTMLTextAreaElement).value, "旧稿");
  assert.match(document.querySelector('.manuscript-scroll .editor-header')!.textContent!, /返回/);
  assert.equal(Boolean(document.querySelector('.new-manuscript > .editor-header')),false);
  assert.ok(document.querySelector('.manuscript-foot .editor-save-indicator'));
  assert.ok(screen.getByLabelText('导出诗稿'));
  assert.equal(Boolean(screen.queryByRole('button', { name: '已保存' })), false);
  assert.ok(screen.getByText('已保存'));
  assert.equal((await screen.findByLabelText("第1句")).textContent, restored.body);
  assert.equal(screen.getAllByLabelText(/^第\d+句$/u).length, 4);
  fireEvent.click(document.querySelector(".manuscript-genre summary")!);
  assert.ok(await screen.findByText("已锁定"));
});

test("editor debounces real analysis and atomic autosave without losing text", async () => {
  const restored = work({ genre: "wujue", title: "待写", body: "" });
  let analysisCalls = 0;
  const savedPayloads: unknown[] = [];
  desktopApi.works.get = async () => restored;
  desktopApi.works.getAnalysisState = async () => null;
  desktopApi.rules.listTemplates = async () => ({ templates: editorTemplates, datasetVersion: "1.0.0" });
  desktopApi.analysis.analyzePoem = async (request) => { analysisCalls += 1; return { ...analyzePoem(request.text, metre, pingze, readingRules, request), requestId: request.requestId, datasetVersions: {} }; };
  desktopApi.works.saveEditorState = async (request) => { savedPayloads.push(request); return { work: { ...restored, title: request.title, body: request.body, genre: request.genre, status: request.status, updatedAt: new Date().toISOString() }, analysisState: { workId: restored.id, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: new Date().toISOString() } }; };
  render(<WorkDetailPage workId={restored.id} onBack={() => undefined} onArchived={() => undefined} />);
  const input = await screen.findByLabelText("第1句");
  await changeVerse(input,"晚风入夜深");
  await waitFor(() => assert.ok(analysisCalls >= 1), { timeout: 1200 });
  await waitFor(() => assert.ok(savedPayloads.length >= 1), { timeout: 1800 });
  const latest = savedPayloads.at(-1) as { body: string; workId: string; templateId: string };
  assert.equal(latest.body.split("\n")[0], "晚风入夜深");
  assert.equal(latest.workId, restored.id);
  assert.equal(latest.templateId, "wujue");
  assert.equal((await screen.findByLabelText("第1句")).textContent, "晚风入夜深");
});

test("editor selection immediately reanalyzes and persists then can be cleared", async () => {
  const restored = work({ genre: "qijue", body: "行风春春春春春\n春春春春春春春\n春春春春春春春\n春春春春春春春" });
  const savedPayloads: Array<{ readingOverrides: unknown[] }> = [];
  desktopApi.works.get = async () => restored;
  desktopApi.works.getAnalysisState = async () => null;
  desktopApi.rules.listTemplates = async () => ({ templates: editorTemplates, datasetVersion: "1.0.0" });
  desktopApi.analysis.analyzePoem = async (request) => ({ ...analyzePoem(request.text, metre, pingze, readingRules, request), requestId: request.requestId, datasetVersions: {} });
  desktopApi.works.saveEditorState = async (request) => { savedPayloads.push(request); return { work: restored, analysisState: { workId: restored.id, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: restored.updatedAt } }; };
  render(<WorkDetailPage workId={restored.id} onBack={() => undefined} onArchived={() => undefined} />);
  await waitFor(() => assert.ok(document.querySelector<HTMLInputElement>(".manuscript-reading-choice input")), { timeout: 1200 });
  const candidate = document.querySelector<HTMLInputElement>(".manuscript-reading-choice input");
  assert.ok(candidate);
  fireEvent.click(candidate);
  await waitFor(() => assert.ok(savedPayloads.some((payload) => payload.readingOverrides.length === 1)), { timeout: 1800 });
  fireEvent.click(await screen.findByRole("checkbox", {name:/取消/}));
  await waitFor(() => assert.ok(savedPayloads.some((payload) => payload.readingOverrides.length === 0)), { timeout: 1800 });
});

test("editor preserves current text after save failure and supports retry", async () => {
  const restored = work({ genre: "wujue", body: "" });
  let attempts = 0;
  desktopApi.works.get = async () => restored;
  desktopApi.works.getAnalysisState = async () => null;
  desktopApi.rules.listTemplates = async () => ({ templates: editorTemplates, datasetVersion: "1.0.0" });
  desktopApi.analysis.analyzePoem = async (request) => ({ ...analyzePoem(request.text, metre, pingze, readingRules, request), requestId: request.requestId, datasetVersions: { metre: "1.0.0" } });
  desktopApi.works.saveEditorState = async (request) => {
    attempts += 1;
    if (attempts === 1) throw new Error("disk unavailable");
    return { work: { ...restored, body: request.body, updatedAt: new Date().toISOString() }, analysisState: { workId: restored.id, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: new Date().toISOString() } };
  };
  render(<WorkDetailPage workId={restored.id} onBack={() => undefined} onArchived={() => undefined} />);
  const input = await screen.findByLabelText("第1句");
  await changeVerse(input,"晚风入夜深");
  assert.ok(await screen.findByText("disk unavailable", {}, { timeout: 1800 }));
  assert.equal(screen.getByLabelText("第1句").textContent, "晚风入夜深");
  fireEvent.click(screen.getByRole("button", { name: "重试保存", exact: true }));
  await waitFor(() => assert.ok(screen.getByText("已保存")), { timeout: 1200 });
  assert.equal(screen.getByLabelText("第1句").textContent, "晚风入夜深");
});

test("editor removes a stale reading override after the original character changes", async () => {
  const restored = work({ genre: "qijue", body: "行风春春春春春\n春春春春春春春\n春春春春春春春春\n春春春春春春春" });
  const savedOverrides: unknown[][] = [];
  desktopApi.works.get = async () => restored;
  desktopApi.works.getAnalysisState = async () => ({ workId: restored.id, templateId: "qijue", variantId: null, readingOverrides: [{ lineIndex: 0, characterIndex: 0, character: "行", candidateId: "行:ping-07yang", sourceText: restored.body.split("\n")[0], sourceOffset: 0 }], ruleDatasetVersions: {}, updatedAt: restored.updatedAt });
  desktopApi.rules.listTemplates = async () => ({ templates: editorTemplates, datasetVersion: "1.0.0" });
  desktopApi.analysis.analyzePoem = async (request) => ({ ...analyzePoem(request.text, metre, pingze, readingRules, request), requestId: request.requestId, datasetVersions: { metre: "1.0.0" } });
  desktopApi.works.saveEditorState = async (request) => { savedOverrides.push(request.readingOverrides); return { work: { ...restored, body: request.body }, analysisState: { workId: restored.id, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: new Date().toISOString() } }; };
  render(<WorkDetailPage workId={restored.id} onBack={() => undefined} onArchived={() => undefined} />);
  const firstLine = await screen.findByLabelText("第1句");
  await changeVerse(firstLine,"春风春春春春春");
  await waitFor(() => assert.ok(savedOverrides.some((overrides) => overrides.length === 0)), { timeout: 2000 });
  assert.equal((screen.queryByText("清除选择")) === (null), true, "DOM identity or absence matches");
});

test("export dialog saves dirty editor snapshot before exporting current text", async () => {
  const { ExportDialog } = await import("../../src/components/editor/ExportDialog.tsx");
  const restored = work({ body: "屏幕正文" });
  let saveCalls = 0;
  let exportRequest: any;
  desktopApi.works.saveEditorState = async (request) => { saveCalls += 1; return { work: { ...restored, body: request.body }, analysisState: { workId: restored.id, templateId: request.templateId, variantId: request.variantId, readingOverrides: request.readingOverrides, ruleDatasetVersions: request.ruleDatasetVersions, updatedAt: restored.updatedAt } }; };
  desktopApi.works.export = async (request) => { exportRequest = request; return { status: "exported", path: "/tmp/屏幕正文.md" }; };
  render(<ExportDialog editor={{ work: restored, title: restored.title, body: restored.body, lines: ["屏幕正文"], genre: restored.genre, status: restored.status, collectionId: null, location: "", notes: "", tags: [], rhymeGroupId: null, templateId: restored.genre, variantId: undefined, readingOverrides: [], ruleDatasetVersions: {}, dirty: true, bodyEdited: true, analysisDirty: false, saveStatus: "dirty" }} onClose={() => undefined} onEnsureSaved={async () => { saveCalls += 1; return true; }} />);
  fireEvent.click(screen.getByText("Markdown"));fireEvent.click(screen.getByText("选择位置并导出"));
  await waitFor(() => assert.ok(screen.getByText(/已导出至/u)));
  assert.equal(saveCalls, 1);
  assert.equal(exportRequest.body, "屏幕正文");
});

test("export dialog treats save dialog cancellation as normal status", async () => {
  const { ExportDialog } = await import("../../src/components/editor/ExportDialog.tsx");
  const restored = work();
  desktopApi.works.export = async () => ({ status: "cancelled" });
  render(<ExportDialog editor={{ work: restored, title: restored.title, body: restored.body, lines: [restored.body], genre: restored.genre, status: restored.status, collectionId: null, location: "", notes: "", tags: [], templateId: restored.genre, variantId: undefined, readingOverrides: [], ruleDatasetVersions: {}, dirty: false, bodyEdited: false, analysisDirty: false, saveStatus: "saved" }} onClose={() => undefined} onEnsureSaved={async () => true} />);
  fireEvent.click(screen.getByText("Markdown"));fireEvent.click(screen.getByText("选择位置并导出"));
  assert.ok(await screen.findByText("已取消导出。"));
  assert.equal((screen.queryByText("导出未完成，请重试。")) === (null), true, "DOM identity or absence matches");
});

test("export dialog refuses to export stale content when dirty save fails", async () => {
  const { ExportDialog } = await import("../../src/components/editor/ExportDialog.tsx");
  const restored = work({ body: "旧正文" });
  let exportCalls = 0;
  desktopApi.works.saveEditorState = async () => { throw new Error("save unavailable"); };
  desktopApi.works.export = async () => { exportCalls += 1; return { status: "exported", path: "/tmp/should-not-exist.md" }; };
  render(<ExportDialog editor={{ work: restored, title: restored.title, body: "新正文", lines: ["新正文"], genre: restored.genre, status: restored.status, collectionId: null, location: "", notes: "", tags: [], rhymeGroupId: null, templateId: restored.genre, variantId: undefined, readingOverrides: [], ruleDatasetVersions: {}, dirty: true, bodyEdited: true, analysisDirty: false, saveStatus: "dirty" }} onClose={() => undefined} onEnsureSaved={async () => false} />);
  fireEvent.click(screen.getByText("Markdown"));fireEvent.click(screen.getByText("选择位置并导出"));
  assert.ok(await screen.findByText("当前修改尚未保存，未执行导出。请先重试保存。"));
  assert.equal(exportCalls, 0);
});

test("UI-01 home shows one real latest draft, not a duplicate work dashboard",async()=>{
 const items=Array.from({length:8},(_,i)=>work({id:`work-${i}`,title:`作品${i}`,body:`首句${i}`,updatedAt:`2026-09-${String(i+1).padStart(2,'0')}T00:00:00Z`,status:i===7?'completed':'draft'}));desktopApi.works.query=queryFixture(()=>items);const opened:string[]=[];
 render(<HomePage onOpenWork={id=>opened.push(id)} onCreateWork={()=>{}}/>);await screen.findByText('作品6');assert.equal(Boolean(screen.queryByText('作品7')),false);fireEvent.click(screen.getByRole('button',{name:'作品6'}));assert.deepEqual(opened,['work-6']);
});

test('UI-01 empty home retains real recommendations and a creation entry, without fake recent works',async()=>{desktopApi.works.query=queryFixture(()=>[]);let created=0;render(<HomePage onOpenWork={()=>assert.fail('no work')} onCreateWork={()=>created++}/>);await screen.findByText('开始写作');fireEvent.click(screen.getByRole('button',{name:'开始写作'}));assert.equal(created,1);assert.ok(screen.getByRole('button',{name:'阅读全文：终南别业'}));});


test('Failure presentation keeps the real reason, full IPC detail and retry action', async () => {
  const { ErrorState } = await import('../../src/components/common/AsyncState.tsx');
  const message = "Error invoking remote method 'works:list': Error: 无法读取诗稿";
  let retries=0;
  render(<ErrorState message={message} onRetry={()=>{retries++;}} />);
  assert.ok(screen.getByText('无法读取诗稿'));
  const details=document.querySelector('.error-details') as HTMLDetailsElement;
  assert.equal(details.open,false);
  fireEvent.click(screen.getByText('错误详情'));assert.equal(details.open,true);
  assert.ok(screen.getByText(message));
  fireEvent.click(screen.getByRole('button',{name:'重试'}));assert.equal(retries,1);
});

test('library view restores its filters and scroll position after opening a work',async()=>{
 const memory={current:{filters:{status:'all' as const,genre:'all' as const,room:'all' as const,tag:''},scrollTop:0}};
 desktopApi.works.query=queryFixture(()=>[work({room:'poetry',title:'可返回的作品'})]);
 let opened='';let view=render(<WorksPage viewState={memory} onOpenWork={id=>{opened=id;}} onCreateWork={()=>{}}/>);
 await screen.findByText('可返回的作品');fireEvent.click(screen.getByRole('button',{name:'查找',exact:true}));fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'可返回'}});
 await screen.findByText('可返回的作品');const page=document.querySelector('.library-work-list')!;page.scrollTop=180;fireEvent.scroll(page);fireEvent.click(screen.getAllByRole('button',{name:/^打开：/})[0]);assert.ok(opened);view.unmount();
 view=render(<WorksPage viewState={memory} onOpenWork={()=>{}} onCreateWork={()=>{}}/>);await screen.findByText('可返回的作品');
 assert.equal((screen.getByLabelText('查找作品题名') as HTMLInputElement).value,'可返回');assert.equal(document.querySelector('.library-work-list')!.scrollTop,180);
});

// Match the new server-side list contract; the original view assertions remain.
function queryFixture(records: () => WorkRecord[]): typeof desktopApi.works.query {
  return async (request={}) => {
    const all=records();
    const matches=all.filter(work=>(request.includeArchived||work.status!=="archived")&&(!request.status||work.status===request.status)&&(!request.room||(work.room??"poetry")===request.room)&&(!request.genre||work.genre===request.genre)&&(!request.category||(work.category??"unclassified")===request.category)&&(!request.tag||work.tags.includes(request.tag))&&(!request.query||work.title.includes(request.query.trim()))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
    const visible=request.cursor?matches.filter(work=>work.updatedAt<request.cursor!.updatedAt||(work.updatedAt===request.cursor!.updatedAt&&work.id<request.cursor!.id)):matches;
    const page=visible.slice(0,request.limit??24);
    const items=page.map(({id,title,genre,room,category,status,tags,createdAt,updatedAt,body})=>({id,title,genre,room:room??"poetry",category:category??"unclassified",status,tags,createdAt,updatedAt,preview:body.trim().split(/\r?\n/u)[0].slice(0,160)}));
    const last=items.at(-1);
    return {items,total:matches.length,tags:[...new Set(all.flatMap(work=>work.tags))],nextCursor:visible.length>items.length&&last?{id:last.id,updatedAt:last.updatedAt}:null};
  };
}

test('summary list ignores an older filter response and keeps clear/reset reachable for no match',async()=>{
  let oldResolve!: (result:Awaited<ReturnType<typeof desktopApi.works.query>>)=>void;
  const api=queryFixture(()=>[work({title:'春风'}),work({id:'123e4567-e89b-12d3-a456-426614174001',title:'秋月'})]);
  desktopApi.works.query=async request=>request?.query==='春'?new Promise(resolve=>{oldResolve=resolve;}):api(request);
  render(<WorksPage onOpenWork={()=>{}} onCreateWork={()=>{}}/>);await screen.findByText('春风');fireEvent.click(screen.getByRole('button',{name:'查找',exact:true}));
  fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'春'}});
  fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'秋'}});await screen.findByText('秋月');
  oldResolve(await api({query:'春',includeArchived:true}));await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((screen.queryByText('春风')) === (null), true, "DOM identity or absence matches");assert.ok(screen.getByText('秋月'));
  fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'不存在'}});await screen.findByText('没有相合的作品');
  fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:''}});await screen.findByText('春风');fireEvent.click(screen.getByRole('button',{name:'查找',exact:true}));
  fireEvent.click(screen.getByText('已归档'));await screen.findByText('暂无作品');
  fireEvent.click(screen.getByText('全部作品'));await screen.findByText('秋月');
});

test('more-page response cannot append rows after the active query changes, and loading prevents repeat requests',async()=>{
  const records=Array.from({length:30},(_,index)=>work({id:`123e4567-e89b-12d3-a456-${String(index).padStart(12,'0')}`,title:`分页${index}`}));
  const api=queryFixture(()=>records);let moreResolve!: (result:Awaited<ReturnType<typeof api>>)=>void,moreCalls=0;
  desktopApi.works.query=request=>request?.cursor?(moreCalls++,new Promise(resolve=>{moreResolve=resolve;})):api(request);
  render(<WorksPage onOpenWork={()=>{}} onCreateWork={()=>{}}/>);await screen.findByRole('button',{name:'加载更多'});
  fireEvent.click(screen.getByRole('button',{name:'加载更多'}));assert.equal((screen.getByRole('button',{name:'正在取阅…'}) as HTMLButtonElement).disabled,true);assert.equal(moreCalls,1);
  fireEvent.click(screen.getByRole('button',{name:'查找',exact:true}));fireEvent.change(screen.getByLabelText('查找作品题名'),{target:{value:'分页1'}});await screen.findByText('分页1');
  moreResolve(await api({includeArchived:true,cursor:{id:records[6].id,updatedAt:records[6].updatedAt}}));await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((screen.queryByText('分页0')) === (null), true, "DOM identity or absence matches");assert.equal((screen.queryByText('分页29')) === (null), true, "DOM identity or absence matches");
});

test('return to a paged list re-reads every loaded page, refreshes edited summaries and restores deep scroll',async()=>{
  let records=Array.from({length:57},(_,index)=>work({id:`123e4567-e89b-12d3-a456-${String(index).padStart(12,'0')}`,title:`多页${index}`}));
  const memory={current:{filters:{status:'all' as const,genre:'all' as const,room:'all' as const,tag:'',query:''},scrollTop:0,loadedPages:1}};
  const requests:unknown[]=[];const api=queryFixture(()=>records);
  desktopApi.works.query=async request=>{requests.push(request);return api(request);};
  let view=render(<WorksPage viewState={memory} onOpenWork={()=>{}} onCreateWork={()=>{}}/>);
  await screen.findByText('多页56');fireEvent.click(await screen.findByRole('button',{name:'加载更多'}));await screen.findByText('多页9');
  fireEvent.click(screen.getByRole('button',{name:'加载更多'}));await screen.findByText('多页0');
  const page=document.querySelector('.library-work-list')!;page.scrollTop=1400;fireEvent.scroll(page);fireEvent.doubleClick(screen.getAllByRole('button',{name:/^打开：/})[40]);view.unmount();
  records=records.map((record,index)=>index===8?{...record,title:'保存后的题名',body:'保存后的首句',updatedAt:'2026-10-04T00:00:00Z'}:record);
  requests.length=0;view=render(<WorksPage viewState={memory} onOpenWork={()=>{}} onCreateWork={()=>{}}/>);
  await screen.findByText('多页0');assert.ok(screen.getByText('保存后的题名'));assert.ok(screen.getByText('保存后的首句'));
  assert.equal(document.querySelector('.library-work-list')!.scrollTop,1400);assert.equal(document.querySelectorAll('.library-work-row').length,57);assert.equal(requests.length,3);
});

test('an archive completing after library unmount cannot start a new query or rewrite retained page memory',async()=>{
  let resolveArchive!:(work:WorkRecord)=>void,queries=0;
  const api=queryFixture(()=>[work()]);desktopApi.works.query=async request=>{queries++;return api(request);};
  desktopApi.works.archive=()=>new Promise(resolve=>{resolveArchive=resolve;});
  const memory={current:{filters:{status:'all' as const,genre:'all' as const,room:'all' as const,tag:''},scrollTop:120,loadedPages:1}};
  const view=render(<WorksPage viewState={memory} onOpenWork={()=>{}} onCreateWork={()=>{}}/>);await screen.findByText('春望');fireEvent.click(screen.getAllByRole('button',{name:/^操作：/})[0]);fireEvent.click(screen.getByRole('button',{name:'归档',exact:true}));view.unmount();
  memory.current.loadedPages=3;resolveArchive(work({status:'archived'}));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(queries,1);assert.equal(memory.current.loadedPages,3);
});

test('publication waits for a successful saved snapshot before opening the new preview',async()=>{
 const {ExportDialog}=await import('../../src/components/editor/ExportDialog.tsx');const restored=work();let saved=false,opened=0;const old=desktopApi.works.openPublication;
 desktopApi.works.openPublication=async r=>{assert.ok(saved);assert.equal(r.workId,restored.id);opened++;return{status:'opened'}};
 try{render(<ExportDialog editor={{work:restored,title:restored.title,body:restored.body,genre:restored.genre,status:restored.status,location:'',notes:'',tags:[],dirty:false,saveStatus:'saved'}} onClose={()=>{}} onEnsureSaved={async()=>{saved=true;return true}}/>);fireEvent.click(screen.getByText('开始排版'));await waitFor(()=>assert.equal(opened,1));}finally{desktopApi.works.openPublication=old;}
});

for(const count of [0,1])test(`collection export uses actual count ${count}, not filtered results`,async()=>{
 desktopApi.works.query=queryFixture(()=>[]);
 desktopApi.works.collectionOverview=async()=>({all:count,uncollected:0,archived:0,collections:[{id:'collection-test',name:'空山集',count,createdAt:'2026-10-31T00:00:00Z',updatedAt:'2026-10-31T00:00:00Z'}]});
 let calls=0;desktopApi.works.openPublication=async()=>{calls++;throw Error("Error invoking remote method 'publication:open': Error: 没有可导出的作品。");};
 const memory={current:{filters:{status:'all' as const,genre:'all' as const,query:'无结果'},scope:'collection-test',scrollTop:0}};
 render(<WorksPage viewState={memory} onOpenWork={()=>{}} onCreateWork={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'文集操作'}));
 const button=screen.getByRole('button',{name:'导出文集'}) as HTMLButtonElement;
 assert.equal(button.disabled,count===0);fireEvent.click(button);
 if(count===0){assert.equal(calls,0);assert.equal(Boolean(screen.queryByRole('alert')),false);}
 else{await waitFor(()=>assert.equal(screen.getByRole('alert').textContent,'没有可导出的作品。'));assert.equal(calls,1);}
});

test('current new-work paper creates the chosen genre and collection before opening it',async()=>{
 const {LibraryNewWork}=await import('../../src/components/works/LibraryNewWork.tsx');let request:any,opened='';
 desktopApi.works.create=async input=>{request=input;return work({genre:'free',room:'song',category:'modern',title:input.title??''})};
 render(<LibraryNewWork collectionId="123e4567-e89b-12d3-a456-426614174002" onClose={()=>{}} onCreated={id=>opened=id}/>);
 fireEvent.change(screen.getByLabelText('题名'),{target:{value:'雨后'}});fireEvent.click(screen.getByRole('button',{name:'现代诗',exact:true}));fireEvent.click(screen.getByRole('button',{name:'创建',exact:true}));
 await waitFor(()=>assert.equal(opened,work().id));assert.equal(request.title,'雨后');assert.equal(request.genre,'free');assert.equal(request.category,'modern');assert.equal(request.collectionId,'123e4567-e89b-12d3-a456-426614174002');
});
test('current new-work paper retains input after failure and retries without navigating early',async()=>{
 const {LibraryNewWork}=await import('../../src/components/works/LibraryNewWork.tsx');let opened=0,calls=0;
 desktopApi.works.create=async()=>{calls++;if(calls===1)throw Error('写入失败');return work()};
 render(<LibraryNewWork collectionId={null} onClose={()=>{}} onCreated={()=>opened++}/>);
 fireEvent.change(screen.getByLabelText('题名'),{target:{value:'保留题名'}});fireEvent.click(screen.getByRole('button',{name:'创建',exact:true}));await screen.findByRole('alert');assert.equal(opened,0);assert.equal((screen.getByLabelText('题名') as HTMLInputElement).value,'保留题名');
 fireEvent.click(screen.getByRole('button',{name:'创建',exact:true}));await waitFor(()=>assert.equal(opened,1));assert.equal(calls,2);
});
