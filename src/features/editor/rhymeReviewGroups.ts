import type { PoemAnalysis } from '../../poetry/analysis/poemAnalyzer';
import type { CiAnalysis } from '../../ci/analyze';
import type { RhymeReviewGroup } from '../../components/manuscript/RhymeReview';
function groupFeet(feet:Array<{id:string;name:string;line:number;offset?:number;character:string}>):RhymeReviewGroup[]{
 const groups=new Map<string,RhymeReviewGroup>();for(const foot of feet){if(!foot.character.trim())continue;const group=groups.get(foot.id)??{id:foot.id,name:foot.name,feet:[]};group.feet.push({line:foot.line,offset:foot.offset,character:foot.character});groups.set(foot.id,group)}return [...groups.values()];
}
export function metreRhymeReviewGroups(analysis:PoemAnalysis){
 return groupFeet(analysis.rhyme.feet.map(foot=>{const character=analysis.lines.find(l=>l.lineIndex===foot.lineIndex)?.characters.at(-1),id=foot.selectedGroupId;
 const candidate=character?.reading.candidates.find(c=>c.rhymeGroupId===id);
 return {id:id??'pending',name:id?(candidate?.rhymeGroupName??'韵部待核对'):'待确认',line:foot.lineIndex,offset:character?.characterIndex,character:foot.character??''};}));
}
export function ciRhymeReviewGroups(analysis:CiAnalysis,key:string){
 return groupFeet((analysis.feet.find(segment=>segment.key===key)?.items??[]).map(foot=>{const ids=[...new Set(foot.options.map(o=>o.group))],reading=analysis.readings.filter(r=>r.line===foot.line).at(-1);return {id:ids.length===1?String(ids[0]):'pending',name:ids.length===1?`第${ids[0]}部`:'待确认',line:foot.line,offset:reading?.offset,character:reading?.character??''}}));
}
