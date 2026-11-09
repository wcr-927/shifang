import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,act,cleanup,fireEvent}=await import('@testing-library/react');
const {desktopApi}=await import('../../src/services/desktopApi.ts');
const {useReadingExplanations}=await import('../../src/features/reference/useReadingExplanations.ts');
const original=desktopApi.reference.explanations;
afterEach(()=>{cleanup();desktopApi.reference.explanations=original});
function Probe({character}:{character:string|null}){const state=useReadingExplanations(character?{system:'pingshui',character}:null);return <><output>{state.status}:{state.bundle?.version}</output><button onClick={state.retry}>重试</button></>}
test('late responses cannot replace the current character; null clears immediately',async()=>{
 const pending=new Map<string,(v:any)=>void>();
 desktopApi.reference.explanations=req=>new Promise(resolve=>pending.set(req.character,resolve));
 const view=render(<Probe character="长"/>);view.rerender(<Probe character="重"/>);
 await act(async()=>pending.get('重')!({version:'重',sources:[],entries:[]}));assert.equal(screen.getByRole('status').textContent,'ready:重');
 await act(async()=>pending.get('长')!({version:'长',sources:[],entries:[]}));assert.equal(screen.getByRole('status').textContent,'ready:重');
 view.rerender(<Probe character={null}/>);assert.equal(screen.getByRole('status').textContent,'idle:');
});
test('retry uses the current complete Unicode character and stable requests do not refetch',async()=>{
 const calls:string[]=[];desktopApi.reference.explanations=async req=>{calls.push(req.character);if(calls.length===1)throw Error('failed');return {version:'ok',sources:[],entries:[]}};
 const view=render(<Probe character="𠮷"/>);await act(async()=>{});assert.equal(screen.getByRole('status').textContent,'error:');
 view.rerender(<Probe character="𠮷"/>);assert.equal(calls.length,1);
 await act(async()=>fireEvent.click(screen.getByText('重试')));assert.deepEqual(calls,['𠮷','𠮷']);assert.equal(screen.getByRole('status').textContent,'ready:ok');
});
