import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { analyzeFixture, regularLines } from "../helpers/analysisFixture.ts";
import type { ManuscriptCharacter } from "../../src/components/editor/ManuscriptInspector.tsx";
import type { ReferenceGroupPage } from "../../src/shared/reference.ts";
import type { ReadingExplanationBundle } from "../../src/shared/readingExplanation.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { value: key === "window" ? dom.window : (dom.window as any)[key], configurable: true });
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react");
const { desktopApi } = await import("../../src/services/desktopApi.ts");
const { ManuscriptInspector } = await import("../../src/components/editor/ManuscriptInspector.tsx");
const originals = { groups: desktopApi.reference.groups, group: desktopApi.reference.group, explanations: desktopApi.reference.explanations };
afterEach(() => { cleanup(); Object.assign(desktopApi.reference, originals); });

const candidates = [
  { id: "长:ping-07yang", toneType: "ping" as const, toneCategory: "ping" as const, rhymeGroupId: "ping-07yang", rhymeGroupName: "七阳", glosses: ["长远"] },
  { id: "长:shang-22yang", toneType: "ze" as const, toneCategory: "shang" as const, rhymeGroupId: "shang-22yang", rhymeGroupName: "二十二养", glosses: ["长幼"] },
];
function selected(): ManuscriptCharacter {
  const base = analyzeFixture(regularLines).lines[0].characters[0];
  return { ...base, lineIndex: 0, character: "长", characterIndex: 0, reading: { ...base.reading, character: "长", candidates, allCandidates:candidates, selectedCandidate: null, source: "unresolved" }, readingConfirmation: "required" };
}
function analysis() {
  const value = analyzeFixture(regularLines);
  value.lines[0].characters[0] = selected();
  value.rhyme.commonGroupIds = ["ping-07yang", "shang-22yang"];
  value.rhyme.feet[0].candidateGroupIds = ["ping-07yang"];
  return value;
}
function page(id = "ping-07yang", chars = "霜光", nextOffset: number | null = null): ReferenceGroupPage {
  return { group: { id, name: id === "ping-07yang" ? "七阳" : "二十二养", tone: "平声", count: 3 }, items: Array.from(chars, character => ({ character, readings: [] })), nextOffset, view: "common-first", filteredCount: 2, usageVersion: "test", usageAvailable: true };
}
const empty: ReadingExplanationBundle = { version: "test", entries: [], sources: [] };
const props = () => ({ selected: selected(), analysis: null, onSelect() {}, onClear() {}, onQueryCharacter() {}, onQueryGroup() {} });

test("candidate circles select and clear only explicit readings even when explanation loading fails", async () => {
  desktopApi.reference.explanations = async () => { throw Error("offline"); };
  const changes: unknown[][] = [];
  const initial = props();
  const callbacks = { onSelect: (...args: unknown[]) => changes.push(args), onClear: (...args: unknown[]) => changes.push(args) };
  const view = render(<ManuscriptInspector {...initial} {...callbacks} />);
  await act(async () => {});
  assert.ok(screen.getByText("字义资料暂不可用"));
  fireEvent.click(screen.getByRole("checkbox", { name: "采用平声 · 七阳" }));
  assert.deepEqual(changes, [[0, 0, "长", candidates[0].id]]);
  const chosen = selected();
  chosen.reading = { ...chosen.reading, source: "user-override", selectedCandidate: candidates[0] };
  view.rerender(<ManuscriptInspector {...initial} {...callbacks} selected={chosen} />);
  assert.equal((screen.getByRole("checkbox", { name: "取消平声 · 七阳" }) as HTMLInputElement).checked, true);
  fireEvent.click(screen.getByRole("checkbox", { name: "取消平声 · 七阳" }));
  assert.deepEqual(changes[1], [0, 0]);
  chosen.reading = { ...chosen.reading, source: "phrase-rule" };
  view.rerender(<ManuscriptInspector {...initial} {...callbacks} selected={chosen} />);
  assert.equal((screen.getByRole("checkbox", { name: "采用平声 · 七阳" }) as HTMLInputElement).checked, false);
});

test("candidate definition and expandable source stay in the same row without duplicate controls", async () => {
  desktopApi.reference.explanations = async () => ({ version: "test", sources: [{ id: "s", title: "诗词格律", edition: "本地", locator: "卷一" }], entries: [{ key: { system: "pingshui", character: "长", sourceCandidateId: candidates[0].id, groupId: "ping-07yang", tone: "ping" }, status: "partial", version: "test", senses: [{ id: "length", meaning: "长度、距离长远", usage: "与短相对", sourceIds: ["s"], examples: [{ text: "我报路长嗟日暮", sourceId: "s", locator: "OEBPS/Text/poem.html / 李清照《渔家傲》" }] }] }] });
  render(<ManuscriptInspector {...props()} />);
  await act(async () => {});
  const row = screen.getByText("长度、距离长远").closest(".manuscript-reading") as HTMLElement;
  assert.equal(within(row).getAllByRole("checkbox").length, 1);
  assert.equal(screen.getAllByRole("checkbox").length, 2);
  assert.equal(screen.queryByText("我报路长嗟日暮"), null);
  assert.equal(within(row).queryByText("与短相对"), null);
  fireEvent.click(within(row).getByRole("button", { name: "例句与出处" }));
  assert.ok(within(row).getByText("我报路长嗟日暮"));
  assert.ok(within(row).getByText("与短相对"));
  assert.ok(within(row).getByText("资料待补全"));
  assert.match(row.textContent!, /诗词格律 · 李清照/);
  assert.ok(!row.textContent!.includes("OEBPS"));
});

