import { ciVerseAdapter } from "../../features/editor/ciVerseAdapter";
import type { WorkAssistanceState, RhymeReference } from "../../shared/assistanceState";
import { ciSegmentId, getRhymeGroups } from "../../features/editor/rhymeReference";
import { useRhymeReference } from "../../features/editor/useRhymeReference";
import { RhymeBrowser } from "../manuscript/RhymeBrowser";
import { ManuscriptAuxiliary, ManuscriptAuxiliarySection } from "../manuscript/ManuscriptUI";
import { useEffect, useRef, useState } from "react";
import type { CiAnalysis } from "../../ci/analyze";
import { sourceCharacters, toneName } from "../../ci/analyze";
import type { CiForm } from "../../ci/catalogue";

import { useReadingExplanations } from "../../features/reference/useReadingExplanations";
import { matchingExplanations } from "../editor/CharacterExplanations";
import { ReadingExplanation } from "../editor/ReadingExplanation";
import { useRhymePage } from "../../features/reference/useRhymePage";
import type { CiPosition } from "./CiBookLine";
export function CiBookInspector({assistance,onReference,onFoot,form,body,analysis,current,rhymeKey,onRhyme,setReading,onQuery}:{onFoot?:(line:number)=>void;assistance?:WorkAssistanceState;onReference?:(reference:RhymeReference)=>void;form:CiForm;body:string;analysis:CiAnalysis;current?:CiPosition;rhymeKey:string;onRhyme:(key:string)=>void;setReading:(line:number,offset:number,source:string,character:string,candidate:string)=>void;onQuery:(character:string)=>void}){
 const source=body.split('\n')[current?.line??0]??'',reading=analysis.readings.find(r=>r.line===current?.line&&r.offset===current?.offset&&r.character===current?.character);
 const marker=current?(ciVerseAdapter(form,body,analysis,assistance)[current.line]?.markers??[]).find(m=>m.start===current.offset):undefined;
 const explanations=useReadingExplanations(reading?{system:'cilin',character:reading.character}:null);
 const keys=[...new Set(form.lines.flatMap(l=>l.rhyme?[l.rhyme]:[]))],key=keys.includes(rhymeKey)?rhymeKey:keys[0];
 const feet=analysis.feet.find(f=>f.key===key)?.items??[];
 const segmentId=ciSegmentId(form.id,key);
 const evidence=getRhymeGroups({kind:"ci",value:analysis,formId:form.id});
 for(const k of keys)if(!evidence.some(e=>e.segmentId===ciSegmentId(form.id,k)))evidence.push({segmentId:ciSegmentId(form.id,k),system:"cilin",groupIds:[],lineIndexes:[]});
 const referenceFeet=feet.map(f=>({line:f.line,character:sourceCharacters(body.split('\n')[f.line]??'').at(-1)?.character??"",groupIds:f.options.map(o=>`cilin-${o.group}`)}));
 const reference=useRhymeReference("cilin",segmentId,assistance,evidence,body.split('\n'),referenceFeet,onReference);
 const [view,setView]=useState<"common-only"|"all">("common-only");
 const activeId=reference.groupId;
 const group=useRhymePage("cilin",activeId,view),page=group.page;
 const root=useRef<HTMLElement>(null),rhymeScroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{root.current?.querySelector('.manuscript-inspector-scroll')?.scrollTo?.(0,0)},[current?.line,current?.offset]);
 useEffect(()=>{if(rhymeScroll.current)rhymeScroll.current.scrollTop=0},[activeId,view]);
 const label={match:'平仄符合',conflict:'平仄不符',pending:'读法待定',uncovered:'未覆盖',empty:'待落笔'};
 return <ManuscriptAuxiliary ref={root} className="ci-book-inspector" aria-label="词稿辅助">
 <ManuscriptAuxiliarySection><header className="manuscript-inspector-fixed"><div className="manuscript-zone-heading"><h2>当前字</h2><span>{current?`第${current.line+1}句 · 第${sourceCharacters(source).findIndex(c=>c.offset===current.offset)+1}字`:''}</span></div><div className="manuscript-current-character"><strong>{current?<button className="manuscript-display-link" onClick={()=>onQuery(current.character)}>{current.character}</button>:'—'}</strong><div><span>{marker?`谱式：${marker.expected}`:'待落笔'}</span>{marker?<span className={`manuscript-check is-${marker.state==='conflict'?'mismatch':marker.state==='pending'?'uncertain':marker.state}`}>{marker.rhymeState==='mismatch'?'韵部不符':label[marker.state]}</span>:null}</div></div></header>
 <div className="manuscript-inspector-scroll" role="region" aria-label="当前字读法与释义" tabIndex={0}>
 {explanations.status==='error'?<p className="manuscript-inspector-muted">{explanations.error}<button onClick={explanations.retry}>重试</button></p>:null}
 {reading?.options.map(option=>{const multiple=reading.options.length>1,chosen=multiple&&reading.selected?.id===option.id,entries=explanations.status==='ready'?matchingExplanations(explanations.bundle.entries,'cilin',reading.character,{id:option.id,groupId:`cilin-${option.group}`,tone:({P:'ping',S:'shang',Q:'qu',R:'ru'} as const)[option.tone],label:''}):[];return <div className={`manuscript-reading${chosen?' is-chosen':''}`} key={option.id}><label className={`manuscript-reading-choice${multiple?"":" is-single"}`}><span><strong>{toneName[option.tone]}声</strong><small>第{option.group}部</small></span>{multiple?<input type="checkbox" checked={chosen} aria-label={`${chosen?'取消':'采用'}${toneName[option.tone]}声 · 第${option.group}部`} onChange={()=>setReading(reading.line,reading.offset,reading.source,reading.character,chosen?'':option.id)}/>:null}</label><div className="manuscript-reading-definition">{entries.length&&explanations.status==='ready'?entries.map((entry,i)=><ReadingExplanation compact key={i} entry={entry} sources={explanations.bundle.sources}/>):<p>{option.gloss||'暂无释义资料'}</p>}</div></div>})}
 {reading&&!reading.options.length?<p className="manuscript-inspector-muted">当前字未收录</p>:null}
 </div></ManuscriptAuxiliarySection>
 <ManuscriptAuxiliarySection><header className="manuscript-inspector-fixed"><div className="manuscript-zone-heading"><h2>用韵</h2><span>词林正韵</span></div>{keys.length>1?<div className="ci-rhyme-segments" role="group" aria-label="词稿韵组">{keys.map((k,i)=><button key={k} aria-pressed={k===key} onClick={()=>onRhyme(k)}>韵{['一','二','三','四'][i]??i+1}</button>)}</div>:null}<RhymeBrowser reference={reference} feet={referenceFeet} names={new Map(reference.groups.map(g=>[g.id,g.name]))} onQueryFoot={f=>onFoot?onFoot(f.line):onQuery(f.character)}/>{activeId?<div className="manuscript-rhyme-options"><div role="group" aria-label="韵字范围">{(["common-only","all"] as const).map(v=><button key={v} className="manuscript-inspector-action" aria-pressed={view===v} onClick={()=>setView(v)}>{v==="all"?"全部":"常用"}</button>)}</div><span>{page?`${view==="all"?page.group.count:page.filteredCount}字`:""}</span></div>:null}</header>
 <div ref={rhymeScroll} className="manuscript-inspector-scroll" role="region" aria-label="同韵字" tabIndex={0} aria-busy={group.busy}>{group.error?<p className="manuscript-inspector-muted" role="status">{group.error}<button className="manuscript-inspector-action" onClick={group.retry}>重试</button></p>:null}<div className="manuscript-rhyme-characters">{page?.items.map(item=><button key={item.character} onClick={()=>onQuery(item.character)}>{item.character}</button>)}</div>{group.busy?<p className="manuscript-inspector-muted">正在读取韵字</p>:null}{page&&page.nextOffset!==null?<button className="manuscript-inspector-action manuscript-load-more" disabled={group.busy} onClick={()=>void group.loadMore()}>更多韵字</button>:null}{page&&!page.items.length?<p className="manuscript-inspector-muted">{view==="common-only"?"暂无常用韵字":"暂无韵字资料"}</p>:null}</div></ManuscriptAuxiliarySection>
 </ManuscriptAuxiliary>;
}
