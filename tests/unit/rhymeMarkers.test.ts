import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {analyzePoem} from '../../src/poetry/analysis/poemAnalyzer';
import {metreToneMarkers} from '../../src/features/editor/toneMarkers';
import {metreReferenceFeet} from '../../src/features/editor/rhymeReference';
import {withRhymeMarker} from '../../src/features/editor/rhymeMarkers';
const data=(name:string)=>JSON.parse(readFileSync(`src/rules/${name}.json`,'utf8'));
const lines=['风急天高猿啸哀','渚清沙白鸟飞回','无边落木萧萧下','不尽长江滚滚来','万里悲秋常作客','百年多病独登台','艰难苦恨繁霜鬓','潦倒新停浊酒杯'];
test('a selected ping reading outside 十灰 marks only the rhyme position red, and reverts with the matching reading',()=>{
 const pingze=data('pingze');
 for(const group of ['ping-04zhi','ping-10hui']){
 const candidate=pingze.characters['台'].candidates.find((c:any)=>c.rhymeGroupId===group);assert.ok(candidate);
 const a=analyzePoem(lines.join('\n'),data('metre'),pingze,data('reading_rules'),{templateId:'qilv',editorLines:lines,overrides:[{lineIndex:5,characterIndex:6,character:'台',candidateId:candidate.id,sourceText:lines[5],sourceOffset:6}]});
 const line=a.lines[5],tone=metreToneMarkers(lines[5],line,line.expectedPattern);assert.equal(tone[6].state,'match');
 const result=withRhymeMarker(tone,lines[5],metreReferenceFeet(a).find(f=>f.line===5),'ping-10hui');assert.equal(result[6].state,group==='ping-10hui'?'match':'conflict');assert.deepEqual(result.slice(0,6),tone.slice(0,6));
 }
});
test('ambiguous, empty and non-rhyme positions are not falsely marked as definite rhyme errors',()=>{
 const tone:any=[{start:0,end:1,expected:'平',state:'match',kind:'tone',message:'平仄符合'}];
 assert.equal(withRhymeMarker(tone,'台',{line:0,character:'台',groupIds:['a','b']},'a')[0].state,'pending');
 assert.deepEqual(withRhymeMarker(tone,'台',undefined,'a'),tone);
 assert.deepEqual(withRhymeMarker([{...tone[0],state:'empty'}],'　',{line:0,character:'',groupIds:[]},'a'),[{...tone[0],state:'empty'}]);
});
