import { ManuscriptMore, ManuscriptStatusChoice } from "../manuscript/ManuscriptTools";
import { ManuscriptHeader, LegacyEditorPortal } from "../manuscript/ManuscriptUI";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useReferenceSession } from "../reference/ReferenceSession";
import { REFERENCE_CONTEXT_EVENT, type ReferenceContextRequest, type ReferencePatternContext } from "../../shared/referenceContext";
import { captureEditorPosition } from "../../features/reference/editorPosition";
const ReferenceDrawer = lazy(() => import("../reference/ReferenceDrawer").then(module => ({ default: module.ReferenceDrawer })));
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { ArrowLeft, Check, ChevronRight, Download } from "lucide-react";
import type { ReactNode } from "react";
import type { EditorState, SaveStatus, TemplateSummary } from "../../features/editor/useEditorController";
import { statusLabels, type WorkGenre, type WorkStatus } from "../../shared/work";
import { SaveStatus as SaveStatusView } from "./SaveStatus";

export function EditorHeader({
  workStatus,onStatusChange,bookPage = false, workId, backLabel = "诗稿", contextLabel, title, saveStatus, onBack, onSave, onExport, saveError, notesAction, documentLabel = "诗稿", referenceContext, extraAction, children,
}: {
  children?: ReactNode;
  workStatus?: WorkStatus;
  onStatusChange?:(value:WorkStatus)=>void;
  bookPage?: boolean;
  extraAction?: ReactNode;
  workId?: string;
  referenceContext?: ReferencePatternContext;
  notesAction?: ReactNode;
  backLabel?: string;
  contextLabel: string;
  title: string;
  saveStatus: SaveStatus;
  documentLabel?: "诗稿" | "词稿" | "现代诗" | "作品";
  onBack: () => void;
  onSave: () => void;
  onExport: () => void;
  saveError: string;
}): JSX.Element {
  const session = useReferenceSession();
  const [historyOpen,setHistoryOpen]=useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceVisited, setReferenceVisited] = useState(false);
  const [referenceRequest, setReferenceRequest] = useState<ReferenceContextRequest>();
  const header = useRef<HTMLElement>(null);
  const editorRoot = useRef<HTMLElement | null>(null);
  const manuscriptPosition = useRef<(() => void) | null>(null);
  const restorePosition = useRef<() => void>(() => {});
  const pointerCaptured = useRef(false);
  const composing = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const owner = header.current?.closest<HTMLElement>(".editor-page") ?? header.current?.parentElement ?? null;
    editorRoot.current = owner;
    if (!owner) return;
    const remember = (event?: Event) => {
      const active = (event?.type === "focusout" ? event.target : document.activeElement) as HTMLElement | null;
      if (active && owner.contains(active) && !header.current?.contains(active) && active.matches("input,textarea,[contenteditable=true],.ci-reading")) manuscriptPosition.current = captureEditorPosition(owner, active);
    };
    const request = (event: Event) => {
      const detail = (event as CustomEvent<ReferenceContextRequest>).detail;
      if (!detail || composing.current) return;
      // A lookup launched inside the drawer must never replace the manuscript return position.
      if (!referenceOpen) restorePosition.current = captureReturnPosition();
      if (sessionRef.current) sessionRef.current.open({ editorRoot: owner, contextLabel, referenceContext, restorePosition: restorePosition.current }, detail);
      else { setReferenceRequest(detail); setReferenceVisited(true); setReferenceOpen(true); }
    };
    const startComposition = () => { composing.current = true; };
    const endComposition = () => { composing.current = false; remember(); };
    owner.addEventListener("compositionstart", startComposition);
    owner.addEventListener("compositionend", endComposition);
    owner.addEventListener(REFERENCE_CONTEXT_EVENT, request);
    owner.addEventListener("focusout", remember);
    owner.addEventListener("input", remember);
    owner.addEventListener("select", remember);
    document.addEventListener("selectionchange", remember);
    return () => {
      owner.removeEventListener("compositionstart", startComposition);
      owner.removeEventListener("compositionend", endComposition);
      owner.removeEventListener(REFERENCE_CONTEXT_EVENT, request);
      owner.removeEventListener("focusout", remember);
      owner.removeEventListener("input", remember);
      owner.removeEventListener("select", remember);
      document.removeEventListener("selectionchange", remember);
    };
  }, [referenceOpen, contextLabel, referenceContext]);
  useEffect(() => { sessionRef.current?.update({ editorRoot: editorRoot.current, contextLabel, referenceContext, restorePosition: restorePosition.current }); }, [contextLabel, referenceContext]);
  function captureReturnPosition(): () => void {
    const active = document.activeElement as HTMLElement | null;
    const owner = editorRoot.current;
    if (active && owner?.contains(active) && !header.current?.contains(active) && !active.closest(".reference-session") && active.matches("input,textarea,[contenteditable=true],.ci-reading")) return captureEditorPosition(owner);
    return manuscriptPosition.current ?? captureEditorPosition(owner ?? document);
  }
  function openReference(): void {
    if (composing.current) return;
    if (!pointerCaptured.current) restorePosition.current = captureReturnPosition();
    pointerCaptured.current = false;
    if (sessionRef.current) sessionRef.current.open({ editorRoot: editorRoot.current, contextLabel, referenceContext, restorePosition: restorePosition.current });
    else { setReferenceVisited(true); setReferenceOpen(true); }
  }
  const save = useRef(onSave);
  save.current = onSave;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      // Dialogs are portalled outside the editor. Never save behind a modal.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      save.current();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  const referenceButton=<button className="quiet-button" type="button" onPointerDown={event=>{if(composing.current){event.preventDefault();return;}if(event.button===0){restorePosition.current=captureReturnPosition();pointerCaptured.current=true;}}} onClick={openReference}>资料</button>;
  const historyButton=workId?<button className="quiet-button history-button" type="button" onClick={()=>setHistoryOpen(true)} aria-label="版本历史">历史</button>:null;
  const saveAndExport=<><SaveStatusView status={saveStatus} error={saveError} onSave={onSave}/><button className="icon-button" type="button" onClick={onExport} title={`导出${documentLabel}`} aria-label={`导出${documentLabel}`}><Download size={16} strokeWidth={1.5}/></button></>;
  return (<>
    {bookPage?<ManuscriptHeader ref={header} onBack={onBack} context={contextLabel}>{children}<ManuscriptMore compact>{historyButton}{referenceButton}{workStatus&&onStatusChange?<ManuscriptStatusChoice status={workStatus} onChange={onStatusChange}/>:null}{extraAction}<button type="button" aria-label={`导出${documentLabel}`} onClick={e=>{e.currentTarget.closest('details')?.querySelector('summary')?.focus();onExport()}}>导出作品</button></ManuscriptMore></ManuscriptHeader>:<header ref={header} className="editor-header"><div className="editor-location"><button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} strokeWidth={1.5}/>{backLabel}</button><ChevronRight size={14} strokeWidth={1.4} aria-hidden="true"/><span className="editor-context-label">{contextLabel}</span><span className="editor-location-separator" aria-hidden="true">·</span><span className="editor-current-title" title={title||"未题"}>{title||"未题"}</span></div><div className="editor-actions">{historyButton}{extraAction}{notesAction}{referenceButton}{saveAndExport}</div></header>}

    {!session && referenceVisited ? <Suspense fallback={<div role="status">正在打开资料…</div>}><ReferenceDrawer contextLabel={contextLabel} open={referenceOpen} editorRoot={editorRoot.current} referenceContext={referenceContext} request={referenceRequest} onClose={() => setReferenceOpen(false)} restorePosition={restorePosition.current} /></Suspense> : null}
    {historyOpen&&workId?<LegacyEditorPortal><VersionHistoryDialog workId={workId} onClose={()=>setHistoryOpen(false)}/></LegacyEditorPortal>:null}
  </>);
}

