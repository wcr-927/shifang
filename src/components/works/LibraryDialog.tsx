import { createPortal } from 'react-dom';
import { useRef, type ReactNode } from 'react';
import { useEditorDialogFocus } from '../editor/useEditorDialogFocus';
export function LibraryDialog({title,busy=false,onClose,children,className=''}:{className?:string;title:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const root=useRef<HTMLElement>(null);useEditorDialogFocus(root,onClose,busy);
 return createPortal(<div className="dialog-backdrop library-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className={`dialog library-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={root}><header><h2 data-dialog-initial tabIndex={-1}>{title}</h2><button onClick={onClose} disabled={busy}>返回</button></header>{children}</section></div>,document.querySelector('.app-shell')??document.body);
}
