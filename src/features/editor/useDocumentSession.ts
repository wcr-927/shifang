import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktopApi } from "../../services/desktopApi";
import { registerCloseFlush } from "../../services/closeCoordinator";
import { AUTOSAVE_DELAY, createDocumentSaveDriver, documentSaveError, type SaveStatus } from "./documentSaveDriver";

type Document = { id: string; body: string; notes: string };
type Session<S> = S & { work: S; dirty: boolean; saveStatus: SaveStatus };

export function useDocumentSession<S extends Document>(work: S, persist: (snapshot: S) => Promise<unknown>) {
  const [editor, setEditor] = useState<Session<S>>(() => ({ ...work, work, dirty: false, saveStatus: "saved" }));
  const [error, setError] = useState("");
  const current = useRef(editor);
  const revision = useRef(0);
  const mounted = useRef(true);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = useCallback((change: Partial<S> | Partial<{ dirty: boolean; saveStatus: SaveStatus }>) => {
    current.current = { ...current.current, ...change };
    if (mounted.current) setEditor(current.current);
  }, []);
  const patch = useCallback((change: Partial<S>) => {
    revision.current++;
    update({ ...change, dirty: true, saveStatus: "dirty" });
  }, [update]);
  const driver = useMemo(() => createDocumentSaveDriver({
    snapshot: () => current.current,
    dirty: snapshot => snapshot.dirty,
    token: () => revision.current,
    active: snapshot => mounted.current && current.current.id === snapshot.id,
    persist: snapshot => persistRef.current(snapshot),
    saving: () => update({ saveStatus: "saving" }),
    saved: () => { update({ dirty: false, saveStatus: "saved" }); setError(""); },
    failed: message => { update({ saveStatus: "error" }); setError(message); },
    errorMessage: documentSaveError,
    checkpoint: () => window.shifang.works.saveVersion ? desktopApi.works.saveVersion(current.current.id) : Promise.resolve(),
    checkpointSaved: () => { if (!current.current.dirty) { update({ saveStatus: "saved" }); setError(""); } },
  }), [update]);
  useEffect(() => registerCloseFlush(driver.flush), [driver]);
  useEffect(() => {
    if (!editor.dirty || editor.saveStatus !== "dirty") return;
    const timer = setTimeout(() => void driver.flush(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [editor, driver]);
  return { editor, patch, save: driver.saveNow, flush: driver.flush, error };
}