export function EditorControls({ editor, templates, onGenre, onStatus, onVariant }: {
  notesAction?: ReactNode;
  editor: EditorState; templates: TemplateSummary[]; onGenre: (value: WorkGenre) => void;
  onStatus: (value: WorkStatus) => void; onVariant: (value: string | undefined) => void;
}): JSX.Element {
  const template = templates.find((item) => item.id === editor.templateId);
  return (<div className="editor-controls" role="group" aria-label="诗稿属性">
        <label>诗体<select value={editor.genre} onChange={(event) => onGenre(event.target.value as WorkGenre)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>状态<select value={editor.status} onChange={(event) => onStatus(event.target.value as WorkStatus)}>{editor.status === "archived" ? <option value="archived" disabled>{statusLabels.archived}</option> : null}<option value="draft">{statusLabels.draft}</option><option value="completed">{statusLabels.completed}</option></select></label>
        <label className="variant-label">格式<select value={editor.variantId ?? "auto"} onChange={(event) => onVariant(event.target.value === "auto" ? undefined : event.target.value)}><option value="auto">自动判断</option>{template?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}{variant.id === template.recommendedVariantId ? " · 系统推荐" : ""}</option>)}</select></label>
        {editor.variantId ? <span className="locked-mark"><Check size={13} strokeWidth={1.5} />已锁定</span> : null}
      </div>);
}
