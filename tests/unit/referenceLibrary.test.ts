import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { parseChapter, resolveInternal, safeArchivePath } from '../../electron/reference/epub.ts';
import { ReferenceLibrary, ReferenceCancelledError } from '../../electron/reference/library.ts';

// Deliberately tiny ZIP writer keeps security fixtures independent of the production parser.
function zip(entries:Record<string,string|Buffer>):Buffer {
  let offset=0; const pieces:Buffer[]=[]; const directory:Buffer[]=[];
  const crc=(data:Buffer)=>{let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
  for(const [path,value]of Object.entries(entries)){
    const name=Buffer.from(path), bytes=Buffer.isBuffer(value)?value:Buffer.from(value),compressed=deflateRawSync(bytes); const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc(bytes),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc(bytes),16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    pieces.push(local,name,compressed);directory.push(central,name);offset+=local.length+name.length+compressed.length;
  }
  const directoryBytes=Buffer.concat(directory), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(directoryBytes.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...pieces,directoryBytes,end]);
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1UAAAAASUVORK5CYII=','base64');
function fixture(body='<h1 id="author">李白</h1><p class="title-poem">静夜思</p><p id="poem">床前明月光，疑是地上霜。𠮷%_\\&quot; OR literal</p><p>举头望明月。<a href="#note">①</a><img src="image.png" alt="插图"/></p><p id="note">脚注明月<a href="#poem">返回</a></p><p class="title-poem">月下</p><p>另一首同文件的作品。</p>',extras:Record<string,string|Buffer>={}):Record<string,string|Buffer>{return {
  mimetype:'application/epub+zip',
  'META-INF/container.xml':'<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>',
  'OPS/content.opf':'<package><metadata><dc:title xmlns:dc="urn:dc">小诗集</dc:title><dc:creator xmlns:dc="urn:dc">编者</dc:creator></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="img" href="image.png" media-type="image/png"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
  'OPS/toc.ncx':'<ncx><navMap><navPoint id="same1"><navLabel><text>李白</text></navLabel><content src="a.xhtml#author"/><navPoint id="same2"><navLabel><text>静夜思</text></navLabel><content src="a.xhtml#poem"/></navPoint><navPoint id="same3"><navLabel><text>静夜思</text></navLabel><content src="b.xhtml#other"/></navPoint></navPoint></navMap></ncx>',
  'OPS/a.xhtml':`<!DOCTYPE html PUBLIC "x" "https://example.invalid/no-network"><html><head><title>李白</title></head><body>${body}</body></html>`,
  'OPS/b.xhtml':'<html><head><title>另一静夜思</title></head><body><p id="other">明月光与明月，各守原文字面。</p></body></html>',
  'OPS/image.png':png,...extras};}
async function setup(){const directory=await mkdtemp(join(tmpdir(),'shifang-reference-'));await mkdir(join(directory,'library'));const library=new ReferenceLibrary(join(directory,'library'));let serial=0;return{directory,library,async epub(entries:Record<string,string|Buffer>){const path=join(directory,`${++serial}.epub`);await writeFile(path,zip(entries));return path;},async cleanup(){if(library.db.open)library.close();await rm(directory,{recursive:true,force:true});}};}
const hooks={check:()=>{}};
test('EPUB preserves duplicate TOC, multi-title blocks, footnotes, images, hash deduplication and fingerprint-scoped positions',async()=>{
 const f=await setup();try{
  const path=await f.epub(fixture());const imported=await f.library.importFile(path,hooks);assert.equal(imported.book.chapterCount,2);assert.equal(imported.book.tocCount,3);assert.equal(imported.duplicate,false);
  const sourceId=imported.book.id, roots=f.library.getToc({sourceId,offset:0,limit:1});assert.equal(roots.nodes[0].hasChildren,true);const children=f.library.getToc({sourceId,parentId:roots.nodes[0].id,offset:0,limit:1});assert.equal(children.nextOffset,1);assert.equal(children.nodes[0].label,'静夜思');assert.equal(f.library.getToc({sourceId,parentId:roots.nodes[0].id,offset:1,limit:1}).nodes[0].label,'静夜思');
  const note=f.library.getChapter({sourceId,documentId:'OPS/a.xhtml',anchor:'note',offset:0,limit:2});assert.ok(note.targetBlockId);assert.ok(note.blocks.some(block=>block.id===note.targetBlockId));assert.ok(note.offset>0);
  const chapter=f.library.getChapter({sourceId,documentId:'OPS/a.xhtml',offset:0,limit:64});assert.equal(chapter.blocks.filter(block=>block.node.type==='h3').length,2);
  const serialized=JSON.stringify(chapter);assert.match(serialized,/"target":\{"documentId":"OPS\/a.xhtml","anchor":"note"\}/);const image=serialized.match(/"imageId":"([a-f\d]+)"/);assert.ok(image);assert.match((await f.library.getImage(sourceId,image[1])).dataUrl,/^data:image\/png;base64,/);
  await assert.rejects(f.library.getImage(sourceId,'../a.xhtml'),/不存在/);
  f.library.savePosition({sourceId,documentId:'OPS/a.xhtml',blockId:chapter.blocks[2].id,scrollTop:64});assert.equal(f.library.getPosition(sourceId)?.scrollTop,64);
  const duplicate=await f.library.importFile(path,hooks);assert.equal(duplicate.duplicate,true);assert.equal(f.library.listSources().length,1);assert.equal(f.library.getPosition(sourceId)?.scrollTop,64);
  assert.deepEqual(f.library.resolve({sourceId,internalPath:'a.xhtml#poem'}),{documentId:'OPS/a.xhtml',anchor:'poem'});
  f.library.close();const reopened=new ReferenceLibrary(join(f.directory,'library'));try{assert.equal(reopened.listSources()[0].hash,sourceId);assert.equal(reopened.getPosition(sourceId)?.scrollTop,64);assert.ok(reopened.getChapter({sourceId,documentId:'OPS/a.xhtml',offset:0,limit:4}).blocks.length);}finally{reopened.close();}
 }finally{await f.cleanup();}
});
test('short scan, trigram, punctuation and Unicode searches paginate literal original coordinates',async()=>{
 const f=await setup();try{const {book}=await f.library.importFile(await f.epub(fixture()),hooks);const sourceId=book.id;
  for(const query of ['明','明月','明月光','𠮷','%','_','\\','" OR']){
   const page=await f.library.search({requestId:query,sourceId,query,scope:'text',offset:0,limit:48},hooks);assert.ok(page.items.length,query);
   for(const hit of page.items){const chapter=f.library.getChapter({sourceId,documentId:hit.documentId,blockId:hit.blockId,offset:0,limit:4});const block=chapter.blocks.find(block=>block.id===hit.blockId)!;assert.equal(block.text.slice(hit.matchStart,hit.matchEnd),query);assert.equal(hit.preview.slice(hit.matchStart-hit.previewStart,hit.matchEnd-hit.previewStart),query);}
  }
  const first=await f.library.search({requestId:'page',sourceId,query:'明月',scope:'text',offset:0,limit:1},hooks);assert.equal(first.nextOffset,1);const second=await f.library.search({requestId:'page2',sourceId,query:'明月',scope:'text',offset:1,limit:1},hooks);assert.notEqual(first.items[0].id,second.items[0].id);
  assert.deepEqual((await f.library.search({requestId:'empty',sourceId,query:' ',scope:'all',offset:0,limit:24},hooks)).items,[]);
  assert.equal((await f.library.search({requestId:'missing',sourceId,query:'绝不会存在',scope:'all',offset:0,limit:24},hooks)).nextOffset,null);
  const all=await f.library.search({requestId:'dedup',sourceId,query:'李白',scope:'all',offset:0,limit:48},hooks);const keys=all.items.map(hit=>`${hit.sourceId}/${hit.documentId}/${hit.blockId}`);assert.equal(new Set(keys).size,keys.length);
  assert.equal((await f.library.search({requestId:'titles',sourceId,query:'静夜思',scope:'catalogue',offset:0,limit:24},hooks)).items.length,3);
 }finally{await f.cleanup();}
});
test('failed or cancelled import never replaces previous source; encrypted text, entities, paths, active content and zip bombs fail closed',async()=>{
 const f=await setup();try{await f.library.importFile(await f.epub(fixture()),hooks);const original=f.library.listSources()[0];
  const bad=[fixture('<script>alert(1)</script>'),fixture('<iframe src="https://example.com"/>'),fixture('<!ENTITY x SYSTEM "file:///etc/passwd"><p>&x;</p>'),fixture('<p><a href="../../../outside.xhtml">escape</a></p>'),fixture(undefined,{'../escape':'x'}),fixture(undefined,{'META-INF/encryption.xml':'<encryption><CipherReference URI="OPS/a.xhtml"/></encryption>'}),fixture(undefined,{'bomb.txt':Buffer.alloc(13*1024*1024)})];
  for(const entries of bad){await assert.rejects(f.library.importFile(await f.epub(entries),hooks));assert.deepEqual(f.library.listSources(),[original]);}
  const corruptPath=await f.epub(fixture());const corrupt=await readFile(corruptPath);const central=corrupt.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));corrupt.writeUInt32LE((corrupt.readUInt32LE(central+16)^1)>>>0,central+16);await writeFile(corruptPath,corrupt);await assert.rejects(f.library.importFile(corruptPath,hooks),/校验失败/);assert.deepEqual(f.library.listSources(),[original]);
  let cancelled=false;await assert.rejects(f.library.importFile(await f.epub(fixture('<p>新书</p>')),{check:()=>{if(cancelled)throw new ReferenceCancelledError();},progress:()=>{cancelled=true;}}),ReferenceCancelledError);assert.deepEqual(f.library.listSources(),[original]);
  assert.equal((await readdir(join(f.directory,'library'))).some(name=>name.startsWith('.import-')),false);
  const changed=fixture('<p>新版</p>');const updated=await f.library.importFile(await f.epub(changed),hooks);assert.notEqual(updated.book.hash,original.hash);assert.equal(f.library.getPosition(updated.book.id),null);
 }finally{await f.cleanup();}
});
test('external resources and event/style attributes cannot enter the safe React tree; local link resolution is bounded',()=>{
 const document=parseChapter('<html><head><title>Safe</title></head><body><p onclick="evil()" style="background:url(https://bad)">文字<a href="https://example.invalid">出处</a><img src="https://bad" alt="未载图"/></p></body></html>','OPS/a.xhtml',new Set(['OPS/a.xhtml']),new Map());const value=JSON.stringify(document);assert.doesNotMatch(value,/onclick|background|evil/);assert.match(value,/externalLabel/);assert.equal(resolveInternal('OPS/a.xhtml','#foot')?.documentId,'OPS/a.xhtml');assert.throws(()=>safeArchivePath('../escape'));assert.throws(()=>resolveInternal('OPS/a.xhtml','%2fetc/passwd'));assert.throws(()=>resolveInternal('OPS/a.xhtml','..%5cescape'));
});
test('worker service reserves progress before startup, cancels requests and closes without a startup worker',async()=>{
 const {ReferenceLibraryService}=await import('../../electron/reference/ReferenceLibraryService.ts');
 const f=await setup();const workerPath=join(process.cwd(),'electron/reference/libraryWorker.ts');
 const lazy=new ReferenceLibraryService(join(f.directory,'lazy'),'/unavailable-worker.js');await lazy.close();
 const service=new ReferenceLibraryService(join(f.directory,'worker'),workerPath);
 try{
  const input=await f.epub(fixture());const preStart=service.importFile(input,'cancel-before-start');service.cancel('cancel-before-start');await assert.rejects(preStart,ReferenceCancelledError);assert.equal(service.importProgress('cancel-before-start').status,'cancelled');assert.deepEqual(await service.listSources(),[]);
  const pending=service.importFile(input,'import-worker');assert.equal(service.importProgress('import-worker').status,'running');await assert.rejects(service.importFile(input,'second'),/正在接入/);
  const imported=await pending;assert.equal(service.importProgress('import-worker').status,'done');assert.equal((await service.listSources()).length,1);
  const query=service.search({requestId:'cancel-search',sourceId:imported.book.id,query:'𠮷',scope:'text',offset:0,limit:24});service.cancel('cancel-search');await assert.rejects(query,ReferenceCancelledError);
  assert.ok((await service.search({requestId:'new-search',sourceId:imported.book.id,query:'明月',scope:'text',offset:0,limit:24})).items.length);
 }finally{await service.close();await f.cleanup();}
});

