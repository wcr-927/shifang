import { useLayoutEffect, useRef, useState } from 'react';
import { registerCloseGuard } from '../../services/closeCoordinator';
export function FreeTextField({value,label,onChange}:{value:string;label:string;onChange:(value:string)=>void}){
 const ref=useRef<HTMLTextAreaElement>(null),composing=useRef(false),latest=useRef(onChange);
 latest.current=onChange;const [draft,setDraft]=useState<string|null>(null);
 useLayoutEffect(()=>registerCloseGuard(()=>composing.current?'请先完成或取消正在输入的文字。':undefined),[]);
 useLayoutEffect(()=>{
  const field=ref.current;if(!field)return;
  const fit=()=>{const scroll=field.closest('.manuscript-scroll'),top=scroll?.scrollTop??0;const clone=field.cloneNode(false) as HTMLTextAreaElement;clone.value=field.value;clone.setAttribute('aria-hidden','true');clone.removeAttribute('aria-label');clone.tabIndex=-1;Object.assign(clone.style,{position:'fixed',left:'-10000px',width:`${field.clientWidth}px`,height:'0',minHeight:'0',visibility:'hidden'});field.parentElement?.append(clone);field.style.height=`${Math.max(360,clone.scrollHeight)}px`;clone.remove();field.scrollTop=0;if(scroll)scroll.scrollTop=top;
   if(scroll&&document.activeElement===field&&scroll.clientHeight>0){const style=getComputedStyle(field),mirror=document.createElement('div'),mark=document.createElement('span');Object.assign(mirror.style,{position:'fixed',left:'-10000px',visibility:'hidden',width:`${field.clientWidth}px`,boxSizing:'border-box',font:style.font,letterSpacing:style.letterSpacing,padding:style.padding,whiteSpace:'pre-wrap',overflowWrap:'break-word'});mirror.textContent=field.value.slice(0,field.selectionEnd);mark.textContent='\u200b';mirror.append(mark);document.body.append(mirror);const caret=mark.getBoundingClientRect(),base=mirror.getBoundingClientRect(),area=scroll.getBoundingClientRect(),y=field.getBoundingClientRect().top+caret.top-base.top;if(y+caret.height>area.bottom-24)scroll.scrollTop+=y+caret.height-area.bottom+24;else if(y<area.top+12)scroll.scrollTop+=y-area.top-12;mirror.remove();}};
  fit();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);if(field.parentElement)observer?.observe(field.parentElement);return()=>observer?.disconnect();
 },[value,draft]);
 return <textarea ref={ref} className="free-paper-body" aria-label={label} value={draft??value} spellCheck={false} rows={1} onCompositionStart={()=>{composing.current=true;setDraft(value)}} onCompositionEnd={e=>{composing.current=false;setDraft(null);latest.current(e.currentTarget.value)}} onChange={e=>{if(composing.current)setDraft(e.target.value);else latest.current(e.target.value)}}/>;
}
