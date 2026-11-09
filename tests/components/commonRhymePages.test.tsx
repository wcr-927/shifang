import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
import type {ReferenceGroupPage, ReferenceSystem} from '../../src/shared/reference.ts';
import type {WorkAssistanceState} from '../../src/shared/assistanceState.ts';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,act,cleanup}=await import('@testing-library/react');
const {desktopApi}=await import('../../src/services/desktopApi.ts');
const {ManuscriptInspector}=await import('../../src/components/editor/ManuscriptInspector.tsx');
const {AncientReference}=await import('../../src/components/editor/AncientReference.tsx');
const {CiBookInspector}=await import('../../src/components/ci/CiBookInspector.tsx');
const {PaperReferenceWorkspace}=await import('../../src/components/reference/PaperReferenceWorkspace.tsx');
const {ciForms}=await import('../../src/ci/catalogue.ts');
const {analyzeCi,rhymeVersion}=await import('../../src/ci/analyze.ts');
const {ciSegmentId}=await import('../../src/features/editor/rhymeReference.ts');
const originals={group:desktopApi.reference.group,groups:desktopApi.reference.groups,sources:desktopApi.reference.sources,lookup:desktopApi.reference.lookup,explanations:desktopApi.reference.explanations};
afterEach(()=>{cleanup();Object.assign(desktopApi.reference,originals)});
const flush=()=>act(async()=>{});
function page(id:string,view:'common-only'|'all',chars='春',nextOffset:number|null=view==='common-only'?48:64):ReferenceGroupPage{
 return {group:{id,name:id,tone:'平声',count:200},items:[...chars].map(character=>({character,readings:[]})),view,filteredCount:view==='all'?200:70,nextOffset,usageVersion:'test',usageAvailable:true};
}
function setup(kind:'poem'|'ci'|'paper'|'ancient'){
 const system:ReferenceSystem=kind==='ci'?'cilin':'pingshui';
 const ids=system==='cilin'?['cilin-1','cilin-2']:['ping-07yang','ping-01dong'];
 desktopApi.reference.groups=async()=>ids.map(id=>({id,name:id,tone:'平声',count:200}));
 desktopApi.reference.sources=async()=>[];
 desktopApi.reference.explanations=async()=>({version:'test',entries:[],sources:[]});
 desktopApi.reference.lookup=async({character,system})=>({character,system,readings:ids.map(id=>({id,tone:'平声',groupId:id,groupName:`选${id}`,glosses:[]})),sourceId:system,version:'test'});
 const form=ciForms[0],body=form.lines.map(l=>l.example??'').join('\n'),key=form.lines.find(l=>l.rhyme)?.rhyme??'a';
 const analysis=analyzeCi(body,form,{choices:[],rhymeVersion});
 function element(id:string){
  const assistance:WorkAssistanceState={version:1,ancientSegments:[],references:[{segmentId:kind==='ci'?ciSegmentId(form.id,key):'poem',system,groupId:id,mode:'manual'}]};
  if(kind==='ancient')return <AncientReference character="长" onQuery={()=>{}} onGroup={()=>{}}/>;
  if(kind==='paper')return <PaperReferenceWorkspace initialSystem={system} onClose={()=>{}} request={{id,kind:'group',groupId:id,system}}/>;
  if(kind==='ci')return <CiBookInspector form={form} body={body} analysis={analysis} assistance={assistance} rhymeKey={key} onRhyme={()=>{}} setReading={()=>{}} onQuery={()=>{}}/>;
  return <ManuscriptInspector selected={null} analysis={null} assistance={assistance} onSelect={()=>{}} onClear={()=>{}} onQueryCharacter={()=>{}} onQueryGroup={()=>{}}/>;
 }
 const rendered=render(element(ids[0]));
 return {system,ids,change:()=>kind==='ancient'?fireEvent.click(screen.getByRole('button',{name:`选${ids[1]}`,exact:true})):rendered.rerender(element(ids[1]))};
}
for(const kind of ['poem','ci','paper','ancient'] as const){
 test(`${kind}: common first page, explicit pagination, retained-page retry and all counts`,async()=>{
  const calls:any[]=[];let fail=true;
  desktopApi.reference.group=async request=>{calls.push(request);if(request.offset&&fail){fail=false;throw Error('offline')}return page(request.id,request.view as any,request.offset?'夏':request.view==='all'?'冬':'春',request.offset?null:request.view==='common-only'?48:64)};
  const {ids,system}=setup(kind);await flush();
  assert.deepEqual(calls,[{system,id:ids[0],view:'common-only',offset:0,limit:48}]);
  assert.ok(screen.getByText('70字'));assert.ok(screen.getByRole('button',{name:'常用',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'更多韵字'}));await flush();
  assert.ok(screen.getByRole('button',{name:kind==='poem'?'查字 春':'春',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'重试',exact:true}));await flush();
  assert.ok(screen.getByRole('button',{name:kind==='poem'?'查字 夏':'夏',exact:true}));assert.equal(calls.length,3);assert.equal(calls[2].offset,48);
  fireEvent.click(screen.getByRole('button',{name:'全部',exact:true}));await flush();
  assert.ok(screen.getByText('200字'));assert.equal(calls.at(-1).view,'all');assert.equal(calls.at(-1).offset,0);assert.equal(calls.at(-1).limit,64);assert.ok(calls.slice(0,3).every(call=>call.limit===48));
  assert.equal(screen.queryByRole('button',{name:kind==='poem'?'查字 春':'春',exact:true}),null);
 });
 test(`${kind}: late next page cannot cross scope or group and switches hide old characters`,async()=>{
  let resolve!:(value:ReferenceGroupPage)=>void;const calls:any[]=[];
  desktopApi.reference.group=async request=>{calls.push(request);if(request.offset)return new Promise(r=>{resolve=r});return page(request.id,request.view as any,request.id.endsWith('2')||request.id.endsWith('dong')?'秋':request.view==='all'?'冬':'春')};
  const {ids,change}=setup(kind);await flush();
  fireEvent.click(screen.getByRole('button',{name:'更多韵字'}));await flush();
  const oldResolve=resolve;
  fireEvent.click(screen.getByRole('button',{name:'全部',exact:true}));
  assert.equal(screen.queryByRole('button',{name:kind==='poem'?'查字 春':'春',exact:true}),null);
  await flush();await act(async()=>oldResolve(page(ids[0],'common-only','旧',null)));
  assert.equal(screen.queryByRole('button',{name:kind==='poem'?'查字 旧':'旧',exact:true}),null);
  fireEvent.click(screen.getByRole('button',{name:'更多韵字'}));await flush();
  const groupResolve=resolve;change();
  assert.equal(screen.queryByRole('button',{name:kind==='poem'?'查字 冬':'冬',exact:true}),null);
  await flush();await act(async()=>groupResolve(page(ids[0],'all','旧',null)));
  assert.ok(screen.getByRole('button',{name:kind==='poem'?'查字 秋':'秋',exact:true}));assert.equal(screen.queryByRole('button',{name:kind==='poem'?'查字 旧':'旧',exact:true}),null);
 });
 test(`${kind}: absent common layer stays empty with all scope available`,async()=>{
  const calls:any[]=[];
  desktopApi.reference.group=async request=>{calls.push(request);return {...page(request.id,request.view as any,request.view==='all'?'春':'',null),usageAvailable:false,filteredCount:0}};
  setup(kind);await flush();assert.ok(screen.getByText('暂无常用韵字'));assert.ok(screen.getByText('0字'));assert.equal(calls.length,1);
  fireEvent.click(screen.getByRole('button',{name:'全部',exact:true}));await flush();assert.ok(screen.getByText('200字'));
 });
}
for(const kind of ['poem','ci','paper','ancient'] as const){
 test(`${kind}: initial-page failure retries the same common scope`,async()=>{
  const calls:any[]=[];
  desktopApi.reference.group=async request=>{calls.push(request);if(calls.length===1)throw Error('offline');return page(request.id,'common-only','春',null)};
  setup(kind);await flush();
  assert.equal(screen.queryByText('暂无常用韵字'),null);
  fireEvent.click(screen.getByRole('button',{name:'重试',exact:true}));await flush();
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].view,'common-only');
  assert.ok(screen.getByRole('button',{name:kind==='poem'?'查字 春':'春',exact:true}));
 });
}
test('ancient: rhyme title still opens reference material and character buttons still query',async()=>{
 const groupId='ping-07yang',opened:string[]=[],queried:string[]=[];
 desktopApi.reference.lookup=async({character,system})=>({character,system,readings:[{id:'reading',tone:'平声',groupId,groupName:'七阳',glosses:['长远']}],sourceId:system,version:'test'});
 desktopApi.reference.explanations=async()=>({version:'test',entries:[],sources:[]});
 desktopApi.reference.group=async()=>({...page(groupId,'common-only','春',null),group:{id:groupId,name:'七阳',tone:'平声',count:200}});
 render(<AncientReference character="长" onQuery={c=>queried.push(c)} onGroup={id=>opened.push(id)}/>);await flush();
 fireEvent.click(screen.getAllByRole('button',{name:'七阳',exact:true}).at(-1)!);
 fireEvent.click(screen.getByRole('button',{name:'春',exact:true}));
 assert.deepEqual(opened,[groupId]);assert.deepEqual(queried,['春']);
});
for(const kind of ['poem','ci','paper','ancient'] as const){
 test(`${kind}: all 110 common candidates append in 48-character batches without changing total`,async()=>{
  const characters=Array.from({length:110},(_,i)=>String.fromCodePoint(0x4e00+i));
  const calls:any[]=[];
  desktopApi.reference.group=async request=>{
   calls.push(request);const offset=request.offset??0,limit=request.limit??64;
   return {...page(request.id,'common-only',characters.slice(offset,offset+limit).join(''),offset+limit<110?offset+limit:null),filteredCount:110};
  };
  setup(kind);await flush();
  const visible=()=>characters.filter(c=>screen.queryByRole('button',{name:kind==='poem'?`查字 ${c}`:c,exact:true})).length;
  assert.equal(visible(),48);assert.ok(screen.getByText('110字'));
  fireEvent.click(screen.getByRole('button',{name:'更多韵字'}));await flush();
  assert.equal(visible(),96);assert.ok(screen.getByText('110字'));
  fireEvent.click(screen.getByRole('button',{name:'更多韵字'}));await flush();
  assert.equal(visible(),110);assert.ok(screen.getByText('110字'));
  assert.equal(screen.queryByRole('button',{name:'更多韵字'}),null);
  assert.deepEqual(calls.map(({offset,limit})=>({offset,limit})),[{offset:0,limit:48},{offset:48,limit:48},{offset:96,limit:48}]);
 });
}
