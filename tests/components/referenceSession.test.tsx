import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : (dom.window as any)[key], configurable: true });
const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { EditorHeader } = await import('../../src/components/editor/EditorHeader.tsx');
const { ReferenceSessionProvider } = await import('../../src/components/reference/ReferenceSession.tsx');
const { selectedEditorCharacter, captureEditorPosition } = await import('../../src/features/reference/editorPosition.ts');
afterEach(cleanup);
function api() {
  window.shifang = { reference: {
    groups: async () => [{ id: 'g', name: '一东', tone: '平', count: 1 }],
    lookup: async ({ system, character }: any) => ({ system, character, sourceId: 'pingshui', version: '1', readings: [] }),
    patterns: async () => [], books: async () => [], sources: async () => [],
  } } as any;
}
function Manuscript({ id = 'one' }: { id?: string }) {
  return <section className="editor-page"><EditorHeader key={id} contextLabel="诗房 · 格律创作" title={id} saveStatus="dirty" saveError="" onBack={() => {}} onSave={() => {}} onExport={() => {}} /><div className="editor-layout"><div className="manuscript-column"><div className="manuscript-scroll"><textarea aria-label="稿面" defaultValue="原𠀀稿文字" /></div></div><aside className="editor-auxiliary">当前句辅助</aside></div></section>;
}
function app(id = 'one') { return <ReferenceSessionProvider><main className="app-shell"><Manuscript key={id} id={id} /></main></ReferenceSessionProvider>; }
async function open() { fireEvent.click(screen.getByRole('button', { name: '资料', exact: true })); return screen.findByRole('dialog'); }
test('one app reference session keeps query, tab and DOM across close, reopen and manuscript navigation', async () => {
  api(); const view = render(app()); const field = screen.getByLabelText('稿面') as HTMLTextAreaElement;
  field.focus(); field.setSelectionRange(1, 3, 'backward'); field.scrollLeft = 19;
  const scroll = document.querySelector<HTMLElement>('.manuscript-scroll')!; scroll.scrollTop = 140;
  await open(); const workspace = document.querySelector('.reference-workspace');
  const query = screen.getByLabelText('查询单字') as HTMLInputElement;
  fireEvent.change(query, { target: { value: '山' } });
  fireEvent.click(screen.getByRole('tab', { name: '格律' }));
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  await waitFor(() => assert.equal(document.activeElement === field, true, 'focus returns to the original manuscript'));
  assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection, field.scrollLeft, scroll.scrollTop], [1, 3, 'backward', 19, 140]);
  assert.equal((document.querySelector('[inert]')) === (null), true, "DOM identity or absence matches");
  assert.equal((document.querySelector('[role=dialog][aria-modal=true]')) === (null), true, "DOM identity or absence matches");
  await open(); assert.equal(document.querySelector('.reference-workspace') === workspace, true, 'reference workspace node is retained');
  assert.equal(screen.getByRole('tab', { name: '格律' }).getAttribute('aria-selected'), 'true');
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  view.rerender(app('two')); await open();
  assert.equal(document.querySelector('.reference-workspace') === workspace, true, 'reference workspace node is retained');
  fireEvent.click(screen.getByRole('tab', { name: '查字' }));
  assert.equal(screen.getByLabelText('查询单字') === query, true, 'query input node is retained'); assert.equal(query.value, '山');
});
test('keyboard action restores the last native selection and IME cannot open or dismiss reference', async () => {
  api(); render(app()); const field = screen.getByLabelText('稿面') as HTMLTextAreaElement;
  field.focus(); field.setSelectionRange(2, 5, 'backward'); fireEvent.select(field); const trigger = screen.getByRole('button', { name: '资料', exact: true }); trigger.focus();
  await open(); fireEvent.keyDown(document, { key: 'Escape', isComposing: true }); assert.ok(screen.getByRole('dialog'));
  fireEvent.click(screen.getByRole('button', { name: '返回' })); await waitFor(() => assert.equal(document.activeElement === field, true, 'focus returns to the original manuscript')); assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection], [2, 5, 'backward']);
  fireEvent.compositionStart(field); fireEvent.click(trigger); assert.equal((screen.queryByRole('dialog')) === (null), true, "DOM identity or absence matches");
  fireEvent.compositionEnd(field); await open(); });
test('paper dialog stays modal at narrow widths without replacing the workspace', async () => {
  api(); render(app()); const field = screen.getByLabelText('稿面'); await open();
  const workspace = document.querySelector('.reference-workspace');
  fireEvent(window, new dom.window.Event('resize'));
  assert.ok(screen.getByRole('dialog'));
  assert.equal(screen.queryByRole('button',{name:'切换为并排'}),null);
  assert.equal(screen.getByLabelText('稿面'),field);
  assert.equal(document.querySelector('.reference-workspace'),workspace);
});
test('character capture rejects half supplementary characters and Range restores backward direction', () => {
  render(<div><textarea aria-label="字" defaultValue="山𠀀月" /><p tabIndex={0}>原文选区</p></div>);
  const input = screen.getByLabelText('字') as HTMLTextAreaElement; input.focus();
  input.setSelectionRange(1, 3); assert.equal(selectedEditorCharacter(), '𠀀');
  input.setSelectionRange(1, 2); assert.equal(selectedEditorCharacter(), undefined);
  input.setSelectionRange(0, 3); assert.equal(selectedEditorCharacter(), undefined);
  const paragraph = document.querySelector('p')!, text = paragraph.firstChild!; paragraph.focus();
  const selection = window.getSelection()!; selection.setBaseAndExtent(text, 4, text, 1);
  const restore = captureEditorPosition(); selection.removeAllRanges(); input.focus(); restore();
  assert.equal(document.activeElement === paragraph, true, 'focus returns to the original paragraph'); assert.equal(selection.anchorOffset, 4); assert.equal(selection.focusOffset, 1); assert.equal(selection.toString(), '文选区');
});


test('ci reading returns the original native Range after modal lookup',async()=>{
 api(); render(<ReferenceSessionProvider><main className="app-shell"><section className="editor-page ci-editor"><EditorHeader title="读稿" contextLabel="词房" saveStatus="saved" saveError="" onBack={()=>{}} onSave={()=>{}} onExport={()=>{}}/><div className="manuscript-column"><div className="manuscript-scroll"><div className="ci-reading" tabIndex={0}>山川风月文章</div></div></div></section></main></ReferenceSessionProvider>);
 const reader=document.querySelector<HTMLElement>('.ci-reading')!,text=reader.firstChild!,selection=window.getSelection()!;
 reader.focus();selection.setBaseAndExtent(text,4,text,1);fireEvent(document,new dom.window.Event('selectionchange'));
 await open();fireEvent.click(screen.getByRole('button',{name:'返回'}));await waitFor(()=>assert.equal(document.activeElement===reader,true));assert.deepEqual([selection.anchorOffset,selection.focusOffset,selection.toString()],[4,1,'川风月']);
});
