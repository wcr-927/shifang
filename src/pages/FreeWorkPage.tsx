import { useRef, useState } from 'react';
import { TitleField } from '../components/editor/TitleField';
import { categoryOf, roomOf, type FreeCategory, type FreeWorkRecord } from '../shared/work';
import { useFreeEditor } from '../features/editor/useFreeEditor';
import { ExportDialog } from '../components/editor/ExportDialog';
import { EditorHeader } from '../components/editor/EditorHeader';
import { SaveErrorNotice, SaveStatus } from '../components/editor/SaveStatus';
import { ManuscriptPage, ManuscriptPaper, ManuscriptStamp, ManuscriptStampSummary, LegacyEditorPortal } from '../components/manuscript/ManuscriptUI';
import { FreeTextField } from '../components/editor/FreeTextField';
import { AncientEditor } from '../components/editor/AncientEditor';
import { AncientReference } from '../components/editor/AncientReference';
import { freeColumns, updateFreeColumn } from '../features/editor/freeColumns';
import { dispatchReferenceIntent } from '../shared/referenceContext';
import { emptyAssistance } from '../shared/assistanceState';

export function FreeWorkPage({work,onBack,backLabel='诗稿'}:{work:FreeWorkRecord;onBack:()=>void;backLabel?:string}):JSX.Element{
 const {editor,patch,save,error}=useFreeEditor(work),[exportOpen,setExportOpen]=useState(false);
 const root=useRef<HTMLElement>(null),modern=roomOf(work)==='song',ancient=!modern&&editor.category==='ancient';
 const [character,setCharacter]=useState(()=>Array.from(work.body).find(c=>/\p{Script=Han}/u.test(c))??'');
 const label=modern?'现代诗':ancient?'古体诗':editor.category==='prose'||editor.category==='fu'?'古文':'自由创作';
 const columns=modern?freeColumns(editor.body,editor.assistance):[editor.body,''];
 const query=(c=character)=>{if(c)dispatchReferenceIntent(root.current,{kind:'character',system:'pingshui',character:c});};
 const queryGroup=(groupId:string)=>dispatchReferenceIntent(root.current,{kind:'group',system:'pingshui',groupId});
 const changeBody=(body:string)=>{const assistance={...(editor.assistance??emptyAssistance())};delete assistance.freeColumns;patch({body,assistance});};
 return <ManuscriptPage ref={root} className={`free-editor free-paper ${modern?'is-modern':ancient?'is-ancient':'is-prose'}`}>

  <div className="editor-notices"><SaveErrorNotice status={editor.saveStatus} error={error} onSave={()=>void save()}/></div>
  <div className="editor-layout">
   <ManuscriptPaper label="正文滚动区"><EditorHeader bookPage workId={work.id} workStatus={editor.status} onStatusChange={status=>patch({status})} contextLabel="创作" title={editor.title} backLabel={backLabel} saveStatus={editor.saveStatus} saveError={error} documentLabel={modern?'现代诗':'作品'} onBack={onBack} onSave={()=>void save()} onExport={()=>setExportOpen(true)}>
    {modern?<span className="manuscript-stamp">现代诗</span>:<details className="manuscript-genre"><ManuscriptStampSummary>{label}</ManuscriptStampSummary><div className="manuscript-genre-options free-genre-options" role="group" aria-label="文体">{(['unclassified','ancient','prose'] as FreeCategory[]).map(value=><button type="button" key={value} aria-pressed={editor.category===value||value==='prose'&&editor.category==='fu'} onClick={e=>{patch({category:value});e.currentTarget.closest('details')?.removeAttribute('open')}}>{value==='ancient'?'古体诗':value==='prose'?'古文':'自由创作'}</button>)}</div></details>}
    {ancient?<ManuscriptStamp onClick={()=>query()} disabled={!character}>字音参考</ManuscriptStamp>:null}
</EditorHeader><div className="manuscript-composition">
    <div className="manuscript-heading"><TitleField value={editor.title} onChange={title=>patch({title})}/></div>
    {ancient?<AncientEditor identity={work.id} body={editor.body} onChange={changeBody} onCharacter={setCharacter}/>:<div className={`free-paper-columns ${modern?'has-two-columns':''}`}><FreeTextField label="作品正文" value={columns[0]} onChange={value=>modern?patch(updateFreeColumn(editor.body,editor.assistance,0,value)):changeBody(value)}/>{modern?<FreeTextField label="正文右栏" value={columns[1]} onChange={value=>patch(updateFreeColumn(editor.body,editor.assistance,1,value))}/>:null}</div>}
    <footer className="manuscript-foot"><span>{label}</span><div className="manuscript-foot-status"><SaveStatus status={editor.saveStatus} error={error} onSave={()=>void save()}/><span>{Array.from(editor.body.replace(/\s/gu,'')).length} 字</span></div></footer>
   </div></ManuscriptPaper>
   {ancient?<AncientReference character={character} onQuery={query} onGroup={queryGroup}/>:null}
  </div>
  {exportOpen?<LegacyEditorPortal><ExportDialog editor={{...editor,category:categoryOf(editor)}} onClose={()=>setExportOpen(false)} onEnsureSaved={save}/></LegacyEditorPortal>:null}
 </ManuscriptPage>;
}
