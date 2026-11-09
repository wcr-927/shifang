import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtempSync,rmSync,mkdirSync,cpSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseConnection} from "../../electron/database/connection.ts";
import {WorkRepository} from "../../electron/database/repositories/WorkRepository.ts";
import {emptyAssistance, type WorkAssistanceState} from "../../src/shared/assistanceState.ts";
const migrations=join(process.cwd(),"electron/database/migrations");
const state:WorkAssistanceState={...emptyAssistance(),firstLineRhyme:"sourced-neighbor",references:[{segmentId:"poem",system:"pingshui",groupId:"ping-10hui",mode:"manual"}]};
function fixture(){const dir=mkdtempSync(join(tmpdir(),"rhyme-reference-"));const c=new DatabaseConnection(join(dir,"db.sqlite"),migrations),r=new WorkRepository(c.db);return {dir,c,r,close(){c.close();rmSync(dir,{recursive:true,force:true})}};}
test("reference and text save atomically; omission preserves, explicit empty clears, versions restore",()=>{
 const f=fixture();try{
 const w=f.r.createWork({genre:"qilv",body:"原文",notes:"原笔记",assistance:state});
 const saved=f.r.updateWork(w.id,{body:"新文"});assert.deepEqual(saved.assistance,state);
 const version=f.r.listVersions(w.id).find(v=>v.body==="原文")!;
 f.c.db.exec("CREATE TRIGGER fail_reference BEFORE UPDATE ON work_assistance_state BEGIN SELECT RAISE(ABORT,'reference failed'); END");
 assert.throws(()=>f.r.saveEditorState({...saved,workId:w.id,genre:"qilv",templateId:"qilv",variantId:null,readingOverrides:[],ruleDatasetVersions:{},body:"不可落盘",assistance:emptyAssistance()}),/reference failed/);
 assert.equal(f.r.getWork(w.id)?.body,"新文");assert.deepEqual(f.r.getWork(w.id)?.assistance,state);
 f.c.db.exec("DROP TRIGGER fail_reference");
 f.r.updateWork(w.id,{assistance:emptyAssistance()});assert.deepEqual(f.r.getWork(w.id)?.assistance,emptyAssistance());
 assert.deepEqual(f.r.restoreVersion(w.id,version.id).assistance,state);
 assert.equal(f.r.getWork(w.id)?.notes,"原笔记");
 }finally{f.close()}
});
test("new backup round trips reference; old backup keeps matching work reference and removes orphans",()=>{
 const f=fixture(),other=fixture();try{
 const w=f.r.createWork({genre:"qilv",body:"原文",assistance:state});
 const backup=f.r.exportBackup();assert.equal(backup.formatVersion,5);assert.equal(backup.schemaVersion,8);
 other.r.restoreBackup(backup,()=>{});assert.deepEqual(other.r.getWork(w.id)?.assistance,state);
 const old:any=structuredClone(backup);old.formatVersion=1;old.schemaVersion=4;
 for(const work of old.works)delete work.assistance;
 for(const version of old.versions)if(version.snapshot)delete version.snapshot.work.assistance;
 const orphan=other.r.createWork({genre:"wujue",assistance:state});
 other.r.restoreBackup(old,()=>{});assert.deepEqual(other.r.getWork(w.id)?.assistance,state);assert.equal(other.r.getWork(orphan.id),null);
 assert.equal(other.c.db.prepare("SELECT count(*) n FROM work_assistance_state WHERE work_id=?").get(orphan.id)?.n,0);
 const oldVersion=other.r.listVersions(w.id)[0];assert.deepEqual(other.r.restoreVersion(w.id,oldVersion.id).assistance,state);
 }finally{f.close();other.close()}
});
test("005 migrates legacy database with safety backup and leaves body untouched",()=>{
 const dir=mkdtempSync(join(tmpdir(),"rhyme-migration-")),old=join(dir,"old"),path=join(dir,"db.sqlite");mkdirSync(old);
 for(const name of ["001_initial.sql","002_creation_spaces.sql","003_ci.sql","004_complete_versions.sql"])cpSync(join(migrations,name),join(old,name));
 let c=new DatabaseConnection(path,old);const id="00000000-0000-4000-8000-000000000001";
 c.db.prepare("INSERT INTO works(id,title,body,genre,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id,"稿","  文字\n","wujue","old","old");c.close();
 c=new DatabaseConnection(path,migrations);try{assert.ok(c.backupPath);assert.equal(new WorkRepository(c.db).getWork(id)?.body,"  文字\n");assert.deepEqual(new WorkRepository(c.db).getWork(id)?.assistance,emptyAssistance());}finally{c.close();rmSync(dir,{recursive:true,force:true})}
});
