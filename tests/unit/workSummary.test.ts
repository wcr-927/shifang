import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseConnection } from "../../electron/database/connection.ts";
import { WorkRepository } from "../../electron/database/repositories/WorkRepository.ts";
import { queryWorksRequestSchema, queryWorksResponseSchema } from "../../src/shared/workSummary.ts";
import { ciForms } from "../../src/ci/catalogue.ts";
import { rhymeVersion } from "../../src/ci/analyze.ts";

function fixture(run: (repository:WorkRepository, connection:DatabaseConnection)=>void) {
  const directory=mkdtempSync(join(tmpdir(),"shifang-summary-"));
  const connection=new DatabaseConnection(join(directory,"summary.sqlite"),`${process.cwd()}/electron/database/migrations`);
  try {run(new WorkRepository(connection.db),connection);} finally {connection.close();rmSync(directory,{recursive:true,force:true});}
}
test("summary boundary contains bounded preview and only list fields, while full reads retain every field",()=>fixture(repository=>{
  const work=repository.createWork({genre:"ci",room:"ci",ci:{formId:ciForms[0].id,version:ciForms[0].version,rhymeVersion,choices:[]},title:"大词稿",body:"𠀀".repeat(10000)+"\n末句",notes:"私密创作记",tags:["标签"]});
  const result=repository.queryWorks({limit:6});queryWorksResponseSchema.parse(result);
  assert.deepEqual(Object.keys(result.items[0]).sort(),["id","title","preview","genre","room","category","status","tags","createdAt","updatedAt","collectionId","collectionPosition"].sort());
  assert.ok(result.items[0].preview.length<=320);assert.equal(Array.from(result.items[0].preview).length,160);
  assert.equal(JSON.stringify(result).includes("私密创作记"),false);assert.equal("ci" in result.items[0],false);
  assert.equal(repository.getWork(work.id)?.body,work.body);assert.equal(repository.listWorks()[0].notes,work.notes);
}));
test("bounded summaries skip all leading trim whitespace before truncation without changing stored body",()=>fixture((repository,connection)=>{
  const prefixes=[" ".repeat(200),"\r\n\n".repeat(100),"\t".repeat(200),"\u3000".repeat(200),
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff".repeat(10)];
  for(const [index,prefix] of prefixes.entries()) {
    const body=prefix+"实际正文𠀀\n后续文字",work=repository.createWork({genre:"free",title:`前导空白${index}`,body});
    const summary=repository.queryWorks({query:work.title}).items[0];
    assert.equal(summary.preview,body.trim().split(/\r?\n/u)[0]);
    assert.equal(summary.preview,"实际正文𠀀");assert.equal("body" in summary,false);
    assert.equal((connection.db.prepare("SELECT body FROM works WHERE id=?").get(work.id) as {body:string}).body,body);
  }
  const body=" ".repeat(300)+"\u200b实际正文",work=repository.createWork({genre:"free",title:"非空白边界",body});
  assert.equal(repository.queryWorks({query:work.title}).items[0].preview,"\u200b实际正文");
  assert.equal(repository.getWork(work.id)?.body,body);
  const blank=repository.createWork({genre:"free",title:"只有空白",body:prefixes.join("")});
  assert.equal(repository.queryWorks({query:blank.title}).items[0].preview,"");
  assert.equal(repository.getWork(blank.id)?.body,blank.body);
}));
test("cursor traverses equal timestamps without duplicates, missing rows or unstable ordering",()=>fixture((repository,connection)=>{
  const works=Array.from({length:59},(_,index)=>repository.createWork({genre:"wujue",title:`作品${index}`}));
  connection.db.prepare("UPDATE works SET updated_at=?").run("2026-10-04T00:00:00.000Z");
  const ids:string[]=[];let cursor;
  do {const page=repository.queryWorks({limit:7,...(cursor?{cursor}:{})});assert.equal(page.total,59);ids.push(...page.items.map(work=>work.id));cursor=page.nextCursor;}while(cursor);
  assert.deepEqual(ids,works.map(work=>work.id).sort().reverse());assert.equal(new Set(ids).size,59);
}));
test("literal title search preserves percent underscore backslash quotes supplementary Han and whitespace semantics",()=>fixture(repository=>{
  const titles=["百分%记","下划_句","路径\\题","作者'句","补充𠀀句","春风句","全空白   "];
  for(const title of titles)repository.createWork({genre:"wujue",title,body:"正文独有词"});
  for(const token of ["%","_","\\","'","𠀀"])assert.equal(repository.queryWorks({query:token}).total,1);
  assert.equal(repository.queryWorks({query:"  春风  "}).items[0].title,"春风句");
  assert.equal(repository.queryWorks({query:"正文独有词"}).total,0);
  assert.equal(repository.queryWorks({query:"  \t\n"}).total,titles.length);
  assert.equal(repository.queryWorks({query:"' OR 1=1 --"}).total,0);
}));
test("room status genre category tag conjunction and archive visibility agree with the existing library",()=>fixture(repository=>{
  const poetry=repository.createWork({genre:"free",room:"poetry",category:"prose",tags:["春","共享"]});
  repository.createWork({genre:"free",room:"song",category:"modern",tags:["歌"]});
  repository.createWork({genre:"wujue",tags:["共享"]});
  repository.archiveWork(poetry.id);
  assert.equal(repository.queryWorks().total,2);
  assert.equal(repository.queryWorks({includeArchived:true}).total,3);
  assert.equal(repository.queryWorks({includeArchived:true,room:"poetry",genre:"free",category:"prose",status:"archived",tag:"春"}).items[0].id,poetry.id);
  assert.equal(repository.queryWorks({status:"archived"}).total,0);
  assert.equal(repository.queryWorks({room:"song",category:"prose"}).total,0);
  assert.ok(!repository.queryWorks({includeTagOptions:true}).tags.includes("春"));assert.ok(repository.queryWorks({includeArchived:true,includeTagOptions:true}).tags.includes("春"));
}));
test("summary reads refresh title ordering labels and cursors after save archive and complete backup restoration",()=>fixture(repository=>{
  const first=repository.createWork({genre:"wujue",title:"首稿",tags:["原标签"]});
  const backup=repository.exportBackup();
  repository.updateWork(first.id,{title:"新题",body:"新首句",tags:["新标签"]});repository.archiveWork(first.id);
  assert.equal(repository.queryWorks().total,0);assert.equal(repository.queryWorks({includeArchived:true,query:"新题"}).items[0].preview,"新首句");
  repository.restoreBackup(backup,()=>{});
  assert.equal(repository.queryWorks().items[0].title,"首稿");assert.deepEqual(repository.queryWorks({includeTagOptions:true}).tags,["原标签"]);
}));
test("query schema rejects invalid bounds unknown filters malformed cursors and unexpected fields",()=>{
  for(const request of [{limit:0},{limit:101},{limit:1.5},{room:"unknown"},{status:"missing"},{genre:"all"},{category:"bad"},{query:"x".repeat(201)},{tag:"x".repeat(81)},{cursor:{id:"not-id",updatedAt:"now"}},{cursor:{id:"123e4567-e89b-12d3-a456-426614174000",updatedAt:""}},{body:"leak"}])assert.equal(queryWorksRequestSchema.safeParse(request).success,false);
  assert.deepEqual(queryWorksRequestSchema.parse({query:"  "}),{includeArchived:false,includeTagOptions:false,query:"",limit:24});
});
test("generated CI metadata matches source hashes and original versions without importing the large dictionary for display",async()=>{
  const {createHash}=await import("node:crypto");const metadata=JSON.parse(readFileSync("src/ci/metadata.json","utf8"));
  for(const [file,key]of [["forms","formsSha256"],["cilin","dictionarySha256"]])assert.equal(metadata[key],createHash("sha256").update(readFileSync(`src/ci/${file}.json`)).digest("hex"));
  assert.deepEqual(metadata.forms,ciForms.map(({id,name,author,version})=>({id,name,author,version})));assert.equal(metadata.rhymeVersion,rhymeVersion);
});
