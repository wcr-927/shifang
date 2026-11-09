import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { WorkRecord } from '../../src/shared/work.ts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/#/'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {installVerseDom,changeVerse,selectVerse}=await import('../support/verseDom.ts');installVerseDom(dom.window);
const {App}=await import('../../src/app/App.tsx');
const id='123e4567-e89b-12d3-a456-426614174089';
let record:WorkRecord,requests:any[],analysisCalls:number,ruleCalls:number,beforeClose:any,closeResults:any[],save:any;
beforeEach(()=>{
 record={id,title:'自由稿',body:'',genre:'free',room:'poetry',category:'unclassified',status:'draft',collectionId:null,location:'',notes:'',rhymeGroupId:null,tags:[],createdAt:'t',updatedAt:'t'};
 requests=[];analysisCalls=0;ruleCalls=0;closeResults=[];
 save=async(req:any)=>{record={...record,...req};return record;};
 window.history.replaceState(null,'',`#/works/${id}`);
 window.shifang={reference:{lookup:async({system,character}:any)=>({system,character,sourceId:'pingshui',version:'1',readings:[]}),explanations:async()=>({version:'1',sources:[],entries:[]}),groups:async()=>[],patterns:async()=>[]},app:{health:async()=>({name:'诗房',version:'test',packaged:false}),onBeforeClose:cb=>{beforeClose=cb;return()=>{};},completeClose:(i,r)=>closeResults.push({id:i,result:r}),onCloseCancelled:()=>()=>{}},rules:{listTemplates:async()=>{ruleCalls++;throw Error('free should not load rules');},getReadingCandidates:async()=>{throw Error('free should not load readings');}},analysis:{analyzePoem:async()=>{analysisCalls++;throw Error('free should not analyze');}},works:{get:async()=>record,list:async()=>[record],query:async()=>({items:[{id:record.id,title:record.title,preview:record.body.slice(0,160),genre:record.genre,room:record.room??"poetry",category:record.category??"unclassified",status:record.status,tags:record.tags,createdAt:record.createdAt,updatedAt:record.updatedAt}],nextCursor:null,total:1,tags:record.tags}),create:async()=>record,update:async()=>record,archive:async()=>record,getAnalysisState:async()=>{throw Error('free should not load analysis state');},saveAnalysisState:async()=>{throw Error('free should not save analysis state');},saveEditorState:async()=>{throw Error('wrong save endpoint');},saveFreeWork:async req=>{requests.push(req);return save(req);},export:async()=>({status:'cancelled'})}};
});
afterEach(cleanup);
async function open(){render(<App/>);return await screen.findByLabelText('作品正文') as HTMLTextAreaElement;}

test('free text and notes retain whitespace and selection, use no classical analysis, and save together in independent fields',async()=>{
 record.notes='  附记\n不导出  ';const body=await open();const header=document.querySelector('.editor-header')!;assert.match(header.textContent!,/返回/);assert.ok(screen.getByLabelText('导出作品'));assert.ok(document.querySelector('.manuscript-foot .editor-save-indicator'));const raw='  开头留白\n\n    第二节\n\t末行  \n';body.focus();fireEvent.change(body,{target:{value:raw}});assert.equal(document.querySelector('.manuscript-foot .editor-save-button')!.getAttribute('data-emphasis'),'true');body.setSelectionRange(1,12);
 fireEvent.click(screen.getByText('自由创作',{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:'古文',exact:true}));
 assert.equal((screen.getByLabelText('作品正文')) === (body), true, "DOM identity or absence matches");assert.equal(body.selectionStart,1);assert.equal(body.selectionEnd,12);
 fireEvent.click(screen.getByTitle('立即保存'));await waitFor(()=>assert.equal(record.notes,'  附记\n不导出  '));assert.equal(record.body,raw);assert.equal(record.category,'prose');
 assert.equal(analysisCalls,0);assert.equal(ruleCalls,0);assert.equal((document.querySelector('.editor-side')) === (null), true, "DOM identity or absence matches");assert.equal(document.body.textContent!.includes('未校验'),false);
});

