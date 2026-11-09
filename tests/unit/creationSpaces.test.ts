import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DatabaseConnection } from '../../electron/database/connection.ts';
import { WorkRepository } from '../../electron/database/repositories/WorkRepository.ts';
import { formatMarkdown, formatPlainText } from '../../src/features/export/exportFormat.ts';
import { RuleService } from '../../electron/services/RuleService.ts';
import { AnalysisService } from '../../electron/services/AnalysisService.ts';
import { bodyToLines } from '../../src/features/editor/editorModel.ts';
const migrations=join(process.cwd(),'electron/database/migrations');

test('creation spaces migration backs up and preserves legacy body, notes, tags, versions and valid reading anchors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'poetry-migration-'));const old=join(dir,'old');mkdirSync(old);cpSync(join(migrations,'001_initial.sql'),join(old,'001_initial.sql'));
 const path=join(dir,'works.sqlite');const c=new DatabaseConnection(path,old);
 const id='123e4567-e89b-12d3-a456-426614174088';
 const body='  行风入夜深\n\n灯下读书长  \n';
 const override={lineIndex:0,characterIndex:0,character:'行',candidateId:'行:ping-08geng',sourceText:'  行风入夜深',sourceOffset:2};
 c.db.prepare("INSERT INTO works(id,title,body,genre,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id,'旧稿',body,'wulv','保留附记','old','old');
 c.db.prepare('INSERT INTO work_tags VALUES (?,?)').run(id,'旧标签');
 c.db.prepare('INSERT INTO work_analysis_state VALUES (?,?,?,?,?,?)').run(id,'wulv','zeqi-first-unrhymed',JSON.stringify([override]),'{}','old');
 c.db.prepare("INSERT INTO work_versions(id,work_id,title,body,genre,status,location,notes,reason,created_at) VALUES ('v',?,?,?,'wulv','draft','','保留附记','manual_save','old')").run(id,'旧稿',body);
 c.close();
 const upgraded=new DatabaseConnection(path,migrations);const repo=new WorkRepository(upgraded.db);
 assert.ok(upgraded.backupPath);assert.equal(repo.getWork(id)!.body,body);assert.equal(repo.getWork(id)!.room,'poetry');assert.equal(repo.getWork(id)!.notes,'保留附记');assert.deepEqual(repo.getWork(id)!.tags,['旧标签']);assert.deepEqual(repo.getAnalysisState(id)!.readingOverrides,[override]);assert.equal(upgraded.db.pragma('foreign_key_check').length,0);
 assert.equal((upgraded.db.prepare('SELECT body FROM work_versions WHERE work_id=?').get(id) as any).body,body);
 const restoredPath=join(dir,'restored.sqlite');cpSync(upgraded.backupPath!,restoredPath);const restored=new DatabaseConnection(restoredPath,old);assert.equal((restored.db.prepare('SELECT body FROM works WHERE id=?').get(id) as any).body,body);restored.close();
 const analyzed=new AnalysisService(new RuleService(join(process.cwd(),'src/rules'))).analyze({requestId:'restored-reading',text:body,editorLines:bodyToLines(body,8),templateId:'wulv',variantId:'zeqi-first-unrhymed',overrides:[override]});assert.equal(analyzed.ignoredOverrideCount,0);assert.equal(analyzed.lines[0].characters[0].reading.source,'user-override');
 const backup=new Database(upgraded.backupPath!,{readonly:true});assert.equal((backup.prepare('SELECT max(version) v FROM schema_migrations').get() as any).v,1);assert.equal((backup.prepare('SELECT body FROM works WHERE id=?').get(id) as any).body,body);backup.close();upgraded.close();
 const reopened=new DatabaseConnection(path,migrations);assert.equal(reopened.backupPath,null);reopened.close();rmSync(dir,{recursive:true,force:true});
});

test('failed upgrade rolls back schema and data, keeps a readable backup and can retry successfully',()=>{
 const dir=mkdtempSync(join(tmpdir(),'poetry-migration-fail-'));const old=join(dir,'old'),bad=join(dir,'bad');mkdirSync(old);mkdirSync(bad);
 cpSync(join(migrations,'001_initial.sql'),join(old,'001_initial.sql'));cpSync(migrations,bad,{recursive:true});writeFileSync(join(bad,'003_fail.sql'),'DELETE FROM works; SELECT * FROM definitely_missing_table;');
 const path=join(dir,'works.sqlite');const first=new DatabaseConnection(path,old);first.db.prepare("INSERT INTO works(id,title,body,genre,created_at,updated_at) VALUES ('old','题','原文','wujue','t','t')").run();first.close();
 assert.throws(()=>new DatabaseConnection(path,bad),/已回滚.*备份/);
 const raw=new Database(path);assert.equal((raw.prepare('SELECT max(version) v FROM schema_migrations').get() as any).v,1);assert.equal((raw.prepare('SELECT body FROM works').get() as any).body,'原文');assert.equal(raw.pragma('table_info(works)').some((x:any)=>x.name==='room'),false);raw.close();
 assert.ok(readdirSync(dir).some(f=>f.includes('.backup-v1-')));
 const retry=new DatabaseConnection(path,migrations);assert.equal((retry.db.prepare('SELECT body FROM works').get() as any).body,'原文');retry.close();rmSync(dir,{recursive:true,force:true});
});

test('one library stores free classifications and notes without metre state or cross-mode conversion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'poetry-free-'));const c=new DatabaseConnection(join(dir,'works.sqlite'),migrations);const repo=new WorkRepository(c.db);
 const body='  第一节\n\n    第二节\n末行  \n';
 const poetry=repo.createWork({genre:'free',room:'poetry',body});const song=repo.createWork({genre:'free',room:'song',category:'modern',body});
 repo.saveFreeWork({workId:poetry.id,title:'自由稿',body,notes:'创作记不导出',category:'prose',status:'completed'});
 const saved=repo.getWork(poetry.id)!;assert.equal(saved.body,body);assert.equal(saved.notes,'创作记不导出');assert.equal(saved.category,'prose');assert.equal(repo.getAnalysisState(poetry.id),null);
 assert.throws(()=>repo.updateWork(poetry.id,{genre:'wujue'}),/不相符|不支持/);assert.throws(()=>repo.updateWork(song.id,{room:'poetry'}),/不相符|不支持/);assert.throws(()=>repo.updateWork(song.id,{category:'fu'}),/不相符/);
 for(const output of [formatPlainText(saved),formatMarkdown(saved)]){assert.ok(output.endsWith(body));assert.equal(output.includes(saved.notes),false);}
 c.close();rmSync(dir,{recursive:true,force:true});
});
