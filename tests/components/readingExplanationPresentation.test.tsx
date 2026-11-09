import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReadingExplanation} from '../../src/components/editor/ReadingExplanation.tsx';
import {matchingExplanations} from '../../src/components/editor/CharacterExplanations.tsx';
import type {ReadingExplanation as Entry} from '../../src/shared/readingExplanation.ts';
const entry:Entry={key:{system:'cilin',character:'长',sourceCandidateId:'2-P-a',groupId:'cilin-2',tone:'ping'},senses:[{id:'a',meaning:'长远',usage:'表示距离',sourceIds:['s'],examples:[{text:'长江',sourceId:'s',locator:'OEBPS/Text/a.html'}]}],status:'partial',version:'test'};
test('shows sourced senses without leaking technical paths or inventing unavailable definitions',()=>{
 const html=renderToStaticMarkup(<ReadingExplanation entry={entry}/>);
 assert.ok(html.includes('长远'));assert.ok(!html.includes('例句与出处'));assert.ok(!html.includes('OEBPS'));assert.ok(!html.includes('诗词格律'));
 const empty=renderToStaticMarkup(<ReadingExplanation entry={{...entry,status:'unavailable',senses:[]}}/>);assert.ok(empty.includes('暂无释义资料'));assert.ok(!empty.includes('长远'));
});
test('aggregate ci option retains multiple raw senses but excludes different tone/system/character',()=>{
 const values=[entry,{...entry,key:{...entry.key,sourceCandidateId:'2-P-b'}},{...entry,key:{...entry.key,tone:'qu' as const}},{...entry,key:{...entry.key,system:'pingshui' as const}},{...entry,key:{...entry.key,character:'重'}}];
 assert.equal(matchingExplanations(values,'cilin','长',{id:'2-ping',groupId:'cilin-2',tone:'ping',label:'平声 · 第二部'}).length,2);
 assert.equal(matchingExplanations(values,'cilin','长',{id:'one',sourceCandidateId:'2-P-a',groupId:'cilin-2',tone:'ping',label:'平声'}).length,1);
});
