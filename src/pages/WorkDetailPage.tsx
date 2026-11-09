import { markerReference, withRhymeMarker } from "../features/editor/rhymeMarkers";
import { getRhymeGroups, metreReferenceFeet } from "../features/editor/rhymeReference";
import { GrammarReview } from "../components/manuscript/GrammarReview";
import { ManuscriptPage, ManuscriptPaper, ManuscriptStamp, ManuscriptStampSummary, LegacyEditorPortal } from "../components/manuscript/ManuscriptUI";
import { VerseEditor, type VerseEditorHandle } from "../components/editor/VerseEditor";
import { metreToneMarkers } from "../features/editor/toneMarkers";
import type { VersePoint } from "../features/editor/verseDocument";
import metrePatterns from "../rules/metre.json";
import { useEffect, useMemo, useRef, useState } from "react";
import { editorLineCharacters } from "../poetry/analysis/editorCoordinates";
import type { PoemAnalysis } from "../poetry/analysis/poemAnalyzer";
import { dispatchReferenceIntent, type ReferencePatternContext } from "../shared/referenceContext";
const manuscriptGenreLabels = { wujue: "五言绝句", qijue: "七言绝句", wulv: "五言律诗", qilv: "七言律诗" };
import { TitleField } from "../components/editor/TitleField";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { EditorControls, EditorHeader } from "../components/editor/EditorHeader";



import { ManuscriptInspector } from "../components/editor/ManuscriptInspector";
import { genreLineCounts, lineSlots } from "../features/editor/editorModel";
import { useEditorController } from "../features/editor/useEditorController";
import { ExportDialog } from "../components/editor/ExportDialog";
import { registerCloseFlush } from "../services/closeCoordinator";

import { PasteConfirmDialog } from "../components/editor/PasteConfirmDialog";
import { SaveErrorNotice, SaveStatus } from "../components/editor/SaveStatus";
import { useEditorDialogFocus } from "../components/editor/useEditorDialogFocus";

