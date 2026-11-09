import {readFileSync} from 'node:fs';
import type {ReferenceRuleService} from './ReferenceRuleService.ts';
import {referenceLookupSchema,type ReferenceSystem} from '../../src/shared/reference.ts';
import {readingExplanationBundleSchema,validateReadingExplanationBundle,readingEvidenceKeyId,type ReadingExplanationBundle,type ReadingEvidenceKey} from '../../src/shared/readingExplanation.ts';
import {getReadingExplanation} from '../../src/poetry/reference/readingExplanations.ts';
const tones:Record<string,ReadingEvidenceKey['tone']>={平声:'ping',上声:'shang',去声:'qu',入声:'ru'};

export class ReadingExplanationService {
 private bundle:ReadingExplanationBundle|undefined;
 private cache=new Map<string,ReadingExplanationBundle>();
 constructor(private rules:ReferenceRuleService,private path:string){}
 lookup(raw:{system:ReferenceSystem;character:string}):ReadingExplanationBundle{
  const request=referenceLookupSchema.parse(raw);
  // Rule lookup validates the complete Unicode scalar and remains independent of explanation loading.
  const readings=this.rules.lookup(request).readings;
  if(!this.bundle)this.bundle=readingExplanationBundleSchema.parse(JSON.parse(readFileSync(this.path,'utf8')));
  const version=this.bundle.version,cacheKey=JSON.stringify([request.system,request.character,version]);
  const cached=this.cache.get(cacheKey);if(cached)return structuredClone(cached);
  const keys=readings.map(reading=>{
   const tone=tones[reading.tone];if(!tone)throw new Error('Unknown ancient tone');
   return {system:request.system,character:request.character,sourceCandidateId:reading.id,groupId:reading.groupId,tone};
  });
  const unique=[...new Map(keys.map(key=>[readingEvidenceKeyId(key),key])).values()];
  const scoped=validateReadingExplanationBundle({...this.bundle,entries:this.bundle.entries.filter(e=>e.key.system===request.system&&e.key.character===request.character)},unique);
  const entries=unique.map(key=>getReadingExplanation(scoped,key));
  const sourceIds=new Set(entries.flatMap(e=>e.senses.flatMap(s=>s.sourceIds)));
  const response={version,entries,sources:scoped.sources.filter(s=>sourceIds.has(s.id))};
  if(this.cache.size>=128)this.cache.delete(this.cache.keys().next().value!);
  this.cache.set(cacheKey,response);return structuredClone(response);
 }
}
