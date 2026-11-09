import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decodeVerseBody,encodeVerseBody,replaceVerseSelection} from '../../src/features/editor/verseDocument.ts';
const range={anchor:{line:0,offset:2},head:{line:1,offset:2}};
test('cross sentence delete and replacement preserve fixed sentence slots and suffixes',()=>{const lines=['缺月挂疏桐','漏断人初静'];assert.deepEqual(replaceVerseSelection(lines,range,'').lines,['缺月','人初静']);assert.deepEqual(replaceVerseSelection(lines,range,'清风').lines,['缺月清风','人初静']);assert.deepEqual(replaceVerseSelection(lines,{anchor:range.head,head:range.anchor},'清风').lines,['缺月清风','人初静']);});
test('all selection clears contents but preserves middle and last slots',()=>{assert.deepEqual(replaceVerseSelection(['甲','','乙'],{anchor:{line:0,offset:0},head:{line:2,offset:1}},'').lines,['','','']);});
test('surrogate boundaries never produce invalid Unicode',()=>{assert.deepEqual(replaceVerseSelection(['甲𠀀乙'],{anchor:{line:0,offset:2},head:{line:0,offset:3}},'').lines,['甲乙']);assert.deepEqual(replaceVerseSelection(['𠀀'],{anchor:{line:0,offset:1},head:{line:0,offset:1}},'春').lines,['春𠀀']);});
test('decode/encode preserve whitespace and trailing empty lines without persisting virtual slots',()=>{for(const body of ['','  甲\n\n末行  \n','𠀀\n\n']){const decoded=decodeVerseBody(body,8);assert.equal(decoded.lines.length,8);assert.equal(encodeVerseBody(decoded),body);}const decoded=decodeVerseBody('',8);decoded.lines[3]='春';assert.equal(encodeVerseBody(decoded),'\n\n\n春');});
test('multiline replacement inserts into successive slots without destroying unselected text',()=>{assert.deepEqual(replaceVerseSelection(['甲乙丙','丁戊己','庚'],{anchor:{line:0,offset:1},head:{line:1,offset:1}},'春\n秋').lines,['甲春','秋戊己','庚']);});
