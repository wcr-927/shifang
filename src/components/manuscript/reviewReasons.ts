import type { AnalysisIssue, PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";
const tone=(s:string)=>s==="ping"?"平":s==="ze"?"仄":s;
export function reviewReason(issue:AnalysisIssue,analysis:PoemAnalysis):string {
 const line=analysis.lines.find(l=>l.lineIndex===issue.lineIndex);
 const c=issue.characterIndex===undefined?undefined:line?.characters.find(c=>c.characterIndex===issue.characterIndex);
 if(issue.code==="TONE_MISMATCH"&&c)return `第${c.characterIndex+1}字“${c.character}”要求${tone(c.expectedTone??"")}声，当前读法为${c.actualTones.map(tone).join("／")}声。`;
 if(issue.code==="READING_UNRESOLVED"&&c){
  const choices=c.reading.allCandidates??c.reading.candidates;
  return choices.length?`“${c.character}”有${[...new Set(choices.map(r=>({ping:"平声",shang:"上声",qu:"去声",ru:"入声"})[r.toneCategory]+"·"+r.rhymeGroupName))].join("、")}读法，需按字义确认。`:`“${c.character}”尚无可用读音资料，不能判定平仄。`;
 }
 if(issue.code.includes("ISOLATED_PING")&&line){
 const uncertain=line.characters.filter(c=>c.actualTones.length>1).map(c=>`第${c.characterIndex+1}字“${c.character}”`);
 return `${line.expectedLength===7?"后五字":"本句"}${issue.code.startsWith("POSSIBLE")?"可能":"已"}形成“${line.isolatedPing.evidence.join("／")}”，触发当前孤平检查。${uncertain.length?"先确认"+uncertain.join("、")+"的读音。":""}`;
}
 if(issue.code.includes("TRIPLE_PING")&&line)return [`句末三字“${line.characters.slice(-3).map(c=>c.character).join("")}”：${line.characters.slice(-3).map(c=>c.actualTones.length===1?tone(c.actualTones[0]):"？").join("")}。`,...line.triplePingTail.evidence].join(" ");
 if(issue.code==="RHYME_UNRESOLVED"&&line){
  const foot=line.characters.at(-1),choices=foot?.reading.candidates??[];
  return foot?`韵脚“${foot.character}”：${choices.length?[...new Set(choices.map(r=>r.rhymeGroupName))].join("、"):"尚无可用资料"}。${choices.length>1?"需先确认读音。":issue.message}`:issue.message;
 }
 return issue.message;
}
