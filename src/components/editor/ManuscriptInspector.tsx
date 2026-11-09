import type { WorkAssistanceState, RhymeReference } from "../../shared/assistanceState";
import { getRhymeGroups, metreReferenceFeet, referenceFootStatus } from "../../features/editor/rhymeReference";
import { useRhymeReference } from "../../features/editor/useRhymeReference";
import { RhymeBrowser } from "../manuscript/RhymeBrowser";
import { ManuscriptAuxiliary, ManuscriptAuxiliarySection } from "../manuscript/ManuscriptUI";
import { useEffect, useRef, useState } from "react";
import type { CharacterAnalysis, PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";
import { useReadingExplanations } from "../../features/reference/useReadingExplanations";
import { useRhymePage } from "../../features/reference/useRhymePage";
import { readingEvidenceKeyId } from "../../shared/readingExplanation";
import { matchingExplanations } from "./CharacterExplanations";
import { ReadingExplanation } from "./ReadingExplanation";

export type ManuscriptCharacter = CharacterAnalysis & { lineIndex: number };
export interface ManuscriptInspectorProps {
  chosenCandidateId?: string|null;
  assistance?: WorkAssistanceState;
  body?: string;
  onFoot?: (line:number)=>void;
  onReference?: (reference:RhymeReference)=>void;
  selected: ManuscriptCharacter | null;
  pendingCharacter?: { character: string; lineIndex: number; characterIndex: number };
  analysis: PoemAnalysis | null;
  loading?: boolean;
  onSelect: (lineIndex: number, characterIndex: number, character: string, candidateId: string) => void;
  onClear: (lineIndex: number, characterIndex: number) => void;
  onQueryCharacter: (character: string) => void;
  onQueryGroup: (groupId: string) => void;
}

const toneNames = { ping: "平声", shang: "上声", qu: "去声", ru: "入声" };
const checkNames = { match: "平仄符合", mismatch: "平仄不符", uncertain: "待确认", unknown: "未收录", "not-applicable": "未校对", uncovered: "未覆盖" };

/** Browsing another group is local to this panel; it never changes the poem's readings. */
export function ManuscriptInspector({ chosenCandidateId, assistance, body = "", onReference, onFoot, selected, pendingCharacter, analysis, loading = false, onSelect, onClear, onQueryCharacter }: ManuscriptInspectorProps): JSX.Element {
  const current = selected ?? pendingCharacter;
  const checkState = selected?.ruleCoverage === "modeled" ? selected.status : "uncovered";
  const explanations = useReadingExplanations(selected && (selected.reading.allCandidates??selected.reading.candidates).length ? { system: "pingshui", character: selected.character } : null);
  const evidence = analysis ? getRhymeGroups({kind:"metre",value:analysis}) : [{segmentId:"poem",system:"pingshui" as const,groupIds:[],lineIndexes:[]}];
  const feet=analysis?metreReferenceFeet(analysis):[];
  const reference = useRhymeReference("pingshui","poem",assistance,evidence,body.split("\n"),feet,onReference,loading);
  const names = new Map(analysis?.lines.flatMap(line => line.characters.flatMap(item => item.reading.candidates.map(candidate => [candidate.rhymeGroupId, candidate.rhymeGroupName] as const))) ?? []);
  const groupId = reference.groupId;
  const currentFoot=feet.find(f=>f.line===selected?.lineIndex&&f.character===selected?.character&&selected?.characterIndex===(analysis?.lines.find(l=>l.lineIndex===f.line)?.characters.length??0)-1);
  const rhymeMismatch=!!currentFoot&&referenceFootStatus(groupId,currentFoot.groupIds,currentFoot.borrowMainGroupId)==="mismatch";
  for (const group of reference.groups) names.set(group.id,group.name);
  const [view, setView] = useState<"common-only" | "all">("common-only");
  const group = useRhymePage("pingshui", loading ? null : groupId, view);
  const characterScroll = useRef<HTMLDivElement>(null);
  const rhymeScroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (characterScroll.current) characterScroll.current.scrollTop = 0;
  }, [selected?.lineIndex, selected?.characterIndex, selected?.character]);

  useEffect(() => {
    if (rhymeScroll.current) rhymeScroll.current.scrollTop = 0;
  }, [groupId, view, loading]);

  return <ManuscriptAuxiliary aria-label="创作辅助">
    <ManuscriptAuxiliarySection aria-labelledby="manuscript-current-heading">
      <header className="manuscript-inspector-fixed">
        <div className="manuscript-zone-heading"><h2 id="manuscript-current-heading">当前字</h2><span>{current ? `第${current.lineIndex + 1}句 · 第${current.characterIndex + 1}字` : ""}</span></div>
        <div className="manuscript-current-character"><strong>{current ? <button className="manuscript-display-link" type="button" aria-label={`查字 ${current.character}`} onClick={() => onQueryCharacter(current.character)}>{current.character}</button> : "—"}</strong><div>{current && (loading || !selected) ? <span>校对中</span> : selected ? <><span>谱式：{selected.isFlexible ? "中" : selected.expectedTone ? selected.expectedTone === "ping" ? "平" : "仄" : "—"}</span><span className={`manuscript-check is-${rhymeMismatch?"mismatch":checkState}`}>{rhymeMismatch?(checkState==="mismatch"?"平仄、韵部不符":"韵部不符"):checkNames[checkState]}</span></> : <span>待落笔</span>}</div></div>
      </header>
      <div ref={characterScroll} className="manuscript-inspector-scroll" role="region" aria-label="当前字读法与释义" tabIndex={0}>
        {loading && !selected ? <p className="manuscript-inspector-muted" role="status">正在更新校对</p> : selected ? <>
          {explanations.status === "error" ? <p className="manuscript-inspector-muted" role="status">{explanations.error} <button className="manuscript-inspector-action" type="button" onClick={explanations.retry}>重试</button></p> : null}
          {(selected.reading.allCandidates??selected.reading.candidates).map(candidate => {
            const multiple=(selected.reading.allCandidates??selected.reading.candidates).length>1;
            const chosen = multiple && (chosenCandidateId!==undefined?chosenCandidateId===candidate.id:selected.reading.source === "user-override" && selected.reading.selectedCandidate?.id === candidate.id);
            const entries = explanations.status === "ready" ? matchingExplanations(explanations.bundle.entries, "pingshui", selected.character, { id: candidate.id, sourceCandidateId: candidate.id, groupId: candidate.rhymeGroupId, tone: candidate.toneCategory, label: "" }) : [];
            return <div className={`manuscript-reading${chosen ? " is-chosen" : ""}`} key={`${selected.lineIndex}:${selected.characterIndex}:${selected.character}:${candidate.id}`}>
              <label className={`manuscript-reading-choice${multiple?"":" is-single"}`}><span><strong>{toneNames[candidate.toneCategory]}</strong><small>{candidate.rhymeGroupName}</small></span>{multiple?<input type="checkbox" checked={chosen} aria-label={`${chosen ? "取消" : "采用"}${toneNames[candidate.toneCategory]} · ${candidate.rhymeGroupName}`} onChange={() => chosen ? onClear(selected.lineIndex, selected.characterIndex) : onSelect(selected.lineIndex, selected.characterIndex, selected.character, candidate.id)} />:null}</label>
              <div className="manuscript-reading-definition">
                {entries.length && explanations.status === "ready" ? entries.map(entry => <ReadingExplanation key={readingEvidenceKeyId(entry.key)} entry={entry} />) : <><p>{candidate.glosses.join("；") || "暂无释义资料"}</p>{explanations.status === "loading" ? <small role="status">正在读取字义</small> : null}</>}
              </div>
            </div>;
          })}
          {!(selected.reading.allCandidates??selected.reading.candidates).length ? <p className="manuscript-inspector-muted">当前字未收录</p> : null}
        </> : null}
      </div>
    </ManuscriptAuxiliarySection>
    <ManuscriptAuxiliarySection aria-labelledby="manuscript-rhyme-heading">
      <header className="manuscript-inspector-fixed">
        <div className="manuscript-zone-heading"><h2 id="manuscript-rhyme-heading">用韵</h2><span>平水韵</span></div>
        <RhymeBrowser reference={reference} feet={feet} names={names} loading={loading} onQueryFoot={f=>onFoot?onFoot(f.line):onQueryCharacter(f.character)}/>
        {!loading && groupId ? <div className="manuscript-rhyme-options"><div role="group" aria-label="韵字范围"><button type="button" className="manuscript-inspector-action" aria-pressed={view === "common-only"} onClick={() => setView("common-only")}>常用</button><button type="button" className="manuscript-inspector-action" aria-pressed={view === "all"} onClick={() => setView("all")}>全部</button></div><span>{group.page ? `${view === "all" ? group.page.group.count : group.page.filteredCount}字` : ""}</span></div> : null}
      </header>
      <div ref={rhymeScroll} className="manuscript-inspector-scroll" role="region" aria-label="同韵字" tabIndex={0} aria-busy={group.busy && !loading && Boolean(groupId)}>
        {!loading && groupId ? <>
          <div className="manuscript-rhyme-characters">{group.page?.items.map(item => <button type="button" key={item.character} onClick={() => onQueryCharacter(item.character)} aria-label={`查字 ${item.character}`}>{item.character}</button>)}</div>
          {group.busy ? <p className="manuscript-inspector-muted" role="status">正在读取韵字</p> : null}
          {group.error ? <p className="manuscript-inspector-muted" role="status">{group.error} <button type="button" className="manuscript-inspector-action" onClick={() => group.retry()}>重试</button></p> : null}
          {group.page?.nextOffset !== null && group.page ? <button type="button" className="manuscript-inspector-action manuscript-load-more" disabled={group.busy} onClick={() => void group.loadMore()}>更多韵字</button> : null}
          {group.page && !group.page.items.length ? <p className="manuscript-inspector-muted">{view === "common-only" ? "暂无常用韵字" : "暂无韵字资料"}</p> : null}
        </> : null}
      </div>
    </ManuscriptAuxiliarySection>
  </ManuscriptAuxiliary>;
}
