import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isTrustedDocument,productionCsp,developmentCsp} from '../../electron/securityPolicy.ts';
import {poemReviewItem,ciReviewItem} from '../../src/components/editor/reviewPresentation.ts';
import {analyzeFixture} from '../helpers/analysisFixture.ts';
test('trusted document accepts only its own hash routes, not origin/path/query lookalikes',()=>{
 for(const document of ['file:///app/dist/index.html','http://127.0.0.1:5173/']){
  assert.equal(isTrustedDocument(document+'#/works',document),true);
  for(const bad of ['https://evil.invalid/','about:blank','javascript:alert(1)',document+'?other=1',document+'/../other.html','file:///tmp/other.html','http://127.0.0.1:5174/','http://127.0.0.1:5173.evil.invalid/'])assert.equal(isTrustedDocument(bad,document),false);
 }
});
test('production rejects executable inline/eval/frame content and dev HMR has a single loopback port',()=>{
 const directives=(policy:string)=>{
  const result=new Map<string,Set<string>>();
  for(const part of policy.split(';').filter(part=>part.trim())){
   const [name,...tokens]=part.trim().split(/\s+/);
   assert.equal(result.has(name),false,`Duplicate CSP directive: ${name}`);
   result.set(name,new Set(tokens));
  }
  return result;
 };
 const production=directives(productionCsp),development=directives(developmentCsp);
 for(const [policy,isDevelopment] of [[production,false],[development,true]] as const){
  for(const tokens of policy.values())for(const token of tokens){assert.notEqual(token,"'unsafe-eval'");assert.doesNotMatch(token,/\*/);if(token==="'unsafe-inline'")assert.equal(isDevelopment,true);}
  for(const directive of ['default-src','font-src'])assert.deepEqual(policy.get(directive),new Set(["'self'"]));
  for(const directive of ['script-src','style-src'])assert.deepEqual(policy.get(directive),new Set(isDevelopment?["'self'","'unsafe-inline'"]:["'self'"]));
  assert.deepEqual(policy.get('img-src'),new Set(["'self'",'data:']));
  for(const directive of ['object-src','base-uri','frame-src','form-action'])assert.deepEqual(policy.get(directive),new Set(["'none'"]));
 }
 assert.deepEqual(production.get('connect-src'),new Set(["'none'"]));
 assert.deepEqual(development.get('connect-src'),new Set(["'self'",'ws://127.0.0.1:5173']));
});
test('review display preserves candidate uncertainty, uncovered and incomplete separately from definite conflicts',()=>{
 const analysis=analyzeFixture(['春','','','']);
 for(const issue of analysis.issues){const item=poemReviewItem(issue,analysis);assert.equal(item.message,issue.message);assert.equal(item.source.system,'metre');assert.equal(item.coordinateSpace,'normalized-character');if(issue.code==='LINE_LENGTH'||issue.code==='LINE_COUNT')assert.equal(item.kind,'incomplete');}
 for(const [code,severity,kind] of [['TONE_MISMATCH','error','conflict'],['RULE_SCOPE_UNMODELED','warning','uncovered'],['RHYME_CANDIDATES_DISJOINT','warning','pending']] as const)assert.equal(poemReviewItem({code,severity,message:'原结论'},analysis).kind,kind);
 for(const kind of ['conflict','pending','uncovered','incomplete'] as const){const item=ciReviewItem({kind,line:1,offset:3,message:'原结论'});assert.equal(item.kind,kind);assert.equal(item.message,'原结论');assert.equal(item.offset,3);assert.equal(item.source.system,'ci');assert.equal(item.coordinateSpace,'source-utf16');}
});