type Position={line:number;offset:number;character:string};
function ReviewDialog({onClose,children}:{onClose:()=>void;children:React.ReactNode}){
 const node=useRef<HTMLElement>(null);useEditorDialogFocus(node,onClose,false);
 return <LegacyEditorPortal><div className="manuscript-review-backdrop dialog-backdrop"><section className="manuscript-review" ref={node} role="dialog" aria-modal="true" aria-label="格律详情" tabIndex={-1}><header><h2 tabIndex={-1} data-dialog-initial>格律</h2><button type="button" className="manuscript-close" onClick={onClose}>关闭</button></header>{children}</section></div></LegacyEditorPortal>;
}
export function WorkDetailPage({workId,onBack,backLabel="诗稿"}:{workId:string;onBack:()=>void;onArchived:()=>void;backLabel?:string}):JSX.Element{
 const controller=useEditorController(workId),editor=controller.editor;
 const [exportOpen,setExportOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
 const [activeLine,setActiveLine]=useState(0),[pinned,setPinned]=useState<Position>(),[hovered,setHovered]=useState<Position>();
 const snapshot=useRef<{workId:string;body:string;analysis:PoemAnalysis}>();
 if(controller.analysis)snapshot.current={workId,body:editor?.body??"",analysis:controller.analysis};
 const displayedAnalysis=controller.analysis??(snapshot.current?.workId===workId?snapshot.current.analysis:null);
 const verseRef=useRef<VerseEditorHandle>(null);
 const root=useRef<HTMLElement>(null),manuscript=useRef<HTMLDivElement>(null);
 const slots=useMemo(()=>editor?lineSlots(editor.lines,genreLineCounts[editor.genre]):[],[editor]);
 useEffect(()=>registerCloseFlush(controller.flush),[controller.flush]);
 if(controller.loadStatus==='loading')return <LoadingState label="正在打开诗稿"/>;
 if(controller.loadStatus==='error')return <ErrorState message={controller.error||'诗稿暂时无法取阅。'} onRetry={controller.retryLoad}/>;
 if(controller.loadStatus==='not-found'||!editor)return <section className="detail-empty"><h1>未找到这首诗稿</h1><button type="button" onClick={onBack}>返回诗稿</button></section>;
 const valid=(p:Position|undefined)=>p&&editor.lines[p.line]?.slice(p.offset,p.offset+p.character.length)===p.character?p:undefined;
 const fallbackLine=Math.min(activeLine,slots.length-1),first=editorLineCharacters(slots[fallbackLine]??'')[0];
 const current=valid(hovered)??valid(pinned)??(first?{line:fallbackLine,offset:first.sourceOffset,character:first.character}:undefined);
 const currentLine=current?.line??fallbackLine;
 const stableAnalysis=controller.analysis??(snapshot.current?.workId===workId&&snapshot.current.body===editor.body?snapshot.current.analysis:null);
 const fresh=stableAnalysis?.lines.find(line=>line.lineIndex===currentLine);
 const selected=current?fresh?.characters.find(c=>c.sourceOffset===current.offset&&c.character===current.character):undefined;
 const characterIndex=current?editorLineCharacters(editor.lines[current.line]??'').findIndex(c=>c.sourceOffset===current.offset):-1;
 const samePattern=displayedAnalysis?.templateId===editor.templateId&&(!editor.variantId||displayedAnalysis.variantId===editor.variantId);
 const patternTemplate=metrePatterns.templates.find(t=>t.id===editor.templateId);
 const patternVariant=patternTemplate?.variants.find(v=>v.id===(editor.variantId??(samePattern?displayedAnalysis?.variantId:undefined)));
 const patternContext:ReferencePatternContext={kind:'metre',templateId:editor.templateId,variantId:editor.variantId??(samePattern?displayedAnalysis?.variantId:undefined),mode:editor.variantId?'locked':controller.analysis&&editor.lines.some(l=>l.trim())?'adopted':'reference'};
 const queryCharacter=(character:string)=>dispatchReferenceIntent(root.current,{kind:'character',system:'pingshui',character});
 const queryGroup=(groupId:string)=>dispatchReferenceIntent(root.current,{kind:'group',system:'pingshui',groupId});
 function activatePoint(point:VersePoint,collapsed:boolean){setActiveLine(point.line);if(!collapsed)return;const text=editor!.lines[point.line]??'',chars=editorLineCharacters(text);const c=chars.find(c=>point.offset>=c.sourceOffset&&point.offset<c.sourceOffset+c.character.length)??(point.offset===text.length?chars.at(-1):undefined);if(c&&/\p{Script=Han}/u.test(c.character))setPinned({line:point.line,offset:c.sourceOffset,character:c.character});}
 function previewPoint(point:VersePoint|undefined){if(!point){setHovered(undefined);return}const text=editor!.lines[point.line]??'';setHovered({line:point.line,offset:point.offset,character:String.fromCodePoint(text.codePointAt(point.offset)??0)});}
 function locateSource(lineIndex:number,offset=0){setActiveLine(lineIndex);setHovered(undefined);const text=editor!.lines[lineIndex]??'';if(offset<text.length)setPinned({line:lineIndex,offset,character:String.fromCodePoint(text.codePointAt(offset)!)});requestAnimationFrame(()=>verseRef.current?.focusAt({line:lineIndex,offset},true));}
 function locateLine(lineIndex:number,index?:number){const c=controller.analysis?.lines.find(l=>l.lineIndex===lineIndex)?.characters.find(c=>c.characterIndex===index);setReviewOpen(false);requestAnimationFrame(()=>locateSource(lineIndex,c?.sourceOffset))}
 const rhymeFeet=stableAnalysis?metreReferenceFeet(stableAnalysis):[];
 const rhymeGroup=markerReference(editor.assistance,stableAnalysis?getRhymeGroups({kind:"metre",value:stableAnalysis}):[],editor.lines,"poem");
 const count=editor.lines.reduce((n,l)=>n+editorLineCharacters(l).filter(c=>/\p{Script=Han}/u.test(c.character)).length,0);
 return <ManuscriptPage ref={root} className="work-detail">

  <div className="editor-notices"><SaveErrorNotice status={editor.saveStatus} error={controller.saveError} onSave={()=>void controller.saveNow()}/>{controller.assistanceStatus==='degraded'?<div className="operation-error" role="status">{controller.assistanceMessage}</div>:null}</div>
  <div className="editor-layout">
   <ManuscriptPaper scrollRef={manuscript} label="诗稿编辑滚动区" syllables={editor.genre.startsWith("wu")?5:7}>
     <EditorHeader bookPage workStatus={editor.status} onStatusChange={controller.setStatus} workId={workId} referenceContext={patternContext} contextLabel="创作" backLabel={backLabel} title={editor.title} saveStatus={editor.saveStatus} saveError={controller.saveError} onBack={onBack} onSave={()=>void controller.saveNow()} onExport={()=>setExportOpen(true)}><details className="manuscript-genre"><ManuscriptStampSummary>{manuscriptGenreLabels[editor.genre]}</ManuscriptStampSummary><div className="manuscript-genre-options"><EditorControls editor={editor} templates={controller.templates} onGenre={controller.setGenre} onStatus={controller.setStatus} onVariant={controller.setVariant}/></div></details><ManuscriptStamp onClick={()=>setReviewOpen(true)}>格律</ManuscriptStamp></EditorHeader>
     <div className="manuscript-composition">
      <div className="manuscript-heading">
       <TitleField value={editor.title} onChange={controller.setTitle}/>

      </div>
      <VerseEditor ref={verseRef} identity={`${workId}:${editor.genre}`} mode="metre" body={editor.body} slots={slots.map((line,index)=>{const pattern=samePattern?displayedAnalysis?.lines.find(l=>l.lineIndex===index)?.expectedPattern??'':'';return{width:(editor.genre.startsWith('wu')?5:7)*27,fontSize:25,markers:withRhymeMarker(metreToneMarkers(line,stableAnalysis?.lines.find(l=>l.lineIndex===index)??null,pattern,patternVariant?.flexiblePositions[index]),line,rhymeFeet.find(f=>f.line===index),rhymeGroup),punctuation:index%2?'。':'，'}})} onChange={body=>{setHovered(undefined);controller.setBody(body)}} onSelection={activatePoint} onHover={previewPoint}/>
      <footer className="manuscript-foot"><span>平水韵</span><div className="manuscript-foot-status"><SaveStatus status={editor.saveStatus} error={controller.saveError} onSave={()=>void controller.saveNow()}/><span>{count} 字</span></div></footer>
     </div>
   </ManuscriptPaper>
   <ManuscriptInspector chosenCandidateId={editor.readingOverrides.find(r=>r.lineIndex===currentLine&&r.characterIndex===characterIndex&&r.character===current?.character)?.candidateId??null} onFoot={line=>{const c=editorLineCharacters(editor.lines[line]??"").at(-1);if(c){setHovered(undefined);setPinned({line,offset:c.sourceOffset,character:c.character});}}} assistance={editor.assistance} body={editor.body} onReference={controller.setReference} selected={selected?{...selected,lineIndex:currentLine}:null} pendingCharacter={current?{character:current.character,lineIndex:current.line,characterIndex:Math.max(0,characterIndex)}:undefined} analysis={stableAnalysis} loading={controller.analysisLoading&&!stableAnalysis} onSelect={controller.selectReading} onClear={controller.clearReading} onQueryCharacter={queryCharacter} onQueryGroup={queryGroup}/>
  </div>
  {reviewOpen?<ReviewDialog onClose={()=>setReviewOpen(false)}><label className="review-rhyme-mode"><input type="checkbox" checked={editor.assistance?.firstLineRhyme === "sourced-neighbor"} onChange={event=>controller.setFirstLineRhyme(event.target.checked ? "sourced-neighbor" : "strict")}/>首句借韵</label><GrammarReview analysis={stableAnalysis} loading={controller.analysisLoading&&!stableAnalysis} error={controller.analysisError} onLocate={locateLine}/></ReviewDialog>:null}
  {exportOpen?<LegacyEditorPortal><ExportDialog editor={editor} onClose={()=>setExportOpen(false)} onEnsureSaved={controller.saveNow}/></LegacyEditorPortal>:null}
  {controller.pastePlan?<PasteConfirmDialog key={controller.pastePlan.id} review={controller.pastePlan} onConfirm={()=>controller.confirmPaste(controller.pastePlan!.id)} onCancel={()=>controller.cancelPaste(controller.pastePlan!.id)}/>:null}
 </ManuscriptPage>;
}
