import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {LibraryNewWork}=await import('../../src/components/works/LibraryNewWork.tsx');
const {desktopApi}=await import('../../src/services/desktopApi.ts');
const original=desktopApi.works.create;afterEach(()=>{cleanup();desktopApi.works.create=original});
test('new work assigns one collection and maps each visible genre to its actual editor',async()=>{
 for(const [label,genre,room,category]of [['近体诗','qijue','poetry','unclassified'],['古体诗','free','poetry','ancient'],['现代诗','free','song','modern'],['古文','free','poetry','prose'],['词','ci','ci','unclassified']]){
  let request:any,opened='';desktopApi.works.create=async r=>{request=r;return{id:'new'} as any};render(<LibraryNewWork collectionId="collection-one" onClose={()=>{}} onCreated={id=>{opened=id}}/>);
  fireEvent.change(screen.getByLabelText('题名'),{target:{value:'  新作题名  '}});fireEvent.click(screen.getByRole('button',{name:label,exact:true}));await waitFor(()=>assert.equal((screen.getByRole('button',{name:'创建',exact:true}) as HTMLButtonElement).disabled,false));fireEvent.click(screen.getByRole('button',{name:'创建',exact:true}));await waitFor(()=>assert.equal(opened,'new'));
  assert.equal(request.title,'新作题名');assert.equal(request.collectionId,'collection-one');assert.equal(request.genre,genre);assert.equal(request.room,room);assert.equal(request.category,category);if(genre==='ci')assert.ok(request.ci.formId&&request.ci.version&&request.ci.rhymeVersion);cleanup();
 }
});
test('creation failure retains the typed title and keeps retry available',async()=>{
 desktopApi.works.create=async()=>{throw Error('disk unavailable')};let opened=false;render(<LibraryNewWork collectionId={null} onClose={()=>{}} onCreated={()=>{opened=true}}/>);fireEvent.change(screen.getByLabelText('题名'),{target:{value:'保留题名'}});fireEvent.click(screen.getByRole('button',{name:'创建',exact:true}));await screen.findByRole('alert');assert.equal(opened,false);assert.equal((screen.getByLabelText('题名') as HTMLInputElement).value,'保留题名');assert.equal((screen.getByRole('button',{name:'创建',exact:true}) as HTMLButtonElement).disabled,false);
});
