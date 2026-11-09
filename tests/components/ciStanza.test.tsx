import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React,{useState} from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:(fn:()=>void)=>setTimeout(fn,0),configurable:true});
const {render,screen,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const {ciForms}=await import('../../src/ci/catalogue.ts');
const {ciStanzas,formatCiReading}=await import('../../src/ci/presentation.ts');
afterEach(cleanup);
function sample(name:string){return ciForms.find(form=>form.name===name)!;}
test('stanza structure follows the selected form and reading copies preserve author characters and overflow',()=>{
 for(const [name,sections]of [['如梦令',[7]],['浣溪沙',[3,3]],['水调歌头',[9,10]]] as const){const form=sample(name);assert.ok(form,name);assert.deepEqual(form.sections,[...sections]);}
 const form=sample('浣溪沙'),body='  山𠀀，\n月。\n\n 春 \n风！\n雨\n谱外  \n末行';
 const grouped=ciStanzas(body,form);assert.equal(grouped.stanzas[0].lines.join(''),'  山𠀀，月。');assert.deepEqual(grouped.overflow,['谱外  ','末行']);
 assert.equal(formatCiReading('',body,form,{title:false,form:false}),'  山𠀀，月。\n\n 春 风！雨\n\n谱外  \n末行');
 assert.equal(body,'  山𠀀，\n月。\n\n 春 \n风！\n雨\n谱外  \n末行');
});
