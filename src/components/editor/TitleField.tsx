import { useRef, useState, type ReactNode } from "react";

/** A stable native textarea: only its visible height changes; value and selection stay native. */
export function TitleField({value,onChange,className="",presentation,hasSubtitle=false}:{
  value:string;onChange:(value:string)=>void;className?:string;presentation?:ReactNode;hasSubtitle?:boolean;
}) {
  const input=useRef<HTMLTextAreaElement>(null);
  const [expanded,setExpanded]=useState(false);
  const long=Array.from(value).length>48;
  return <div className={`title-field ${presentation ? "title-shell" : ""}`} data-has-subtitle={hasSubtitle} data-collapsed={long&&!expanded}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setExpanded(false);}}>
    <textarea ref={input} rows={1} className={`editor-title-input ${className} ${Array.from(value).length>18?"is-long-title":""}`}
      aria-label="诗稿题名" value={value} maxLength={200} placeholder="未题"
      onFocus={()=>setExpanded(true)} onChange={event=>onChange(event.target.value.replace(/[\r\n]/g,""))}
      onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.keyCode!==229)event.preventDefault();}}/>
    {presentation}
    {long&&!expanded?<button className="title-expand inline-action" type="button" onClick={()=>{setExpanded(true);input.current?.focus({preventScroll:true});}}>查看完整题名</button>:null}
  </div>;
}
