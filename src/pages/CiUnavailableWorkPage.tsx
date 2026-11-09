import { useRef, useState } from "react";
import type { CiWorkRecord } from "../shared/work";
import { useCiEditor } from "../features/editor/useCiEditor";
import { CiFallbackManuscript } from "../components/ci/CiFallbackManuscript";
import { CreationNotes, NotesButton } from "../components/editor/CreationNotes";
import { useNotesPanel } from "../components/editor/useNotesPanel";
import { EditorHeader } from "../components/editor/EditorHeader";
import { ExportDialog } from "../components/editor/ExportDialog";
import { SaveErrorNotice } from "../components/editor/SaveStatus";

/** Remains available even when the separate rules/editor chunk cannot be fetched. */
export function CiUnavailableWorkPage({work,onBack,backLabel="诗稿"}:{work:CiWorkRecord;onBack:()=>void;backLabel?:string}) {
  const {editor,patch,save,error}=useCiEditor(work);
  const root=useRef<HTMLElement>(null),notes=useNotesPanel(root);
  const [exportOpen,setExportOpen]=useState(false);
  return <section ref={root} className="editor-page free-editor" data-notes-open={notes.open}>
    <EditorHeader referenceContext={{kind:"ci",formId:editor.ci.formId,version:editor.ci.version,available:false}} workId={work.id} contextLabel="词房 · 按谱填词" backLabel={backLabel} title={editor.title} saveStatus={editor.saveStatus} saveError={error} documentLabel="词稿" notesAction={<NotesButton open={notes.open} onToggle={notes.toggle} onCapture={notes.capture}/>} onBack={onBack} onSave={()=>void save()} onExport={()=>setExportOpen(true)}/>
    <div className="editor-notices"><SaveErrorNotice status={editor.saveStatus} error={error} onSave={()=>void save()}/><p role="status">词稿模块暂时无法加载，校对已暂停。已读取的正文和创作记可继续编辑、保存与导出；保留原词谱和读音选择。返回后可重新打开。</p></div>
    <div className="free-layout"><CiFallbackManuscript title={editor.title} body={editor.body} onTitleChange={title=>patch({title})} onBodyChange={body=>patch({body})}/><CreationNotes open={notes.open} onClose={notes.close} value={editor.notes} onChange={notes=>patch({notes})}/></div>
    {exportOpen?<ExportDialog editor={editor} onClose={()=>setExportOpen(false)} onEnsureSaved={save}/>:null}
  </section>;
}
