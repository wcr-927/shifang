import ciForms from "../../src/ci/forms.json";
import {BrowserWindow,dialog,ipcMain,type IpcMainInvokeEvent} from 'electron';
import {join,dirname,basename} from 'node:path';import {pathToFileURL} from 'node:url';import {writeFile,rename,rm,lstat,mkdtemp} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import type {WorkRepository} from '../database/repositories/WorkRepository';import {handleTrusted} from '../security';
import {publicationRequestSchema,type PublicationDocument} from '../../src/shared/publication';import {publicationSnapshot} from '../../src/features/export/publicationModel';import {sanitizeExportFilename} from '../../src/features/export/exportFormat';
export class PublicationService{
 private window:BrowserWindow|null=null;private snapshot:PublicationDocument|null=null;private busy=false;
 constructor(private repository:WorkRepository,private base:string,private dev:boolean){
  handleTrusted('publication:open',(_e,raw)=>this.open(raw));
  ipcMain.handle('publication:document',e=>{this.check(e);return this.snapshot;});
  ipcMain.handle('publication:export',async(e,format)=>{this.check(e);if(format!=='png'&&format!=='pdf')throw Error('无效导出格式');return this.export(format);});
  ipcMain.on('publication:close',e=>{if(this.window&&e.sender===this.window.webContents&&e.senderFrame===this.window.webContents.mainFrame&&!this.busy)this.window.close();});
 }
 private url(){return this.dev?'http://127.0.0.1:5173/publication.html':pathToFileURL(join(this.base,'../dist/publication.html')).href;}
 private check(e:IpcMainInvokeEvent){if(!this.window||this.window.isDestroyed()||e.sender!==this.window.webContents||e.senderFrame!==this.window.webContents.mainFrame||new URL(e.senderFrame.url).href!==this.url())throw Error('Untrusted publication sender');}
 async open(raw:unknown){
  if(this.window&&!this.window.isDestroyed()){this.window.focus();throw Error('请先关闭当前导出预览。');}
  const request=publicationRequestSchema.parse(raw);let title='',works=[];
  if('workId'in request){const work=this.repository.getWork(request.workId);if(!work)throw Error('作品不存在');works=[work];title=work.title;}
  else{const collection=this.repository.libraryOverview().collections.find(c=>c.id===request.collectionId);if(!collection)throw Error('文集不存在');title=collection.name;
   const result=this.repository.queryWorks({collectionId:request.collectionId,limit:100});if(result.total>100)throw Error('文集超过100篇，请拆分后导出。');works=result.items.map(w=>this.repository.getWork(w.id)!).filter(Boolean);
  }
  this.snapshot=publicationSnapshot(title,'collectionId'in request,works.map(w=>({...w,...(w.genre==='ci'?{sections:ciForms.find(f=>f.id===w.ci.formId)?.sections}:{})})));
  const window=new BrowserWindow({width:1100,height:860,minWidth:850,minHeight:680,title:'诗房 · 导出',backgroundColor:'#e5e1dc',show:false,webPreferences:{preload:join(this.base,'publicationPreload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});this.window=window;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==this.url())event.preventDefault();});window.on('close',e=>{if(this.busy)e.preventDefault();});window.on('closed',()=>{this.window=null;this.snapshot=null;});
  try{await window.loadURL(this.url());window.show();return{status:'opened'};}catch(e){window.destroy();throw e;}
 }
 private async export(format:'png'|'pdf'){
  const window=this.window,snapshot=this.snapshot;if(!window||!snapshot||this.busy)throw Error('当前无法导出');this.busy=true;let temporary='';
  try{
   const count=await window.webContents.executeJavaScript('window.publicationOutput.pageCount()');if(!Number.isInteger(count)||count<1||count>200)throw Error('排版尚未完成');
   const name=sanitizeExportFilename(snapshot.title);
   const chosen=await dialog.showSaveDialog(window,{title:format==='pdf'?'保存 PDF':count===1?'保存图片':'保存图片组',defaultPath:format==='pdf'?name+'.pdf':count===1?name+'.png':name+'-图片',...(format==='pdf'?{filters:[{name:'PDF',extensions:['pdf']}]}:count===1?{filters:[{name:'PNG',extensions:['png']}]}:{})});
   if(chosen.canceled||!chosen.filePath)return{status:'cancelled' as const};const destination=chosen.filePath;
   await window.webContents.executeJavaScript('window.publicationOutput.lock(true)');
   if(format==='pdf'){
    await window.webContents.executeJavaScript('window.publicationOutput.print(true)');
    const bytes=await window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});
    temporary=join(dirname(destination),'.'+basename(destination)+'.'+randomUUID()+'.tmp');await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,destination);temporary='';
   }else{
    if(count>1){temporary=await mkdtemp(join(dirname(destination),'.shifang-images-'));}else temporary=join(dirname(destination),'.'+basename(destination)+'.'+randomUUID()+'.tmp');
    for(let i=0;i<count;i++){
     const rect=await window.webContents.executeJavaScript(`window.publicationOutput.image(${i})`);
     const capture=await window.webContents.capturePage(rect);const bytes=capture.resize({width:1080,height:rect.height*2,quality:'best'}).toPNG();
     await writeFile(count===1?temporary:join(temporary,`${String(i+1).padStart(3,'0')}.png`),bytes,{flag:'wx'});
    }
    if(count>1){try{await lstat(destination);throw Error('同名文件夹已存在，请选择新的名称。');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await rename(temporary,destination);}else await rename(temporary,destination);temporary='';
   }
   return{status:'exported' as const,path:destination};
  }finally{
   if(temporary)await rm(temporary,{recursive:true,force:true}).catch(()=>{});
   if(!window.isDestroyed())await window.webContents.executeJavaScript('window.publicationOutput.reset()').catch(()=>{});
   this.busy=false;
  }
 }
}
