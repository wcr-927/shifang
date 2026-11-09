import { useEffect, useRef, useState } from "react";
import type { ReferenceFoot } from "../../features/editor/rhymeReference";
import { referenceFootStatus } from "../../features/editor/rhymeReference";
import type { RhymeReferenceView } from "../../features/editor/useRhymeReference";
export function RhymeBrowser({reference,feet,names,loading,onQueryFoot}:{reference:RhymeReferenceView;feet:ReferenceFoot[];names:Map<string,string>;loading?:boolean;onQueryFoot?:(foot:ReferenceFoot)=>void}) {
 const root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement|null>(null);
 const [menu,setMenu]=useState<{ids:string[]|null;identity:string;top:number;left:number;width:number}|null>(null);
 const identity=JSON.stringify([reference.segmentId,feet,loading]);
 const shown=menu?.identity===identity?menu:null;
 const name=(id:string|null)=>id?(names.get(id)??reference.groups.find(g=>g.id===id)?.name??"待核对").split("·").at(-1)!.trim():"未定";
 const close=(restore=false)=>{setMenu(null);if(restore)trigger.current?.focus({preventScroll:true})};
 useEffect(()=>{
  if(!shown)return;
  (panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed=true]')??panel.current?.querySelector<HTMLButtonElement>('button'))?.focus({preventScroll:true});
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close()};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true)}};
  const reposition=()=>close();
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape,true);window.addEventListener("resize",reposition);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape,true);window.removeEventListener("resize",reposition)};
 },[shown]);
 function open(ids:string[]|null,button:HTMLElement) {
  if(shown&&trigger.current===button){close(true);return}
  trigger.current=button;
  const rect=button.getBoundingClientRect(),area=root.current!.getBoundingClientRect();
  const width=ids?Math.min(220,Math.max(116,ids.length*57+20)):Math.min(270,area.width);
  setMenu({ids,identity,width,left:Math.max(12,Math.min(window.innerWidth-width-12,ids?rect.left+rect.width/2-width/2:area.left)),top:Math.max(12,Math.min(rect.bottom+7,window.innerHeight-(ids?60:245)-12))});
 }
 function choose(foot:ReferenceFoot,button:HTMLElement) {
  const ids=[...new Set(foot.groupIds)];
  if(!ids.length){close();onQueryFoot?.(foot);return}
  if(ids.length===1){reference.browse(ids[0]);close();return}
  open(ids,button);
 }
 return <div ref={root} className="rhyme-browser" aria-label="用韵浏览">
 <button type="button" className="rhyme-browser-name" aria-label="浏览韵部" aria-expanded={Boolean(shown)} onClick={e=>open(null,e.currentTarget)} disabled={loading}>{loading?"校对中":name(reference.groupId)}</button>
 <div className="rhyme-feet-scroll" onScroll={()=>close()}><div className="rhyme-browser-feet" aria-label="已用韵脚">{!loading&&feet.map(f=>{
 const status=referenceFootStatus(reference.groupId,f.groupIds,f.borrowMainGroupId);
 return <button type="button" key={f.line} aria-label={`第${f.line+1}句韵脚 ${f.character||"未填"} · ${status==="mismatch"?"不符":status==="pending"?"待确认":"符合"}`} title={`第${f.line+1}句`} className={`is-${status}`} disabled={!f.character} onClick={e=>choose(f,e.currentTarget)}>{f.character||"·"}</button>;
 })}</div></div>
 {shown?<div ref={panel} role="dialog" aria-label={shown.ids?"候选韵部":"韵部目录"} className={`rhyme-browser-menu${shown.ids?" is-readings":""}`} style={{top:shown.top,left:shown.left,width:shown.width}} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node))close()}}>
 <div className="rhyme-browser-groups">{reference.groups.filter(g=>!shown.ids||shown.ids.includes(g.id)).map(g=><button type="button" key={g.id} aria-label={`${name(g.id)} ${g.tone}`} aria-pressed={g.id===reference.groupId} onClick={()=>{reference.browse(g.id);close(true)}}>{name(g.id)}</button>)}</div>
 {!reference.ready&&!reference.error?<span role="status">正在读取韵部</span>:null}
 </div>:null}
 {reference.error?<p className="manuscript-reference-status" role="status">{reference.error} <button onClick={reference.retry}>重试</button></p>:reference.invalid?<p className="manuscript-reference-status" role="status">原韵部已失效</p>:null}
 </div>;
}
