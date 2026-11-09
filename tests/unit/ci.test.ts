import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ciForms} from '../../src/ci/catalogue.ts';
import {analyzeCi,candidates,rhymeVersion} from '../../src/ci/analyze.ts';
import {DatabaseConnection} from '../../electron/database/connection.ts';
import {WorkRepository} from '../../electron/database/repositories/WorkRepository.ts';
import {mkdtempSync,mkdirSync,cpSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {formatMarkdown,formatPlainText} from '../../src/features/export/exportFormat.ts';
// Independently transcribed book examples and structures (Daizhige Qinding transcription).
// Original fixtures are independent; four expansion fixtures freeze the pinned book examples.
const oracle:[string,number[],string][]=[
 ['如梦令',[6,6,5,6,2,2,6],'曾宴桃源深洞/一曲舞鸾歌凤/长记别伊时/和泪出门相送/如梦/如梦/残月落花烟重'],
 ['浣溪沙',[7,7,7,7,7,7],'宿醉离愁慢髻鬟/六铢衣薄惹轻寒/慵红闷翠掩青鸾/罗袜况兼金菡萏/雪肌仍是玉琅玕/骨香腰细更沈檀'],
 ['卜算子',[5,5,7,5,5,5,7,5],'缺月挂疏桐/漏断人初静/时见幽人独往来/缥缈孤鸿影/惊起却回头/有恨无人省/拣尽寒枝不肯栖/寂寞沙洲冷'],
 ['菩萨蛮',[7,7,5,5,5,5,5,5],'平林漠漠烟如织/寒山一带伤心碧/暝色入高楼/有人楼上愁/玉阶空伫立/宿鸟归飞急/何处是归程/长亭更短亭'],
 ['水调歌头',[5,5,4,7,6,6,5,5,5,3,3,3,4,7,6,6,5,5,5],'九金增宋重/八玉变秦余/千年清浸/先净河洛出图书/一段升平光景/不但五星循轨/万点共连珠/垂衣本神圣/补衮妙工夫/朝元去/锵环佩/冷云衢/芝房雅奏/仪凤矫首听笙竽/天近黄麾仗晓/春早红鸾扇暖/迟日上金铺/万岁南山色/不老对唐虞'],
 ['念奴娇',[4,5,4,7,6,4,4,5,4,6,6,4,5,7,6,4,4,5,4,6],'凭空眺远/见长空万里/云无留迹/桂魄飞来光射处/冷浸一天秋碧/玉宇琼楼/乘鸾来去/人在清凉国/江山如画/望中烟树历历/我醉拍手狂歌/举杯邀月/对影成三客/起舞徘徊风露下/今夕不知何夕/便欲乘风/翻然归去/何用骑鹏翼/水晶宫里/一声吹断横笛'],
 ["忆江南", [3, 5, 7, 7, 5], "江南好/风景旧曾谙/日出江花红胜火/春来江水绿如蓝/能不忆江南"],
];
const state=(f:typeof ciForms[number])=>({formId:f.id,version:f.version,rhymeVersion,choices:[]});
for(const [name,lengths,poem] of oracle)test(`${name}: independent source structure, example, wrong length/tone/rhyme and unknown scope`,()=>{
 const f=ciForms.find(f=>f.name===name)!;assert.ok(f.source.includes('id='));assert.deepEqual(f.lines.map(l=>l.pattern.length),lengths);assert.equal(f.total,lengths.reduce((a,b)=>a+b));
 const body=poem.replaceAll('/','\n'),check=(s:string)=>analyzeCi(s,f,state(f));assert.deepEqual(check(body).issues.filter(i=>i.kind==='conflict'),[],name);
 const rows=body.split('\n');rows[0]=rows[0].slice(1);assert.ok(check(rows.join('\n')).issues.some(i=>i.kind==='incomplete'&&i.line===0));rows[0]+='山山';assert.ok(check(rows.join('\n')).issues.some(i=>i.kind==='conflict'&&i.line===0));
 const strict=f.lines.findIndex(l=>/[PZ]/.test(l.pattern)),index=f.lines[strict].pattern.search(/[PZ]/);const altered=body.split('\n');altered[strict]=altered[strict].slice(0,index)+(f.lines[strict].pattern[index]==='P'?'雪':'东')+altered[strict].slice(index+1);assert.ok(check(altered.join('\n')).issues.some(i=>i.kind==='conflict'&&i.offset===index));
 const rhymed=f.lines.map((l,i)=>({l,i})).filter(x=>x.l.rhyme==='a');const wrong=body.split('\n');for(const [n,x]of rhymed.slice(0,2).entries())wrong[x.i]=wrong[x.i].slice(0,-1)+(x.l.rhymeTone==='P'?(n?'寒':'东'):(n?'旱':'送'));assert.ok(check(wrong.join('\n')).issues.some(i=>i.kind==='conflict'&&i.message.includes('同部')));
 assert.ok(check(body+'\n  x').issues.some(i=>i.kind==='uncovered'));assert.equal(check('').issues.some(i=>i.kind==='conflict'),false);
});
test('Cilin is independent: split 灰/元 groups, entering tone, true ambiguity and source-bound choices',()=>{
 assert.ok(candidates('白').some(r=>r.tone==='R'));assert.ok(candidates('行').length>1);assert.ok(candidates('灰').some(r=>r.group===3));assert.ok(candidates('来').some(r=>r.group===5));assert.ok(candidates('元').some(r=>r.group===7));assert.ok(candidates('魂').some(r=>r.group===6));
 const f=ciForms[0],s=state(f),choice={line:0,offset:0,character:'行',source:'行',candidate:candidates('行')[0].id};const a=analyzeCi('行',f,{...s,choices:[choice]});assert.equal(a.readings[0].selected?.id,choice.candidate);assert.ok(analyzeCi('山行',f,{...s,choices:[choice]}).issues.some(i=>i.message.includes('旧读音')));
});
test('repeat and rhyme change enforce the selected variant, not just total characters',()=>{
 const f=ciForms[0];const rows=f.lines.map(l=>l.example);rows[5]='相送';assert.ok(analyzeCi(rows.join('\n'),f,state(f)).issues.some(i=>i.message.includes('须叠')));
 const p=ciForms.find(f=>f.name==='菩萨蛮')!;const r=p.lines.map(l=>l.example);for(const i of [0,1,4,5])r[i]=r[i].slice(0,-1)+'雪';assert.ok(analyzeCi(r.join('\n'),p,state(p)).issues.some(i=>i.message.includes('须换韵')));
});
test('v2 upgrade backs up old free and regulated work, ci roundtrips all forms and failed upgrade rolls back',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ci-migration-')),old=join(dir,'v2');mkdirSync(old);for(const name of ['001_initial.sql','002_creation_spaces.sql'])cpSync(join('electron/database/migrations',name),join(old,name));const path=join(dir,'works.sqlite');let c=new DatabaseConnection(path,old);let repo=new WorkRepository(c.db);c.db.prepare("INSERT INTO works(id,title,body,genre,room,category,notes,created_at,updated_at) VALUES ('old','旧题',?,'free','song','modern','旁记','t','t')").run('  旧稿\n\n末行  ');const oldWork=c.db.prepare("SELECT id,title,body,notes FROM works WHERE id='old'").get() as {id:string;title:string;body:string;notes:string};c.close();
 c=new DatabaseConnection(path,'electron/database/migrations');repo=new WorkRepository(c.db);assert.ok(c.backupPath);const migrated=repo.getWork(oldWork.id)!;for(const key of ["id","title","body","notes"] as const)assert.equal(migrated[key],oldWork[key]);
 for(const f of ciForms){const w=repo.createWork({genre:'ci',room:'ci',ci:state(f)});assert.equal(w.body,'');const body='  '+f.lines.map(l=>l.example).join('\n')+'  \n';repo.saveCiWork({workId:w.id,title:'题名独立',body,notes:'不导出旁记',status:'draft',ci:state(f)});repo.saveVersion(w.id,'manual_save');const saved=repo.getWork(w.id)!;assert.equal(saved.body,body);assert.equal(saved.ci?.formId,f.id);assert.ok(formatMarkdown(saved).includes(f.name));assert.ok(formatPlainText(saved).endsWith(body));assert.ok(!formatMarkdown(saved).includes('不导出旁记'));assert.throws(()=>repo.updateWork(w.id,{ci:state(ciForms.find(x=>x.id!==f.id)!)}),/更换谱式/);}
 c.close();const reopen=new DatabaseConnection(path,'electron/database/migrations');assert.equal(new WorkRepository(reopen.db).listWorks().length,ciForms.length+1);reopen.close();
 const bad=join(dir,'bad');cpSync('electron/database/migrations',bad,{recursive:true});writeFileSync(join(bad,'004_failure.sql'),'DELETE FROM works; SELECT * FROM missing_ci_table;');const restored=join(dir,'v2.sqlite');const backup=new Database(path);backup.close(); // isolate a v2 fixture
 const v2=new DatabaseConnection(restored,old);v2.db.exec("INSERT INTO works(id,body,genre,created_at,updated_at) VALUES ('old','原文','wujue','t','t')");v2.close();assert.throws(()=>new DatabaseConnection(restored,bad),/回滚/);const raw=new Database(restored);assert.equal((raw.prepare('SELECT max(version) v FROM schema_migrations').get() as any).v,2);assert.equal((raw.prepare('SELECT body FROM works').get() as any).body,'原文');raw.close();
});

