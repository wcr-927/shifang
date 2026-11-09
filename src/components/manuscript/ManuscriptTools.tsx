import { useEffect, useRef, type ReactNode } from "react";
import type { WorkStatus } from "../../shared/work";

export function ManuscriptMore({children,compact=false}:{children:ReactNode;compact?:boolean}){
 const root=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))root.current?.removeAttribute("open")};
  document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
 },[]);
 return <details ref={root} className="editor-tools" onToggle={e=>{if(e.target===e.currentTarget&&!e.currentTarget.open)e.currentTarget.querySelectorAll("details[open]").forEach(item=>item.removeAttribute("open"))}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();root.current?.removeAttribute("open");root.current?.querySelector("summary")?.focus()}}}><summary aria-label="更多" className={compact?"manuscript-more-compact":undefined}>{compact?"···":"更多"}</summary><div className="editor-tools-menu" onClick={e=>{if((e.target as Element).closest("button"))root.current?.removeAttribute("open")}}>{children}</div></details>;
}
export function ManuscriptStatusChoice({status,onChange}:{status:WorkStatus;onChange:(value:WorkStatus)=>void}){
 return <details className="editor-status-choice"><summary>作品状态</summary>
 <div role="group" aria-label="作品状态">{(["draft","completed"] as const).map(value=><button type="button" key={value} aria-pressed={status===value} onClick={e=>{if(status!==value)onChange(value);e.currentTarget.closest(".editor-tools")?.querySelector<HTMLElement>(":scope > summary")?.focus();}}>{value==="draft"?"草稿":"已完成"}</button>)}</div>
 </details>;
}
