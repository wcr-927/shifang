import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readingEvidenceKeySchema,validateReadingExplanationBundle,type ReadingExplanationBundle,type ReadingEvidenceKey} from '../../src/shared/readingExplanation.ts';
import {getReadingExplanation} from '../../src/poetry/reference/readingExplanations.ts';
const key:ReadingEvidenceKey={system:'cilin',character:'行',sourceCandidateId:'11-Q-二十四敬',groupId:'cilin-11',tone:'qu'};
const source={id:'fixture',title:'Synthetic test source',edition:'test',locator:'test:1'};
function bundle():ReadingExplanationBundle{return {version:'test',sources:[source],entries:[{key,version:'test',status:'verified',senses:['学行','德行'].map((meaning,i)=>({id:'sense-'+i,meaning,usage:'Synthetic usage, not historical evidence',sourceIds:['fixture'],readingEvidence:[{sourceId:'fixture',locator:'test:tone',note:'Synthetic explicit tone evidence'}],examples:[{text:meaning,sourceId:'fixture',locator:'test:'+i,evidenceKind:'meaning-context' as const}]}))}]};}
test('explanation-does-not-collapse-cilin-senses',()=>{
 const data=validateReadingExplanationBundle(bundle(),[key]);
 assert.deepEqual(getReadingExplanation(data,key).senses.map(s=>s.meaning),['学行','德行']);
});
test('missing-sense-stays-unavailable; system, character and raw candidate all matter',()=>{
 const missing:ReadingEvidenceKey={system:'pingshui',character:'看',sourceCandidateId:'看:ping-14han',groupId:'ping-14han',tone:'ping'};
 const data=bundle();const before=structuredClone(data);const result=getReadingExplanation(data,missing);
 assert.deepEqual(result,{key:missing,status:'unavailable',senses:[],version:'test'});
 assert.deepEqual(data,before);
 assert.equal(getReadingExplanation(data,{...key,character:'敬'}).status,'unavailable');
});
test('source-reference-and-character-must-match',()=>{
 for(const change of [
  (b:ReadingExplanationBundle)=>{b.entries[0].senses[0].sourceIds=[];},
  (b:ReadingExplanationBundle)=>{b.entries[0].senses[0].examples[0].sourceId='missing';},
  (b:ReadingExplanationBundle)=>{b.entries[0].senses[0].examples[0].text='错误';},
  (b:ReadingExplanationBundle)=>{b.entries[0].senses[0].examples=[];},
  (b:ReadingExplanationBundle)=>{b.entries[0].version='stale';},
  (b:ReadingExplanationBundle)=>{b.entries[0].status='unavailable';},
  (b:ReadingExplanationBundle)=>{b.entries.push(structuredClone(b.entries[0]));},
  (b:ReadingExplanationBundle)=>{b.entries[0].senses[1].id=b.entries[0].senses[0].id;},
  (b:ReadingExplanationBundle)=>{b.sources.push(structuredClone(source));},
 ]){const b=bundle();change(b);assert.throws(()=>validateReadingExplanationBundle(b,[key]));}
 assert.throws(()=>validateReadingExplanationBundle(bundle(),[]),'unknown foreign key');
 for(const invalid of [{...key,character:'\ud840'},{...key,character:'行走'},{...key,tone:'ping'},{...key,groupId:'cilin-2'},{...key,system:'pingshui'}])assert.equal(readingEvidenceKeySchema.safeParse(invalid).success,false);
});
test('same raw ID in another character or system cannot borrow meanings',()=>{
 const other={...key,character:'敬'};const b=bundle();
 b.entries.push({...structuredClone(b.entries[0]),key:other,senses:[{id:'own',meaning:'Own meaning',usage:'Synthetic',sourceIds:['fixture'],readingEvidence:[{sourceId:'fixture',locator:'test:tone',note:'Synthetic explicit tone evidence'}],examples:[{text:'敬',sourceId:'fixture',locator:'test:own',evidenceKind:'meaning-context'}]}]});
 const valid=validateReadingExplanationBundle(b,[key,other]);
 assert.equal(getReadingExplanation(valid,other).senses[0].id,'own');
 assert.equal(getReadingExplanation(valid,key).senses.length,2);
});
test('query results cannot mutate the stored explanation or input key',()=>{
 const b=bundle();const before=structuredClone(b);const result=getReadingExplanation(b,key);
 result.senses[0].meaning='changed';result.key.character='敬';
 assert.deepEqual(b,before);assert.equal(key.character,'行');
});
test('a source-note alone must not be certified as contextual reading evidence',()=>{
 const b=bundle();for(const sense of b.entries[0].senses){sense.examples.forEach(e=>e.evidenceKind='source-note');}
 assert.throws(()=>validateReadingExplanationBundle(b,[key]));
 const noTone=bundle();delete noTone.entries[0].senses[0].readingEvidence;
 assert.throws(()=>validateReadingExplanationBundle(noTone,[key]));
 const missingSource=bundle();missingSource.entries[0].senses[0].readingEvidence![0].sourceId='absent';
 assert.throws(()=>validateReadingExplanationBundle(missingSource,[key]));
});
