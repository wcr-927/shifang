import { CiReview } from "../components/manuscript/CiReview";
import { setRhymeReference } from "../shared/assistanceState";
import { ManuscriptPage, ManuscriptPaper, ManuscriptStamp, LegacyEditorPortal } from "../components/manuscript/ManuscriptUI";
import type { VerseEditorHandle } from "../components/editor/VerseEditor";
import type { VersePoint } from "../features/editor/verseDocument";
import { CiBookManuscript } from "../components/ci/CiBookManuscript";
import { CiBookInspector } from "../components/ci/CiBookInspector";
import type { CiPosition } from "../components/ci/CiBookLine";
import { sourceCharacters } from "../ci/analyze";
import { useEditorDialogFocus } from "../components/editor/useEditorDialogFocus";
import { CiReadingCopyDialog } from "../components/ci/CiReadingCopyDialog";
import { dispatchReferenceIntent, type ReferencePatternContext } from "../shared/referenceContext";
import { useMemo, useRef, useState } from "react";
import type { CiWorkRecord } from "../shared/work";
import { ciForms, ciForm } from "../ci/catalogue";
import { analyzeCi, rhymeVersion } from "../ci/analyze";
import { CiFallbackManuscript } from "../components/ci/CiFallbackManuscript";
import { useCiEditor } from "../features/editor/useCiEditor";
import { CreationNotes, NotesButton } from "../components/editor/CreationNotes";
import { useNotesPanel } from "../components/editor/useNotesPanel";
import { ExportDialog } from "../components/editor/ExportDialog";
import { EditorHeader } from "../components/editor/EditorHeader";
import { SaveErrorNotice, SaveStatus } from "../components/editor/SaveStatus";



function CiDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){const ref=useRef<HTMLElement>(null);useEditorDialogFocus(ref,onClose,false);return <LegacyEditorPortal><div className="ci-book-dialog dialog-backdrop"><section className="manuscript-review" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2 tabIndex={-1} data-dialog-initial>{title}</h2><button className="manuscript-close" onClick={onClose}>返回</button></header>{children}</section></div></LegacyEditorPortal>}
export function CiWorkPage({ work, onBack, backLabel = "诗稿" }: { work: CiWorkRecord; onBack: () => void; backLabel?: string }): JSX.Element {
  const { editor, patch, save, error } = useCiEditor(work);
  const root = useRef<HTMLElement>(null);
  const verseRef=useRef<VerseEditorHandle>(null);
  const notes = useNotesPanel(root);
  const [readingCopy, setReadingCopy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [detailsOpen,setDetailsOpen]=useState(false),[formOpen,setFormOpen]=useState(false),[nextForm,setNextForm]=useState(work.ci.formId),[hovered,setHovered]=useState<CiPosition>(),[rhymeKey,setRhymeKey]=useState('a');
  const [formBusy,setFormBusy]=useState(false),[formError,setFormError]=useState('');
  const [activeLine, setActiveLine] = useState(0);
  const [selection, setSelection] = useState<{ line: number; offset: number; character: string; origin: "native" | "assistance" }>();
  const form = ciForm(editor.ci.formId);
  const state = editor.ci;
  const analysis = useMemo(
    () => form && state.version === form.version && state.rhymeVersion === rhymeVersion ? analyzeCi(editor.body, form, state) : null,
    [editor.body, state, form],
  );

  const referenceContext: ReferencePatternContext = { kind: "ci", formId: state.formId, version: state.version, available: Boolean(form && analysis) };
  function selectPoint(point:VersePoint,collapsed:boolean){setActiveLine(point.line);if(!collapsed)return;const text=editor.body.split('\n')[point.line]??'',chars=sourceCharacters(text),found=chars.find(c=>point.offset>=c.offset&&point.offset<c.offset+c.character.length)??(point.offset===text.length?chars.at(-1):undefined);if(found&&/\p{Script=Han}/u.test(found.character))setSelection({line:point.line,...found,origin:'native'});}
  function previewPoint(point:VersePoint|undefined){if(!point){setHovered(undefined);return}const text=editor.body.split('\n')[point.line]??'',character=String.fromCodePoint(text.codePointAt(point.offset)??0);setHovered({line:point.line,offset:point.offset,character});}
  function locate(line:number,offset=0){setDetailsOpen(false);setActiveLine(line);setHovered(undefined);const text=editor.body.split('\n')[line]??'';if(offset<text.length)setSelection({line,offset,character:String.fromCodePoint(text.codePointAt(offset)!),origin:'assistance'});requestAnimationFrame(()=>verseRef.current?.focusAt({line,offset},true));}



  if (!form || !analysis) {
    return <section ref={root} className="editor-page free-editor" data-notes-open={notes.open}>
      <EditorHeader workId={work.id} referenceContext={referenceContext} contextLabel="词房 · 按谱填词" backLabel={backLabel} title={editor.title} saveStatus={editor.saveStatus} saveError={error} documentLabel="词稿" notesAction={<NotesButton open={notes.open} onToggle={notes.toggle} onCapture={notes.capture} />} onBack={onBack} onSave={() => void save()} onExport={() => setExportOpen(true)} />
      <div className="editor-notices"><SaveErrorNotice status={editor.saveStatus} error={error} onSave={() => void save()} /><p role="status">此稿词谱暂不可用，校对已暂停。正文和创作记可继续编辑、保存与导出；保留原词谱标识和读音选择。</p></div>
      <div className="free-layout"><CiFallbackManuscript title={editor.title} body={editor.body} onTitleChange={title => patch({ title })} onBodyChange={body => patch({ body })} /><CreationNotes open={notes.open} onClose={notes.close} value={editor.notes} onChange={value => patch({ notes: value })} /></div>
      {exportOpen ? <ExportDialog editor={editor} onClose={() => setExportOpen(false)} onEnsureSaved={save} /> : null}
    </section>;
  }

  const activeForm = form;
  const valid=(p:CiPosition|undefined)=>p&&editor.body.split('\n')[p.line]?.slice(p.offset,p.offset+p.character.length)===p.character?p:undefined;
  const first=sourceCharacters(editor.body.split('\n')[activeLine]??'')[0];
  const current=valid(hovered)??valid(selection)??(first?{line:activeLine,...first}:undefined);

  function setReading(line: number, offset: number, source: string, character: string, candidate: string): void {
    patch({
      ci: {
        ...state,
        version: activeForm.version,
        rhymeVersion,
        choices: [
          ...state.choices.filter(choice => !(choice.line === line && choice.offset === offset)),
          ...(candidate ? [{ line, offset, source, character, candidate }] : []),
        ],
      },
    });
  }

  async function applyEmptyForm(){
    if(formBusy||editor.body.trim())return;
    const chosen=ciForm(nextForm);if(!chosen)return;
    setFormBusy(true);setFormError('');
    // Flush an emptied draft before changing its form; keep the dialog modal until saved.
    if(!await save()){setFormError('保存未完成，请重试。');setFormBusy(false);return;}
    const previous=state;
    patch({ci:{...state,formId:chosen.id,version:chosen.version,rhymeVersion}});
    if(await save()){setRhymeKey(chosen.lines.find(l=>l.rhyme)?.rhyme??'a');setFormOpen(false);}
    else{patch({ci:previous});setFormError('词牌未更换，请重试。');}
    setFormBusy(false);
  }


  return (
    <ManuscriptPage
      ref={root}
      className="work-detail ci-book"
      

    >
      <div className="editor-notices"><SaveErrorNotice status={editor.saveStatus} error={error} onSave={() => void save()} /></div>

      <div className="editor-layout">
        <ManuscriptPaper label="词稿正文滚动区">
            <CiBookManuscript renderTopline={labels=>(<EditorHeader bookPage workStatus={editor.status} onStatusChange={status=>patch({status})} workId={work.id} referenceContext={referenceContext}
        contextLabel="创作"
        backLabel={backLabel}
        title={editor.title}
        saveStatus={editor.saveStatus}
        saveError={error}
        documentLabel="词稿"
        extraAction={<><button className="quiet-button" type="button" onClick={e => {e.currentTarget.closest('details')?.querySelector('summary')?.focus();setReadingCopy(true)}}>复制读稿</button></>} onBack={onBack} onSave={()=>void save()} onExport={()=>setExportOpen(true)}>{labels}</EditorHeader>)} saveStatus={<SaveStatus status={editor.saveStatus} error={error} onSave={()=>void save()}/>} editor={editor} form={form} analysis={analysis} editorRef={verseRef} onTitle={title=>patch({title})} onBody={body=>{setHovered(undefined);patch({body})}} onSelection={selectPoint} onHover={previewPoint} onRhyme={setRhymeKey} onForm={()=>{if(!editor.body.trim()){setNextForm(form.id);setFormError('');setFormOpen(true)}}} onDetails={()=>setDetailsOpen(true)}/>


        </ManuscriptPaper>

        <CiBookInspector onFoot={line=>{const c=sourceCharacters(editor.body.split("\n")[line]??"").at(-1);if(c){setHovered(undefined);setSelection({line,...c,origin:"assistance"});}}} assistance={editor.assistance} onReference={reference=>patch({assistance:setRhymeReference(editor.assistance,reference,reference.segmentId)})} form={form} body={editor.body} analysis={analysis} current={current} rhymeKey={rhymeKey} onRhyme={setRhymeKey} setReading={setReading} onQuery={character=>dispatchReferenceIntent(root.current,{kind:'character',system:'cilin',character})}/>

      </div>

      {detailsOpen?<CiDialog title="词谱与校对" onClose={()=>setDetailsOpen(false)}><CiReview form={form} analysis={analysis} body={editor.body} onLocate={locate} onPattern={()=>{setDetailsOpen(false);requestAnimationFrame(()=>dispatchReferenceIntent(root.current,{kind:"pattern",pattern:referenceContext}))}}/></CiDialog>:null}
      {formOpen&&!editor.body.trim()?<CiDialog title="选择词牌" onClose={()=>{if(!formBusy)setFormOpen(false)}}><div className="ci-form-list">{ciForms.map(f=><button disabled={formBusy} key={f.id} aria-pressed={f.id===nextForm} onClick={()=>setNextForm(f.id)}>{f.name} · {f.author}体</button>)}</div>{formError?<p role="alert">{formError}</p>:null}<footer><ManuscriptStamp disabled={formBusy} onClick={()=>setFormOpen(false)}>取消</ManuscriptStamp><ManuscriptStamp disabled={formBusy} onClick={()=>void applyEmptyForm()}>{formBusy?"保存中":"采用词谱"}</ManuscriptStamp></footer></CiDialog>:null}
      {readingCopy ? <LegacyEditorPortal><CiReadingCopyDialog editor={editor} form={form} save={save} onClose={() => setReadingCopy(false)} /></LegacyEditorPortal> : null}
      {exportOpen ? <LegacyEditorPortal><ExportDialog editor={editor} onClose={() => setExportOpen(false)} onEnsureSaved={save} /></LegacyEditorPortal> : null}
    </ManuscriptPage>
  );
}
