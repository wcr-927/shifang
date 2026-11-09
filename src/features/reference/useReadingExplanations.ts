import { useCallback, useEffect, useState } from 'react';
import { desktopApi } from '../../services/desktopApi';
import type { ReadingExplanationBundle } from '../../shared/readingExplanation';
export type ExplanationRequest=Parameters<typeof desktopApi.reference.explanations>[0];
export type ExplanationQueryState=
 | {status:'idle'|'loading';bundle:null;error:null}
 | {status:'ready';bundle:ReadingExplanationBundle;error:null}
 | {status:'error';bundle:null;error:string};
const idle:ExplanationQueryState={status:'idle',bundle:null,error:null};
const loading:ExplanationQueryState={status:'loading',bundle:null,error:null};
export function useReadingExplanations(request:ExplanationRequest|null):ExplanationQueryState & {retry:()=>void}{
 const system=request?.system,character=request?.character;
 const identity=JSON.stringify([system,character]);
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<{identity:string;attempt:number;value:ExplanationQueryState}>({identity:'',attempt:-1,value:idle});
 const retry=useCallback(()=>setAttempt(value=>value+1),[]);
 useEffect(()=>{
  if(!system||!character)return;
  let active=true;
  setResult({identity,attempt,value:loading});
  void desktopApi.reference.explanations({system,character}).then(bundle=>{
   if(active)setResult({identity,attempt,value:{status:'ready',bundle,error:null}});
  },()=>{if(active)setResult({identity,attempt,value:{status:'error',bundle:null,error:'字义资料暂不可用'}})});
  return ()=>{active=false};
 },[system,character,identity,attempt]);
 // Mask stale data during render, before the effect for a different character runs.
 const value=!request?idle:result.identity===identity&&result.attempt===attempt?result.value:loading;
 return {...value,retry};
}
