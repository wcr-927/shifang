import { flushFailureMessage, flushTimeoutMessage, type FlushResult } from "../shared/close";

type CloseFlushHandler = () => Promise<FlushResult>;

const closeGuards=new Set<()=>string|undefined>();
export function registerCloseGuard(guard:()=>string|undefined):()=>void{closeGuards.add(guard);return()=>{closeGuards.delete(guard)};}

let activeHandler: CloseFlushHandler | null = null;
let pending: Promise<FlushResult> | null = null;

export function registerCloseFlush(handler: CloseFlushHandler): () => void {
  activeHandler = handler;
  return () => { if (activeHandler === handler) activeHandler = null; };
}

export function flushBeforeClose(timeoutMs = 4000): Promise<FlushResult> {
  if (pending) return pending;
  for(const guard of closeGuards){const message=guard();if(message)return Promise.resolve({status:"failed",message});}
  const handler = activeHandler;
  if (!handler) return Promise.resolve({ status: "clean" });
  pending = new Promise<FlushResult>((resolve) => {
    const timer = setTimeout(() => resolve({ status: "timeout", message: flushTimeoutMessage }), timeoutMs);
    Promise.resolve().then(handler).then(resolve, () => resolve({ status: "failed", message: flushFailureMessage }))
      .finally(() => clearTimeout(timer));
  }).finally(() => { pending = null; });
  return pending;
}