test('reading index groups missing poems across files, targets exact blocks, preserves original nodes and rolls back cancellation or invalid evidence',async()=>{
 const f=await setup();try{
  const entries=fixture('<h1 id="author">李白</h1><p>【作者小传】</p><p>（701—762）作者介绍。</p><p class="title-poem-k-zhong">静夜思</p><p class="shuming">李白</p><p class="kai_long">床前明月光。</p><blockquote><p class="title-poem-k-zhong">鉴赏引用假诗题</p></blockquote><p class="title-poem-k-zhong">月下[1]</p><p class="shuming">李白</p><p class="kai_long">举杯邀明月。</p>');
  entries['OPS/content.opf']=String(entries['OPS/content.opf']).replace('小诗集','文学鉴赏辞典');
  entries['OPS/toc.ncx']='<ncx><navMap><navPoint><navLabel><text>唐诗鉴赏辞典</text></navLabel><content src="a.xhtml#author"/><navPoint><navLabel><text>李白</text></navLabel><content src="a.xhtml#author"/></navPoint><navPoint><navLabel><text>杜甫</text></navLabel><content src="b.xhtml#du"/></navPoint></navPoint></navMap></ncx>';
  entries['OPS/b.xhtml']='<html><body><p class="title-poem-k-zhong">静夜思</p><p class="shuming">李白</p><p class="kai_long">另一首的首句。</p><h1 id="du">杜甫</h1><p>【作者小传】</p><p>（712—770）作者介绍。</p><p class="title-poem-k-zhong">望岳</p><p class="shuming">杜甫</p><p class="kai_long">岱宗夫如何。</p></body></html>';
  const {book}=await f.library.importFile(await f.epub(entries),hooks),sourceId=book.id;
  const original=f.library.db.prepare('SELECT * FROM toc').all();const texts=f.library.db.prepare('SELECT id,text FROM blocks ORDER BY row_id').all();
  f.library.savePosition({sourceId,documentId:'OPS/a.xhtml',blockId:'OPS/a.xhtml:b4',scrollTop:37});
  await f.library.rebuildNavigation(sourceId,hooks);
  const root=f.library.getToc({sourceId,offset:0,limit:128}),author=f.library.getToc({sourceId,parentId:root.nodes[0].id,offset:0,limit:128}).nodes.find(node=>node.label==='李白')!;
  assert.ok(author);const works=f.library.getToc({sourceId,parentId:author.id,offset:0,limit:128}).nodes;
  assert.equal(works.filter(node=>node.kind==='work').length,3);assert.equal(works.filter(node=>node.kind==='intro').length,1);assert.ok(works.some(node=>node.label==='月下[1]'));
  const duplicates=works.filter(node=>node.originalLabel==='静夜思');assert.equal(duplicates.length,2);assert.equal(new Set(duplicates.map(node=>node.label)).size,2);
  const second=duplicates.find(node=>node.documentId==='OPS/b.xhtml')!;const chapter=f.library.getChapter({sourceId,documentId:second.documentId,blockId:second.blockId,offset:0,limit:1});assert.equal(chapter.targetBlockId,second.blockId);
  assert.equal(f.library.getTocPath({sourceId,documentId:second.documentId,blockId:second.blockId}).currentId,second.id);
  assert.ok(f.library.getTocSearch({sourceId,query:'李白',offset:0,limit:1}).nextOffset);
  assert.deepEqual(f.library.db.prepare('SELECT * FROM toc').all(),original);assert.deepEqual(f.library.db.prepare('SELECT id,text FROM blocks ORDER BY row_id').all(),texts);assert.equal(f.library.getPosition(sourceId)?.scrollTop,37);
  const previous=f.library.db.prepare('SELECT generation FROM navigation_versions').get() as any;
  f.library.db.prepare("UPDATE navigation_versions SET version='previous'").run();let stop=false;
  await assert.rejects(f.library.rebuildNavigation(sourceId,{check(){if(stop)throw new ReferenceCancelledError();},progress(){stop=true;}}),ReferenceCancelledError);
  assert.deepEqual(f.library.db.prepare('SELECT generation FROM navigation_versions').get(),previous);
  const stored=join(f.library.directory,'sources',sourceId,'original.epub');const bytes=await readFile(stored);entries['OPS/a.xhtml']=String(entries['OPS/a.xhtml']).replace('静夜思','被改动的诗题');await writeFile(stored,zip(entries));
  await assert.rejects(f.library.rebuildNavigation(sourceId,hooks),/不一致/);await writeFile(stored,bytes);
  assert.deepEqual(f.library.db.prepare('SELECT generation FROM navigation_versions').get(),previous);assert.deepEqual(f.library.db.prepare('SELECT id,text FROM blocks ORDER BY row_id').all(),texts);
 }finally{await f.cleanup();}
});

