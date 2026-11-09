import assert from "node:assert/strict";
import {test} from "node:test";
import {getRhymeGroups,resolveRhymeReference,referenceFootStatus,metreReferenceFeet,ciSegmentId} from "../../src/features/editor/rhymeReference.ts";
import {emptyAssistance,setRhymeReference,workAssistanceStateSchema} from "../../src/shared/assistanceState.ts";
test("manual reference does not jump with changed feet, automatic resumes on clear",()=>{
 const state=setRhymeReference(undefined,{segmentId:"poem",system:"pingshui",groupId:"hui",mode:"manual"},"poem");
 const groups=[{segmentId:"poem",system:"pingshui" as const,groupIds:["dong"],lineIndexes:[1]}];
 assert.equal(resolveRhymeReference(state,groups,[],new Set(["hui","dong"])).active[0].groupId,"hui");
 assert.equal(resolveRhymeReference(setRhymeReference(state,null,"poem"),groups,[],new Set(["hui","dong"])).active[0].groupId,"dong");
});
test("stale UTF16 anchor, unavailable group and foreign segment cannot be active",()=>{
 const ref={segmentId:"poem",system:"pingshui" as const,groupId:"hui",mode:"manual" as const,anchor:{line:0,offset:1,character:"𠀀",source:"甲𠀀"}};
 const state={...emptyAssistance(),references:[ref]},groups=[{segmentId:"poem",system:"pingshui" as const,groupIds:[],lineIndexes:[0]}];
 assert.equal(resolveRhymeReference(state,groups,["甲𠀀"],new Set(["hui"])).active.length,1);
 for(const [g,lines,available]of [[groups,["甲乙"],new Set(["hui"])],[groups,["甲𠀀"],new Set()], [[],["甲𠀀"],new Set(["hui"])]]as const)assert.equal(resolveRhymeReference(state,[...g],lines,available).invalid.length,1);
});
test("first written legal foot supplies reference; ci segments and form identities stay independent",()=>{
 const analysis:any={rhyme:{feet:[{lineIndex:0,candidateGroupIds:[]},{lineIndex:1,candidateGroupIds:["hui"]},{lineIndex:3,candidateGroupIds:["dong"]}]}};
 assert.deepEqual(getRhymeGroups({kind:"metre",value:analysis})[0].groupIds,["hui"]);
 const ci:any={feet:[{key:"a",items:[{line:1,options:[{group:1}]}]},{key:"b",items:[{line:5,options:[{group:2}]}]}]};
 const groups=getRhymeGroups({kind:"ci",value:ci,formId:"qingping"});
 assert.notEqual(ciSegmentId("qingping","a"),ciSegmentId("rumeng","a"));
 assert.deepEqual(groups.map(g=>g.groupIds),[["cilin-1"],["cilin-2"]]);
 assert.equal(referenceFootStatus("hui",[]),"pending");assert.equal(referenceFootStatus("hui",["hui","dong"]),"pending");
 assert.equal(referenceFootStatus("hui",["hui"]),"match");assert.equal(referenceFootStatus("hui",["dong"]),"mismatch");
 assert.equal(workAssistanceStateSchema.safeParse({...emptyAssistance(),references:[{segmentId:"a",system:"cilin",mode:"manual",groupId:"1"},{segmentId:"a",system:"cilin",mode:"manual",groupId:"2"}]}).success,false);
});

test("confirmed readings determine browser foot membership without altering analysis",()=>{
 const value:any={rhyme:{feet:[{lineIndex:1,character:"台",candidateGroupIds:["hui","zhi"]}]},lines:[{lineIndex:1,characters:[{character:"台",reading:{selectedCandidate:null}}]}]};
 assert.deepEqual(metreReferenceFeet(value)[0].groupIds,["hui","zhi"]);
 value.lines[0].characters[0].reading.selectedCandidate={rhymeGroupId:"hui"};
 assert.deepEqual(metreReferenceFeet(value)[0].groupIds,["hui"]);
 assert.equal(referenceFootStatus("zhi",metreReferenceFeet(value)[0].groupIds),"mismatch");
 assert.deepEqual(value.rhyme.feet[0].candidateGroupIds,["hui","zhi"]);
});
