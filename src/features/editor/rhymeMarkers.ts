import type { WorkAssistanceState } from '../../shared/assistanceState';
import type { ToneMarker } from './toneMarkers';
import { referenceFootStatus, resolveRhymeReference, type ReferenceFoot, type RhymeGroupEvidence } from './rhymeReference';
/** Compare with the same remembered dictionary direction shown in the rhyme panel. */
export function markerReference(state:WorkAssistanceState|undefined,evidence:RhymeGroupEvidence[],lines:string[],segment:string){
 const available=new Set([...evidence.flatMap(e=>e.groupIds),...(state?.references??[]).map(r=>r.groupId)]);
 return resolveRhymeReference(state,evidence,lines,available).active.find(r=>r.segmentId===segment)?.groupId??null;
}
export function withRhymeMarker(markers:ToneMarker[],source:string,foot:ReferenceFoot|undefined,groupId:string|null):ToneMarker[]{
 const last=markers.at(-1);
 if(!last||!foot?.character||!groupId||last.state==='empty'||source.slice(last.start,last.end)!==foot.character)return markers;
 // Never attach stale or overflow foot evidence to a different source position.
 if(/[\p{Script=Han}\u3000]/u.test(source.slice(last.end)))return markers;
 const rhymeState=referenceFootStatus(groupId,foot.groupIds,foot.borrowMainGroupId);
 if(rhymeState==='match')return markers;
 const state=rhymeState==='mismatch'?'conflict':last.state==='match'?'pending':last.state;
 return [...markers.slice(0,-1),{...last,state,rhymeState,message:`${last.message}；${rhymeState==='mismatch'?'韵部不符':'韵脚读音待确认'}`}];
}
