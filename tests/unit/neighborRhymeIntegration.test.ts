import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyzePoem, type MetreDataset, type AnalyzePoemOptions } from '../../src/poetry/analysis/poemAnalyzer.ts';
import type { PingzeDataset, ReadingRulesDataset } from '../../src/poetry/analysis/readingResolver.ts';
const load = <T>(name: string): T => JSON.parse(readFileSync(`src/rules/${name}.json`, 'utf8'));
const metre=load<MetreDataset>('metre'), pingze=load<PingzeDataset>('pingze'), rules=load<ReadingRulesDataset>('reading_rules');
const poem='洛阳城里见秋风，欲作家书意万重。复恐匆匆说不尽，行人临发又开封。';
const overrides=[{lineIndex:1,characterIndex:6,character:'重',candidateId:'重:ping-02dong'},{lineIndex:3,characterIndex:6,character:'封',candidateId:'封:ping-02dong'}];
const run=(text=poem, options: Partial<AnalyzePoemOptions>={}, data=pingze)=>analyzePoem(text,metre,data,rules,{templateId:'qijue',variantId:'pingqi-first-rhymed',overrides,...options});
test('秋思 strict rejects different groups; explicit mode keeps original first group and body reference',()=>{
 const strict=run(); assert.equal(strict.rhyme.status,'mismatch'); assert.equal(strict.rhyme.firstLineBorrow,undefined);
 const enabled=run(poem,{firstLineRhyme:'sourced-neighbor'});
 assert.equal(enabled.rhyme.status,'compatible');
 assert.equal(enabled.rhyme.firstLineBorrow?.status,'confirmed');
 assert.equal(enabled.rhyme.firstLineBorrow?.firstGroupId,'ping-01dong');
 assert.equal(enabled.rhyme.firstLineBorrow?.mainGroupId,'ping-02dong');
 assert.equal(enabled.rhyme.feet[0].selectedGroupId,'ping-01dong');
 assert.deepEqual(enabled.rhyme.commonGroupIds,['ping-02dong']);
 assert.deepEqual(enabled.rhyme.evidence.comparedLineIndexes,[1,3]);
 assert.equal(enabled.issues.find(issue=>issue.code==='FIRST_LINE_BORROW')?.severity,'info');
 assert.equal(enabled.issues.some(issue=>issue.code==='RHYME_GROUP'),false);
});
test('mode cannot waive body mismatch, non-neighbor or an unknown first foot',()=>{
 const body=run(poem.replace('又开封','又开风'),{firstLineRhyme:'sourced-neighbor',overrides:overrides.slice(0,1)});
 assert.equal(body.rhyme.status,'mismatch'); assert.equal(body.rhyme.firstLineBorrow,undefined);
 const other=run(poem.replace('见秋风','见秋天'),{firstLineRhyme:'sourced-neighbor'});
 assert.equal(other.rhyme.status,'mismatch'); assert.equal(other.rhyme.firstLineBorrow,undefined);
 const { 龘: _removed, ...characters }=pingze.characters;
 const unknown=run(poem.replace('见秋风','见秋龘'),{firstLineRhyme:'sourced-neighbor'},{...pingze,characters});
 assert.equal(unknown.rhyme.firstLineBorrow,undefined); assert.equal(unknown.rhyme.status,'unknown');
});
test('non-rhyming first-line variant never activates borrowing',()=>{
 assert.equal(run(poem,{variantId:'pingqi-first-unrhymed',firstLineRhyme:'sourced-neighbor'}).rhyme.firstLineBorrow,undefined);
 assert.equal(run(poem,{firstLineRhyme:'strict'}).rhyme.firstLineBorrow,undefined);
});
