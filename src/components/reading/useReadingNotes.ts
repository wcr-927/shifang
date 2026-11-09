import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopApi } from '../../services/desktopApi';
import { registerCloseFlush } from '../../services/closeCoordinator';
import type { FlushResult } from '../../shared/close';
export function useReadingNotes(active:boolean){
 const pending=useRef(new Map<string,string>()),running=useRef<Promise<FlushResult>|null>(null),timer=useRef<ReturnType<typeof setTimeout>>();
 const [error,setError]=useState('');
 const flush=useCallback(():Promise<FlushResult>=>{
  clearTimeout(timer.current);if(running.current)return running.current;
  running.current=(async():Promise<FlushResult>=>{await Promise.resolve();try{while(pending.current.size){const [id,note]=pending.current.entries().next().value!;await desktopApi.reference.updateReadingNote({id,note});if(pending.current.get(id)===note)pending.current.delete(id);}setError('');return{status:'saved'};}catch{setError('读书笔记未能保存，请重试。');return{status:'failed',message:'读书笔记未能保存，已保留编辑内容。'};}finally{running.current=null;}})();return running.current;
 },[]);
 useEffect(()=>active?registerCloseFlush(flush):undefined,[active,flush]);
 useEffect(()=>()=>{clearTimeout(timer.current);void flush();},[flush]);
 return {error,flush,change(id:string,note:string){pending.current.set(id,note);clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),500);}};
}
