import assert from 'node:assert/strict';
import {test} from 'node:test';
import {freeColumns,updateFreeColumn} from '../../src/features/editor/freeColumns.ts';
import {workAssistanceStateSchema} from '../../src/shared/assistanceState.ts';
test('columns keep whitespace and supplementary characters across edits and reloads',()=>{
 const raw='  甲𠀀\n\n乙  \n';assert.deepEqual(freeColumns(raw),['  甲𠀀','乙  \n']);
 const updated=updateFreeColumn(raw,undefined,0,'  新\n\n左𠀀');assert.equal(updated.body,'  新\n\n左𠀀\n\n乙  \n');
 assert.deepEqual(freeColumns(updated.body,workAssistanceStateSchema.parse(updated.assistance)),['  新\n\n左𠀀','乙  \n']);
 const emptied=updateFreeColumn(updated.body,updated.assistance,0,'');assert.deepEqual(freeColumns(emptied.body,emptied.assistance),['','乙  \n']);
});
test('blank lines typed in the left column never jump automatically into the right',()=>{
 const updated=updateFreeColumn('',undefined,0,'甲\n\n乙');assert.equal(updated.body,'甲\n\n乙');assert.deepEqual(freeColumns(updated.body,updated.assistance),['甲\n\n乙','']);
 const right=updateFreeColumn(updated.body,updated.assistance,1,'丙\n');assert.deepEqual(freeColumns(right.body,right.assistance),['甲\n\n乙','丙\n']);
});

test('column split survives real save, history and complete backup restore',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {DatabaseConnection}=await import('../../electron/database/connection.ts'),{WorkRepository}=await import('../../electron/database/repositories/WorkRepository.ts');
 const dir=mkdtempSync(join(tmpdir(),'free-columns-')),db=new DatabaseConnection(join(dir,'work.sqlite'),join(process.cwd(),'electron/database/migrations')),repo=new WorkRepository(db.db);
 try{const work=repo.createWork({genre:'free',room:'song',category:'modern',notes:'旧附记'});let change=updateFreeColumn('',undefined,0,'左\n\n左二');change=updateFreeColumn(change.body,change.assistance,1,'右𠀀\n');const saved=repo.saveFreeWork({workId:work.id,title:'双栏',category:'modern',status:'draft',notes:'旧附记',...change});assert.deepEqual(freeColumns(saved.body,saved.assistance),['左\n\n左二','右𠀀\n']);repo.saveVersion(work.id,'manual_save');const backup=repo.exportBackup();repo.restoreBackup(backup,()=>{});const restored=repo.getWork(work.id)!;assert.deepEqual(freeColumns(restored.body,restored.assistance),['左\n\n左二','右𠀀\n']);assert.equal(restored.notes,'旧附记');assert.ok(repo.listVersions(work.id).some(v=>v.snapshot?.work.assistance?.freeColumns?.breakOffset===change.assistance.freeColumns?.breakOffset));}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
