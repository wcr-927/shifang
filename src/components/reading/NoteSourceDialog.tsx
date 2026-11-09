import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorDialogFocus } from '../editor/useEditorDialogFocus';
import { ReadingContent } from '../reference/ReadingContent';
import { desktopApi } from '../../services/desktopApi';
import type { ReadingNote } from '../../shared/reading';
import type { ReferenceBlock, ReferenceTarget } from '../../shared/reference';
export function NoteSourceDialog({note,onClose}:{note:ReadingNote;onClose:()=>void}){
 const root=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null),epoch=useRef(0);
 const [blocks,setBlocks]=useState<ReferenceBlock[]>([]),[next,setNext]=useState<number|null>(null),[target,setTarget]=useState<ReferenceTarget|null>(note.nodeId.startsWith('chapter:')?{documentId:note.nodeId.slice(8),anchor:''}:null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEditorDialogFocus(root,onClose,false);
 async function load(offset=0,t=target){const revision=++epoch.current;setBusy(true);setError('');try{const page=t?await desktopApi.reference.read({sourceId:note.sourceId,...t,offset,limit:36}):await desktopApi.reference.readingPiece({sourceId:note.sourceId,nodeId:note.nodeId,offset,limit:64});if(revision!==epoch.current)return;const entries=page.blocks.filter(b=>!('section'in b)||!['title','signature'].includes(String(b.section)));setBlocks(p=>offset?[...p,...entries]:entries);setNext(page.nextOffset);setTarget(t);if(!offset)requestAnimationFrame(()=>{const el=scroll.current;if(el){el.scrollTop=0;const hit=el.querySelector<HTMLElement>('[data-reference-hit]');hit?.scrollIntoView({block:'center'});}});}catch{if(revision===epoch.current)setError('原文暂时无法定位，摘录和读书笔记仍保留。');}finally{if(revision===epoch.current)setBusy(false);}}
 useEffect(()=>{void load();return()=>{++epoch.current;};},[]);
 return createPortal(<div className="dialog-backdrop library-dialog-backdrop note-source-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={root} className="dialog library-dialog note-source-dialog" role="dialog" aria-modal="true" aria-label={note.title} tabIndex={-1}><header><h2 data-dialog-initial tabIndex={-1}>{note.title}</h2><button onClick={onClose}>返回</button></header><p className="note-source-byline">{note.author}　《{note.bookTitle}》</p><div className="note-source-body" ref={scroll}>{error?<p role="alert">{error}<button onClick={()=>void load()}>重试</button></p>:null}{busy&&!blocks.length?<p role="status">正在翻阅…</p>:null}{blocks.map(b=>{const at=b.text.indexOf(note.quote);return <ReadingContent key={b.id} sourceId={note.sourceId} block={b} highlight={at>=0?{start:at,end:at+note.quote.length}:undefined} onLink={t=>void load(0,t)}/>;})}{next!==null?<button disabled={busy} onClick={()=>void load(next)}>继续阅读</button>:null}</div></section></div>,document.querySelector('.app-shell')??document.body);
}
