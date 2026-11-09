import { displayDate } from "../../shared/displayDate";
import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { desktopApi, getDesktopErrorMessage } from "../../services/desktopApi";
import { useEditorDialogFocus } from "../editor/useEditorDialogFocus";
import type { BackupPreview } from "../../shared/recovery";
export function BackupDialog({onClose,onRestored}:{onClose:()=>void;onRestored:()=>void}):JSX.Element{
 const dialog=useRef<HTMLElement>(null),[busy,setBusy]=useState(false),[preview,setPreview]=useState<BackupPreview|null>(null),[message,setMessage]=useState(""),[error,setError]=useState(false);
 useEditorDialogFocus(dialog,onClose,busy);
 async function action(kind:"export"|"preview"|"restore"){
  setBusy(true);setMessage("");setError(false);
  try{
   if(kind==="export"){const result=await desktopApi.works.exportBackup();setMessage(result.status==="cancelled"?"已取消备份。":`完整备份已保存：${result.path}`);}
   if(kind==="preview"){setPreview(null);const result=await desktopApi.works.previewBackup();if(result.status==="selected")setPreview(result);else setMessage("已取消选择备份。");}
   if(kind==="restore"&&preview){const result=await desktopApi.works.restoreBackup(preview.token);setPreview(null);setMessage(`作品库已恢复。恢复前备份：${result.backupPath}`);onRestored();}
  }catch(cause){setError(true);setMessage(getDesktopErrorMessage(cause,"操作未完成，原作品库仍保留，请重试。"));}finally{setBusy(false);}
 }
 return createPortal(<div className="dialog-backdrop"><section ref={dialog} className="dialog recovery-dialog backup-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="backup-title"><header className="dialog-header"><h2 id="backup-title">备份与恢复</h2><button className="quiet-button" type="button" disabled={busy} onClick={onClose}>关闭</button></header><p>完整备份包含作品、文集、摘录与读书笔记、旧稿附记、标签、读音选择和历史记录。书籍资料和阅读位置不在作品备份中，原书可重新接入。</p><div className="dialog-actions"><button type="button" className="quiet-button" disabled={busy} onClick={()=>void action("export")}>保存完整备份</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>void action("preview")}>选择备份并预览</button></div>{busy?<p role="status">正在处理，请稍候…</p>:null}{message?<p role={error?"alert":"status"}>{message}</p>:null}{preview?<section className="backup-preview"><h3>恢复预览</h3><p>{preview.path}</p><p>备份时间：{displayDate(preview.createdAt)} · 数据格式 {preview.schemaVersion}</p><p>{preview.works} 篇作品 · {preview.collections} 个归集 · {preview.versions} 个历史版本 · {preview.notes} 项笔记 · {preview.analysisStates} 份近体诗状态</p><p>确认后以此备份替换当前作品库。系统会先保存当前库的完整备份；任一步失败都会保留原库。</p><footer className="dialog-actions"><button type="button" className="quiet-button" disabled={busy} onClick={()=>setPreview(null)}>取消恢复</button><button type="button" className="primary-button" disabled={busy} onClick={()=>void action("restore")}>确认恢复作品库</button></footer></section>:null}</section></div>,document.querySelector(".app-shell")??document.body);
}
