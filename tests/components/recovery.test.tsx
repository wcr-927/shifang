import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import type { WorkRecord, WorkAnalysisState } from "../../src/shared/work.ts";
import type { WorkVersion } from "../../src/shared/recovery.ts";
const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost/"});
for(const key of ["window","document","navigator","HTMLElement","Event","CustomEvent","MouseEvent"])Object.defineProperty(globalThis,key,{value:key==="window"?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,waitFor,cleanup}=await import("@testing-library/react");
const {VersionHistoryDialog}=await import("../../src/components/editor/VersionHistoryDialog.tsx");
const {LibraryNewWork}=await import("../../src/components/works/LibraryNewWork.tsx");
const {CiWorkPage}=await import("../../src/pages/CiWorkPage.tsx");
const {ciForms}=await import("../../src/ci/catalogue.ts");
const id="00000000-0000-4000-8000-000000000001";
const work:WorkRecord={id,title:"相同正文",body:"  行𠀀\n\n尾行  \n",notes:"创作记",genre:"wujue",room:"poetry",category:"unclassified",status:"draft",collectionId:null,rhymeGroupId:null,location:"",tags:[],createdAt:"2026-10-04T00:00:00Z",updatedAt:"2026-10-04T00:00:00Z"};
const state:WorkAnalysisState={workId:id,templateId:"wujue",variantId:null,readingOverrides:[],ruleDatasetVersions:{metre:"1.0.0"},updatedAt:work.updatedAt};
const version:WorkVersion={id:"00000000-0000-4000-8000-000000000002",workId:id,title:work.title,body:work.body,notes:work.notes,genre:work.genre,status:work.status,location:work.location,room:"poetry",category:"unclassified",ci:null,reason:"manual_save",createdAt:work.createdAt,completeness:"complete",snapshot:{work:{...work,room:"poetry",category:"unclassified"},analysisState:{...state,variantId:"older-variant",ruleDatasetVersions:{metre:"older-version"}}}};
afterEach(cleanup);
test("history identifies analysis-only differences and renders full untrimmed body and notes",async()=>{
 window.shifang={works:{listVersions:async()=>[version],get:async()=>work,getAnalysisState:async()=>state}} as any;
 render(<VersionHistoryDialog workId={id} onClose={()=>{}}/>);
 await screen.findByText(/与当前稿不同：校对设置/);
 assert.equal(document.querySelector(".history-paper-bodies pre")!.textContent,work.body);
 assert.equal(document.querySelector(".history-notes pre")!.textContent,work.notes);
 assert.equal(screen.queryByText(/技术详情/),null);
 fireEvent.click(screen.getByRole("button",{name:"对照当前稿"}));
 assert.equal(document.querySelectorAll(".history-paper-bodies pre").length,2);
});
test("history restore failure keeps the current preview and supports retry; success signals reload",async()=>{
 let attempts=0,closed=0,signaled="";
 window.shifang={works:{listVersions:async()=>[version],get:async()=>work,getAnalysisState:async()=>state,restoreVersion:async()=>{if(++attempts===1)throw Error("恢复故障");return work;}}} as any;
 const listen=(e:Event)=>{signaled=(e as CustomEvent<string>).detail;};window.addEventListener("shifang-work-restored",listen);
 try{render(<VersionHistoryDialog workId={id} onClose={()=>closed++}/>);await screen.findByText(/与当前稿不同/);fireEvent.click(screen.getByRole("button",{name:"恢复此版本"}));await screen.findByRole("alert");assert.equal(closed,0);assert.equal(document.querySelector(".history-paper-bodies pre")!.textContent,work.body);fireEvent.click(screen.getByRole("button",{name:"恢复此版本"}));await waitFor(()=>assert.equal(closed,1));assert.equal(signaled,id);}finally{window.removeEventListener("shifang-work-restored",listen);}
});
test("unavailable ci catalog disables creation and leaves existing ci body, notes and saving reachable",async()=>{
 const originals=ciForms.splice(0);let saved:any;
 try{
  render(<LibraryNewWork collectionId={null} onClose={()=>{}} onCreated={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:"词",exact:true}));await waitFor(()=>assert.equal((screen.getByRole("button",{name:"创建",exact:true}) as HTMLButtonElement).disabled,true));cleanup();
  const ciWork={...work,genre:"ci" as const,room:"ci" as const,ci:{formId:"removed-form",version:"old",rhymeVersion:"old",choices:[]}};
  window.shifang={works:{saveCiWork:async(req:any)=>{saved=req;return {...ciWork,...req};},saveVersion:async()=>true}} as any;
  render(<CiWorkPage work={ciWork} onBack={()=>{}}/>);
  const input=screen.getByLabelText("词稿正文");fireEvent.change(input,{target:{value:"  𠀀仍可写\n\n尾行  \n"}});fireEvent.click(screen.getByRole("button",{name:"创作记",exact:true}));fireEvent.change(screen.getByLabelText("创作记内容"),{target:{value:"仍可写旁记"}});fireEvent.click(screen.getByTitle("立即保存"));await waitFor(()=>assert.ok(saved));assert.equal(saved.body,"  𠀀仍可写\n\n尾行  \n");assert.equal(saved.notes,"仍可写旁记");assert.deepEqual(saved.ci,ciWork.ci);
 }finally{cleanup();ciForms.push(...originals);}
});
