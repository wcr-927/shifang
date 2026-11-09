import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleService } from "../../electron/services/RuleService.ts";
import { validateRules } from "../../electron/services/validateRules.ts";
import { validateCiRules, loadCiRulesSafe } from "../../src/ci/validate.ts";
import forms from "../../src/ci/forms.json";
import cilin from "../../src/ci/cilin.json";
const valid=new RuleService(`${process.cwd()}/src/rules`).load();
test("runtime rules reject corrupted toneType, candidate references, patterns and rhyme indexes",()=>{
 for(const mutate of [(b:any)=>b.pingze.characters["一"].candidates[0].toneType="corrupt",(b:any)=>b.readingRules.rules[0].candidateId="missing",(b:any)=>b.metre.templates[0].variants[0].patterns[0]="平x",(b:any)=>b.rhyme.characterIndex["一"]=["missing"],(b:any)=>b.rhyme.groups[1].id=b.rhyme.groups[0].id,(b:any)=>b.metre.templates[0].variants[0].rhymePositions=[99],(b:any)=>b.pingze.characters["一"].candidates[0].toneCategory="ping",(b:any)=>b.metre.templates[2].nianPositions=[0]]){const damaged=structuredClone(valid);mutate(damaged);assert.throws(()=>validateRules(damaged));}
 assert.deepEqual(validateRules(valid),valid.datasetVersions);
});
test("all ci forms and cilin validate; corruption safely degrades without module failure",()=>{
 assert.equal(validateCiRules(forms,cilin).forms.length,forms.length);
 for(const mutate of [(f:any,c:any)=>f[0].sections=[99],(f:any,c:any)=>f[0].total++, (f:any,c:any)=>f[0].lines[0].pattern="BAD",(f:any,c:any)=>f[0].repeat=[[99,0]],(f:any,c:any)=>f[0].id=f[1].id,(f:any,c:any)=>c.readings["东"][0].group=50,(f:any,c:any)=>c.readings["东"][0].tone="X",(f:any,c:any)=>c.version=""]){const f=structuredClone(forms),c=structuredClone(cilin);mutate(f,c);assert.throws(()=>validateCiRules(f,c));const fallback=loadCiRulesSafe(f,c);assert.equal(fallback.forms.length,0);assert.ok(fallback.error);}
});
