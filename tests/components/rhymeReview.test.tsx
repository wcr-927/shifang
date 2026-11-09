import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {analyzePoem} from '../../src/poetry/analysis/poemAnalyzer';
import {metreRhymeReviewGroups} from '../../src/features/editor/rhymeReviewGroups';
import {ciForms} from '../../src/ci/catalogue';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,cleanup}=await import('@testing-library/react');
const {GrammarReview}=await import('../../src/components/manuscript/GrammarReview');
const {CiReview}=await import('../../src/components/manuscript/CiReview');
afterEach(cleanup);
const data=(n:string)=>JSON.parse(readFileSync(`src/rules/${n}.json`,'utf8'));
function analysis(){const lines=['风急天高猿啸哀','渚清沙白鸟飞回','无边落木萧萧下','不尽长江滚滚来','万里悲秋常作客','百年多病独登台','艰难苦恨繁霜鬓','潦倒新停浊酒杯'],p=data('pingze'),c=p.characters['台'].candidates.find((c:any)=>c.rhymeGroupId==='ping-04zhi');return analyzePoem(lines.join('\n'),data('metre'),p,data('reading_rules'),{templateId:'qilv',variantId:'zeqi-first-rhymed',editorLines:lines,overrides:[0,1,3,5,7].map(i=>({lineIndex:i,characterIndex:6,character:lines[i][6],candidateId:p.characters[lines[i][6]].candidates.find((r:any)=>r.rhymeGroupId===(i===5?'ping-04zhi':'ping-10hui')).id,sourceText:lines[i],sourceOffset:6}))});}
test('five engine conflicts are displayed once with grouped feet and precise navigation',()=>{
 const a=analysis();assert.equal(a.issues.filter(i=>i.code==='RHYME_GROUP').length,5);const before=JSON.stringify(a),located:unknown[]=[];
 render(<GrammarReview analysis={a} loading={false} error="" onLocate={(...args)=>located.push(args)}/>);
 assert.equal(screen.getAllByText('押韵不一致').length,1);assert.equal(document.querySelectorAll('.review-rhyme-group').length,2);assert.equal(document.querySelectorAll('.review-rhyme-group button').length,5);
 fireEvent.click(screen.getByRole('button',{name:'定位第6句韵脚：台'}));assert.deepEqual(located,[[5,6]]);assert.equal(JSON.stringify(a),before);
});
test('equal groups stay neutral and unresolved candidates are not assigned to one family',()=>{
 const a=analysis();a.rhyme.feet=a.rhyme.feet.slice(1);
 a.rhyme.feet.forEach((f,i)=>{f.selectedGroupId=i<2?'ping-10hui':'ping-04zhi';const c=a.lines[f.lineIndex].characters.at(-1)!;c.reading.candidates=[{...c.reading.candidates[0],rhymeGroupId:f.selectedGroupId,rhymeGroupName:i<2?'十灰':'四支'}]});
 assert.deepEqual(metreRhymeReviewGroups(a).map(g=>g.feet.length),[2,2]);a.rhyme.feet[3].selectedGroupId=null;
 assert.equal(metreRhymeReviewGroups(a).at(-1)?.name,'待确认');
});
test('ci review groups a conflict only within its own rhyme segment',()=>{
 const form={...ciForms[0],lines:[...ciForms[0].lines]};form.lines[0]={...form.lines[0],rhyme:'a'};form.lines[1]={...form.lines[1],rhyme:'b'};
 const reading=(group:number)=>({id:String(group),group,tone:'P' as const,subgroup:'',gloss:''});
 const a={issues:[{kind:'conflict' as const,code:'rhyme-group' as const,segment:'a',line:2,message:'冲突'}],readings:[{line:0,offset:3,character:'东',source:'',options:[reading(1)]},{line:2,offset:4,character:'支',source:'',options:[reading(3)]},{line:1,offset:1,character:'灰',source:'',options:[reading(5)]}],feet:[{key:'a',items:[{line:0,options:[reading(1)]},{line:2,options:[reading(3)]}]},{key:'b',items:[{line:1,options:[reading(5)]}]}],filled:3};
 const located:unknown[]=[];render(<CiReview form={form} analysis={a} body="东\n灰\n支" onLocate={(...args)=>located.push(args)} onPattern={()=>{}}/>);
 assert.equal(screen.getAllByText('押韵不一致').length,1);assert.equal(document.querySelector('.review-rhyme-groups')?.textContent?.includes('灰'),false);fireEvent.click(screen.getByRole('button',{name:'定位第3句韵脚：支'}));assert.deepEqual(located,[[2,4]]);
});