test('free save failures block navigation, retry persists raw text and returns to the single library',async()=>{
 const body=await open();fireEvent.change(body,{target:{value:'不能丢失\n\n  文本'}});save=async()=>{throw Error('隔离磁盘故障');};
 fireEvent.click(screen.getByRole('button',{name:'创作',exact:true}));await screen.findAllByText(/隔离磁盘故障/);
 assert.equal(window.location.hash,`#/works/${id}`);assert.equal(body.value,'不能丢失\n\n  文本');
 save=async(req:any)=>{record={...record,...req};return record;};fireEvent.click(screen.getByRole('button',{name:'创作',exact:true}));await waitFor(()=>assert.equal(window.location.hash,'#/works'));assert.equal(record.body,'不能丢失\n\n  文本');
});

test('free close flush includes right-column text typed while an earlier save is pending',async()=>{
 record.room='song';record.category='modern';const body=await open();fireEvent.change(body,{target:{value:' 第一节\n\n第二节\n'}});
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let count=0;
 save=async(req:any)=>{if(++count===1)await gate;record={...record,...req};return record;};
 let closing!:Promise<void>;act(()=>{closing=Promise.resolve(beforeClose(12));});await waitFor(()=>assert.equal(requests.length,1));
 fireEvent.change(screen.getByLabelText('正文右栏'),{target:{value:'第二栏继续'}});
 await act(async()=>{release();await closing;});assert.equal(requests.length,2);assert.equal(record.notes,'');assert.equal(record.body,' 第一节\n\n第二节\n\n\n第二栏继续');assert.equal(closeResults[0].result.status,'saved');assert.equal(analysisCalls,0);
});


test('oversized free input stays intact and blocks save instead of being silently truncated',async()=>{
 const body=await open();const raw='甲'.repeat(100001);fireEvent.change(body,{target:{value:raw}});
 assert.equal(body.hasAttribute('maxlength'),false);
 fireEvent.click(screen.getByTitle('立即保存'));await screen.findAllByText(/输入已完整保留/);
 assert.equal(body.value,raw);assert.equal(requests.length,0);assert.equal(record.body,'');
});

test('free paper hides old notes UI but preserves existing notes through saves',async()=>{
 record.notes='  原有附记\n保留';const body=await open();fireEvent.change(body,{target:{value:'甲乙\n\n丙丁'}});assert.equal(screen.queryByRole('button',{name:'创作记',exact:true}),null);
 fireEvent.click(screen.getByTitle('立即保存'));await waitFor(()=>assert.equal(record.body,'甲乙\n\n丙丁'));assert.equal(record.notes,'  原有附记\n保留');
});

test('ci uses its own save and analysis, preserves legacy notes without exposing the old notes UI',async()=>{
 const {ciForms}=await import('../../src/ci/catalogue.ts');const {rhymeVersion}=await import('../../src/ci/analyze.ts');
 record={...record,notes:'  旁记\n末行  ',genre:'ci',room:'ci',ci:{formId:ciForms[0].id,version:ciForms[0].version,rhymeVersion,choices:[]}};
 window.shifang.works.saveCiWork=async req=>{requests.push(req);record={...record,...req};return record;};
 HTMLElement.prototype.scrollIntoView=()=>{};globalThis.requestAnimationFrame=fn=>{fn(0);return 0;};
 render(<App/>);const body=await screen.findByLabelText('第1句') as HTMLTextAreaElement;assert.match(document.querySelector('.manuscript-scroll .editor-header')!.textContent!,/返回/);assert.ok(screen.getByLabelText('导出词稿'));await changeVerse(body,'  行山  ');await selectVerse(body,2,3);
 assert.equal(screen.queryByRole('button',{name:'创作记',exact:true}),null);assert.equal(screen.queryByLabelText('创作记内容'),null);
 fireEvent.click(screen.getAllByRole('checkbox',{name:/采用/})[0]);
 fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));await waitFor(()=>assert.equal(record.body,'  行山  '));assert.equal(record.notes,'  旁记\n末行  ');assert.equal(record.ci?.choices[0].source,'  行山  ');assert.equal(record.ci?.choices[0].offset,2);assert.equal(analysisCalls,0);assert.equal(ruleCalls,0);
});

