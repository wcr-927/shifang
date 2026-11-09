import { CiUnavailableWorkPage } from "./CiUnavailableWorkPage";
import type { CiWorkPage } from "./CiWorkPage";
import { useEffect, useState } from "react";
import { desktopApi } from "../services/desktopApi";
import type { WorkRecord, WorkRoom } from "../shared/work";
import { roomOf } from "../shared/work";
import { LoadingState, ErrorState } from "../components/common/AsyncState";
import { WorkDetailPage } from "./WorkDetailPage";
import { FreeWorkPage } from "./FreeWorkPage";

export function WorkEditorPage(props: { workId: string; onBack: () => void; onArchived: () => void; backLabel?: string; onRoomResolved?: (id:string,room:WorkRoom)=>void }): JSX.Element {
  const [ciPage,setCiPage]=useState<typeof CiWorkPage|null>(null);
  const [ciLoadError,setCiLoadError]=useState(false);
  const [work,setWork]=useState<WorkRecord|null|undefined>();const [error,setError]=useState("");const [retry,setRetry]=useState(0);
  useEffect(()=>{const restored=(event:Event)=>{if((event as CustomEvent<string>).detail===props.workId)setRetry(n=>n+1);};window.addEventListener("shifang-work-restored",restored);return()=>window.removeEventListener("shifang-work-restored",restored);},[props.workId]);
  useEffect(()=>{let active=true;setWork(undefined);setError("");void desktopApi.works.get(props.workId).then(w=>{if(active){setWork(w);if(w)props.onRoomResolved?.(w.id,roomOf(w));}}).catch(()=>{if(active)setError("诗稿暂时无法取阅，请重试。");});return()=>{active=false;};},[props.workId,retry,props.onRoomResolved]);
  useEffect(()=>{
    if(work?.genre!=="ci")return;
    let active=true;setCiPage(null);setCiLoadError(false);
    void import("./CiWorkPage").then(module=>{if(active)setCiPage(()=>module.CiWorkPage);}).catch(()=>{if(active)setCiLoadError(true);});
    return()=>{active=false;};
  },[work,retry]);
  if(error)return <ErrorState message={error} onRetry={()=>setRetry(n=>n+1)}/>;
  if(work===undefined)return <LoadingState label="正在打开诗稿"/>;
  if(work===null)return <section className="detail-empty"><h1>未找到这首诗稿</h1><button className="quiet-button" onClick={props.onBack}>返回{props.backLabel ?? "诗稿"}</button></section>;
  const CiPage=ciPage;
  if(work.genre==="ci") {
    if(ciLoadError)return <CiUnavailableWorkPage key={`${work.id}:${retry}`} work={work} onBack={props.onBack} backLabel={props.backLabel}/>;
    if(!CiPage)return <section><LoadingState label="正在加载词稿"/><button className="quiet-button" onClick={props.onBack}>返回{props.backLabel??"诗稿"}</button></section>;
    return <CiPage key={`${work.id}:${retry}`} work={work} onBack={props.onBack} backLabel={props.backLabel}/>;
  }
  return work.genre==="free"?<FreeWorkPage key={`${work.id}:${retry}`} work={work} onBack={props.onBack} backLabel={props.backLabel}/>:<WorkDetailPage key={`${work.id}:${retry}`} {...props}/>;
}
