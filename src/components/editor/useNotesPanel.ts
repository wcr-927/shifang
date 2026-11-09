import { captureEditorPosition } from "../../features/reference/editorPosition";
import { keepCaretVisible } from "./caretVisibility";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
interface Position { input: TextControl; start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null; top: number; left: number; scrolls: Array<{ element: HTMLElement; top: number; left: number }> }

/** Notes are a presentation change, never a new editor instance or save boundary. */
export function useNotesPanel(root: RefObject<HTMLElement>) {
  const [open,setOpen]=useState(false);
  const lastInput=useRef<TextControl|null>(null);
  const position=useRef<Position|null>(null);
  const readingPosition=useRef<(()=>void)|null>(null);
  const changed=useRef(false);
  const auxiliary=useRef<{element:HTMLElement;top:number}[]>([]);
  const notePosition=useRef<{start:number;end:number;top:number}|null>(null);
  useEffect(()=>{
    const remember=(event:Event)=>{const e=event.target as HTMLElement;if(e?.matches?.('.free-body,.editor-title-input,.line-input') && root.current?.contains(e)){lastInput.current=e as TextControl;readingPosition.current=null;}};
    const selection=()=>{if(document.activeElement?.matches('.free-body,.editor-title-input,.line-input'))capture();};
    const readingBlur=(event:Event)=>{const reader=(event.target as HTMLElement)?.closest?.<HTMLElement>('.ci-reading:not([hidden]),.verse-editor');if(reader&&root.current?.contains(reader))readingPosition.current=captureEditorPosition(root.current,reader);};
    document.addEventListener('focusout',readingBlur);
    document.addEventListener('selectionchange',selection);
    document.addEventListener('focusin',remember);
    return()=>{document.removeEventListener('focusin',remember);document.removeEventListener('selectionchange',selection);document.removeEventListener('focusout',readingBlur);};
  },[root]);
  function capture(leaving?: TextControl) {
    const reader=root.current?.querySelector<HTMLElement>(".ci-reading:not([hidden]),.verse-editor");
    if(reader && (document.activeElement===reader || reader.contains(document.activeElement))) {readingPosition.current=captureEditorPosition(root.current!,reader);return;}
    const active=document.activeElement as TextControl|null;
    const input=leaving ?? (active?.matches?.('.free-body,.editor-title-input,.line-input') ? active : position.current ? null : lastInput.current);
    if(!input || !root.current?.contains(input))return;
    position.current={input,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,top:input.scrollTop,left:input.scrollLeft,scrolls:Array.from(root.current.querySelectorAll<HTMLElement>('.free-scroll,.manuscript-scroll')).map(element=>({element,top:element.scrollTop,left:element.scrollLeft}))};
  }
  function rememberNotes(){const field=root.current?.querySelector<HTMLTextAreaElement>('.notes-panel textarea');if(field)notePosition.current={start:field.selectionStart,end:field.selectionEnd,top:field.scrollTop};}
  function toggle(){
    capture();
    if(!open)auxiliary.current=Array.from(root.current?.querySelectorAll<HTMLElement>('.inspector-scroll') ?? []).map(element=>({element,top:element.scrollTop}));
    else rememberNotes();
    changed.current=true;setOpen(value=>!value);
  }
  function close(){capture();rememberNotes();changed.current=true;setOpen(false);}
  useLayoutEffect(()=>{
    if(!changed.current)return;
    const saved=position.current;
    if(saved?.input.isConnected){
      saved.input.setSelectionRange(saved.start,saved.end,saved.direction ?? undefined);
      if(!open)saved.input.focus({preventScroll:true});
      saved.input.scrollTop=saved.top;saved.input.scrollLeft=saved.left;
      for(const item of saved.scrolls){item.element.scrollTop=item.top;item.element.scrollLeft=item.left;}
    }
    if(open){
      const field=root.current?.querySelector<HTMLTextAreaElement>('.notes-panel textarea');
      field?.focus({preventScroll:true});
      if(saved?.input.isConnected){saved.input.scrollLeft=saved.left;keepCaretVisible(saved.input);}
      if(field && notePosition.current){field.setSelectionRange(notePosition.current.start,notePosition.current.end);field.scrollTop=notePosition.current.top;}
    } else for(const item of auxiliary.current)item.element.scrollTop=item.top;
    if(!open){if(root.current?.querySelector(".ci-reading:not([hidden]),.verse-editor"))readingPosition.current?.();readingPosition.current=null;}
    changed.current=false;
  },[open,root]);
  return {open,toggle,close,capture:()=>capture()};
}