test('ci cross-line paste requires preview, cancel preserves raw source, confirm supports undo and redo',async()=>{
 const {ciForms}=await import('../../src/ci/catalogue.ts');const {rhymeVersion}=await import('../../src/ci/analyze.ts');
 record={...record,genre:'ci',room:'ci',body:'原文',ci:{formId:ciForms[0].id,version:ciForms[0].version,rhymeVersion,choices:[]}};window.shifang.works.saveCiWork=async req=>{record={...record,...req};return record;};
 HTMLElement.prototype.scrollIntoView=()=>{};globalThis.requestAnimationFrame=fn=>{fn(0);return 0;};render(<App/>);const input=await screen.findByLabelText('第1句');
 await selectVerse(input,0,input.textContent!.length);const root=input.closest('.verse-editor')!;
 const paste=()=>fireEvent.paste(root,{clipboardData:{getData:()=> '  风来\n\n山远  '}});paste();await screen.findByRole('dialog',{name:'确认多行粘贴'});assert.equal(document.querySelector('.paste-confirm-dialog')!.closest('[inert]'),null);fireEvent.click(screen.getByRole('button',{name:'取消',exact:true}));assert.equal(input.textContent,'原文');await selectVerse(input,0,input.textContent!.length);paste();fireEvent.click(screen.getByRole('button',{name:'确认插入'}));assert.equal(input.textContent,'  风来');assert.equal(screen.getByLabelText('第3句').textContent,'山远  ');
 fireEvent.keyDown(root,{key:'z',metaKey:true});assert.equal(input.textContent,'原文');fireEvent.keyDown(root,{key:'z',metaKey:true,shiftKey:true});assert.equal(input.textContent,'  风来');fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));await waitFor(()=>assert.equal(record.body,'  风来\n\n山远  '));

});

test('ci assistance resolves pending readings in place while optional readings remain reachable',async()=>{
 const {ciForms}=await import('../../src/ci/catalogue.ts');const {rhymeVersion}=await import('../../src/ci/analyze.ts');
 record={...record,genre:'ci',room:'ci',body:'行行行行行行',ci:{formId:ciForms[0].id,version:ciForms[0].version,rhymeVersion,choices:[]}};
 window.shifang.works.saveCiWork=async req=>{record={...record,...req};return record;};
 HTMLElement.prototype.scrollIntoView=()=>{};globalThis.requestAnimationFrame=fn=>{fn(0);return 0;};
 render(<App/>);const firstLine=await screen.findByLabelText('第1句') as HTMLTextAreaElement;
 fireEvent.click(screen.getByRole('button',{name:'词谱',exact:true}));const overview=screen.getByRole('dialog',{name:'词谱与校对'});assert.ok(overview.querySelector('.grammar-review'));assert.equal(Boolean(overview.querySelector('input[type=checkbox]')),false);
 assert.equal(document.querySelectorAll('.ci-reading-task').length,0);
 const issue=overview.querySelector<HTMLButtonElement>('button.review-kind-pending')!;
 fireEvent.click(issue);
 assert.equal(document.activeElement===firstLine.closest('.verse-editor'),true);
 const choices=document.querySelectorAll<HTMLInputElement>('.manuscript-reading-choice input');
 assert.ok(choices.length>1);
 fireEvent.click(choices[0]);
 assert.equal(document.querySelectorAll('.manuscript-reading-choice input').length,choices.length);
 assert.ok((document.querySelectorAll<HTMLInputElement>('.manuscript-reading-choice input')[0]).checked);

});

