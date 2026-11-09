import {act,fireEvent} from '@testing-library/react';
export function installVerseDom(win:any){
 for(const key of ['Node','MutationObserver','getComputedStyle','innerHeight','innerWidth'])Object.defineProperty(globalThis,key,{value:typeof win[key]==='function'&&key==='getComputedStyle'?win[key].bind(win):win[key],configurable:true,writable:true});
 if(!globalThis.requestAnimationFrame)Object.defineProperty(globalThis,'requestAnimationFrame',{value:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),configurable:true,writable:true});
 if(!globalThis.cancelAnimationFrame)Object.defineProperty(globalThis,'cancelAnimationFrame',{value:clearTimeout,configurable:true,writable:true});
 const rect={left:0,top:0,right:100,bottom:20,width:100,height:20,x:0,y:0,toJSON:()=>({})};
 win.Range.prototype.getBoundingClientRect=()=>rect;
 win.Range.prototype.getClientRects=()=>Object.assign([rect],{item:(i:number)=>i===0?rect:null});
 win.HTMLElement.prototype.scrollIntoView=()=>{};
}
export async function selectVerse(line:HTMLElement,start:number,end=start){const root=line.closest<HTMLElement>('.verse-editor')!;root.focus();const point=(offset:number):[Node,number]=>{const walker=document.createTreeWalker(line,4);let node;while(node=walker.nextNode()){if(offset<=node.textContent!.length)return[node,offset];offset-=node.textContent!.length}return[line,0]};await act(async()=>{window.getSelection()!.setBaseAndExtent(...point(start),...point(end));fireEvent(document,new window.Event('selectionchange'));await new Promise(r=>setTimeout(r,30))});}
export async function changeVerse(line:HTMLElement,text:string){await selectVerse(line,0,line.textContent!.length);await act(async()=>{fireEvent(line.closest('.verse-editor')!,new window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text}));});}
