import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event','KeyboardEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {installVerseDom}=await import('../support/verseDom.ts');installVerseDom(dom.window);
const {AncientEditor}=await import('../../src/components/editor/AncientEditor.tsx');
afterEach(cleanup);
async function select(a:number,ao:number,b=a,bo=ao){const root=document.querySelector<HTMLElement>('.ancient-body')!,nodes=root.querySelectorAll('p');root.focus();await act(async()=>{window.getSelection()!.setBaseAndExtent(nodes[a].firstChild!,ao,nodes[b].firstChild!,bo);fireEvent(document,new dom.window.Event('selectionchange'));await new Promise(r=>setTimeout(r,30));});return root;}
test('ancient cross-line deletion merges naturally, undo restores whitespace and blank lines',async()=>{
 const original='  甲𠀀乙\n丙丁  \n\n末行\n';let result=original;render(<AncientEditor identity="one" body={original} onChange={value=>{result=value}} onCharacter={()=>{}}/>);
 const root=await select(0,3,1,1);fireEvent.keyDown(root,{key:'Backspace'});assert.equal(result,'  甲丁  \n\n末行\n');fireEvent.keyDown(root,{key:'z',metaKey:true});assert.equal(result,original);
});
test('ancient Enter creates a new editable line without a fixed verse slot',async()=>{
 let result='甲乙';render(<AncientEditor identity="two" body="甲乙" onChange={v=>{result=v}} onCharacter={()=>{}}/>);
 const root=await select(0,1);fireEvent.keyDown(root,{key:'Enter'});assert.equal(result,'甲\n乙');fireEvent.keyDown(root,{key:'Backspace'});assert.equal(result,'甲乙');
});
