import { useState } from "react";
import type { CiForm } from "../../ci/catalogue";
import type { CiWorkRecord } from "../../shared/work";
import { formatCiReading } from "../../ci/presentation";
import { desktopApi, getDesktopErrorMessage } from "../../services/desktopApi";
import { LibraryDialog } from "../works/LibraryDialog";
import { ManuscriptStamp } from "../manuscript/ManuscriptUI";

export function CiReadingCopyDialog({ editor, form, save, onClose }: { editor: CiWorkRecord; form: CiForm; save: () => Promise<boolean>; onClose: () => void }) {
  const [includeTitle, setTitle] = useState(true), [includeForm, setForm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const text = formatCiReading(editor.title, editor.body, form, { title: includeTitle, form: includeForm });
  async function output(action: "copy" | "export") {
    setBusy(true); setMessage("");
    try {
      if (!await save()) throw new Error("当前修改未能保存，请重试后再输出。");
      const request = { title: editor.title, body: editor.body, formId: form.id, includeTitle, includeForm };
      if (action === "copy") { await desktopApi.works.copyReading(request); setMessage("读稿已复制。"); }
      else { const result = await desktopApi.works.exportReading(request); setMessage(result.status === "cancelled" ? "已取消导出。" : "已导出至所选位置。"); }
    } catch (cause) { setMessage(getDesktopErrorMessage(cause, "输出未完成，请重试。")); }
    finally { setBusy(false); }
  }
  return <LibraryDialog title="复制读稿" className="reading-copy-dialog" busy={busy} onClose={onClose}>
    <div className="reading-copy-options"><button type="button" aria-pressed={includeTitle} disabled={busy} onClick={()=>setTitle(!includeTitle)}>题名</button><button type="button" aria-pressed={includeForm} disabled={busy} onClick={()=>setForm(!includeForm)}>词牌体式</button></div>
    <pre aria-label="读稿内容预览" className="reading-copy-preview">{text || "（空稿）"}</pre>
    {message ? <p className="export-message" role="status">{message}</p> : null}
    <footer><button type="button" disabled={busy} onClick={()=>void output('export')}>存为 TXT</button><ManuscriptStamp disabled={busy} onClick={()=>void output('copy')}>{busy?'处理中…':'复制'}</ManuscriptStamp></footer>
  </LibraryDialog>;
}
