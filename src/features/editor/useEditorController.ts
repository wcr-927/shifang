import { emptyAssistance, setRhymeReference, type WorkAssistanceState, type RhymeReference } from "../../shared/assistanceState";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { desktopApi } from "../../services/desktopApi";
import type { AnalyzePoemRequest } from "../../shared/ipc";
import { workAnalysisStateSchema, type WorkGenre, type WorkRecord, type WorkStatus } from "../../shared/work";
import type { PoemAnalysis, PoemReadingOverride } from "../../poetry/analysis/poemAnalyzer";
import { applyLinePaste, linePastePlan, pasteSourceKey, type PastePlan } from "./pastePlan";
import { AUTOSAVE_DELAY, createDocumentSaveDriver, type SaveStatus } from "./documentSaveDriver";
export type { SaveStatus } from "./documentSaveDriver";
import { type FlushResult } from "../../shared/close";
import { z } from "zod";
import { editorLineCharacters } from "../../poetry/analysis/editorCoordinates";
import { assistanceUnavailable, assistanceStateUnreadable, assistanceStateInvalid, assistanceStateMismatch, assistanceVariantIgnored, assistanceCandidateIgnored, describeRestoreReasons, fallbackTemplates, readTemplates, restoreOverrides } from "./editorAssistance";
import { analysisLineSlots, bodyToLines, genreLineCounts, linesToBody } from "./editorModel";

export type EditorLoadStatus = "loading" | "ready" | "not-found" | "error";

export interface TemplateSummary {
  id: WorkGenre;
  name: string;
  shortName: string;
  lineCount: number;
  lineLength: number;
  recommendedVariantId: string;
  variants: Array<{ id: string; name: string; style: string }>;
}

export interface EditorState {
  work: WorkRecord;
  title: string;
  body: string;
  lines: string[];
  genre: WorkGenre;
  status: WorkStatus;
  collectionId: string | null;
  location: string;
  notes: string;
  tags: string[];
  rhymeGroupId: string | null;
  assistance?: WorkAssistanceState;
  templateId: WorkGenre;
  variantId: string | undefined;
  readingOverrides: PoemReadingOverride[];
  ruleDatasetVersions: Record<string, string>;
  dirty: boolean;
  bodyEdited: boolean;
  analysisDirty: boolean;
  saveStatus: SaveStatus;
}

export interface EditorController {
  loadStatus: EditorLoadStatus;
  error: string;
  editor: EditorState | null;
  templates: TemplateSummary[];
  analysis: PoemAnalysis | null;
  analysisLoading: boolean;
  analysisError: string;
  assistanceStatus: "loading" | "ready" | "degraded";
  assistanceMessage: string;
  saveError: string;
  setTitle: (title: string) => void;
  setNotes: (notes: string) => void;
  setReference: (reference: RhymeReference) => void;
  setLine: (index: number, line: string) => void;
  setBody: (body: string) => void;
  pasteLines: (index: number, text: string) => void;
  pastePlan: PastePlan | null;
  confirmPaste: (planId: number) => void;
  cancelPaste: (planId: number) => void;
  readingInvalidations: number[];
  dismissReadingInvalidation: (lineIndex: number) => void;
  setGenre: (genre: WorkGenre) => void;
  setStatus: (status: WorkStatus) => void;
  setFirstLineRhyme: (mode: "strict" | "sourced-neighbor") => void;
  setVariant: (variantId: string | undefined) => void;
  selectReading: (lineIndex: number, characterIndex: number, character: string, candidateId: string) => void;
  clearReading: (lineIndex: number, characterIndex: number) => void;
  saveNow: () => Promise<boolean>;
  flush: () => Promise<FlushResult>;
  retryLoad: () => void;
  retrySave: () => Promise<boolean>;
}

let requestSequence = 0;

function updateEditor(editor: EditorState, patch: Partial<EditorState>): EditorState {
  return { ...editor, ...patch, dirty: true, saveStatus: "dirty" };
}

