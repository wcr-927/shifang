import { z } from 'zod';

const text=z.string().trim().min(1);
const toneLetters={ping:'P',shang:'S',qu:'Q',ru:'R'} as const;
export const readingEvidenceKeySchema=z.object({
 system:z.enum(['pingshui','cilin']),
 character:z.string().refine(value=>Array.from(value).length===1&&/^\p{Script=Han}$/u.test(value),'Expected one Han character'),
 sourceCandidateId:text,groupId:text,tone:z.enum(['ping','shang','qu','ru']),
}).strict().superRefine((key,context)=>{
 const valid=key.system==='pingshui'
  ? key.sourceCandidateId===`${key.character}:${key.groupId}`&&key.groupId.startsWith(`${key.tone}-`)
  : /^cilin-([1-9]|1[0-9])$/.test(key.groupId)&&key.sourceCandidateId.startsWith(`${key.groupId.slice(6)}-${toneLetters[key.tone]}-`);
 if(!valid)context.addIssue({code:z.ZodIssueCode.custom,message:'Candidate, system, group and tone do not match'});
});
export type ReadingEvidenceKey=z.infer<typeof readingEvidenceKeySchema>;
export const readingSourceSchema=z.object({
 id:text,title:text,edition:text,locator:text,
 fingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 url:z.string().url().refine(value=>/^https?:\/\//.test(value),'Expected HTTP source URL').optional(),
}).strict();
export type ReadingSource=z.infer<typeof readingSourceSchema>;
const senseSchema=z.object({
 id:text,meaning:text,usage:text,sourceIds:z.array(text).min(1),
 examples:z.array(z.object({text,sourceId:text,locator:text,
  evidenceKind:z.enum(['source-note','meaning-context','reading-context']).optional(),
 }).strict()),
 readingEvidence:z.array(z.object({sourceId:text,locator:text,note:text}).strict()).optional(),
}).strict();
export const readingExplanationSchema=z.object({
 key:readingEvidenceKeySchema,senses:z.array(senseSchema),status:z.enum(['verified','partial','unavailable']),version:text,
}).strict();
export type ReadingExplanation=z.infer<typeof readingExplanationSchema>;
export const readingExplanationBundleSchema=z.object({
 version:text,sources:z.array(readingSourceSchema),entries:z.array(readingExplanationSchema),
}).strict().superRefine((bundle,context)=>{
 const fail=(message:string)=>context.addIssue({code:z.ZodIssueCode.custom,message});
 const sources=new Set(bundle.sources.map(source=>source.id));
 if(sources.size!==bundle.sources.length)fail('Duplicate source ID');
 const keys=new Set<string>();
 for(const entry of bundle.entries){
  const key=readingEvidenceKeyId(entry.key);
  if(keys.has(key))fail('Duplicate explanation key: '+key);keys.add(key);
  if(entry.version!==bundle.version)fail('Entry version differs from bundle');
  if(entry.status==='unavailable'&&entry.senses.length)fail('Unavailable entry must have no senses');
  if(entry.status!=='unavailable'&&!entry.senses.length)fail('Available entry must explain a sense');
  if(new Set(entry.senses.map(s=>s.id)).size!==entry.senses.length)fail('Duplicate sense ID');
  for(const sense of entry.senses){
   if(sense.sourceIds.some(id=>!sources.has(id)))fail('Unknown sense source');
   if(entry.status==='verified'){
    if(!sense.examples.some(e=>e.evidenceKind==='meaning-context'||e.evidenceKind==='reading-context'))fail('Verified sense needs a real context, not only a source note');
    if(!sense.readingEvidence?.length)fail('Verified sense needs separate meaning-and-tone evidence');
   }
   for(const evidence of sense.readingEvidence??[])if(!sources.has(evidence.sourceId)||!sense.sourceIds.includes(evidence.sourceId))fail('Reading evidence source is missing from sense sources');
   for(const example of sense.examples){
    if(!sources.has(example.sourceId)||!sense.sourceIds.includes(example.sourceId))fail('Example source is missing from sense sources');
    if(!example.text.includes(entry.key.character))fail('Example does not contain the exact character');
   }
  }
 }
});
export type ReadingExplanationBundle=z.infer<typeof readingExplanationBundleSchema>;

/** JSON encoding avoids delimiter collisions in raw dictionary IDs. */
export function readingEvidenceKeyId(key:ReadingEvidenceKey):string{
 return JSON.stringify([key.system,key.character,key.sourceCandidateId,key.groupId,key.tone]);
}
/** Structural validation alone cannot establish whether a reading exists in the current dictionary. */
export function validateReadingExplanationBundle(value:unknown,availableKeys:readonly ReadingEvidenceKey[]):ReadingExplanationBundle{
 const bundle=readingExplanationBundleSchema.parse(value);
 const known=new Set(availableKeys.map(key=>readingEvidenceKeyId(readingEvidenceKeySchema.parse(key))));
 for(const entry of bundle.entries)if(!known.has(readingEvidenceKeyId(entry.key)))throw new Error('Unknown dictionary reading: '+readingEvidenceKeyId(entry.key));
 return bundle;
}
