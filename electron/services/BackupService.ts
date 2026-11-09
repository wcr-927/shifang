import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrowserWindow } from "electron";
import { validateBackup, type CompleteBackup } from "../../src/shared/recovery.js";
import type { WorkRepository } from "../database/repositories/WorkRepository.js";
import type { ShowSaveDialog } from "./ExportService.js";

export function writeBackupAtomic(path: string, backup: CompleteBackup): void {
  const temporary=join(dirname(path),`.shifang-${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd=openSync(temporary,"wx",0o600);
    writeFileSync(fd,JSON.stringify(backup,null,2),"utf8");fsyncSync(fd);closeSync(fd);fd=undefined;
    renameSync(temporary,path);
  } finally { if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{/* renamed or not created */} }
}
export class BackupService {
  private selected: {token:string; backup:CompleteBackup} | null=null;
  private busy=false;
  constructor(private repository: WorkRepository, private backupDirectory: string, private saveDialog: ShowSaveDialog, private openDialog: (window: BrowserWindow | undefined)=>Promise<{canceled:boolean;filePaths:string[]}>, private write=writeBackupAtomic) {}
  private async exclusive<T>(action:()=>Promise<T>):Promise<T>{if(this.busy)throw new Error("备份或恢复正在进行，请稍候");this.busy=true;try{return await action();}finally{this.busy=false;}}
  export(window: BrowserWindow | undefined){return this.exclusive(async()=>{
    const choice=await this.saveDialog(window,{title:"完整备份作品库",defaultPath:`诗房完整备份-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:"诗房完整备份",extensions:["json"]}]});
    if(choice.canceled||!choice.filePath)return {status:"cancelled" as const};
    this.write(choice.filePath,this.repository.exportBackup());return {status:"exported" as const,path:choice.filePath};
  });}
  preview(window: BrowserWindow | undefined){return this.exclusive(async()=>{
    this.selected=null;
    const choice=await this.openDialog(window);if(choice.canceled||!choice.filePaths[0])return {status:"cancelled" as const};
    let backup: CompleteBackup;
    try{backup=validateBackup(JSON.parse(readFileSync(choice.filePaths[0],"utf8")));}
    catch(cause){throw new Error("备份文件无法读取或未通过完整格式与关联校验，请重新选择。原作品库未改变。",{cause});}
    const token=randomUUID();this.selected={token,backup};
    return {status:"selected" as const,token,path:choice.filePaths[0],createdAt:backup.createdAt,works:backup.works.length,collections:backup.collections.length,versions:backup.versions.length,analysisStates:backup.analysisStates.length,notes:backup.works.filter(w=>w.notes.length>0).length+(backup.readingNotes?.length??0),schemaVersion:backup.schemaVersion};
  });}
  restore(token:string){return this.exclusive(async()=>{
    if(!this.selected||this.selected.token!==token)throw new Error("恢复预览已失效，请重新选择备份");
    const path=join(this.backupDirectory,`before-restore-${Date.now()}-${randomUUID()}.json`);
    this.repository.restoreBackup(this.selected.backup,b=>{mkdirSync(this.backupDirectory,{recursive:true});this.write(path,b);});
    this.selected=null;return {status:"restored" as const,backupPath:path};
  });}
}