test('ci paste cancellation restores complete UTF-16 selection, focus and scroll; locating Han selects the full code point',async()=>{
 const {ciForms}=await import('../../src/ci/catalogue.ts');const {rhymeVersion}=await import('../../src/ci/analyze.ts');
 record={...record,genre:'ci',room:'ci',body:'甲𠀀乙丙丁',ci:{formId:ciForms[0].id,version:ciForms[0].version,rhymeVersion,choices:[]}};
 HTMLElement.prototype.scrollIntoView=()=>{};globalThis.requestAnimationFrame=fn=>{setTimeout(()=>fn(0),0);return 0;};
 render(<App/>);const input=await screen.findByLabelText('第1句') as HTMLTextAreaElement,scroll=document.querySelector<HTMLElement>('.manuscript-scroll')!;
 await selectVerse(input,5,1);scroll.scrollTop=137;const root=input.closest('.verse-editor')!;
 fireEvent.paste(root,{clipboardData:{getData:()=> '甲\r乙'}});await screen.findByRole('dialog',{name:'确认多行粘贴'});
 fireEvent.click(screen.getByRole('button',{name:'取消',exact:true}));await waitFor(()=>assert.equal(document.activeElement===root,true));
 assert.equal(input.textContent,'甲𠀀乙丙丁');assert.equal(window.getSelection()?.toString(),'𠀀乙丙');assert.equal(scroll.scrollTop,137);
 fireEvent.click(screen.getByRole('button',{name:'词谱',exact:true}));const issue=[...document.querySelectorAll<HTMLElement>('.review-limits button')].find(e=>e.textContent?.includes('𠀀'))!;fireEvent.click(issue);
 await waitFor(()=>assert.equal(window.getSelection()?.toString(),'𠀀'));

});

test('unavailable ci form and version retain title, body, notes, save and export without analysis',async()=>{
 const {ciForms}=await import('../../src/ci/catalogue.ts');const {rhymeVersion}=await import('../../src/ci/analyze.ts');
 for(const ci of [{formId:'removed-form',version:'old',rhymeVersion:'old',choices:[]},{formId:ciForms[0].id,version:'old',rhymeVersion,choices:[]}]){
  cleanup();record={...record,genre:'ci',room:'ci',body:'  𠀀原稿\n\n末行  \n',notes:'原始旁记',ci};const original=structuredClone(ci);
  window.shifang.works.saveCiWork=async req=>{requests.push(req);record={...record,...req};return record;};let exported:any;window.shifang.works.export=async req=>{exported=req;return {status:'cancelled'};};
  render(<App/>);const body=await screen.findByLabelText('词稿正文') as HTMLTextAreaElement;assert.equal(body.value,record.body);assert.equal((screen.queryByLabelText('词谱校对总览')) === (null), true, "DOM identity or absence matches");
  fireEvent.change(screen.getByLabelText('诗稿题名'),{target:{value:'降级仍可写'}});fireEvent.change(body,{target:{value:record.body+'新句'}});
  fireEvent.click(screen.getByRole('button',{name:'创作记',exact:true}));fireEvent.change(screen.getByLabelText('创作记内容'),{target:{value:'  新附记\n'}});
  fireEvent.click(screen.getByTitle('立即保存'));await waitFor(()=>assert.equal(record.notes,'  新附记\n'));assert.deepEqual(record.ci,original);assert.equal(record.genre,'ci');assert.equal(record.room,'ci');
  fireEvent.click(screen.getByLabelText('导出词稿'));fireEvent.click(screen.getByText('纯文本 TXT'));fireEvent.click(await screen.findByRole('button',{name:'选择位置并导出'}));await waitFor(()=>assert.ok(exported));
  cleanup();render(<App/>);assert.equal((await screen.findByLabelText('词稿正文') as HTMLTextAreaElement).value,record.body);assert.deepEqual(record.ci,original);
 }
 assert.equal(analysisCalls,0);assert.equal(ruleCalls,0);
});
