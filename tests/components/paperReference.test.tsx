import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event','CustomEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {PaperReferenceWorkspace}=await import('../../src/components/reference/PaperReferenceWorkspace.tsx');
afterEach(cleanup);
const reading={id:'长:ping-07yang',tone:'平声',groupId:'ping-07yang',groupName:'七阳',glosses:['长远']};
function api(){window.shifang={reference:{groups:async()=>[{id:'ping-07yang',name:'七阳',tone:'平声',count:1}],lookup:async({character,system}:any)=>({character,system,readings:[reading],sourceId:'pingshui',version:'1'}),explanations:async()=>({version:'1',entries:[],sources:[]}),group:async()=>({group:{id:'ping-07yang',name:'七阳',tone:'平声',count:1},items:[{character:'长',readings:[reading]}],nextOffset:null,view:'common-first',filteredCount:1,usageVersion:'1',usageAvailable:true}),patterns:async()=>[],sources:async()=>[]}} as any;}
test('single-character query, rhyme drilldown and return preserve result and scroll without duplicate heading',async()=>{
 api();render(<PaperReferenceWorkspace initialSystem="pingshui" onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('查询单字'),{target:{value:'长'}});fireEvent.click(screen.getByRole('button',{name:'查询',exact:true}));
 await screen.findByText('长远');assert.equal(document.querySelector('.paper-reference-reading h3')?.textContent,'平声');assert.equal(screen.getAllByRole('heading',{level:3}).length,1);
 const content=document.querySelector('.paper-reference-content')!;content.scrollTop=92;
 fireEvent.click(screen.getByRole('button',{name:'七阳',exact:true}));await screen.findByRole('button',{name:'长',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'长',exact:true}));await screen.findByText('长远');
 fireEvent.click(screen.getByRole('button',{name:'返回上次查看'}));await screen.findByRole('button',{name:'长',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'返回上次查看'}));await screen.findByText('长远');assert.equal(content.scrollTop,92);
 assert.equal(screen.getByRole('tab',{name:'格律'}).textContent,'格律');
});
test('editing query invalidates in-flight results',async()=>{
 api();let resolve:any;window.shifang.reference.lookup=()=>new Promise(r=>{resolve=r});
 render(<PaperReferenceWorkspace initialSystem="pingshui" onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('查询单字'),{target:{value:'长'}});fireEvent.click(screen.getByRole('button',{name:'查询',exact:true}));
 fireEvent.change(screen.getByLabelText('查询单字'),{target:{value:'台'}});
 resolve({character:'长',system:'pingshui',readings:[reading],sourceId:'pingshui',version:'1'});
 await waitFor(()=>assert.equal(screen.queryByText('长远'),null));assert.equal((screen.getByLabelText('查询单字') as HTMLInputElement).value,'台');
});
