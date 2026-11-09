/** Measure a native text caret without changing value, selection or undo history. */
export function keepCaretVisible(input:HTMLInputElement|HTMLTextAreaElement){
 const scroller=input.closest<HTMLElement>('.free-scroll,.manuscript-scroll');
 if(!scroller?.clientHeight||!input.clientWidth)return;
 const rect=input.getBoundingClientRect(),area=scroller.getBoundingClientRect();
 let top=rect.top,bottom=rect.bottom;
 if(input instanceof HTMLTextAreaElement){
  const style=getComputedStyle(input),mirror=document.createElement('div'),marker=document.createElement('span');
  Object.assign(mirror.style,{position:'fixed',left:'-10000px',top:'0',visibility:'hidden',pointerEvents:'none',width:`${input.clientWidth}px`,boxSizing:'border-box',font:style.font,letterSpacing:style.letterSpacing,padding:style.padding,whiteSpace:style.whiteSpace==='pre'?'pre':'pre-wrap',overflowWrap:style.overflowWrap,tabSize:style.tabSize});
  mirror.setAttribute('aria-hidden','true');mirror.textContent=input.value.slice(0,input.selectionEnd);marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);
  const caret=marker.getBoundingClientRect();top=rect.top+caret.top-mirror.getBoundingClientRect().top-input.scrollTop;bottom=top+caret.height;mirror.remove();
 }
 if(bottom>area.bottom-16)scroller.scrollTop+=bottom-area.bottom+16;
 else if(top<area.top+12)scroller.scrollTop+=top-area.top-12;
}
