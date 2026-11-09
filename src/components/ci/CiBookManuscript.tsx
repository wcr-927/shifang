import { ManuscriptStamp, ManuscriptTopline } from "../manuscript/ManuscriptUI";
import { useMemo, type ReactNode, type RefObject } from "react";
import { TitleField } from "../editor/TitleField";
import { VerseEditor, type VerseEditorHandle } from "../editor/VerseEditor";
import { ciVerseAdapter } from "../../features/editor/ciVerseAdapter";
import type { VersePoint } from "../../features/editor/verseDocument";
import type { CiForm } from "../../ci/catalogue";
import type { CiAnalysis } from "../../ci/analyze";
import { sourceCharacters } from "../../ci/analyze";
import type { CiWorkRecord } from "../../shared/work";
export function CiBookManuscript({editor,form,analysis,editorRef,onTitle,onBody,onSelection,onHover,onRhyme,onForm,onDetails,renderTopline,saveStatus}:{renderTopline?:(labels:ReactNode)=>ReactNode;saveStatus?:ReactNode;editor:CiWorkRecord;form:CiForm;analysis:CiAnalysis;editorRef:RefObject<VerseEditorHandle>;onTitle:(title:string)=>void;onBody:(body:string)=>void;onSelection:(point:VersePoint,collapsed:boolean)=>void;onHover:(point:VersePoint|undefined)=>void;onRhyme:(key:string)=>void;onForm:()=>void;onDetails:()=>void}){
 const slots=useMemo(()=>ciVerseAdapter(form,editor.body,analysis,editor.assistance),[form,editor.body,analysis,editor.assistance]);
 const labels=<>{!editor.body.trim()?<ManuscriptStamp onClick={onForm}>换词牌</ManuscriptStamp>:null}<ManuscriptStamp onClick={onDetails}>{form.author}体</ManuscriptStamp><ManuscriptStamp onClick={onDetails}>词谱</ManuscriptStamp></>;
 return <>{renderTopline?renderTopline(labels):<ManuscriptTopline>{labels}</ManuscriptTopline>}<div className="ci-book-composition"><div className="manuscript-heading"><TitleField value={editor.title} onChange={onTitle}/></div>
 <VerseEditor ref={editorRef} identity={`${editor.id}:${form.id}`} mode="ci" body={editor.body} slots={slots} onChange={onBody} onSelection={onSelection} onHover={onHover} onRhyme={line=>{const key=form.lines[line]?.rhyme;if(key)onRhyme(key)}}/>
 <footer className="manuscript-foot"><span>词林正韵</span><div className="manuscript-foot-status">{saveStatus}<span>{sourceCharacters(editor.body).filter(c=>/\p{Script=Han}/u.test(c.character)).length} 字</span></div></footer></div></>;
}