test('ordinary books retain chapter topology and current chapter after an in-place index upgrade',async()=>{
 const f=await setup();try{const entries=fixture();entries['OPS/b.xhtml']='<html><body></body></html>';const {book}=await f.library.importFile(await f.epub(entries),hooks);await f.library.rebuildNavigation(book.id,hooks);
  const original=f.library.getToc({sourceId:book.id,mode:'original',offset:0,limit:128}),reading=f.library.getToc({sourceId:book.id,mode:'reading',offset:0,limit:128});assert.deepEqual(reading.nodes.map(n=>n.id),original.nodes.map(n=>n.id));
  assert.equal(f.library.getTocSearch({sourceId:book.id,query:'静夜思',offset:0,limit:128}).nodes.length,2);
  assert.equal(f.library.db.prepare("SELECT count(*) AS count FROM navigation_nodes WHERE kind IN ('work','author')").get().count,0);
  const node=f.library.getToc({sourceId:book.id,parentId:original.nodes[0].id,mode:'reading',offset:0,limit:128}).nodes[0];
  assert.equal(f.library.getTocPath({sourceId:book.id,documentId:node.documentId,blockId:node.blockId}).currentId,node.id);
 }finally{await f.cleanup();}
});

test('paper reader preserves exact piece boundaries, semantic roles and links across pagination',async()=>{
 const {ReadingPieces,readingIndex}=await import('../../electron/reference/reading.ts');
 const {readingPieceRequest,readingIndexRequest}=await import('../../src/shared/reading.ts');
 const f=await setup();try{
  const body='<h1 id="author">李白</h1><p>【作者小传】</p><p>（701—762）作者介绍。</p><p class="title-poem">静夜思</p><p class="shuming">李白</p><p class="kai">床前明月光[1]，疑是地上霜。</p><p class="kai">举头望明月，低头思故乡。</p><p>〔注〕[1]明月：月亮。</p><p>鉴赏<a href="#note">原注</a></p><p id="note">完整末段。</p><p class="title-poem">月下</p><p class="shuming">李白</p><p class="kai">下一首不要混入。</p>';
  const entries=fixture(body);entries['OPS/content.opf']=String(entries['OPS/content.opf']).replace('小诗集','文学鉴赏辞典');entries['OPS/toc.ncx']='<ncx><navMap><navPoint><navLabel><text>唐诗鉴赏辞典</text></navLabel><content src="a.xhtml#author"/><navPoint><navLabel><text>李白</text></navLabel><content src="a.xhtml#author"/></navPoint></navPoint></navMap></ncx>';const {book}=await f.library.importFile(await f.epub(entries),hooks);await f.library.rebuildNavigation(book.id,hooks);const authors=readingIndex(f.library.db,readingIndexRequest.parse({sourceId:book.id}));assert.ok(authors.nodes.length);
  const index=readingIndex(f.library.db,readingIndexRequest.parse({sourceId:book.id,authorId:authors.nodes[0].id}));const work=index.nodes.find(n=>n.label==='静夜思')!;assert.ok(work);
  const pieces=new ReadingPieces(f.library.db,join(f.directory,'library'));const request={sourceId:book.id,nodeId:work.id};const whole=await pieces.get(readingPieceRequest.parse(request));assert.equal(whole.blocks.filter(b=>b.section==='poem').length,2);assert.equal(whole.blocks.filter(b=>b.section==='notes').length,1);assert.ok(!whole.blocks.some(b=>b.text.includes('下一首')));assert.match(JSON.stringify(whole),/"target"/);
  const small=await pieces.get(readingPieceRequest.parse({...request,limit:3})),rest=await pieces.get(readingPieceRequest.parse({...request,offset:3}));assert.deepEqual([...small.blocks,...rest.blocks],whole.blocks);
  await assert.rejects(pieces.get(readingPieceRequest.parse({...request,rootId:'missing'})),/未找到/);
 }finally{await f.cleanup();}
});
