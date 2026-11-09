import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ReferenceContextRequest, ReferencePatternContext } from "../../shared/referenceContext";
const ReferenceDrawer = lazy(() => import("./ReferenceDrawer").then(module => ({ default: module.ReferenceDrawer })));
export interface ReferenceSessionOwner {
  editorRoot: HTMLElement | null;
  contextLabel: string;
  referenceContext?: ReferencePatternContext;
  restorePosition: () => void;
}
interface Session {
  open: (owner: ReferenceSessionOwner, request?: ReferenceContextRequest) => void;
  update: (owner: ReferenceSessionOwner) => void;
}
const ReferenceSessionContext = createContext<Session | null>(null);
export function useReferenceSession(): Session | null { return useContext(ReferenceSessionContext); }

/** One read-only workspace for the lifetime of the app, including navigation between manuscripts. */
export function ReferenceSessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [owner, setOwner] = useState<ReferenceSessionOwner>();
  const [request, setRequest] = useState<ReferenceContextRequest>();
  const [opened, setOpened] = useState(false);
  const open = useCallback((next: ReferenceSessionOwner, intent?: ReferenceContextRequest) => {
    setOwner(next);
    // A plain open restores the last view; explicit intents alone replace a query.
    if (intent) setRequest(intent);
    setOpened(true);
  }, []);
  const update = useCallback((next: ReferenceSessionOwner) => {
    setOwner(previous => previous?.editorRoot === next.editorRoot ? { ...previous, contextLabel: next.contextLabel, referenceContext: next.referenceContext } : previous);
  }, []);
  useEffect(() => {
    if (!owner?.editorRoot || !opened) return;
    // The owner can disappear on navigation while the read-only session remains mounted.
    const observer = new window.MutationObserver(() => { if (!owner.editorRoot?.isConnected) setOpened(false); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [owner, opened]);
  return <ReferenceSessionContext.Provider value={{ open, update }}>{children}{owner ? <Suspense fallback={opened ? <p role="status">正在打开资料…</p> : null}><ReferenceDrawer open={opened} contextLabel={owner.contextLabel} editorRoot={owner.editorRoot} referenceContext={owner.referenceContext} restorePosition={owner.restorePosition} request={request} onClose={() => setOpened(false)} /></Suspense> : null}</ReferenceSessionContext.Provider>;
}
