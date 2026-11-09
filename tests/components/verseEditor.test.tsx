import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React,{useState} from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,cleanup,act}=await import('@testing-library/react');
const {installVerseDom}=await import('../support/verseDom.ts');installVerseDom(dom.window);
const {VerseEditor}=await import('../../src/components/editor/VerseEditor.tsx');
const {flushBeforeClose}=await import('../../src/services/closeCoordinator.ts');
const slots=Array.from({length:2},()=>({width:150,fontSize:24,markers:[]}));
afterEach(cleanup);
async function range(){const root=screen.getByRole('textbox',{name:'诗词正文'}),nodes=document.querySelectorAll('.verse-text');root.focus();await act(async()=>{window.getSelection()!.setBaseAndExtent(nodes[0].firstChild!,2,nodes[1].firstChild!,2);fireEvent(document,new window.Event('selectionchange'));await new Promise(r=>setTimeout(r,30))});return root;}
test('one editing root supports cross-node deletion and undo while retaining fixed slots',async()=>{function App(){const [body,setBody]=useState('缺月挂疏桐\n漏断人初静');return <><VerseEditor identity="test" body={body} mode="ci" slots={slots} onChange={setBody}/><output>{body}</output></>};render(<App/>);const root=await range();fireEvent.keyDown(root,{key:'Backspace'});assert.equal(document.querySelector('output')!.textContent,'缺月　　　\n　　人初静');assert.equal(document.querySelectorAll('.verse-text').length,2);fireEvent.keyDown(root,{key:'z',metaKey:true});assert.equal(document.querySelector('output')!.textContent,'缺月挂疏桐\n漏断人初静');});
test('typing replaces a cross-node selection at its start without merging suffix text',async()=>{let value='';render(<VerseEditor identity="test" body={'缺月挂疏桐\n漏断人初静'} mode="ci" slots={slots} onChange={body=>{value=body}}/>);const root=await range();fireEvent(root,new window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'清风'}));assert.equal(value,'缺月清风　\n　　人初静');});
test('pending composition blocks window close and does not publish its provisional cross-slot deletion',async()=>{let changes=0;render(<VerseEditor identity="test" body={'缺月挂疏桐\n漏断人初静'} mode="ci" slots={slots} onChange={()=>changes++}/>);const root=await range();fireEvent.compositionStart(root);assert.equal(changes,0);assert.equal((await flushBeforeClose()).status,'failed');cleanup();assert.equal((await flushBeforeClose()).status,'clean');});
test('oversized insertion retains the entire input and leaves the poem unchanged',async()=>{
 let value='';render(<VerseEditor identity="overflow" body={'白日　山尽'} mode="metre" slots={[{width:135,fontSize:25,markers:[]}]} onChange={body=>value=body}/>);
 const {selectVerse}=await import('../support/verseDom.ts');const line=screen.getByLabelText('第1句');await selectVerse(line,2);
 fireEvent(screen.getByRole('textbox',{name:'诗词正文'}),new window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'青山'}));
 assert.equal((screen.getByLabelText('待填文字') as HTMLTextAreaElement).value,'青山');assert.equal(line.textContent,'白日　山尽');assert.equal(value,'');
 fireEvent.change(screen.getByLabelText('待填文字'),{target:{value:'傍'}});fireEvent.click(screen.getByText('填入'));assert.equal(value,'白日傍山尽');
});
test('IME commit fills a gap from its original selection and cancellation retains it',async()=>{
 const {selectVerse}=await import('../support/verseDom.ts');let value='';render(<VerseEditor identity="ime-gap" body={'白日　山尽'} mode="metre" slots={[{width:135,fontSize:25,markers:[]}]} onChange={body=>value=body}/>);
 const line=screen.getByLabelText('第1句'),root=screen.getByRole('textbox',{name:'诗词正文'});await selectVerse(line,2);
 fireEvent.compositionStart(root);fireEvent.compositionEnd(root,{data:'依'});await act(async()=>{await new Promise(r=>setTimeout(r,50))});assert.equal(value,'白日依山尽');
 await selectVerse(line,2,3);fireEvent.compositionStart(root);fireEvent.compositionEnd(root,{data:''});await act(async()=>{await new Promise(r=>setTimeout(r,50))});assert.equal(value,'白日依山尽');
});