test('Qinding commentary: explicit entering-for-level exceptions do not permit arbitrary shang/qu',()=>{
 for(const [name,line,offset]of [['如梦令',2,3],['念奴娇',4,4],['念奴娇',9,4]] as const){const f=ciForms.find(f=>f.name===name)!;assert.equal(f.lines[line].pattern[offset],'I');const rows=f.lines.map(l=>l.example);rows[line]=rows[line].slice(0,offset)+'雪'+rows[line].slice(offset+1);assert.equal(analyzeCi(rows.join('\n'),f,state(f)).issues.some(i=>i.kind==='conflict'&&i.line===line&&i.offset===offset),false);rows[line]=rows[line].slice(0,offset)+'旱'+rows[line].slice(offset+1);assert.ok(analyzeCi(rows.join('\n'),f,state(f)).issues.some(i=>i.kind==='conflict'&&i.line===line&&i.offset===offset));}
});

test('unavailable ci form saves and reopens its original identity and choices without allowing replacement',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ci-unavailable-')),path=join(dir,'works.sqlite');
 let connection=new DatabaseConnection(path,'electron/database/migrations'),repo=new WorkRepository(connection.db);
 const work=repo.createWork({genre:'ci',room:'ci',ci:state(ciForms[0])});
 const original={formId:'removed-form',version:'old-version',rhymeVersion:'old-rhyme',choices:[{line:0,offset:2,source:'  行',character:'行',candidate:'7-P'}]};
 connection.db.prepare('UPDATE works SET ci_json=? WHERE id=?').run(JSON.stringify(original),work.id);
 const body='  𠀀行\n\n末行  \n',notes='  原始创作记\n';
 repo.saveCiWork({workId:work.id,title:'仍是词稿',body,notes,status:'draft',ci:original});
 assert.throws(()=>repo.updateWork(work.id,{ci:{...original,formId:'another-removed-form'}}),/更换谱式/);
 assert.throws(()=>repo.updateWork(work.id,{ci:state(ciForms[0])}),/更换谱式/);
 const free=repo.createWork({genre:'free'});assert.throws(()=>repo.updateWork(free.id,{ci:original}),/更换谱式/);
 connection.close();connection=new DatabaseConnection(path,'electron/database/migrations');repo=new WorkRepository(connection.db);
 const saved=repo.getWork(work.id)!;assert.equal(saved.genre,'ci');assert.equal(saved.room,'ci');assert.equal(saved.body,body);assert.equal(saved.notes,notes);assert.deepEqual(saved.ci,original);
 assert.equal(formatPlainText(saved),'仍是词稿\n\n'+body);assert.ok(formatMarkdown(saved).includes('removed-form'));assert.ok(!formatMarkdown(saved).includes(notes));connection.close();
});


