import { z } from "zod";
const text=z.string().min(1).refine(s=>s.trim().length>0),index=z.number().int().nonnegative();
const line=z.object({example:text,pattern:z.string().min(1).regex(/^[APZI]+$/u),rhyme:text.nullable(),rhymeTone:z.enum(["P","Z"]).nullable(),caesura:z.number().int().positive().nullable()});
const form=z.object({id:text,name:text,author:text,summary:text,total:z.number().int().positive(),sections:z.array(z.number().int().positive()).min(1),lines:z.array(line).min(1),repeat:z.array(z.array(index)),rhymeChanges:z.array(z.array(index)),source:text,book:text,version:text,scope:text,notes:z.string(),sourceRhymeGaps:z.array(z.object({rhyme:text,groups:z.array(z.number().int().min(1).max(19)).length(2),tone:z.literal("R"),source:z.string().url(),note:text})).max(1).optional()});
const cilin=z.object({version:text,source:text,readings:z.record(z.string(), z.array(z.object({id:text,group:z.number().int().min(1).max(19),tone:z.enum(["P","S","Q","R"]),subgroup:text,gloss:z.string()})).min(1))});
export function validateCiRules(rawForms:unknown, rawCilin:unknown){
 const forms=z.array(form).min(1).parse(rawForms),dictionary=cilin.parse(rawCilin);
 if(new Set(forms.map(f=>f.id)).size!==forms.length)throw new Error("词谱标识重复");
 if(!Object.keys(dictionary.readings).length)throw new Error("词韵字表为空");
 const subgroupReferences=new Map<string,string>();
 for(const [character,options]of Object.entries(dictionary.readings)){
  if(Array.from(character).length!==1)throw new Error("词韵字位或候选标识无效");
  for(const r of options){const reference=r.tone,previous=subgroupReferences.get(r.subgroup);if(previous&&previous!==reference)throw new Error("词韵子部引用不一致");subgroupReferences.set(r.subgroup,reference);if(r.id!==`${r.group}-${r.tone}-${r.subgroup}`||(r.group>=15)!==(r.tone==="R"))throw new Error("词韵候选声调或韵部引用不一致");}
 }
 for(const f of forms){
  if(f.sections.reduce((a,b)=>a+b,0)!==f.lines.length||f.lines.reduce((a,l)=>a+l.pattern.length,0)!==f.total)throw new Error("词谱分片句数或总字数不一致");
  for(const gap of f.sourceRhymeGaps??[])if(f.id!=="shuidiaogetou-sushi-qinding-v1"||gap.rhyme!=="c"||gap.groups.join(',')!=="18,19"||gap.source!==f.source||f.lines.filter(l=>l.rhyme===gap.rhyme).length!==2||f.lines.some(l=>l.rhyme===gap.rhyme&&l.rhymeTone!=="Z"))throw new Error("词谱来源差异范围无效");
  const rhymeTones=new Map<string,string>();
  for(const l of f.lines){
   if(Array.from(l.example).filter(c=>/\p{Script=Han}/u.test(c)).length!==l.pattern.length||(l.caesura!==null&&l.caesura>=l.pattern.length)||(l.rhyme===null)!==(l.rhymeTone===null))throw new Error("词谱句长、句读或韵脚无效");
   if(l.rhyme){const previous=rhymeTones.get(l.rhyme);if(previous&&previous!==l.rhymeTone&&f.id!=="xijiangyue-qinding-v1")throw new Error("词谱同韵组声调不一致");rhymeTones.set(l.rhyme,l.rhymeTone!);if(l.pattern.at(-1)!==l.rhymeTone&&l.pattern.at(-1)!=="A"&&!(l.pattern.at(-1)==="I"&&l.rhymeTone==="P"))throw new Error("词谱韵脚平仄不一致");}
  }
  for(const pair of [...f.repeat,...f.rhymeChanges])if(pair.length!==2||pair[0]===pair[1]||pair.some(i=>i>=f.lines.length))throw new Error("词谱叠句或换韵引用无效");
  for(const [a,b]of f.repeat)if(f.lines[a].pattern.length!==f.lines[b].pattern.length||f.lines[a].rhyme!==f.lines[b].rhyme)throw new Error("词谱叠句结构不一致");
  for(const [a,b]of f.rhymeChanges)if(!f.lines[a].rhyme||!f.lines[b].rhyme||f.lines[a].rhyme===f.lines[b].rhyme)throw new Error("词谱换韵组引用无效");
 }
 return {forms,dictionary};
}
export function loadCiRulesSafe(forms:unknown,cilin:unknown){try{return {...validateCiRules(forms,cilin),error:""};}catch{return {forms:[],dictionary:{version:"",readings:{}},error:"词谱或词韵数据校验未通过，校对暂停。已有正文仍可编辑、保存与导出。"};}}
