import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseConnection} from '../../electron/database/connection.ts';
import {WorkRepository} from '../../electron/database/repositories/WorkRepository.ts';
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'poetry-collections-'));const c=new DatabaseConnection(join(dir,'db.sqlite'),join(process.cwd(),'electron/database/migrations'));return{r:new WorkRepository(c.db),close(){c.close();rmSync(dir,{recursive:true,force:true})}}};
test('collections have unique trimmed names, one owner per work, and deletion preserves manuscripts and valid history',()=>{
 const f=fixture();try{const a=f.r.createCollection(' 山居集 '),b=f.r.createCollection('行旅');assert.equal(a.name,'山居集');assert.throws(()=>f.r.createCollection('山居集'));const w=f.r.createWork({genre:'wujue',title:'雨后',body:'  原文𠀀\n',notes:'旁记',collectionId:a.id});f.r.moveToCollection(w.id,b.id);assert.equal(f.r.libraryOverview().collections.find(c=>c.id===a.id)?.count,0);assert.equal(f.r.libraryOverview().collections.find(c=>c.id===b.id)?.count,1);f.r.renameCollection(b.id,'春日集');f.r.removeCollection(b.id);assert.equal(f.r.getWork(w.id)?.collectionId,null);assert.equal(f.r.getWork(w.id)?.body,'  原文𠀀\n');assert.equal(f.r.getWork(w.id)?.notes,'旁记');const backup=f.r.exportBackup();assert.equal(backup.formatVersion,5);f.r.restoreBackup(backup,()=>{});assert.equal(f.r.libraryOverview().uncollected,1);}finally{f.close()}
});
test('collection ordering paginates without omissions and survives backup',()=>{
 const f=fixture();try{const c=f.r.createCollection('集');const works=Array.from({length:9},(_,i)=>f.r.createWork({genre:'qijue',title:String(i),collectionId:c.id}));f.r.reorderCollectionWork(works[1].id,'up');let cursor:any,ids:string[]=[];do{const p=f.r.queryWorks({collectionId:c.id,limit:3,...(cursor?{cursor}:{})});ids.push(...p.items.map(w=>w.id));cursor=p.nextCursor;}while(cursor);assert.deepEqual(ids,[works[1].id,works[0].id,...works.slice(2).map(w=>w.id)]);const b=f.r.exportBackup();f.r.restoreBackup(b,()=>{});assert.deepEqual(f.r.queryWorks({collectionId:c.id}).items.map(w=>w.id),ids);assert.equal(f.r.queryWorks({collectionId:null}).total,0);}finally{f.close()}
});
test('archive reversal restores prior completion, and unified prose filter includes old fu',()=>{
 const f=fixture();try{const a=f.r.createWork({genre:'free',category:'fu'}),b=f.r.createWork({genre:'free',category:'prose'});f.r.updateWork(a.id,{status:'completed'});f.r.archiveWork(a.id);assert.equal(f.r.libraryOverview().archived,1);assert.equal(f.r.unarchiveWork(a.id).status,'completed');assert.equal(f.r.queryWorks({categoryGroup:'prose'}).total,2);assert.equal(f.r.queryWorks({categoryGroup:'regulated'}).total,0);}finally{f.close()}
});
