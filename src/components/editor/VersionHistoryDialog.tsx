import { displayDate } from "../../shared/displayDate";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { desktopApi, getDesktopErrorMessage } from "../../services/desktopApi";
import { flushBeforeClose } from "../../services/closeCoordinator";
import { canLeave } from "../../shared/close";
import { type WorkVersion } from "../../shared/recovery";
import type { WorkAnalysisState, WorkRecord } from "../../shared/work";
import { useEditorDialogFocus } from "./useEditorDialogFocus";

export function VersionHistoryDialog({workId,onClose}:{workId:string;onClose:()=>void}):JSX.Element {
  const dialog=useRef<HTMLElement>(null);
  const [versions,setVersions]=useState<WorkVersion[]>([]),[selected,setSelected]=useState<WorkVersion|null>(null),[current,setCurrent]=useState<WorkRecord|null>(null);
  const [analysis,setAnalysis]=useState<WorkAnalysisState|null>(null);
  const [compare,setCompare]=useState(false),[rules,setRules]=useState(false),[pinBusy,setPinBusy]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEditorDialogFocus(dialog,rules?()=>setRules(false):onClose,busy||pinBusy);
  async function load(){setBusy(true);setError("");try{
    const result=await flushBeforeClose();if(!canLeave(result))throw new Error("当前修改尚未保存，请重试保存后查看历史。");
    const [history,work,state]=await Promise.all([desktopApi.works.listVersions(workId),desktopApi.works.get(workId),desktopApi.works.getAnalysisState(workId)]);
    setVersions(history);setSelected(history[0]??null);setCurrent(work);setAnalysis(state);
  }catch(cause){setError(getDesktopErrorMessage(cause,"历史暂时无法取阅，请重试。"));}finally{setBusy(false);}}
  useEffect(()=>{void load();},[workId]);
  async function restore(){if(!selected)return;setBusy(true);setError("");try{
    const result=await flushBeforeClose();if(!canLeave(result))throw new Error("当前修改尚未保存，未执行恢复。");
    await desktopApi.works.restoreVersion(workId,selected.id);
    window.dispatchEvent(new CustomEvent("shifang-work-restored",{detail:workId}));onClose();
  }catch(cause){setError(getDesktopErrorMessage(cause,"恢复未完成，当前作品仍保留，请重试。"));}finally{setBusy(false);}}
  async function togglePin(){if(!selected||pinBusy)return;setPinBusy(true);setError("");try{
    const pinned=!selected.pinned;await desktopApi.works.setVersionPinned(workId,selected.id,pinned);
    setVersions(items=>items.map(v=>v.id===selected.id?{...v,pinned}:v));setSelected({...selected,pinned});
  }catch(cause){setError(getDesktopErrorMessage(cause,"保留状态未能保存，请重试。"));}finally{setPinBusy(false);}}
  const fields=["题名","正文","附记","状态","位置"];
  const oldValues=selected?[selected.title,selected.body,selected.notes,selected.status,selected.location]:[];
  const newValues=current?[current.title,current.body,current.notes,current.status,current.location]:[];
  const differences=fields.filter((_,i)=>oldValues[i]!==newValues[i]);
  if(selected?.snapshot&&current){for(const [key,label]of [["genre","文体"],["room","房间"],["category","分类"],["tags","标签"],["collectionId","归集"],["collectionPosition","文集顺序"],["rhymeGroupId","韵部"],["ci","词谱与读音"],["assistance","查韵位置"]]as const)if(JSON.stringify(selected.snapshot.work[key])!==JSON.stringify(current[key]))differences.push(label);}
  if(selected?.snapshot){const compare=(a:WorkAnalysisState|null)=>a?{templateId:a.templateId,variantId:a.variantId,readingOverrides:a.readingOverrides,ruleDatasetVersions:Object.fromEntries(Object.entries(a.ruleDatasetVersions).sort(([x],[y])=>x.localeCompare(y)))}:null;if(JSON.stringify(compare(selected.snapshot.analysisState))!==JSON.stringify(compare(analysis)))differences.push("校对设置");}
  return createPortal(<div className="dialog-backdrop manuscript-review-backdrop"><section className="history-paper" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="history-title">
    <header><h2 id="history-title" data-dialog-initial tabIndex={-1}>版本历史</h2><div className="history-header-actions"><button type="button" onClick={()=>setRules(!rules)} disabled={busy||pinBusy}>保留规则</button><button type="button" onClick={rules?()=>setRules(false):onClose} disabled={busy||pinBusy}>返回</button></div></header>
    {error?<p role="alert">{error} <button disabled={busy} onClick={()=>void load()}>重试</button></p>:null}
    {busy?<p role="status">正在读取…</p>:null}
    {!busy&&!versions.length&&!error?<p>尚无历史版本。</p>:null}
    {rules?<section className="history-retention-rules"><h3>历史保留</h3><dl><div><dt>最近 30 天</dt><dd>保留较细的自动历史</dd></div><div><dt>更早的自动历史</dt><dd>每天保留最后一版</dd></div><div><dt>每篇自动历史上限</dt><dd>100 个</dd></div><div><dt>标记保留、手动保存</dt><dd>不自动清理</dd></div></dl><p>达到上限时先移除最早的未保留自动版本。正文自动保存不受影响。</p><p>恢复前的记录和状态变化记录同样保留。升级前会自动备份已有历史。</p></section>:null}
    <div className="history-paper-layout" hidden={rules}><nav aria-label="历史版本列表">{versions.map(v=><button type="button" aria-pressed={selected?.id===v.id} disabled={busy||pinBusy} key={v.id} onClick={()=>setSelected(v)}><time>{displayDate(v.createdAt)}</time><span>{v.reason==="autosave"?"自动保存":v.reason==="status_change"?"状态变化":"保存"}{v.pinned?" · 已保留":""}</span></button>)}</nav>
    {selected?<article className="history-paper-content"><div className="history-paper-heading"><h3>{selected.title||"未题"}</h3><div className="history-heading-actions"><button type="button" disabled={busy||pinBusy} aria-pressed={Boolean(selected.pinned)} onClick={()=>void togglePin()}>{selected.pinned?"已保留":"保留此版"}</button><button type="button" aria-pressed={compare} onClick={()=>setCompare(!compare)}>{compare?"收起对照":"对照当前稿"}</button></div></div>
    <p className="history-differences">与当前稿不同：{differences.join("、")||"无"}。</p>
    <div className={`history-paper-bodies${compare?" is-comparing":""}`}><section>{compare?<h4>此版本</h4>:null}<pre>{selected.body.split("\n").map((line,i)=><span key={i} className={compare&&line!==current?.body.split("\n")[i]?"is-changed":""}>{line}{i<selected.body.split("\n").length-1?"\n":""}</span>)}</pre></section>
    {compare?<section><h4>当前稿</h4><pre>{current?.body.split("\n").map((line,i)=><span key={i} className={line!==selected.body.split("\n")[i]?"is-changed":""}>{line}{i<current.body.split("\n").length-1?"\n":""}</span>)}</pre></section>:null}</div>
    {selected.notes||current?.notes?<details className="history-notes"><summary>附记</summary><div><pre>{selected.notes}</pre>{compare?<pre>{current?.notes}</pre>:null}</div></details>:null}
    {!selected.snapshot?<p className="history-restore-note">旧版记录不含完整属性；恢复保留现有标签和归集，未记录的近体诗选音会清除。</p>:selected.snapshot.work.assistance===undefined?<p className="history-restore-note">此版本未记录用韵浏览位置，恢复时保留当前位置。</p>:null}
    <footer><span>恢复前会保留当前版本</span><button type="button" className="history-restore" disabled={busy||!differences.length} onClick={()=>void restore()}>恢复此版本</button></footer></article>:null}</div>
  </section></div>,document.querySelector(".app-shell")??document.body);
}
