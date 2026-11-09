import assert from 'node:assert/strict';import {test} from 'node:test';import Database from 'better-sqlite3';
import {homePoems,HOME_POEM_SOURCE} from '../../src/shared/homePoems.ts';import {ReadingPieces} from '../../electron/reference/reading.ts';import {readingPieceRequest} from '../../src/shared/reading.ts';import {workDisplayTitle} from '../../src/features/works/workDisplayTitle.ts';
test('home excerpts are contiguous original passages and full reading works before importing books',async()=>{const db=new Database(':memory:');try{const reader=new ReadingPieces(db,'/unused');for(const poem of homePoems){if(poem.excerpt)assert.ok(poem.lines.join('').includes(poem.excerpt.join('')));const piece=await reader.get(readingPieceRequest.parse({sourceId:HOME_POEM_SOURCE,nodeId:poem.id}));assert.equal(piece.author,poem.author);assert.deepEqual(piece.blocks.filter(b=>b.section==='poem').map(b=>b.text),poem.lines);assert.equal(piece.nextId,null);const first=await reader.get(readingPieceRequest.parse({sourceId:HOME_POEM_SOURCE,nodeId:poem.id,limit:2}));assert.equal(first.blocks.length,2);}await assert.rejects(reader.get(readingPieceRequest.parse({sourceId:HOME_POEM_SOURCE,nodeId:'missing'})),/未找到/);}finally{db.close()}});
test('untitled work fallback is display-only and retains its identity',()=>{const work={id:'a',title:'',preview:'一径穿林暮\n后句',genre:'wujue',room:'poetry',category:'unclassified'} as any;assert.equal(workDisplayTitle(work),'一径穿林暮');assert.equal(work.title,'');assert.equal(work.id,'a');assert.equal(workDisplayTitle({...work,preview:''}),'未题 · 五绝');assert.equal(workDisplayTitle({...work,title:'山中小住'}),'山中小住')});

test('all 100 recommendations have distinct identities and full texts',()=>{
 assert.equal(homePoems.length,100);
 assert.equal(new Set(homePoems.map(p=>p.id)).size,100);
 assert.equal(new Set(homePoems.map(p=>p.lines.join(''))).size,100);
});
