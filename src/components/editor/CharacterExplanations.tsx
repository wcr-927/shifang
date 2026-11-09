import { useReadingExplanations } from '../../features/reference/useReadingExplanations';
import type { ReadingExplanation as Entry, ReadingEvidenceKey } from '../../shared/readingExplanation';
import { readingEvidenceKeyId } from '../../shared/readingExplanation';
import { ReadingExplanation } from './ReadingExplanation';
export interface ExplanationCandidate{id:string;groupId:string;tone:ReadingEvidenceKey['tone'];sourceCandidateId?:string;label:string}
export function matchingExplanations(entries:Entry[],system:ReadingEvidenceKey['system'],character:string,candidate:ExplanationCandidate):Entry[]{
 return entries.filter(({key})=>key.system===system&&key.character===character&&key.groupId===candidate.groupId&&key.tone===candidate.tone&&(!candidate.sourceCandidateId||key.sourceCandidateId===candidate.sourceCandidateId));
}
export function CharacterExplanations({system,character,candidates,disabled=false}:{system:ReadingEvidenceKey['system'];character:string;candidates:ExplanationCandidate[];disabled?:boolean}):JSX.Element|null{
 const query=useReadingExplanations(!disabled&&candidates.length?{system,character}:null);
 if(query.status==='idle')return null;
 if(query.status==='loading')return <p className="explanation-unavailable" role="status">正在读取字义</p>;
 if(query.status==='error')return <div className="explanation-unavailable" role="status">{query.error} <button type="button" className="inline-action" onClick={query.retry}>重试</button></div>;
 if(query.status!=='ready')return null;
 const bundle=query.bundle;
 return <section className="character-explanations" aria-label={`${character}的字义解释`}>
  {candidates.map(candidate=>{const entries=matchingExplanations(bundle.entries,system,character,candidate);return <section className="explanation-candidate" key={candidate.id}>
   <h4>{candidate.label}</h4>{entries.length?entries.map(entry=><ReadingExplanation key={readingEvidenceKeyId(entry.key)} entry={entry}/>):<p className="explanation-unavailable">暂无释义资料</p>}
  </section>})}
 </section>;
}
