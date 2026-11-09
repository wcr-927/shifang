import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseChapter} from '../../electron/reference/epub';
const parse=(body:string)=>parseChapter(`<html><head><title>篇目</title></head><body>${body}</body></html>`,'text/a.html',new Set(['text/a.html']),new Map());
test('prose embedded signature and original spans retain text and block anchors',()=>{
 const p=parse('<h3 id="title" class="kindle-cn-heading2">黄 鹤 楼 记<span class="calibre32">阎伯理</span></h3><p class="calibre24"><span class="kindle-cn-kai2">州城西南隅<span class="super"><a href="#note">(1)</a></span>。</span></p><p class="fnote" id="note">(1)原注。</p><p class="calibre24">鉴赏。</p>');
 assert.equal(p.blocks[0].text,'黄 鹤 楼 记阎伯理');assert.equal(p.blocks[0].title,'黄 鹤 楼 记');assert.equal(p.blocks[0].author,'阎伯理');assert.equal(p.blocks[1].nodes[0].role,'verse');assert.equal(p.blocks[2].nodes[0].role,'notes');assert.equal(p.blocks[3].nodes[0].role,undefined);assert.ok(p.blocks[2].anchors.includes('note'));
 const original=p.blocks[1].nodes[0].children![0];assert.equal(original.children![1].tag,'sup');assert.equal(original.children![1].children![0].target?.anchor,'note');
});
test('qu subtitle and explicit signature are distinguished from commentary',()=>{
 const p=parse('<h2 class="kindle-cn-heading1">〔南吕〕四块玉</h2><p class="kindle-cn-para-right1">马致远等</p><p class="kindle-cn-para-center">马嵬坡</p><p class="kindle-cn-kai">睡海棠，春将晚。</p><p class="calibre24">作品鉴赏。</p>');
 assert.deepEqual(p.blocks.map(b=>b.nodes[0].role),['work-title','signature','work-title','verse',undefined]);
});
test('a quotation nested in commentary does not turn the entire paragraph into original text',()=>{
 const p=parse('<p>评论<span class="kindle-cn-kai2">引用</span>评论。</p>');assert.equal(p.blocks[0].nodes[0].role,undefined);
});
