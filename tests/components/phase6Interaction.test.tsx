import assert from "node:assert/strict";
import {afterEach,test} from "node:test";
import React,{useRef} from "react";
import {JSDOM} from "jsdom";
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event','KeyboardEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,cleanup}=await import('@testing-library/react');
const {EditorHeader}=await import('../../src/components/editor/EditorHeader.tsx');
const {TitleField}=await import('../../src/components/editor/TitleField.tsx');
const {useEditorDialogFocus}=await import('../../src/components/editor/useEditorDialogFocus.ts');
afterEach(cleanup);
function header(save:()=>void){return <EditorHeader title="诗" contextLabel="诗房" saveStatus="dirty" saveError="" onBack={()=>{}} onSave={save} onExport={()=>{}}/>;}
test('save keyboard routes Cmd/Ctrl+S while preserving modal, IME and native keys',()=>{
 let calls=0;render(header(()=>calls++));
 for(const modifier of ['metaKey','ctrlKey']){const event=new dom.window.KeyboardEvent('keydown',{key:'s',[modifier]:true,bubbles:true,cancelable:true});document.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
 assert.equal(calls,2);
 for(const fields of [{key:'s',metaKey:true,isComposing:true},{key:'s',ctrlKey:true,keyCode:229},{key:'z',metaKey:true},{key:'a',ctrlKey:true},{key:'s',ctrlKey:true,altKey:true},{key:'s',metaKey:true,shiftKey:true}]){const event=new dom.window.KeyboardEvent('keydown',{...fields,bubbles:true,cancelable:true});document.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}
 const modal=document.createElement('section');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');document.body.append(modal);
 const event=new dom.window.KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true});document.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(calls,2);modal.remove();
});
test('save keyboard uses latest callback and unregisters on editor removal',()=>{
 let calls=0;const view=render(header(()=>calls++));view.rerender(header(()=>calls+=10));fireEvent.keyDown(document,{key:'s',ctrlKey:true});assert.equal(calls,10);view.unmount();fireEvent.keyDown(document,{key:'s',ctrlKey:true});assert.equal(calls,10);
});
test('long title expansion and blur keep the same native node, complete value and reverse selection',()=>{
 const value='长题𠀀'.repeat(50);const view=render(<TitleField value={value} onChange={()=>{}}/>);const input=screen.getByLabelText('诗稿题名') as HTMLTextAreaElement;
 input.setSelectionRange(8,21,'backward');fireEvent.click(screen.getByRole('button',{name:'查看完整题名'}));assert.equal((document.activeElement) === (input), true, "DOM identity or absence matches");assert.equal(input.value,value);assert.equal((screen.getByLabelText('诗稿题名')) === (input), true, "DOM identity or absence matches");assert.equal((screen.queryByRole('button',{name:'查看完整题名'})) === (null), true, "DOM identity or absence matches");
 input.setSelectionRange(8,21,'backward');fireEvent.blur(input);assert.ok(screen.getByRole('button',{name:'查看完整题名'}));assert.equal(input.selectionStart,8);assert.equal(input.selectionEnd,21);assert.equal(input.selectionDirection,'backward');assert.equal((screen.getByLabelText('诗稿题名')) === (input), true, "DOM identity or absence matches");
 view.rerender(<TitleField value={value+'新'} onChange={()=>{}}/>);assert.equal((screen.getByLabelText('诗稿题名')) === (input), true, "DOM identity or absence matches");assert.equal(input.value,value+'新');
});
test('title Enter leaves composition confirm and keyCode229 untouched',()=>{
 render(<TitleField value="" onChange={()=>{}}/>);const input=screen.getByLabelText('诗稿题名');
 assert.equal(fireEvent.keyDown(input,{key:'Enter',isComposing:true}),true);assert.equal(fireEvent.keyDown(input,{key:'Enter',keyCode:229}),true);assert.equal(fireEvent.keyDown(input,{key:'Enter'}),false);
});
function Modal({close}:{close:()=>void}){const root=useRef<HTMLElement>(null);useEditorDialogFocus(root,close,false);return <div className="dialog-backdrop"><section ref={root} role="dialog" tabIndex={-1}><textarea aria-label="组合"/><details><summary>详情</summary></details><button>最后</button></section></div>;}
test('dialog Escape and Tab do not intercept IME; textarea/summary participate in focus trap',()=>{
 let closed=0;render(<Modal close={()=>closed++}/>);const input=screen.getByLabelText('组合');assert.equal((document.activeElement) === (input), true, "DOM identity or absence matches");
 assert.equal(fireEvent.keyDown(input,{key:'Escape',isComposing:true}),true);assert.equal(fireEvent.keyDown(input,{key:'Escape',keyCode:229}),true);assert.equal(fireEvent.keyDown(input,{key:'Tab',shiftKey:true,isComposing:true}),true);assert.equal((document.activeElement) === (input), true, "DOM identity or absence matches");assert.equal(closed,0);
 fireEvent.keyDown(input,{key:'Tab',shiftKey:true});assert.equal((document.activeElement) === (screen.getByRole('button',{name:'最后'})), true, "DOM identity or absence matches");fireEvent.keyDown(document.activeElement!,{key:'Tab'});assert.equal((document.activeElement) === (input), true, "DOM identity or absence matches");fireEvent.keyDown(input,{key:'Escape'});assert.equal(closed,1);
});
