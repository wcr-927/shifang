import { useEffect, useRef, useState } from 'react';
import { ManuscriptAuxiliary, ManuscriptAuxiliarySection } from '../manuscript/ManuscriptUI';
import { desktopApi } from '../../services/desktopApi';
import { useReadingExplanations } from '../../features/reference/useReadingExplanations';
import { ReadingExplanation } from './ReadingExplanation';
import { useRhymePage } from '../../features/reference/useRhymePage';
import type { ReferenceLookup } from '../../shared/reference';
export function AncientReference({character,onQuery,onGroup}:{character:string;onQuery:(c:string)=>void;onGroup:(id:string)=>void}){
 const [lookup,setLookup]=useState<ReferenceLookup|null>(null),[groupId,setGroupId]=useState(''),[error,setError]=useState('');
 const [view,setView]=useState<"common-only"|"all">("common-only");
 const group=useRhymePage('pingshui',groupId||null,view),page=group.page;
 const rhymeScroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(rhymeScroll.current)rhymeScroll.current.scrollTop=0},[groupId,view]);
 const evidence=useReadingExplanations(character?{system:'pingshui',character}:null);
 useEffect(()=>{let active=true;setLookup(null);setError('');if(character)void desktopApi.reference.lookup({system:'pingshui',character}).then(result=>{if(active){setLookup(result);setGroupId(old=>old||result.readings[0]?.groupId||'')}},()=>{if(active)setError('字音资料暂不可用')});return()=>{active=false};},[character]);
 return <ManuscriptAuxiliary aria-label="古体字音参考">
  <ManuscriptAuxiliarySection><header className="manuscript-inspector-fixed"><div className="manuscript-zone-heading"><h2>当前字</h2><span>字音参考</span></div><div className="manuscript-current-character"><strong><button className="manuscript-display-link" onClick={()=>character&&onQuery(character)}>{character||'—'}</button></strong></div></header>
  <div className="manuscript-inspector-scroll">{error?<p role="status">{error}</p>:null}{(lookup?.character===character?lookup.readings:[]).map(r=><div className="manuscript-reading" key={r.id}><div className="manuscript-reading-choice"><strong>{r.tone}</strong><button className="ancient-group-link" onClick={()=>setGroupId(r.groupId)}>{r.groupName}</button></div><div className="manuscript-reading-definition">{evidence.status==='ready'&&evidence.bundle.entries.some(e=>e.key.sourceCandidateId===r.id)?evidence.bundle.entries.filter(e=>e.key.sourceCandidateId===r.id).map(e=><ReadingExplanation key={e.key.sourceCandidateId} entry={e}/>):<p>{r.glosses.join('；')||'暂无释义资料'}</p>}</div></div>)}</div></ManuscriptAuxiliarySection>
  <ManuscriptAuxiliarySection><header className="manuscript-inspector-fixed"><div className="manuscript-zone-heading"><h2>韵部参考</h2><span>平水韵</span></div><div className="manuscript-rhyme-heading"><strong>{page?<button className="manuscript-display-link" onClick={()=>onGroup(groupId)}>{page.group.name.split('·').at(-1)?.trim()}</button>:'—'}</strong></div>{groupId?<div className="manuscript-rhyme-options"><div role="group" aria-label="韵字范围">{(["common-only","all"] as const).map(v=><button key={v} className="manuscript-inspector-action" aria-pressed={view===v} onClick={()=>setView(v)}>{v==='all'?'全部':'常用'}</button>)}</div><span>{page?`${view==='all'?page.group.count:page.filteredCount}字`:''}</span></div>:null}</header><div ref={rhymeScroll} className="manuscript-inspector-scroll" role="region" aria-label="同韵字" tabIndex={0} aria-busy={group.busy}>{group.error?<p className="manuscript-inspector-muted" role="status">{group.error}<button className="manuscript-inspector-action" onClick={group.retry}>重试</button></p>:null}<div className="ancient-rhyme-grid">{page?.items.map(item=><button key={item.character} onClick={()=>onQuery(item.character)}>{item.character}</button>)}</div>{page?.nextOffset!==null&&page?<button className="manuscript-inspector-action" disabled={group.busy} onClick={()=>void group.loadMore()}>更多韵字</button>:null}{group.busy?<p className="manuscript-inspector-muted">正在读取韵字</p>:null}{page&&!page.items.length?<p className="manuscript-inspector-muted">{view==='common-only'?'暂无常用韵字':'暂无韵字资料'}</p>:null}</div></ManuscriptAuxiliarySection>
 </ManuscriptAuxiliary>;
}
