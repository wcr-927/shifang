import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuleService} from '../../electron/services/RuleService.ts';
import {ReferenceRuleService} from '../../electron/services/ReferenceRuleService.ts';
import {ReadingExplanationService} from '../../electron/services/ReadingExplanationService.ts';
const rules=new ReferenceRuleService(new RuleService('src/rules'),'src/ci');
const path='src/rules/reading_explanations.json';
test('sample explanations retain the dictionary key and do not mutate cached entries',()=>{
 const service=new ReadingExplanationService(rules,path);
 const lookup=()=>service.lookup({system:'pingshui',character:'长'}).entries.find(e=>e.key.sourceCandidateId==='长:shang-22yang')!;
 const entry=lookup();assert.equal(entry.senses[0].meaning,'年纪较大。');
 entry.senses[0].meaning='changed';assert.equal(lookup().senses[0].meaning,'年纪较大。');
});
test('uncovered characters retain original candidates with unavailable explanations',()=>{
 const service=new ReadingExplanationService(rules,path),before=rules.lookup({system:'pingshui',character:'山'});
 const result=service.lookup({system:'pingshui',character:'山'});
 assert.equal(result.entries.length,before.readings.length);
 assert.ok(result.entries.every(e=>e.status==='unavailable'&&e.senses.length===0));
 assert.deepEqual(rules.lookup({system:'pingshui',character:'山'}),before);
 assert.deepEqual(service.lookup({system:'pingshui',character:'𠮷'}).entries,[]);
 assert.throws(()=>service.lookup({system:'pingshui',character:'\ud840'}));
});
test('missing explanation data can be retried and does not damage independent rule lookup',()=>{
 const temporary=join(mkdtempSync(join(tmpdir(),'reading-explanation-')),'explanations.json');
 const service=new ReadingExplanationService(rules,temporary);
 assert.throws(()=>service.lookup({system:'pingshui',character:'看'}));
 assert.equal(rules.lookup({system:'pingshui',character:'看'}).readings.length,2);
 writeFileSync(temporary,readFileSync(path));assert.equal(service.lookup({system:'pingshui',character:'看'}).entries.length,2);
});