function replaceOverride(
  overrides: EditorState["readingOverrides"],
  next: EditorState["readingOverrides"][number],
): EditorState["readingOverrides"] {
  const remaining = overrides.filter(
    (item) => !(item.lineIndex === next.lineIndex && item.characterIndex === next.characterIndex),
  );
  return [...remaining, next].sort((left, right) => left.lineIndex - right.lineIndex || left.characterIndex - right.characterIndex);
}

function sameVersions(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every((key) => left[key] === right[key]);
}

// Analysis identity is independent from save revision and display metadata.
function analysisKey(editor: EditorState | null, workId: string, generation: number): string | null {
  if (!editor || editor.work.id !== workId) return null;
  return JSON.stringify({
    workId, generation, lines: editor.lines, genre: editor.genre, templateId: editor.templateId,
    firstLineRhyme: editor.assistance?.firstLineRhyme ?? "strict",
    format: { mode: editor.variantId ? "locked" : "auto", variantId: editor.variantId ?? null },
    overrides: [...editor.readingOverrides].sort((a, b) => a.lineIndex - b.lineIndex || a.characterIndex - b.characterIndex),
    ruleVersions: Object.entries(editor.ruleDatasetVersions).sort(([a], [b]) => a.localeCompare(b)),
  });
}

export function useEditorController(workId: string): EditorController {
  const [loadStatus, setLoadStatus] = useState<EditorLoadStatus>("loading");
  const [error, setError] = useState("");
  const [editor, setEditorState] = useState<EditorState | null>(null);
  const editorRef = useRef<EditorState | null>(null);
  const setEditor = useCallback((next: SetStateAction<EditorState | null>) => {
    const value = typeof next === "function" ? next(editorRef.current) : next;
    editorRef.current = value;
    setEditorState(value);
  }, []);
  const [templates, setTemplates] = useState<TemplateSummary[]>(fallbackTemplates);
  const [assistanceReady, setAssistanceReady] = useState(false);
  const [assistanceMessage, setAssistanceMessage] = useState("");
  const [rulesAvailable, setRulesAvailable] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ key: string; value: PoemAnalysis } | null>(null);
  const [analysisFailure, setAnalysisFailure] = useState<{ key: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const loadGeneration = useRef(0);
  const editorRevision = useRef(0);
  const analysisRevision = useRef(0);
  const latestAnalysisRequest = useRef(0);
  const hydrated = useRef(false);
  const [readingNotice, setReadingNotice] = useState<{ workId: string; generation: number; lines: number[] } | null>(null);
  const [pendingPaste, setPendingPaste] = useState<PastePlan | null>(null);
  const pendingPasteRef = useRef<PastePlan | null>(null);
  const pasteSequence = useRef(0);
  const setPastePlan = useCallback((plan: PastePlan | null) => { pendingPasteRef.current = plan; setPendingPaste(plan); }, []);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setReadingNotice(null);
    setPastePlan(null);
    setLoadStatus("loading");
    setError("");
    setAssistanceReady(false);
    setRulesAvailable(false);
    setAssistanceMessage("");
    setAnalysisFailure(null);
    setAnalysisResult(null);
    setTemplates(fallbackTemplates);
    try {
      const work = await desktopApi.works.get(workId);
      if (generation !== loadGeneration.current) return;
      if (!work) { setEditor(null); setLoadStatus("not-found"); return; }
      if ((work.genre === "free" || work.genre === "ci")) throw new Error("请在自由编辑器中打开此作品");
      const nextEditor: EditorState = {
        work, title: work.title, body: work.body,
        lines: bodyToLines(work.body, genreLineCounts[work.genre]),
        genre: work.genre, status: work.status, collectionId: work.collectionId,
        location: work.location, notes: work.notes, tags: work.tags, rhymeGroupId: work.rhymeGroupId, assistance: work.assistance,
        templateId: work.genre, variantId: undefined, readingOverrides: [], ruleDatasetVersions: {},
        dirty: false, bodyEdited: false, analysisDirty: false, saveStatus: "saved",
      };
      hydrated.current = true;
      editorRevision.current = 0;
      setEditor(nextEditor);
      setLoadStatus("ready");

      // Work is already usable. Auxiliary failures cannot take this editor away.
      const [templateResult, stateResult] = await Promise.allSettled([
        Promise.resolve().then(() => desktopApi.rules.listTemplates()),
        Promise.resolve().then(() => desktopApi.works.getAnalysisState(workId)),
      ]);
      if (generation !== loadGeneration.current) return;
      let availableTemplates = fallbackTemplates;
      let templateDataValid = false;
      const warnings: string[] = [];
      try {
        if (templateResult.status === "rejected") throw templateResult.reason;
        availableTemplates = readTemplates(templateResult.value);
        templateDataValid = true;
        setTemplates(availableTemplates);
        setRulesAvailable(true);
      } catch { warnings.push(assistanceUnavailable); }
      if (stateResult.status === "rejected") {
        warnings.push(stateResult.reason instanceof z.ZodError ? assistanceStateInvalid : assistanceStateUnreadable);
      } else try {
        const saved = stateResult.value === null ? null : workAnalysisStateSchema.parse(stateResult.value);
        if (saved) {
          if (saved.workId !== workId || saved.templateId !== work.genre) {
            warnings.push(assistanceStateMismatch);
          } else {
            const restored = restoreOverrides(saved.readingOverrides, nextEditor.lines);
            if (restored.ignored) warnings.push(describeRestoreReasons(restored.reasons));
            const variantExists = availableTemplates.find(item => item.id === work.genre)?.variants.some(variant => variant.id === saved.variantId);
            if (saved.variantId && !variantExists && templateDataValid) warnings.push(assistanceVariantIgnored);
            // Do not hydrate stale choices over edits made while auxiliary I/O ran.
            if (editorRevision.current === 0) setEditor(current => current ? {
              ...current,
              variantId: variantExists ? saved.variantId ?? undefined : undefined,
              readingOverrides: restored.overrides,
              ruleDatasetVersions: saved.ruleDatasetVersions,
            } : current);
          }
        }
      } catch { warnings.push(assistanceStateInvalid); }
      setAssistanceMessage(warnings.join("\n"));
      setAssistanceReady(true);
    } catch {
      if (generation !== loadGeneration.current) return;
      setLoadStatus("error");
      setError("诗稿暂时无法取阅，请重试。");
    }
  }, [workId]);

  useEffect(() => {
    hydrated.current = false;
    void load();
    return () => { hydrated.current = false; loadGeneration.current += 1; };
  }, [load]);

  const patchEditor = useCallback((patch: Partial<EditorState>) => {
    editorRevision.current += 1;
    setEditor((current) => (current ? updateEditor(current, patch) : current));
  }, []);

  const dismissReadingInvalidation = useCallback((lineIndex: number) => {
    setReadingNotice((notice) => notice ? { ...notice, lines: notice.lines.filter((index) => index !== lineIndex) } : notice);
  }, []);
  const invalidateReadings = useCallback((current: EditorState, changedLines: number[]) => {
    const affected = new Set(changedLines);
    const removed = current.readingOverrides.filter((item) => affected.has(item.lineIndex));
    if (removed.length) setReadingNotice((notice) => ({
      workId: current.work.id, generation: loadGeneration.current,
      lines: [...new Set([
        ...(notice?.workId === current.work.id && notice.generation === loadGeneration.current ? notice.lines : []),
        ...removed.map((item) => item.lineIndex),
      ])].sort((a, b) => a - b),
    }));
    return current.readingOverrides.filter((item) => !affected.has(item.lineIndex));
  }, []);

  const setNotes = useCallback((notes: string) => patchEditor({ notes }), [patchEditor]);
  const setTitle = useCallback((title: string) => patchEditor({ title }), [patchEditor]);
  const setBody = useCallback((body:string)=>{
    setEditor(current=>{
      if(!current||current.body===body)return current;
      const lines=bodyToLines(body,genreLineCounts[current.genre]);
      const affected=Array.from({length:Math.max(lines.length,current.lines.length)},(_,i)=>i).filter(i=>lines[i]!==current.lines[i]);
      setPastePlan(null);editorRevision.current+=1;setAnalysisResult(null);
      return updateEditor(current,{body,lines,bodyEdited:true,readingOverrides:invalidateReadings(current,affected)});
    });
  },[invalidateReadings,setPastePlan]);
  const setLine = useCallback((index: number, line: string) => {
    setEditor((current) => {
      if (!current || current.lines[index] === line) return current;
      const lines = [...current.lines];
      while (lines.length <= index) lines.push("");
      lines[index] = line;
      setPastePlan(null);
      editorRevision.current += 1;
      setAnalysisResult(null);
      return updateEditor(current, { lines, body: linesToBody(lines), bodyEdited: true,
        readingOverrides: invalidateReadings(current, [index]) });
    });
  }, [invalidateReadings, setPastePlan]);

  const applyPaste = useCallback((plan: PastePlan) => {
    const current = editorRef.current;
    if (!current || current.work.id !== plan.workId || loadGeneration.current !== plan.generation ||
        pasteSourceKey(current, loadGeneration.current) !== plan.sourceKey) return;
    const lines = applyLinePaste(current.lines, plan);
    editorRevision.current += 1;
    setAnalysisResult(null);
    setEditor(updateEditor(current, { lines, body: linesToBody(lines), bodyEdited: true,
      readingOverrides: invalidateReadings(current, plan.changes.map((item) => item.lineIndex)) }));
  }, [invalidateReadings, setEditor]);
  const pasteLines = useCallback((index: number, text: string) => {
    const current = editorRef.current;
    if (!current || !hydrated.current || !Number.isInteger(index) || index < 0) return;
    const incoming = linePastePlan(current.lines, index, text);
    const { changes } = incoming;
    setPastePlan(null); // A new paste supersedes any earlier confirmation.
    if (!changes.length) return;
    const plan: PastePlan = { id: ++pasteSequence.current, workId: current.work.id,
      generation: loadGeneration.current, sourceKey: pasteSourceKey(current, loadGeneration.current),
      ...incoming };
    if (changes.some((item) => item.previous.length > 0)) setPastePlan(plan);
    else applyPaste(plan);
  }, [applyPaste, setPastePlan]);
  const confirmPaste = useCallback((planId: number) => {
    const plan = pendingPasteRef.current;
    if (!plan || plan.id !== planId) return;
    setPastePlan(null);
    applyPaste(plan); // Recheck the work/session/body snapshot immediately before mutation.
  }, [applyPaste, setPastePlan]);
  const cancelPaste = useCallback((planId: number) => {
    if (pendingPasteRef.current?.id === planId) setPastePlan(null);
  }, [setPastePlan]);

  const setGenre = useCallback((genre: WorkGenre) => {
    const template = templates.find((item) => item.id === genre);
    if (!template) return;
    patchEditor({ genre, templateId: genre, variantId: undefined, lines: editor?.lines ?? [], body: editor?.body ?? "" });
  }, [editor?.body, editor?.lines, patchEditor, templates]);

  const setReference = useCallback((reference: RhymeReference) => {
    const current=editorRef.current;if(!current)return;
    patchEditor({assistance:setRhymeReference(current.assistance,reference,"poem")});
  },[patchEditor]);
  const setStatus = useCallback((status: WorkStatus) => patchEditor({ status }), [patchEditor]);
  const setFirstLineRhyme = useCallback((mode: "strict" | "sourced-neighbor") => {
    const current = editorRef.current;
    if (current) patchEditor({assistance:{...(current.assistance ?? emptyAssistance()),firstLineRhyme:mode}});
  }, [patchEditor]);
  const setVariant = useCallback((variantId: string | undefined) => patchEditor({ variantId }), [patchEditor]);

  const selectReading = useCallback((lineIndex: number, characterIndex: number, character: string, candidateId: string) => {
    const current = editorRef.current;
    if (!current) return;
    const sourceText = current.lines[lineIndex];
    const target = editorLineCharacters(sourceText ?? "")[characterIndex];
    if (!target || target.character !== character) return;
    patchEditor({ readingOverrides: replaceOverride(current.readingOverrides, { lineIndex, characterIndex, character, candidateId, sourceText, sourceOffset: target.sourceOffset }) });
    dismissReadingInvalidation(lineIndex);
  }, [editor, patchEditor, dismissReadingInvalidation]);

  const clearReading = useCallback((lineIndex: number, characterIndex: number) => {
    if (!editor) return;
    patchEditor({ readingOverrides: editor.readingOverrides.filter((item) => !(item.lineIndex === lineIndex && item.characterIndex === characterIndex)) });
  }, [editor, patchEditor]);

  const saveDriver = useMemo(() => createDocumentSaveDriver({
    snapshot: () => editorRef.current ? { ...editorRef.current, saveGeneration: loadGeneration.current } : null,
    dirty: snapshot => snapshot.dirty,
    token: () => `${loadGeneration.current}:${editorRevision.current}:${analysisRevision.current}`,
    active: snapshot => hydrated.current && snapshot.saveGeneration === loadGeneration.current && editorRef.current?.work.id === snapshot.work.id,
    saving: () => { setSaveError(""); setEditor(current => current ? { ...current, saveStatus: "saving" } : current); },
    persist: snapshot => desktopApi.works.saveEditorState({
      workId: snapshot.work.id, title: snapshot.title, body: snapshot.body, genre: snapshot.genre,
      status: snapshot.status, collectionId: snapshot.collectionId, location: snapshot.location,
      notes: snapshot.notes, assistance: snapshot.assistance, rhymeGroupId: snapshot.rhymeGroupId, tags: snapshot.tags,
      templateId: snapshot.templateId, variantId: snapshot.variantId ?? null,
      readingOverrides: snapshot.readingOverrides, ruleDatasetVersions: snapshot.ruleDatasetVersions,
    }),
    saved: saved => setEditor(current => current ? {
      ...current, work: saved.work, dirty: false, bodyEdited: false, analysisDirty: false, saveStatus: "saved",
    } : current),
    failed: message => { setSaveError(message); setEditor(current => current ? { ...current, saveStatus: "error" } : current); },
    checkpoint: () => window.shifang.works.saveVersion ? desktopApi.works.saveVersion(workId) : Promise.resolve(),
    checkpointSaved: () => { if (!editorRef.current?.dirty) { setSaveError(""); setEditor(current => current ? { ...current, saveStatus: "saved" } : current); } },
  }), [workId, setEditor]);
  const flush = saveDriver.flush;
  const saveNow = saveDriver.saveNow;

  useEffect(() => {
    if (!editor?.dirty || editor.saveStatus !== "dirty" || !hydrated.current) return;
    const timer = window.setTimeout(() => { void flush(); }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [editor, flush]);

  const inputKey = analysisKey(editor, workId, loadGeneration.current);
  const analysisInput = useMemo(() => {
    if (!editor || loadStatus !== "ready" || !assistanceReady || !rulesAvailable) return null;
    return {
      text: linesToBody(editor.lines),
      editorLines: analysisLineSlots(editor.lines, genreLineCounts[editor.genre]),
      templateId: editor.templateId,
      firstLineRhyme: editor.assistance?.firstLineRhyme ?? "strict",
      variantId: editor.variantId,
      overrides: editor.readingOverrides,
    };
  }, [inputKey, loadStatus, assistanceReady, rulesAvailable]);
  const analysis = analysisInput && analysisResult?.key === inputKey ? analysisResult.value : null;
  const analysisError = analysisInput && analysisFailure?.key === inputKey ? analysisFailure.message : "";
  const analysisLoading = Boolean(analysisInput && !analysis && !analysisError);

  useEffect(() => {
    if (!analysisInput || !inputKey || analysisResult?.key === inputKey) return;
    const generation = loadGeneration.current;
    const requestKey = inputKey;
    const requestNumber = ++requestSequence;
    latestAnalysisRequest.current = requestNumber;
    const isCurrent = () => generation === loadGeneration.current && latestAnalysisRequest.current === requestNumber && analysisKey(editorRef.current, workId, generation) === requestKey;
    const timer = window.setTimeout(async () => {
      setAnalysisFailure(null);
      const request: AnalyzePoemRequest = { ...analysisInput, requestId: `editor-${workId}-${requestNumber}` };
      try {
        const result = await desktopApi.analysis.analyzePoem(request);
        if (!isCurrent()) return;
        const datasetVersions = z.record(z.string(), z.string().min(1)).parse(result.datasetVersions);
        if (result.ignoredOverrideCount) setAssistanceMessage(current => current.includes(assistanceCandidateIgnored) ? current : [current, assistanceCandidateIgnored].filter(Boolean).join("\n"));
        const current = editorRef.current!;
        const activeOverrides = current.readingOverrides.filter((override) => {
          const character = result.lines.find((line) => line.lineIndex === override.lineIndex)
            ?.characters.find((item) => item.characterIndex === override.characterIndex);
          return character?.character === override.character && character.reading.source === "user-override" &&
            character.reading.selectedCandidate?.id === override.candidateId;
        });
        const overridesChanged = activeOverrides.length !== current.readingOverrides.length;
        const versionsChanged = !sameVersions(current.ruleDatasetVersions, datasetVersions);
        const next = !overridesChanged && !versionsChanged ? current : {
          ...current, readingOverrides: overridesChanged ? activeOverrides : current.readingOverrides,
          ruleDatasetVersions: datasetVersions, analysisDirty: true,
        };
        if (next !== current) { analysisRevision.current += 1; setEditor(next); }
        // Adopt server-used versions and filtered invalid choices in the same
        // render as this result. Their normalization must not trigger a loop.
        setAnalysisResult({ key: analysisKey(next, workId, generation)!, value: result });
        setAnalysisFailure(null);
      } catch (cause) {
        if (!isCurrent()) return;
        setAnalysisResult(null);
        setAnalysisFailure({ key: requestKey, message: assistanceUnavailable });
      }
    }, 200);
    return () => { window.clearTimeout(timer); latestAnalysisRequest.current = 0; };
  }, [analysisInput, workId]);

  return {
    loadStatus,
    error,
    editor,
    templates,
    analysis,
    analysisLoading,
    analysisError,
    assistanceStatus: analysisError || assistanceMessage ? "degraded" : assistanceReady ? "ready" : "loading",
    assistanceMessage: analysisError || assistanceMessage,
    saveError,
    setTitle,
    setNotes,
    setLine,
    setBody,
    pasteLines,
    pastePlan: pendingPaste && editor?.work.id === workId && pendingPaste.workId === workId && pendingPaste.generation === loadGeneration.current && pasteSourceKey(editor, loadGeneration.current) === pendingPaste.sourceKey ? pendingPaste : null,
    confirmPaste,
    cancelPaste,
    readingInvalidations: readingNotice?.workId === workId && readingNotice.generation === loadGeneration.current ? readingNotice.lines : [],
    dismissReadingInvalidation,
    setGenre,
    setStatus,
    setReference,
    setFirstLineRhyme,
    setVariant,
    selectReading,
    clearReading,
    saveNow,
    flush,
    retryLoad: () => { void load(); },
    retrySave: saveNow,
  };
}
