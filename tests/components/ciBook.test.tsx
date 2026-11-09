import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'getContext',{value:()=>({measureText:(s:string)=>({width:Array.from(s).length*24})})});
const {render,screen,fireEvent,cleanup}=await import('@testing-library/react');
const {ciForms}=await import('../../src/ci/catalogue.ts');
const {analyzeCi,rhymeVersion}=await import('../../src/ci/analyze.ts');
const {installVerseDom,changeVerse,selectVerse}=await import('../support/verseDom.ts');installVerseDom(dom.window);
const {CiBookManuscript}=await import('../../src/components/ci/CiBookManuscript.tsx');
afterEach(cleanup);
function props(name:string,body=''){const form=ciForms.find(f=>f.name===name)!,ci={formId:form.id,version:form.version,rhymeVersion,choices:[]};return {editor:{id:'test',title:name,body,ci,status:'draft'} as any,form,analysis:analyzeCi(body,form,ci),editorRef:React.createRef<any>(),onTitle:()=>{},onBody:()=>{},onSelection:()=>{},onHover:()=>{},onRhyme:()=>{},onForm:()=>{},onDetails:()=>{}}}
test('rhyme markers preserve distinct segments and empty slots without inserting text',()=>{const p=props('菩萨蛮'),groups:string[]=[];render(<CiBookManuscript {...p} onRhyme={k=>groups.push(k)}/>);assert.equal(document.querySelectorAll('.verse-text').length,8);fireEvent.click(screen.getByRole('button',{name:'第3句韵二'}));assert.deepEqual(groups,['b']);assert.equal(screen.getByLabelText('第3句').textContent,'');});
test('analysis refresh retains the single editing root and source nodes',async()=>{const p=props('卜算子','  山𠀀，');const view=render(<CiBookManuscript {...p}/>),field=screen.getByLabelText('第1句'),root=screen.getByRole('textbox',{name:'诗词正文'});await selectVerse(field,3,5);view.rerender(<CiBookManuscript {...p} analysis={{...p.analysis}}/>);assert.equal(screen.getByLabelText('第1句'),field);assert.equal(screen.getByRole('textbox',{name:'诗词正文'}),root);assert.equal(field.textContent,'  山𠀀，');assert.equal(window.getSelection()?.toString(),'𠀀');});
test('long form preserves overflow text and uses one editable document',()=>{const p=props('念奴娇'),body=p.form.lines.map(l=>l.example).join('\n')+'\n谱外原文  ';render(<CiBookManuscript {...props('念奴娇',body)}/>);assert.equal(document.querySelectorAll('.verse-text').length,p.form.lines.length+1);assert.equal(screen.getByLabelText(`第${p.form.lines.length+1}句`).textContent,'谱外原文  ');assert.equal(document.querySelectorAll('[contenteditable=true]').length,1);});
test('form selection appears only for whitespace-only drafts independently of title',()=>{const view=render(<CiBookManuscript {...props('卜算子','  \n  ')}/>);assert.ok(screen.getByRole('button',{name:'换词牌'}));for(const body of ['山','，','a']){view.rerender(<CiBookManuscript {...props('卜算子',body)}/>);assert.equal(screen.queryByRole('button',{name:'换词牌'}),null);assert.ok(screen.getByRole('button',{name:'词谱',exact:true}));}});
