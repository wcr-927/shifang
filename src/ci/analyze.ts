import { VERSE_GAP } from '../shared/verseGap';
import { ciRuleData } from './catalogue';
import type { CiForm } from './catalogue';
import type { CiState, CiChoice } from './schema';
export type Tone='P'|'S'|'Q'|'R';
export interface Reading {id:string;group:number;tone:Tone;subgroup:string;gloss:string}
export const rhymeVersion=ciRuleData.dictionary.version;
const dictionary=ciRuleData.dictionary.readings as Record<string,Reading[]>;
export const toneName:Record<Tone,string>={P:'平',S:'上',Q:'去',R:'入'};
export function candidates(character:string):Reading[]{
 const result=new Map<string,Reading>();
 for(const r of dictionary[character]??[]) {const id=`${r.group}-${r.tone}`;const old=result.get(id);result.set(id,{...r,id,gloss:[old?.gloss,r.gloss].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('；')});}
 return [...result.values()];
}
export function sourceCharacters(source:string){const chars:{character:string;offset:number}[]=[];let offset=0;for(const character of source){if(character===VERSE_GAP||/\p{Script=Han}/u.test(character))chars.push({character,offset});offset+=character.length;}return chars;}
export type IssueKind='incomplete'|'pending'|'conflict'|'uncovered';
export interface CiIssue {code?:'rhyme-group'|'rhyme-pending';segment?:string;kind:IssueKind;line:number;offset?:number;message:string}
export function analyzeCi(body:string,form:CiForm,state:CiState){
 const lines=body.split('\n'),issues:CiIssue[]=[];
 const readings: {line:number;offset:number;character:string;source:string;options:Reading[];selected?:Reading}[]=[];
 const feet=new Map<string,Array<{line:number;options:Reading[]}>>();
 const valid=(c:CiChoice)=>lines[c.line]===c.source && c.source.slice(c.offset,c.offset+c.character.length)===c.character && candidates(c.character).some(r=>r.id===c.candidate);
 const stale=state.choices.filter(c=>!valid(c));
 if(state.version!==form.version || state.rhymeVersion!==rhymeVersion)issues.push({kind:'uncovered',line:0,message:'保存时规则版本与当前不同，请重新核对读音与谱式。'});
 for(const c of stale)issues.push({kind:'pending',line:c.line,message:'原文或候选已变化，旧读音选择未参与校对。'});
 form.lines.forEach((rule,line)=>{
  const source=lines[line]??'',chars=sourceCharacters(source);
  if(chars.length!==rule.pattern.length)issues.push({kind:chars.length<rule.pattern.length?'incomplete':'conflict',line,message:`第${line+1}句 ${chars.length}/${rule.pattern.length}字${chars.length>rule.pattern.length?'，超出谱式':''}`});
  if(/[^\p{Script=Han}\p{P}\s]/u.test(source))issues.push({kind:'uncovered',line,message:'含非汉字内容，原文保留，该部分未作声韵校对。'});
  chars.forEach((c,index)=>{
   if(c.character===VERSE_GAP){readings.push({line,...c,source,options:[]});issues.push({kind:'incomplete',line,offset:c.offset,message:`第${line+1}句第${index+1}字待填。`});return;}
   const options=candidates(c.character),choice=state.choices.find(x=>x.line===line&&x.offset===c.offset&&valid(x)),selected=options.find(r=>r.id===choice?.candidate),active=selected?[selected]:options;
   readings.push({line,...c,source,options,selected});
   const expected=rule.pattern[index];
   if(!expected)return;
   const fits=(r:Reading)=>expected==='A'||(expected==='P'?r.tone==='P':expected==='I'?r.tone==='P'||r.tone==='R':r.tone!=='P');
   if(!options.length)issues.push({kind:'uncovered',line,offset:c.offset,message:`“${c.character}”未收录于当前词韵字表，不能判为合律。`});
   else if(!active.some(fits))issues.push({kind:'conflict',line,offset:c.offset,message:`“${c.character}”与此处${expected==='P'?'平声':expected==='I'?'平/入声':'仄声'}要求冲突。`});
   else if(!active.every(fits))issues.push({kind:'pending',line,offset:c.offset,message:`“${c.character}”有多种声调，请按字义确认。`});
   if(index===rule.pattern.length-1 && chars.length===rule.pattern.length && rule.rhyme){
    const list=feet.get(rule.rhyme)??[];list.push({line,options:active});feet.set(rule.rhyme,list);
   }
  });
 });
 for(let line=form.lines.length;line<lines.length;line++)issues.push({kind:'uncovered',line,message:`第${line+1}行超出所选谱式，原文保留并可继续编辑。`});
 for(const [group,items]of feet){
  // Unknown feet provide no group evidence, but cannot undo a conflict among known feet.
  const known=items.filter(f=>f.options.length>0);
  if(!known.length)continue;
  let common=new Set(known[0].options.map(r=>r.group));for(const f of known)common=new Set([...common].filter(g=>f.options.some(r=>r.group===g)));
  if(known.length>1 && !common.size){
   const gap=form.sourceRhymeGaps?.find(g=>g.rhyme===group);
   const inGap=(r:Reading)=>!!gap&&r.tone===gap.tone&&gap.groups.includes(r.group);
   if(gap&&known.length===items.length&&known.every(f=>f.options.some(inGap))){
    const ambiguous=known.some(f=>f.options.length>1);
    issues.push({code:ambiguous?'rhyme-pending':'rhyme-group',segment:group,kind:ambiguous?'pending':'uncovered',line:known.at(-1)!.line,message:ambiguous?`韵组${group.toUpperCase()}含多种读音，请先确认；此谱例另有来源分部差异，不能自动判定。`:gap.note});
   }else issues.push({code:'rhyme-group',segment:group,kind:'conflict',line:known.at(-1)!.line,message:`韵组${group.toUpperCase()}的韵脚不属《词林正韵》同部。`});
  }
  else if(known.length!==items.length)continue;
  else if(items.some(f=>new Set(f.options.map(r=>r.group)).size>1))issues.push({code:'rhyme-pending',segment:group,kind:'pending',line:items.at(-1)!.line,message:`韵组${group.toUpperCase()}含跨部读音，当前仅候选相容，须确认。`});
 }
 for(const [a,b]of form.repeat){const x=sourceCharacters(lines[a]??'').map(c=>c.character).join(''),y=sourceCharacters(lines[b]??'').map(c=>c.character).join('');if(x&&y&&x!==y)issues.push({kind:'conflict',line:a,message:`第${a+1}句须叠第${b+1}句；原文未修改。`});}
 for(const [a,b]of form.rhymeChanges){const left=feet.get(form.lines[a].rhyme!),right=feet.get(form.lines[b].rhyme!);if(!left?.length||!right?.length)continue;const x=new Set(left.flatMap(f=>f.options.map(r=>r.group))),y=new Set(right.flatMap(f=>f.options.map(r=>r.group)));if(x.size===1&&y.size===1&&[...x][0]===[...y][0])issues.push({kind:'conflict',line:b,message:'此处须换韵，当前仍用前一韵部。'});}
 return {issues,readings,feet:[...feet].map(([key,items])=>({key,items})),filled:form.lines.filter((_,i)=>sourceCharacters(lines[i]??'').length>0).length};
}

export type CiAnalysis = ReturnType<typeof analyzeCi>;
