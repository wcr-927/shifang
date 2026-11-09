import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseConnection } from '../../electron/database/connection.ts';
import { WorkRepository } from '../../electron/database/repositories/WorkRepository.ts';
import { pruneAutomaticHistory } from '../../electron/database/historyRetention.ts';

test('retention caps automatic versions, keeps last older daily version, and protects pinned/manual/status records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'history-retention-')), c=new DatabaseConnection(join(dir,'db.sqlite'),join(process.cwd(),'electron/database/migrations')), repo=new WorkRepository(c.db);
 try{
  const w=repo.createWork({genre:'wujue',body:'原文'});
  const insert=(date:string,reason='autosave',pinned=0)=>{const id=randomUUID();c.db.prepare("INSERT INTO work_versions(id,work_id,title,body,genre,status,location,notes,reason,created_at,room,category,completeness,pinned) VALUES (?,?,'','','wujue','draft','','',?,?,'poetry','unclassified','legacy',?)").run(id,w.id,reason,date,pinned);return id;};
  const old=new Date(Date.now()-40*86400000);old.setHours(10,0,0,0);
  const first=insert(old.toISOString());old.setHours(12);const last=insert(old.toISOString());
  const pinned=insert(new Date(0).toISOString(),'autosave',1), manual=insert(new Date(0).toISOString(),'manual_save'), status=insert(new Date(0).toISOString(),'status_change');
  pruneAutomaticHistory(c.db,w.id);let ids=repo.listVersions(w.id).map(v=>v.id);assert.ok(!ids.includes(first));assert.ok(ids.includes(last));
  for(let i=0;i<110;i++)insert(new Date(Date.now()-i*600000).toISOString());
  pruneAutomaticHistory(c.db,w.id);const versions=repo.listVersions(w.id);assert.equal(versions.filter(v=>v.reason==='autosave'&&!v.pinned).length,100);
  ids=versions.map(v=>v.id);for(const id of [pinned,manual,status])assert.ok(ids.includes(id));assert.ok(!ids.includes(last));
  repo.setVersionPinned(w.id,versions.find(v=>v.reason==='autosave'&&!v.pinned)!.id,true);
  const backup=repo.exportBackup();assert.equal(backup.schemaVersion,8);repo.restoreBackup(backup,()=>{});assert.equal(repo.listVersions(w.id).filter(v=>v.pinned).length,2);
  assert.throws(()=>repo.setVersionPinned(randomUUID(),pinned,false),/未找到/);
  assert.equal(repo.getWork(w.id)?.body,'原文');
 }finally{c.close();rmSync(dir,{recursive:true,force:true});}
});