test("fresh pending character masks the previous definitions and actions while preserving its position", async () => {
  desktopApi.reference.explanations = async () => empty;
  const view = render(<ManuscriptInspector {...props()} />);
  await act(async () => {});
  view.rerender(<ManuscriptInspector {...props()} selected={null} pendingCharacter={{ character: "风", lineIndex: 2, characterIndex: 3 }} loading />);
  assert.ok(screen.getByText("风"));
  assert.ok(screen.getByText("第3句 · 第4字"));
  assert.equal(screen.queryByText("长幼"), null);
  assert.equal(screen.queryByRole("checkbox"), null);
  assert.equal(screen.queryByText(/^谱式：/), null);
});

test("current-character proof names only tone comparison and gives coverage priority over a match", async () => {
  desktopApi.reference.explanations = async () => empty;
  const character = { ...selected(), isFlexible: false, expectedTone: "ping" as const, status: "match" as const, ruleCoverage: "modeled" as const };
  const view = render(<ManuscriptInspector {...props()} selected={character} />);
  await act(async () => {});
  assert.ok(screen.getByText("谱式：平"));
  assert.ok(screen.getByText("平仄符合"));
  view.rerender(<ManuscriptInspector {...props()} selected={{ ...character, expectedTone: "ze", status: "mismatch" }} />);
  assert.ok(screen.getByText("谱式：仄"));
  assert.ok(screen.getByText("平仄不符"));
  view.rerender(<ManuscriptInspector {...props()} selected={{ ...character, isFlexible: true, ruleCoverage: "unmodeled-special-position" }} />);
  assert.ok(screen.getByText("谱式：中"));
  assert.ok(screen.getByText("未覆盖"));
  assert.equal(screen.queryByText("平仄符合"), null);
  assert.ok(document.querySelector(".manuscript-check.is-uncovered"));
  view.rerender(<ManuscriptInspector {...props()} selected={character} loading />);
  assert.equal(screen.queryByText(/^谱式：/), null);
  assert.equal(screen.queryByText("平仄符合"), null);
  assert.equal(document.querySelector(".manuscript-check"), null);
});

test("empty poem and unavailable rhyme material remain usable without invented rhyme or definitions", async () => {
  desktopApi.reference.explanations = async () => empty;
  desktopApi.reference.group = async () => { throw Error("offline"); };
  const view = render(<ManuscriptInspector {...props()} selected={null} />);
  assert.ok(screen.getByText("未定"));
  assert.equal(screen.queryByRole("checkbox"), null);
  view.rerender(<ManuscriptInspector {...props()} analysis={analysis()} />);
  await act(async () => {});
  assert.ok(screen.getByText("韵字资料暂不可用"));
  assert.equal(screen.getAllByRole("checkbox").length, 2);
  assert.ok(screen.getByLabelText("已用韵脚"));
});

test("chosen reading preserves complete choices and same-character explanations while analysis refreshes", async()=>{
 desktopApi.reference.explanations=async()=>empty;
 const chosen=selected();chosen.reading={...chosen.reading,candidates:[candidates[0]],allCandidates:candidates,selectedCandidate:candidates[0],source:"user-override"};
 const view=render(<ManuscriptInspector {...props()} selected={chosen} chosenCandidateId={candidates[0].id}/>);
 await act(async()=>{});
 const first=screen.getByRole("checkbox",{name:"取消平声 · 七阳"});
 assert.equal(screen.getAllByRole("checkbox").length,2);
 view.rerender(<ManuscriptInspector {...props()} selected={chosen} chosenCandidateId={candidates[1].id} loading/>);
 assert.equal(screen.getAllByRole("checkbox").length,2);
 assert.equal(screen.getByRole("checkbox",{name:"采用平声 · 七阳"}),first);
 assert.equal((screen.getByRole("checkbox",{name:"取消上声 · 二十二养"}) as HTMLInputElement).checked,true);
 assert.equal(screen.queryByText("正在更新校对"),null);
});

test('a single available reading shows its explanation without a selection circle',async()=>{
 desktopApi.reference.explanations=async()=>empty;
 const value=selected();value.reading={...value.reading,candidates:[candidates[0]],allCandidates:[candidates[0]]};
 render(<ManuscriptInspector {...props()} selected={value}/>);
 assert.equal(screen.queryAllByRole('checkbox').length,0);assert.ok(screen.getByText('七阳'));
 await act(async()=>{await Promise.resolve()});
});
