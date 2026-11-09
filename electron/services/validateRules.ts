import { z } from "zod";
import type { RuleBundle } from "./RuleService.js";
const text=z.string().min(1).refine(s=>s.trim().length>0);
const character=text.refine(s=>Array.from(s).length===1,"需要单个Unicode字符");
const toneCategory=z.enum(["ping","shang","qu","ru"]),toneType=z.enum(["ping","ze"]);
const dimension=z.object({status:z.enum(["resolved","ambiguous","not-evaluated","unknown"]),values:z.array(z.string())});
const candidate=z.object({id:text,toneType,toneCategory,rhymeGroupId:text,rhymeGroupName:text,glosses:z.array(z.string())});
const group=z.object({id:text,name:text,toneCategory,toneType,characters:z.array(character).min(1)});
const index=z.number().int().nonnegative();
const variant=z.object({id:text,name:text,style:text,patterns:z.array(text),flexiblePositions:z.array(z.array(index)),rhymePositions:z.array(index).min(1),note:z.string()});
const template=z.object({id:z.enum(["wujue","qijue","wulv","qilv"]),name:text,shortName:text,kind:z.enum(["jueju","lushi"]),lineCount:z.number().int(),lineLength:z.number().int(),rhymeTone:z.literal("ping"),recommendedVariantId:text,lineRoles:z.array(text),coupletPairs:z.array(z.array(index)).optional(),nianPositions:z.array(index).optional(),variants:z.array(variant).min(1)});
function unique(items: (string|number)[],name:string){if(new Set(items).size!==items.length)throw new Error(`${name} IDs or indexes must be unique`);}
function equalSet(a:string[],b:string[]){return a.length===b.length&&a.every(x=>b.includes(x));}
export function validateRules(bundle: Omit<RuleBundle, "datasetVersions">): Record<string, string> {
  const versions:Record<string,string>={};
  for(const name of ["rhyme","pingze","metre","readingRules"]as const){const version=bundle[name]?.datasetVersion;if(typeof version!=="string"||!version.trim())throw new Error(`${name} datasetVersion is required`);versions[name]=version;}
  const rhyme=z.object({schemaVersion:z.literal(1),groups:z.array(group).length(106),characterIndex:z.record(z.string(), z.array(text).min(1))}).parse(bundle.rhyme);
  const pingze=z.object({schemaVersion:z.literal(2),characters:z.record(z.string(), z.object({character,candidates:z.array(candidate).min(1),baseAmbiguity:z.object({tone:dimension,rhyme:dimension,modernPronunciation:dimension})}))}).parse(bundle.pingze);
  const metre=z.object({schemaVersion:z.literal(1),templates:z.array(template).length(4)}).parse(bundle.metre);
  const readings=z.object({schemaVersion:z.literal(1),rules:z.array(z.object({id:text,targetCharacter:character,phrase:text,targetOffset:index,candidateId:text,priority:z.number().int(),sourceGloss:z.string()})).min(1)}).parse(bundle.readingRules);
  unique(rhyme.groups.map(g=>g.id),"rhyme groups");
  const groups=new Map(rhyme.groups.map(g=>[g.id,g])), expectedIndex=new Map<string,string[]>();
  for(const g of rhyme.groups){
    if(g.toneType!==(g.toneCategory==="ping"?"ping":"ze"))throw new Error("rhyme tone category/type mismatch");
    unique(g.characters,"rhyme characters");for(const c of g.characters)expectedIndex.set(c,[...(expectedIndex.get(c)??[]),g.id]);
  }
  if(Object.keys(rhyme.characterIndex).length!==expectedIndex.size)throw new Error("rhyme character index is incomplete");
  for(const [c,ids]of Object.entries(rhyme.characterIndex)){character.parse(c);unique(ids,"rhyme character index");if(!equalSet(ids,expectedIndex.get(c)??[]))throw new Error("rhyme character index references invalid groups");}
  if(Object.keys(pingze.characters).length!==expectedIndex.size)throw new Error("pingze characters are incomplete");
  const candidateIds:string[]=[];
  for(const [c,entry]of Object.entries(pingze.characters)){
    if(entry.character!==c||!equalSet(entry.candidates.map(v=>v.rhymeGroupId),rhyme.characterIndex[c]??[]))throw new Error("character key or candidate index mismatch");
    for(const v of entry.candidates){candidateIds.push(v.id);const g=groups.get(v.rhymeGroupId);if(v.id!==`${c}:${v.rhymeGroupId}`||!g||!g.characters.includes(c)||v.toneType!==g.toneType||v.toneCategory!==g.toneCategory||v.rhymeGroupName!==g.name)throw new Error("candidate tone or rhyme reference mismatch");}
    for(const key of ["tone","rhyme"]as const){const d=entry.baseAmbiguity[key],values=[...new Set(entry.candidates.map(v=>key==="tone"?v.toneType:v.rhymeGroupId))];if(!equalSet(d.values,values)||d.status!==(values.length>1?"ambiguous":"resolved"))throw new Error("candidate ambiguity mismatch");}
  }
  unique(candidateIds,"reading candidates");unique(readings.rules.map(r=>r.id),"reading rules");
  for(const r of readings.rules){if(Array.from(r.phrase)[r.targetOffset]!==r.targetCharacter||!pingze.characters[r.targetCharacter]?.candidates.some(c=>c.id===r.candidateId))throw new Error("reading rule candidate or phrase reference mismatch");}
  unique(metre.templates.map(t=>t.id),"templates");
  for(const t of metre.templates){
    const length=t.id.startsWith("wu")?5:7,count=t.id.endsWith("jue")?4:8;
    if(t.lineCount!==count||t.lineLength!==length||t.kind!==(count===4?"jueju":"lushi")||t.lineRoles.length!==count)throw new Error("metre template dimensions mismatch");
    unique(t.variants.map(v=>v.id),"variants");if(!t.variants.some(v=>v.id===t.recommendedVariantId))throw new Error("recommended variant missing");
    for(const v of t.variants){
      if(v.patterns.length!==count||v.flexiblePositions.length!==count||v.patterns.some(p=>Array.from(p).length!==length||!/^[平仄]+$/u.test(p)))throw new Error("metre pattern characters or length invalid");
      for(const ps of v.flexiblePositions){unique(ps,"flexible positions");if(ps.some(i=>i>=length))throw new Error("flexible position out of range");}
      unique(v.rhymePositions,"rhyme positions");if(v.rhymePositions.some(i=>i>=count||v.patterns[i].at(-1)!=="平"))throw new Error("rhyme position out of range or wrong tone");
    }
    for(const pair of t.coupletPairs??[]){if(pair.length!==2||pair.some(i=>i>=count)||pair[0]===pair[1])throw new Error("couplet indexes invalid");}
    if(t.nianPositions){unique(t.nianPositions,"nian positions");if(t.nianPositions.some(i=>i===0||i>=count))throw new Error("nian position out of range");}
  }
  return versions;
}
