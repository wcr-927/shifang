import type {ReadingShelfItem,ReadingIndexPage,ReadingPiece,readingIndexRequest,readingPieceRequest} from '../../src/shared/reading';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { z } from 'zod';
import type { ReferenceBook, ReferenceChapterPage, ReferenceImportProgress, ReferencePosition, ReferenceSearchPage, ReferenceTocPage, referenceChapterSchema, referenceSearchSchema, referenceTocSchema } from '../../src/shared/reference';
import type { ReferenceTocPath,ReferenceTocSearchPage,referenceTocPathSchema,referenceTocSearchSchema } from '../../src/shared/reference';
import { ReferenceCancelledError } from './task';

class WorkerRpc {
  private exited=false; private closing:Promise<void>|null=null; private sequence=0; private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>(); readonly worker:Worker; readonly ready:Promise<void>; private resolveReady:()=>void=()=>{}; private rejectReady:(error:Error)=>void=()=>{};
  constructor(directory:string,workerPath:string,cleanup:boolean,progress:(value:Record<string,any>)=>void) {
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    this.ready.catch(()=>{}); this.worker=new Worker(workerPath,{workerData:{directory,cleanup},execArgv:workerPath.endsWith('.ts')?['--import',import.meta.resolve('tsx')]:[]}); this.worker.unref();
    this.worker.on('message',value=>{
      if(value.event==='ready'){this.resolveReady();return;}
      if(value.event==='progress'){progress(value);return;}
      if(value.event) return;
      const pending=this.pending.get(value.id);if(!pending)return;this.pending.delete(value.id);if(!this.pending.size)this.worker.unref();
      if(value.error)pending.reject(value.cancelled?new ReferenceCancelledError():new Error(value.error));else pending.resolve(value.result);
    });
    this.worker.on('error',error=>this.fail(error));this.worker.on('exit',code=>{this.exited=true;if(this.pending.size)this.fail(new Error(`资料worker已退出 (${code})`));});
  }
  private fail(error:Error):void{this.rejectReady(error);for(const pending of this.pending.values())pending.reject(error);this.pending.clear();}
  async call<T>(method:string,args:unknown[]=[],requestId?:string):Promise<T>{if(this.exited)throw new Error('资料worker已关闭');this.worker.ref();await this.ready;const id=++this.sequence;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,args,requestId});});}
  cancel(requestId:string):void{this.worker.postMessage({method:'cancel',args:[requestId]});}
  async terminate():Promise<void>{this.exited=true;this.fail(new Error('资料worker已关闭'));await this.worker.terminate();}
  close():Promise<void>{if(this.exited)return Promise.resolve();if(!this.closing)this.closing=(async()=>{try{await this.call('close');}finally{await this.terminate();}})();return this.closing;}
}
export class ReferenceLibraryService {
  private rpc:WorkerRpc|null=null; private importFinished:Promise<void>|null=null; private importer:WorkerRpc|null=null; private activeImport:string|null=null; private importCancelled=false; private imports=new Map<string,ReferenceImportProgress>(); private closed=false; private readonly workerPath:string;
  /** directory must be the environment's userData/reference, never the works database. */
  constructor(readonly directory:string,workerPath?:string) {
    this.workerPath=workerPath??fileURLToPath(new URL('./libraryWorker.js',import.meta.url));

  }
  private reader():WorkerRpc{if(this.closed)throw new Error('资料库已关闭');return this.rpc??=(new WorkerRpc(this.directory,this.workerPath,true,()=>{}));}
  recommendationTarget(id:string):Promise<{bookId:string;sourceId:string;nodeId:string;title:string}|null>{return this.reader().call('recommendationTarget',[id]);}
  readingShelf():Promise<ReadingShelfItem[]>{return this.reader().call('readingShelf');}
  readingIndex(r:z.output<typeof readingIndexRequest>):Promise<ReadingIndexPage>{return this.reader().call('readingIndex',[r]);}
  readingPiece(r:z.output<typeof readingPieceRequest>):Promise<ReadingPiece>{return this.reader().call('readingPiece',[r]);}
  listSources():Promise<ReferenceBook[]>{return this.reader().call('listSources');}
  async importFile(path:string,requestId:string):Promise<{book:ReferenceBook;duplicate:boolean}> {
    if(this.closed)throw new Error('资料库已关闭'); if(this.activeImport)throw new Error('已有资料正在接入，请等待完成');
    this.activeImport=requestId;this.importCancelled=false;let finish=()=>{};this.importFinished=new Promise(resolve=>{finish=resolve;});
    this.imports.set(requestId,{requestId,status:'running',phase:'准备文件',completed:0,total:0,message:''});
    while(this.imports.size>32){const first=this.imports.keys().next().value;if(first)this.imports.delete(first);}
    let importer:WorkerRpc|null=null;
    try{
      await this.reader().call('listSources');if(this.closed||this.importCancelled)throw new ReferenceCancelledError();
      importer=new WorkerRpc(this.directory,this.workerPath,false,value=>{this.imports.set(requestId,{requestId,status:'running',phase:value.phase,completed:value.completed,total:value.total,message:''});});this.importer=importer;
      const result=await importer.call<{book:ReferenceBook;duplicate:boolean}>('importFile',[path],requestId);
      this.imports.set(requestId,{requestId,status:'done',phase:result.duplicate?'已接入此书':'接入完成',completed:result.book.chapterCount,total:result.book.chapterCount,message:result.duplicate?'原书指纹相同，复用已有资料。':'',sourceId:result.book.id});return result;
    }catch(error){this.imports.set(requestId,{requestId,status:error instanceof ReferenceCancelledError?'cancelled':'error',phase:'接入结束',completed:0,total:0,message:error instanceof Error?error.message:String(error)});throw error;}
    finally{try{await importer?.close();}finally{this.importer=null;this.activeImport=null;finish();this.importFinished=null;}}
  }
  async rebuildNavigation(sourceId:string,requestId:string):Promise<void> {
    if(this.closed)throw new Error('资料库已关闭');if(this.activeImport)throw new Error('已有资料任务进行中，请稍后重试');
    this.activeImport=requestId;this.importCancelled=false;let finish=()=>{};this.importFinished=new Promise(resolve=>{finish=resolve;});
    this.imports.set(requestId,{requestId,status:'running',phase:'准备阅读目录',completed:0,total:0,message:'',sourceId});
    let worker:WorkerRpc|null=null;
    try {
      await this.reader().call('listSources');if(this.closed||this.importCancelled)throw new ReferenceCancelledError();
      worker=new WorkerRpc(this.directory,this.workerPath,false,value=>this.imports.set(requestId,{requestId,status:'running',phase:value.phase,completed:value.completed,total:value.total,message:'',sourceId}));this.importer=worker;
      await worker.call('rebuildNavigation',[sourceId],requestId);this.imports.set(requestId,{requestId,status:'done',phase:'阅读目录已更新',completed:1,total:1,message:'',sourceId});
    }catch(error){this.imports.set(requestId,{requestId,status:error instanceof ReferenceCancelledError?'cancelled':'error',phase:'目录更新结束',completed:0,total:0,message:error instanceof Error?error.message:String(error),sourceId});throw error;}
    finally {try{await worker?.close();}finally{this.importer=null;this.activeImport=null;finish();this.importFinished=null;}}
  }
  getTocPath(request:z.output<typeof referenceTocPathSchema>):Promise<ReferenceTocPath>{return this.reader().call('getTocPath',[request]);}
  getTocSearch(request:z.output<typeof referenceTocSearchSchema>):Promise<ReferenceTocSearchPage>{return this.reader().call('getTocSearch',[request]);}
  importProgress(requestId:string):ReferenceImportProgress{return this.imports.get(requestId)??{requestId,status:'error',phase:'未找到接入任务',completed:0,total:0,message:'接入任务不存在或已过期'};}
  cancel(requestId:string):void{if(this.activeImport===requestId)this.importCancelled=true;this.rpc?.cancel(requestId);this.importer?.cancel(requestId);}
  getToc(request:z.output<typeof referenceTocSchema>):Promise<ReferenceTocPage>{return this.reader().call('getToc',[request]);}
  getChapter(request:z.output<typeof referenceChapterSchema>):Promise<ReferenceChapterPage>{return this.reader().call('getChapter',[request]);}
  search(request:z.output<typeof referenceSearchSchema>):Promise<ReferenceSearchPage>{return this.reader().call('search',[request],request.requestId);}
  getImage(sourceId:string,imageId:string):Promise<{dataUrl:string}>{return this.reader().call('getImage',[sourceId,imageId]);}
  resolve(request:{sourceId:string;internalPath:string}):Promise<{documentId:string;anchor:string}|null>{return this.reader().call('resolve',[request]);}
  getPosition(sourceId:string):Promise<ReferencePosition|null>{return this.reader().call('getPosition',[sourceId]);}
  savePosition(position:ReferencePosition):Promise<void>{return this.reader().call('savePosition',[position]);}
  async close():Promise<void>{
    this.closed=true;if(this.activeImport)this.importer?.cancel(this.activeImport);
    if(this.importFinished){let timeout:ReturnType<typeof setTimeout>|undefined;await Promise.race([this.importFinished,new Promise<void>(resolve=>{timeout=setTimeout(resolve,1500);})]);if(timeout)clearTimeout(timeout);if(this.importer)await this.importer.terminate();}
    if(this.rpc)await this.rpc.close();
  }
}
