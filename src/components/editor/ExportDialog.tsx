import { useState } from "react";
import { LibraryDialog } from "../works/LibraryDialog";
import { ManuscriptStamp } from "../manuscript/ManuscriptUI";
import { desktopApi, getDesktopErrorMessage } from "../../services/desktopApi";
import type { ExportWorkRequest } from "../../shared/ipc";
import type { SaveStatus } from "../../features/editor/useEditorController";
import type { ExportSnapshot } from "../../features/export/exportFormat";
import type { WorkRecord } from "../../shared/work";
export type ExportEditor = ExportSnapshot & { work: Pick<WorkRecord, "id" | "room" | "category">; dirty: boolean; saveStatus: SaveStatus };

export function ExportDialog({ editor, onClose, onEnsureSaved }: { editor: ExportEditor; onClose: () => void; onEnsureSaved: () => Promise<boolean> }): JSX.Element {
  const [format, setFormat] = useState<ExportWorkRequest["format"]|"publication">("publication");
  const [state, setState] = useState<"idle" | "exporting" | "done" | "cancelled" | "error">("idle");
  const [message, setMessage] = useState("");



  async function exportWork(): Promise<void> {
    setState("exporting");
    setMessage("");
    try {
      if (format === "publication" || editor.dirty || editor.saveStatus === "error") {
        const saved = await onEnsureSaved();
        if (!saved) { setState("error"); setMessage("当前修改尚未保存，未执行导出。请先重试保存。"); return; }
      }
      if(format==='publication'){await desktopApi.works.openPublication({workId:editor.work.id});onClose();return;}
      const result = await desktopApi.works.export({ ci:editor.ci, workId: editor.work.id, title: editor.title, body: editor.body, genre: editor.genre, room: editor.room ?? editor.work.room, category: editor.category ?? editor.work.category, status: editor.status, location: editor.location, notes: editor.notes, tags: editor.tags, format });
      if (result.status === "cancelled") { setState("cancelled"); setMessage("已取消导出。"); }
      else { setState("done"); setMessage("已导出至所选位置。"); }
    } catch (cause) { setState("error"); setMessage(getDesktopErrorMessage(cause, "导出未完成，请重试。")); }
  }

  return <LibraryDialog title="导出作品" className="export-dialog" busy={state==='exporting'} onClose={onClose}>
    <div className="export-format-grid" role="radiogroup" aria-label="导出格式" onKeyDown={event=>{
      if(state==='exporting'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const formats=['publication','txt','markdown'] as const;
      const next=formats[(formats.indexOf(format)+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+formats.length)%formats.length];
      setFormat(next);event.currentTarget.querySelector<HTMLButtonElement>(`[data-format="${next}"]`)?.focus();
    }}>
      {([['publication','图片／PDF'],['txt','纯文本 TXT'],['markdown','Markdown']] as const).map(([value,label])=><button key={value} type="button" role="radio" data-format={value} aria-checked={format===value} disabled={state==='exporting'} onClick={()=>{setFormat(value);setMessage('');setState('idle')}}>{label}</button>)}
    </div>
    <p className="export-work-title">{editor.title.trim()||'未题'}</p>
    {message?<p className={`export-message export-${state}`} role={state==='error'?'alert':'status'}>{message}</p>:null}
    <footer><ManuscriptStamp onClick={()=>void exportWork()} disabled={state==='exporting'}>{state==='exporting'?'正在导出…':format==='publication'?'开始排版':'选择位置并导出'}</ManuscriptStamp></footer>
  </LibraryDialog>;
}
