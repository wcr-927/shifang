import { useEffect, useRef, useState } from "react";
import type { WorkAssistanceState, RhymeReference } from "../../shared/assistanceState";
import type { ReferenceGroup, ReferenceSystem } from "../../shared/reference";
import { desktopApi } from "../../services/desktopApi";
import { resolveRhymeReference, type RhymeGroupEvidence, type ReferenceFoot } from "./rhymeReference";

/** A remembered dictionary page, never an input to the tone/rhyme analyser. */
export function useRhymeReference(system:ReferenceSystem,segmentId:string,state:WorkAssistanceState|undefined,evidence:RhymeGroupEvidence[],lines:readonly string[],_feet:ReferenceFoot[],onChange?: (reference:RhymeReference)=>void,loading=false) {
 const [catalogue,setCatalogue]=useState<{system:ReferenceSystem;groups:ReferenceGroup[]}|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 const changeRef=useRef(onChange);changeRef.current=onChange;
 useEffect(()=>{let active=true;setError("");setCatalogue(null);
  void Promise.resolve().then(()=>desktopApi.reference.groups({system})).then(groups=>{if(active)setCatalogue({system,groups})},()=>{if(active)setError("韵部目录暂不可用")});
  return()=>{active=false};
 },[system,attempt]);
 const ready=catalogue?.system===system,groups=ready?catalogue.groups:[];
 const available=new Set(ready?groups.map(g=>g.id):evidence.flatMap(g=>g.groupIds));
 const resolved=resolveRhymeReference(state,evidence,lines,available);
 const stored=state?.references.find(r=>r.segmentId===segmentId && r.system===system);
 const active=ready||!stored?resolved.active.find(r=>r.segmentId===segmentId):undefined;
 const groupId=active?.groupId??null;
 // Capture only the initial unambiguous page. No per-keystroke snapshots or reading changes.
 useEffect(()=>{
  if(!loading&&ready&&!stored&&groupId)changeRef.current?.({segmentId,system,groupId,mode:"automatic"});
 },[loading,ready,Boolean(stored),groupId,segmentId,system]);
 function browse(id:string) {
  if(!ready||!available.has(id)||loading)return;
  changeRef.current?.({segmentId,system,groupId:id,mode:"manual"});
 }
 return {groups,ready,error,retry:()=>setAttempt(a=>a+1),groupId,browse,segmentId,
  invalid:ready&&Boolean(stored&&resolved.invalid.includes(stored))};
}
export type RhymeReferenceView = ReturnType<typeof useRhymeReference>;
