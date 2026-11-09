import type { WorkAssistanceState, RhymeReference } from "../../shared/assistanceState";
import type { PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";
import type { CiAnalysis } from "../../ci/analyze";

export interface RhymeGroupEvidence {
  segmentId: string; system: "pingshui" | "cilin"; groupIds: string[]; lineIndexes: number[]; borrowMainGroupId?: string;
}
export const ciSegmentId = (formId: string, key: string) => `ci:${formId}:${key}`;
/** The first written legal rhyme foot supplies the initial direction; conflicts do not silently change it. */
export function getRhymeGroups(input: {kind:"metre";value:PoemAnalysis} | {kind:"ci";value:CiAnalysis;formId:string}): RhymeGroupEvidence[] {
  if (input.kind === "metre") {
    const feet = metreReferenceFeet(input.value);
    return [{segmentId:"poem",system:"pingshui",borrowMainGroupId:feet[0]?.borrowMainGroupId,groupIds:feet[0]?.borrowMainGroupId ? [feet[0].borrowMainGroupId] : feet.find(f=>f.groupIds.length===1)?.groupIds ?? [],lineIndexes:feet.map(f=>f.line)}];
  }
  return input.value.feet.map(segment=>({segmentId:ciSegmentId(input.formId,segment.key),system:"cilin",
    groupIds:[...new Set(segment.items.find(f=>new Set(f.options.map(o=>o.group)).size===1)?.options.map(o=>`cilin-${o.group}`) ?? [])],
    lineIndexes:segment.items.map(f=>f.line)}));
}
export function resolveRhymeReference(state: WorkAssistanceState | undefined, groups: RhymeGroupEvidence[], lines: readonly string[], available: ReadonlySet<string>): {active:RhymeReference[];invalid:RhymeReference[]} {
  const active:RhymeReference[]=[],invalid:RhymeReference[]=[];
  for(const reference of state?.references ?? []) {
    const group=groups.find(g=>g.segmentId===reference.segmentId && g.system===reference.system),a=reference.anchor;
    if(!group || !available.has(reference.groupId) || (a && (lines[a.line]!==a.source || a.source.slice(a.offset,a.offset+a.character.length)!==a.character))) invalid.push(reference);
    else active.push(reference.mode === "automatic" && group.borrowMainGroupId && available.has(group.borrowMainGroupId)
      ? {...reference, groupId:group.borrowMainGroupId} : reference);
  }
  for(const group of groups) {
    if(active.some(r=>r.segmentId===group.segmentId)) continue;
    const id=group.groupIds.find(id=>available.has(id));
    if(id) {
      const index=active.findIndex(r=>r.segmentId===group.segmentId);
      if(index>=0) active.splice(index,1);
      active.push({segmentId:group.segmentId,system:group.system,groupId:id,mode:"automatic"});
    }
  }
  return {active,invalid};
}
export function referenceFootStatus(groupId:string | null, candidates:readonly string[], borrowMainGroupId?:string):"match"|"mismatch"|"pending" {
  if(groupId && groupId===borrowMainGroupId) return "match";
  if(!groupId || !candidates.length) return "pending";
  if(!candidates.includes(groupId)) return "mismatch";
  return new Set(candidates).size===1 ? "match" : "pending";
}


export interface ReferenceFoot {line:number;character:string;groupIds:string[];borrowMainGroupId?:string}
// Use the resolved reading for display, including an explicitly chosen non-ping reading.
// Unconfirmed rhyme candidates retain the analyser's scope; browsing never selects a reading.
export function metreReferenceFeet(analysis:PoemAnalysis):ReferenceFoot[] {
 return analysis.rhyme.feet.map(foot=>{
  const character=analysis.lines?.find(l=>l.lineIndex===foot.lineIndex)?.characters.at(-1);
  const selected=character?.character===foot.character?character?.reading.selectedCandidate:null;
  const borrow = analysis.rhyme.firstLineBorrow;
  const borrowMainGroupId = foot.lineIndex===0 && borrow?.status==="confirmed" ? borrow.mainGroupId : undefined;
  return {borrowMainGroupId,line:foot.lineIndex,character:foot.character??"",groupIds:selected?[selected.rhymeGroupId]:foot.candidateGroupIds};
 });
}
