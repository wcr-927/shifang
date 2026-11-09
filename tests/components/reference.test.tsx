import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import type { ReferenceApi, ReferenceChapterPage, ReferenceGroupPage, ReferenceSearchPage } from "../../src/shared/reference.ts";
import type { RhymeView } from "../../src/shared/rhymeUsage.ts";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "CustomEvent", "MouseEvent"]) Object.defineProperty(globalThis, key, { value: key === "window" ? dom.window : (dom.window as any)[key], configurable: true });
Object.defineProperty(globalThis,"requestAnimationFrame",{value:(callback:()=>void)=>setTimeout(callback,0),configurable:true});
const { render, screen, fireEvent, waitFor, cleanup, act } = await import("@testing-library/react");
const { EditorHeader } = await import("../../src/components/editor/EditorHeader.tsx");
const { ReadingContent } = await import("../../src/components/reference/ReadingContent.tsx");
afterEach(cleanup);
const book = { id: "book", title: "原书", creator: "作者", publisher: "载本", hash: "hash", chapterCount: 2, tocCount: 3, importedAt: "2026-10-04", warnings: [] };
function chapter(documentId = "chapter", text = "前文明月后文"): ReferenceChapterPage { return { sourceId: "book", documentId, title: documentId === "note" ? "注释" : "第一节", blocks: [{ id: `${documentId}-0`, anchors: [], text, node: { type: "p", children: [{ type: "text", text }] } }], offset: 0, nextOffset: null, totalBlocks: 1, previousId: null, nextId: "note", targetBlockId: `${documentId}-0` }; }
function api(overrides: Partial<ReferenceApi> = {}) { const reference: ReferenceApi = { copy: async () => {}, lookup: async ({ system, character }) => ({ system, character, sourceId: system, version: "1", readings: [{ id: `${system}-1`, tone: system === "pingshui" ? "入声" : "平声", groupId: "g", groupName: system === "pingshui" ? "一东" : "第一部", glosses: ["原义"] }] }), groups: async () => [{ id: "g", name: "一东", tone: "平", count: 65 }], group: async request => rhymePage(request, [request.offset ? "月" : "明"], {nextOffset: request.offset ? null : 64}), patterns: async () => [], sources: async () => [{ id: "pingshui", title: "编者附表", author: "编者", version: "1", description: "电子载本", boundary: "不能表示为原著作者核定完整字典", urls: [] }], books: async () => [book], importBook: async () => ({ status: "cancelled" }), importProgress: async ({ requestId }) => ({ requestId, status: "cancelled", phase: "", completed: 0, total: 1, message: "" }), cancel: async () => {}, toc: async ({ parentId }) => ({ nodes: parentId ? [{ id: "child", parentId, label: "同名", documentId: "chapter", anchor: "", hasChildren: false }] : [{ id: "branch", parentId: null, label: "同名", documentId: "chapter", anchor: "", hasChildren: true }], nextOffset: null }), read: async ({ documentId }) => chapter(documentId), search: async ({ requestId }) => ({ requestId, items: [], nextOffset: null }), image: async () => ({ dataUrl: "" }), position: async () => null, savePosition: async () => {}, resolve: async () => ({ documentId: "chapter", anchor: "" }), ...overrides }; window.shifang = { reference } as any; return reference; }
async function apiBaseLookup(request: { system: "pingshui" | "cilin"; character: string }) { return { ...request, sourceId: request.system, version: "1", readings: [] }; }
test("safe structure renders nested text with exact original UTF16 match coordinates", () => {
 api(); render(<ReadingContent sourceId="book" block={{ id: "block", anchors: [], text: "𠀀明月", node: { type: "p", children: [{ type: "text", text: "𠀀" }, { type: "strong", children: [{ type: "text", text: "明月" }] }] } }} highlight={{ start: 2, end: 4 }} onLink={() => {}} />); assert.equal(document.querySelector("mark")?.textContent, "明月"); assert.equal(document.querySelector("p")?.textContent, "𠀀明月");
});
test("line breaks and image alternatives keep later highlights aligned to original block text", () => {
 api(); render(<ReadingContent sourceId="book" block={{ id: "block", anchors: [], text: "前\n插图明月", node: { type: "p", children: [{ type: "text", text: "前" }, { type: "br" }, { type: "img", imageId: "image", alt: "插图" }, { type: "text", text: "明月" }] } }} highlight={{ start: 4, end: 6 }} onLink={() => {}} />); assert.equal(document.querySelector("mark")?.textContent, "明月");
});

function pattern(id: string, kind: "metre" | "ci", version = "1") { return {id, kind, name: id, variant: "所选体", summary: "体式", lines: [{pattern: "平仄平", section: 1, rhyme: true}], notes: [], scope: "完整范围", sourceId: kind, version}; }

function rhymePage(request: { id: string; view?: RhymeView; offset?: number }, characters: string[], extra: Partial<ReferenceGroupPage> = {}): ReferenceGroupPage {
 return {group: {id: request.id, name: request.id === 'g2' ? '二冬' : '一东', tone: '平', count: 65}, view: request.view ?? 'all', filteredCount: 65, usageVersion: 'fixture-usage', usageAvailable: true, items: characters.map(character => ({character, readings: []})), nextOffset: null, ...extra};
}
