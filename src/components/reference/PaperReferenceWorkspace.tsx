import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { desktopApi, getDesktopErrorMessage } from "../../services/desktopApi";
import type { ReferenceGroup, ReferenceGroupPage, ReferenceLookup, ReferenceSystem } from "../../shared/reference";
import type { ReferenceContextRequest, ReferencePatternContext } from "../../shared/referenceContext";
import type { ReadingExplanationBundle } from "../../shared/readingExplanation";
import { PatternQueries, SourceDetails } from "./RuleQueries";

type Tab = "character" | "rhyme" | "pattern";
type View = { tab: Tab; system: ReferenceSystem; character: string; lookup: ReferenceLookup | null; explanations: ReadingExplanationBundle | null; group: ReferenceGroupPage | null; groupId: string | null; view: "common-only" | "all"; scroll: number };
const labels: Record<Tab, string> = { character: "查字", rhyme: "查韵", pattern: "格律" };
const noSourceNavigation = () => {};
export function PaperReferenceWorkspace({ onClose, initialSystem, request, referenceContext }: { onClose: () => void; initialSystem: ReferenceSystem; request?: ReferenceContextRequest; referenceContext?: ReferencePatternContext }): JSX.Element {
  const [state, setState] = useState<View>({ tab: "character", system: initialSystem, character: "", lookup: null, explanations: null, group: null, groupId: null, view: "common-only", scroll: 0 });
  const [trail, setTrail] = useState<View[]>([]), [groups, setGroups] = useState<ReferenceGroup[]>([]), [directory, setDirectory] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [directoryError, setDirectoryError] = useState(""), [revision, setRevision] = useState(0);
  const [patternRequest, setPatternRequest] = useState<Extract<ReferenceContextRequest, {kind:"pattern"}>>();
  const content = useRef<HTMLDivElement>(null), epoch = useRef(0), consumed = useRef(""), current = useRef(state);
  const retryGroup = useRef<(() => void) | null>(null);
  current.current = state;
  useEffect(() => { let stale = false; setGroups([]); setDirectoryError(""); void desktopApi.reference.groups({ system: state.system }).then(items => { if (!stale) setGroups(items); }).catch(cause => { if (!stale) setDirectoryError(getDesktopErrorMessage(cause, "韵部目录未能读取。")); }); return () => { stale = true; }; }, [state.system, revision]);
  useEffect(() => () => { epoch.current++; }, []);
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = state.scroll; }, [state]);
  function remember() { setTrail(items => [...items, { ...current.current, scroll: content.current?.scrollTop ?? 0 }]); }
  function back() { epoch.current++; setBusy(false); setError(""); setDirectory(false); const previous = trail.at(-1); if (previous) { setState(previous); setTrail(items => items.slice(0,-1)); } }
  async function lookup(character: string, system = current.current.system, push = true) {
    if ([...character].length !== 1) { setError("请输入一个完整字符。"); return; }
    if (push) remember(); const id = ++epoch.current; setBusy(true); setError(""); setDirectory(false);
    setState(s => ({ ...s, tab: "character", system, character, lookup: null, explanations: null, scroll: 0 }));
    try {
      const result = await desktopApi.reference.lookup({ character, system });
      if (id !== epoch.current) return;
      setState(s => ({ ...s, lookup: result }));
      // A missing explanation must never hide the dictionary's valid readings.
      try { const explanations = await desktopApi.reference.explanations({ character, system }); if (id === epoch.current) setState(s => ({ ...s, explanations })); } catch { /* Dictionary glosses remain available. */ }
    } catch (cause) { if (id === epoch.current) setError(getDesktopErrorMessage(cause, "单字查询未能完成，请重新查询。")); }
    finally { if (id === epoch.current) setBusy(false); }
  }
  async function openGroup(groupId: string, system = current.current.system, push = true, offset = 0, view = current.current.view) {
    if (push) remember(); const id = ++epoch.current; setBusy(true); setError(""); setDirectory(false);
    retryGroup.current = () => { void openGroup(groupId, system, false, offset, view); };
    const scroll = offset ? content.current?.scrollTop ?? 0 : 0;
    setState(s => ({ ...s, tab: "rhyme", system, group: offset && s.groupId === groupId && s.system === system && s.view === view ? s.group : null, groupId, view, scroll }));
    try { const result = await desktopApi.reference.group({ system, id: groupId, view, offset, limit: view === "common-only" ? 48 : 64 }); if (id === epoch.current) setState(s => ({ ...s, group: offset && s.group?.group.id === groupId && s.view === view && s.system === system ? { ...result, items: [...s.group.items, ...result.items] } : result })); }
    catch (cause) { if (id === epoch.current) setError(getDesktopErrorMessage(cause, "韵字未能读取，请重新选择韵部。")); }
    finally { if (id === epoch.current) setBusy(false); }
  }
  function activate(tab: Tab) {
    epoch.current++; setBusy(false); setError(""); setTrail([]); setDirectory(false); setState(s => ({ ...s, tab, scroll: 0 }));
    if (tab === "pattern" && referenceContext) setPatternRequest({ id: `context-${Date.now()}`, kind: "pattern", pattern: referenceContext });
  }
  useEffect(() => {
    if (!request || consumed.current === request.id) return; consumed.current = request.id; setTrail([]);
    if (request.kind === "pattern") { activate("pattern"); setPatternRequest(request); }
    else if (request.kind === "character") void lookup(request.character, request.system, false);
    else void openGroup(request.groupId, request.system, false);
  }, [request?.id]);
  const { tab, system, character, group, explanations } = state;
  return <div className="reference-workspace paper-reference-workspace creation-reference">
    <header className="paper-reference-header"><h2 id="reference-drawer-title" tabIndex={-1} data-dialog-initial>资料</h2><nav role="tablist" aria-label="资料类别">{(Object.keys(labels) as Tab[]).map(t => <button role="tab" key={t} aria-selected={tab === t} aria-pressed={tab === t} onClick={() => activate(t)}>{labels[t]}</button>)}</nav><button onClick={onClose}>返回</button></header>
    <div className="paper-reference-content" ref={content}>
      {trail.length > 0 ? <button className="paper-reference-trail" onClick={back}>返回上次查看</button> : null}
      <div hidden={tab === "pattern"}>
        <div className="paper-reference-systems">{(["pingshui", "cilin"] as const).map(s => <button key={s} aria-pressed={system === s} onClick={() => { epoch.current++; setBusy(false); setError(""); setTrail([]); setDirectory(false); setState(v => ({ ...v, system: s, lookup: null, explanations: null, group: null, groupId: null, scroll: 0 })); if (tab === "character" && character) void lookup(character, s, false); }}>{s === "pingshui" ? "平水韵" : "词林正韵"}</button>)}</div>
        {error ? <p role="alert">{error}{tab === "rhyme" && retryGroup.current ? <button onClick={() => retryGroup.current?.()}>重试</button> : null}</p> : null}
        <section hidden={tab !== "character"}>
          <form className="paper-character-query" onSubmit={e => { e.preventDefault(); void lookup(character, system, false); }}><input aria-label="查询单字" value={character} placeholder="字" maxLength={2} onChange={e => { epoch.current++; setBusy(false); setState(s => ({ ...s, character: e.target.value, lookup: null, explanations: null })); }} /><button disabled={busy}>查询</button></form>
          {state.lookup?.readings.map((r,i) => { const entry = explanations?.entries.find(e => e.key.sourceCandidateId === r.id && e.key.groupId === r.groupId); return <div className="paper-reference-reading" key={r.id+i}><div><h3>{r.tone}</h3><button onClick={() => void openGroup(r.groupId)}>{r.groupName}</button></div><div>{entry?.senses.length ? entry.senses.map(s => <div className="paper-reference-sense" key={s.id}><p>{s.meaning}</p>{s.examples.length ? <details><summary>例句与出处</summary>{s.examples.map((example,j) => <div key={j}><p>{example.text}</p><small>{explanations?.sources.find(source => source.id === example.sourceId)?.title}</small></div>)}</details> : null}</div>) : <p>{r.glosses.join("；") || "暂无释义资料"}</p>}</div></div>; })}
          {state.lookup && !state.lookup.readings.length ? <p>此字尚未收录。</p> : null}
          {state.lookup ? <SourceDetails inlineOnly sourceId={state.lookup.sourceId} onSource={noSourceNavigation} /> : null}
        </section>
        <section hidden={tab !== "rhyme"}>
          <div className="paper-rhyme-heading"><h3>{(group?.group.name ?? groups.find(g => g.id === state.groupId)?.name)?.split("·").at(-1)?.trim() ?? "韵部"}</h3><button onClick={() => setDirectory(!directory)}>{state.groupId ? "换一部" : "选择"}</button>{state.groupId ? <div role="group" aria-label="韵字范围">{(["common-only","all"] as const).map(v => <button key={v} aria-pressed={state.view === v} onClick={() => void openGroup(state.groupId!,system,false,0,v)}>{v === "all" ? "全部" : "常用"}</button>)}{group ? <span>{state.view === "all" ? group.group.count : group.filteredCount}字</span> : null}</div> : null}</div>
          {directoryError ? <p role="alert">{directoryError}<button onClick={() => setRevision(v => v+1)}>重试</button></p> : null}
          <div className="paper-rhyme-directory" hidden={!directory && !!state.groupId}>{groups.map(g => <button key={g.id} onClick={() => void openGroup(g.id,system,false)}>{g.name.split("·").at(-1)?.trim()}<small>{g.tone}</small></button>)}</div>
          {group ? <>{!group.items.length ? <p>{state.view === "common-only" ? "暂无常用韵字" : "暂无韵字资料"}</p> : null}<div className="paper-rhyme-words">{group.items.map(item => <button key={item.character} onClick={() => void lookup(item.character)}>{item.character}</button>)}</div>{group.nextOffset !== null ? <button className="paper-load-more" disabled={busy} onClick={() => void openGroup(group.group.id,system,false,group.nextOffset!)}>更多韵字</button> : null}<SourceDetails inlineOnly sourceId={system} onSource={noSourceNavigation} /></> : null}
        </section>
        {busy ? <p role="status">正在查询…</p> : null}
      </div>
      <section hidden={tab !== "pattern"}><PatternQueries compact paper request={patternRequest} onSource={noSourceNavigation} /></section>
    </div>
  </div>;
}
