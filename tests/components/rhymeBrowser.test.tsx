import assert from "node:assert/strict";
import {afterEach,test} from "node:test";
import React,{useState} from "react";
import {JSDOM} from "jsdom";
const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost"});
for(const key of ["window","document","navigator","HTMLElement","Event","MouseEvent","KeyboardEvent"])Object.defineProperty(globalThis,key,{value:key==="window"?dom.window:(dom.window as any)[key],configurable:true});
const {render,screen,fireEvent,act,cleanup,within}=await import("@testing-library/react");
const {useRhymeReference}=await import("../../src/features/editor/useRhymeReference.ts");
const {RhymeBrowser}=await import("../../src/components/manuscript/RhymeBrowser.tsx");
const {setRhymeReference}=await import("../../src/shared/assistanceState.ts");
const {desktopApi}=await import("../../src/services/desktopApi.ts");
const original=desktopApi.reference.groups;
afterEach(()=>{cleanup();desktopApi.reference.groups=original});
const names=new Map([["hui","十灰"],["dong","一东"]]);
type Foot={line:number;character:string;groupIds:string[]};
let latest:any;
function Harness({feet,segment="poem"}:{feet:Foot[];segment?:string}){
 const [state,setState]=useState<any>();latest=state;
 const ref=useRhymeReference("pingshui",segment,state,[{segmentId:segment,system:"pingshui",groupIds:feet.find(f=>f.groupIds.length===1)?.groupIds??[],lineIndexes:feet.map(f=>f.line)}],feet.map(f=>f.character),feet,r=>setState((old:any)=>setRhymeReference(old,r,segment)));
 return <><div className="manuscript-column" data-testid="paper"/><RhymeBrowser reference={ref} feet={feet} names={names}/><output>{ref.groupId}</output></>
}
const originalFeet:Foot[]=[{line:1,character:"回",groupIds:["hui"]},{line:3,character:"杯",groupIds:["hui"]}];
const changed:Foot[]=[originalFeet[0],{line:3,character:"风",groupIds:["dong"]}];
function mock(){desktopApi.reference.groups=async()=>[...names].map(([id,name])=>({id,name,tone:"平声",count:10}))}

test("browse directly, keep page on leaving and editing, return through earlier foot, isolate segments",async()=>{
 mock();const view=render(<Harness feet={originalFeet}/>);await act(async()=>{});
 assert.equal(latest.references[0].groupId,"hui");
 view.rerender(<Harness feet={changed}/>);await act(async()=>{});
 assert.equal(document.querySelector("output")!.textContent,"hui");
 fireEvent.click(screen.getByRole("button",{name:/第4句韵脚 风/}));await act(async()=>{});
 assert.equal(document.querySelector("output")!.textContent,"dong");
 assert.equal(latest.references[0].groupId,"dong");
 assert.equal(screen.queryByText("采用"),null);
 fireEvent.pointerDown(screen.getByTestId("paper"));
 fireEvent.keyDown(document,{key:"Escape"});
 assert.equal(document.querySelector("output")!.textContent,"dong");
 view.rerender(<Harness feet={originalFeet}/>);await act(async()=>{});
 assert.equal(document.querySelector("output")!.textContent,"dong");
 fireEvent.click(screen.getByRole("button",{name:/第2句韵脚 回/}));await act(async()=>{});
 assert.equal(latest.references[0].groupId,"hui");
 view.rerender(<Harness feet={changed} segment="ci:a:b"/>);await act(async()=>{});
 fireEvent.click(screen.getByRole("button",{name:/第4句韵脚 风/}));await act(async()=>{});
 assert.equal(latest.references.find((r:any)=>r.segmentId==="poem").groupId,"hui");
 assert.equal(latest.references.find((r:any)=>r.segmentId==="ci:a:b").groupId,"dong");
});
test("ambiguous foot offers compact choices, catalogue browses freely, confirmed reading removes ambiguity",async()=>{
 mock();const ambiguous:Foot[]=[originalFeet[0],{line:3,character:"台",groupIds:["hui","dong"]}];
 const view=render(<Harness feet={ambiguous}/>);await act(async()=>{});
 const foot=()=>screen.getByRole("button",{name:/第4句韵脚 台/});
 assert.equal(foot().className,"is-pending");
 fireEvent.click(foot());
 const dialog=screen.getByRole("dialog",{name:"候选韵部"});
 assert.equal(within(dialog).getAllByRole("button").length,2);
 fireEvent.click(within(dialog).getByRole("button",{name:"一东 平声"}));await act(async()=>{});
 assert.equal(document.querySelector("output")!.textContent,"dong");
 assert.equal(screen.queryByRole("dialog"),null);
 view.rerender(<Harness feet={[originalFeet[0],{line:3,character:"台",groupIds:["hui"]}]}/>);await act(async()=>{});
 assert.equal(foot().className,"is-mismatch");
 fireEvent.click(foot());await act(async()=>{});
 assert.equal(foot().className,"is-match");assert.equal(screen.queryByRole("dialog"),null);
 fireEvent.click(screen.getByRole("button",{name:"浏览韵部"}));
 assert.ok(screen.getByRole("dialog",{name:"韵部目录"}));
 fireEvent.keyDown(document,{key:"Escape"});assert.equal(screen.queryByRole("dialog"),null);
 assert.equal(document.activeElement,screen.getByRole("button",{name:"浏览韵部"}));
});