test('empty ci form changes preserve notes/history and reject any written source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ci-form-change-')),c=new DatabaseConnection(join(dir,'works.sqlite'),'electron/database/migrations'),repo=new WorkRepository(c.db);
 try{const before=ciForms.find(f=>f.name==='水调歌头')!,after=ciForms.find(f=>f.name==='卜算子')!,body='  \n\n  ',notes='  笔记  ',work=repo.createWork({genre:'ci',room:'ci',body,notes,ci:state(before)});
 const saved=repo.saveCiWork({workId:work.id,title:'保留题名',body,notes,status:'draft',ci:state(after)});assert.equal(saved.body,body);assert.equal(saved.notes,notes);assert.equal(saved.ci?.formId,after.id);
 const snapshots=c.db.prepare('SELECT snapshot_json FROM work_versions WHERE work_id=?').all(work.id) as any[];assert.ok(snapshots.some(r=>r.snapshot_json.includes(before.id)));assert.ok(snapshots.some(r=>r.snapshot_json.includes(after.id)));
 assert.throws(()=>repo.saveCiWork({workId:work.id,title:'不应保存',body,notes:'',status:'draft',ci:{...state(before),version:'invalid'}}),/可用词谱/);assert.equal(repo.getWork(work.id)!.body,body);
 assert.throws(()=>repo.saveCiWork({workId:work.id,title:'写作',body:'新字',notes,status:'draft',ci:state(before)}),/已有正文/);
 repo.saveCiWork({workId:work.id,title:'写作',body:'原文',notes,status:'draft',ci:state(after)});
 assert.throws(()=>repo.saveCiWork({workId:work.id,title:'绕过',body:'',notes,status:'draft',ci:state(before)}),/已有正文/);
 assert.equal(repo.getWork(work.id)!.body,'原文');assert.equal(repo.getWork(work.id)!.ci?.formId,after.id);
 }finally{c.close()}
});


test('eight added forms accept their cited examples and preserve changing rhyme groups',()=>{
 const names=['虞美人','定风波','江城子','声声慢','雨霖铃','青玉案','永遇乐','醉花阴'];
 for(const name of names){
  const f=ciForms.find(f=>f.name===name)!;
  const result=analyzeCi(f.lines.map(line=>line.example).join('\n'),f,state(f));
  assert.deepEqual(result.issues.filter(i=>i.kind==='conflict'||i.kind==='uncovered'),[],name);
 }
 assert.equal(ciForms.find(f=>f.name==='定风波')!.lines.map(l=>l.rhyme).join(''),'aabbaccadda');
 assert.equal(ciForms.find(f=>f.name==='虞美人')!.lines.map(l=>l.rhyme).join(''),'aabbccdd');
});
