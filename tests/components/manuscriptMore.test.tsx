import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,cleanup}=await import('@testing-library/react');
const {ManuscriptMore,ManuscriptStatusChoice}=await import('../../src/components/manuscript/ManuscriptTools.tsx');
test('status expands inside More; choice uses existing callback and closes without a dialog',()=>{
 let status='draft';render(<ManuscriptMore><button>历史</button><button>资料</button><ManuscriptStatusChoice status="draft" onChange={value=>{status=value}}/></ManuscriptMore>);
 const menu=document.querySelector<HTMLDetailsElement>('.editor-tools')!;menu.open=true;
 fireEvent.click(screen.getByText('作品状态'));assert.equal(menu.open,true);assert.equal(screen.queryByRole('dialog'),null);
 assert.equal(screen.getByRole('button',{name:'草稿'}).getAttribute('aria-pressed'),'true');
 fireEvent.click(screen.getByRole('button',{name:'已完成'}));assert.equal(status,'completed');assert.equal(menu.open,false);assert.equal(document.activeElement,menu.querySelector('summary'));
 cleanup();
});

test('global navigation exposes only current destinations and routes without creating a work',async()=>{
 const {AppNavigation}=await import('../../src/components/navigation/AppNavigation.tsx');const {registerNavigationHandler}=await import('../../src/app/routes.ts');const routes:unknown[]=[];const dispose=registerNavigationHandler(route=>routes.push(route));
 try{render(<AppNavigation route={{kind:'work',workId:'id'}} onBackup={()=>{}} motion onMotion={()=>{}} onError={()=>{}}/>);
 assert.deepEqual(Array.from(document.querySelectorAll('.app-navigation nav button')).map(b=>b.textContent),['创作','阅读','摘记']);
 assert.equal(screen.getByRole('button',{name:'创作'}).getAttribute('aria-current'),'page');
 for(const label of ['阅读','摘记','创作'])fireEvent.click(screen.getByRole('button',{name:label,exact:true}));fireEvent.click(screen.getByLabelText('诗房首页'));
 assert.deepEqual(routes,[{kind:'reference'},{kind:'notes'},{kind:'works'},{kind:'home'}]);
 }finally{cleanup();dispose()}
});
