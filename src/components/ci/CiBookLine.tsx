import { useRef, useState, type CSSProperties } from "react";
import { sourceCharacters, type CiAnalysis } from "../../ci/analyze";
import type { CiLine } from "../../ci/catalogue";
import { ciToneMarkers } from "../../features/editor/toneMarkers";
import { measureInputText, ToneMarkers } from "../editor/ToneMarkers";
export type CiPosition = { line:number; offset:number; character:string };
export function CiBookLine({value,index,rule,analysis,fontSize,rhymeLabel,onChange,onActive,onHover,onPin,onRhyme,onNext,onPaste}:{
 value:string;index:number;rule?:CiLine;analysis:CiAnalysis;fontSize:number;rhymeLabel?:string;
 onChange:(value:string)=>void;onActive:(input:HTMLTextAreaElement)=>void;onHover:(position:CiPosition|undefined)=>void;onPin:(position:CiPosition)=>void;onRhyme:()=>void;onNext:()=>void;onPaste:(input:HTMLTextAreaElement,text:string)=>void;
}){
 const input=useRef<HTMLTextAreaElement>(null),composing=useRef(false);
 const [scroll,setScroll]=useState(0),[hover,setHover]=useState<{character:string;style:CSSProperties}>();
 const markers=ciToneMarkers(value,rule?.pattern??'',analysis,index),cell=fontSize+2;
 const width=(rule?.pattern.length??Math.max(7,sourceCharacters(value).length))*cell;
 const clear=()=>{setHover(undefined);onHover(undefined)};
 const hit=(field:HTMLTextAreaElement,x:number)=>{const m=measureInputText(field,value),left=x-field.getBoundingClientRect().left+field.scrollLeft-m.origin;return sourceCharacters(value).find(c=>left>=m.advance(c.offset)&&left<m.advance(c.offset+c.character.length))};
 return <div className="ci-book-line" style={{width:width+22}}>
  <div className="ci-book-input" style={{width}}>
   <textarea ref={input} rows={1} wrap="off" data-ci-line={index} className="line-input" aria-label={`第${index+1}句`} value={value}
    onFocus={e=>onActive(e.currentTarget)} onSelect={e=>onActive(e.currentTarget)}
    onCompositionStart={()=>{composing.current=true;clear()}} onCompositionEnd={()=>{composing.current=false;clear()}}
    onClick={e=>{if(!composing.current){const c=hit(e.currentTarget,e.clientX);if(c)onPin({line:index,...c})}}}
    onMouseMove={e=>{if(composing.current)return;const c=hit(e.currentTarget,e.clientX);if(!c){clear();return}onHover({line:index,...c});const m=measureInputText(e.currentTarget,value);setHover({character:c.character,style:{left:m.origin+m.advance(c.offset)-e.currentTarget.scrollLeft}})}} onMouseLeave={clear}
    onScroll={e=>{setScroll(e.currentTarget.scrollLeft);clear()}} onChange={e=>{clear();onChange(e.target.value)}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();onNext()}}}
    onPaste={e=>{const text=e.clipboardData.getData('text');if(/[\r\n]/u.test(text)){e.preventDefault();onPaste(e.currentTarget,text)}}}/>
   {!value&&rule?<div className="ci-book-empty" aria-hidden="true">{markers.map((_,i)=><span style={{width:cell}} key={i}>·</span>)}</div>:null}
   {hover?<span className="ci-book-hover" aria-hidden="true" style={hover.style}>{hover.character}</span>:null}
   <ToneMarkers source={value} markers={markers} inputRef={input} scrollLeft={scroll} label={`第${index+1}句谱式`}/>
  </div>
  <div className="ci-book-line-end"><span aria-hidden="true">{rule&&!/[，。！？；、,.!?;]\s*$/u.test(value)?rule.rhyme?'。':'，':''}</span>{rhymeLabel?<button type="button" onClick={onRhyme} aria-label={`第${index+1}句${rhymeLabel}，查看韵组`}>{rhymeLabel}</button>:null}</div>
 </div>;
}
