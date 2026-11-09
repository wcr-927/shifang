import { Notebook, X } from "lucide-react";

export function NotesButton({ open, onToggle, onCapture }: { open: boolean; onToggle:()=>void; onCapture:()=>void }): JSX.Element {
  return <button type="button" className="quiet-button notes-toggle" aria-expanded={open} aria-controls="creation-notes-panel" onPointerDown={onCapture} onClick={onToggle}><Notebook size={16} aria-hidden="true"/>创作记</button>;
}

export function CreationNotes({ value, onChange, open, onClose }: { value:string; onChange:(value:string)=>void; open:boolean; onClose:()=>void }): JSX.Element {
  return <aside id="creation-notes-panel" className="notes-panel" data-open={open} aria-label="创作记旁记" hidden={!open} onKeyDown={event=>{if(event.key==='Escape' && !event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();onClose();}}}>
    <div className="notes-view-switch" role="group" aria-label="主编辑区内容"><button type="button" onClick={onClose}>正文</button><span aria-current="true">创作记</span></div><header><div className="notes-panel-title"><span className="notes-panel-mark" aria-hidden="true"><Notebook size={15}/></span><div><h2>创作记</h2></div></div><button type="button" className="icon-button" aria-label="关闭创作记" title="关闭创作记" onClick={onClose}><X size={17}/></button></header>
    {value.length>20000?<p className="panel-error" role="alert">创作记超过保存长度上限，输入已保留，请缩短后再保存。</p>:null}
    <textarea aria-label="创作记内容" value={value} onChange={event=>onChange(event.target.value)} placeholder="记下灵感、出处或推敲过程…" spellCheck={false}/>
  </aside>;
}
