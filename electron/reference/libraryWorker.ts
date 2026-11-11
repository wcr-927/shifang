import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { ReferenceLibrary, yieldTask } from './library';
import {recommendationTarget} from './recommendation';
import {readingShelf,readingIndex,ReadingPieces} from './reading';
import { ReferenceCancelledError } from './task';

if (!parentPort) throw new Error('资料worker需要消息端口');
const port=parentPort; const cancelled=new Set<string>();const active=new Map<number,string>();
await mkdir(workerData.directory,{recursive:true});
// Only the long-lived query worker cleans interrupted private staging files at startup.
if (workerData.cleanup) for (const name of await readdir(workerData.directory)) if (/^\.import-[a-f\d-]+$/u.test(name)) await rm(join(workerData.directory,name),{recursive:true,force:true});
const library=new ReferenceLibrary(workerData.directory);
if(workerData.cleanup)library.db.exec('DELETE FROM navigation_nodes WHERE NOT EXISTS (SELECT 1 FROM navigation_versions v WHERE v.source_id=navigation_nodes.source_id AND v.generation=navigation_nodes.generation)');
const upgrades=new Map<string,Promise<void>>();
async function ensureNavigation(sourceId:string){if(!library.db.prepare('SELECT id FROM sources WHERE id=?').get(sourceId))return;let pending=upgrades.get(sourceId);if(!pending){pending=library.rebuildNavigation(sourceId,{check:()=>{}}).finally(()=>upgrades.delete(sourceId));upgrades.set(sourceId,pending);}await pending;}
const pieces=new ReadingPieces(library.db,workerData.directory);
port.on('message', async (message:{id:number;method:string;args:any[];requestId?:string}) => {
  if (message.method==='cancel') { cancelled.add(message.args[0]); if(cancelled.size>2048)cancelled.delete(cancelled.values().next().value!); return; }
  const requestId=message.requestId??String(message.id);
  active.set(message.id,requestId);
  const hooks={check:()=>{if(cancelled.has(requestId)) throw new ReferenceCancelledError();},progress:(phase:string,completed:number,total:number)=>port.postMessage({event:'progress',requestId,phase,completed,total})};
  try {
    hooks.check(); let result:unknown;
    switch(message.method) {
      case 'recommendationTarget': result=recommendationTarget(library.db,message.args[0]);break;
      case 'readingShelf': result=readingShelf(library.db);break;
      case 'readingIndex': await ensureNavigation(message.args[0].sourceId);result=readingIndex(library.db,message.args[0]);break;
      case 'readingPiece': await ensureNavigation(message.args[0].sourceId);result=await pieces.get(message.args[0]);break;
      case 'listSources': result=library.listSources();break;
      case 'importFile': result=await library.importFile(message.args[0],hooks);break;
      case 'rebuildNavigation': result=await library.rebuildNavigation(message.args[0],hooks);break;
      case 'getTocPath': result=library.getTocPath(message.args[0]);break;
      case 'getTocSearch': result=library.getTocSearch(message.args[0]);break;
      case 'getToc': result=library.getToc(message.args[0]);break;
      case 'getChapter': result=library.getChapter(message.args[0]);break;
      case 'search': result=await library.search(message.args[0],hooks);break;
      case 'getImage': result=await library.getImage(message.args[0],message.args[1]);break;
      case 'resolve': result=library.resolve(message.args[0]);break;
      case 'getPosition': result=library.getPosition(message.args[0]);break;
      case 'savePosition': result=library.savePosition(message.args[0]);break;
      case 'close': for(const [id,request] of active)if(id!==message.id)cancelled.add(request);while(active.size>1)await yieldTask();library.close();port.postMessage({id:message.id,result:null});port.close();return;
      default:throw new Error('资料任务无效');
    }
    port.postMessage({id:message.id,result});
  } catch(error) { port.postMessage({id:message.id,error:error instanceof Error?error.message:String(error),cancelled:error instanceof ReferenceCancelledError}); }
  finally { active.delete(message.id);cancelled.delete(requestId); }
});
port.postMessage({event:'ready'});
