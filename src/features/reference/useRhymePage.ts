import { useEffect, useRef, useState } from "react";
import { desktopApi } from "../../services/desktopApi";
import type { ReferenceGroupPage, ReferenceSystem } from "../../shared/reference";

/** One explicit page at a time, isolated from previous groups and scopes. */
export function useRhymePage(system: ReferenceSystem, groupId: string | null, view: "common-only" | "all") {
  const [attempt, setAttempt] = useState(0);
  const scope = JSON.stringify([system, groupId, view, attempt]);
  const current = useRef({ scope, revision: 0 }), pending = useRef<number | null>(null);
  if (current.current.scope !== scope) current.current = { scope, revision: current.current.revision + 1 };
  const revision = current.current.revision;
  const identity = `${scope}:${revision}`;
  const [result, setResult] = useState<{ identity: string; page: ReferenceGroupPage | null; error: string; busy: boolean }>({ identity: "", page: null, error: "", busy: false });
  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setResult({ identity, page: null, error: "", busy: true });
    void desktopApi.reference.group({ system, id: groupId, view, offset: 0, limit: view === "common-only" ? 48 : 64 }).then(page => {
      if (active) setResult({ identity, page, error: "", busy: false });
    }, () => {
      if (active) setResult({ identity, page: null, error: "韵字资料暂不可用", busy: false });
    });
    return () => { active = false; };
  }, [system, groupId, view, identity]);
  useEffect(() => () => { current.current.revision++; }, []);
  const state = result.identity === identity ? result : { page: null, error: "", busy: Boolean(groupId) };
  async function loadMore() {
    const page = state.page;
    if (!groupId || !page || page.nextOffset === null || state.busy || pending.current === revision) return;
    pending.current = revision;
    setResult({ identity, page, error: "", busy: true });
    try {
      const next = await desktopApi.reference.group({ system, id: groupId, view, offset: page.nextOffset, limit: view === "common-only" ? 48 : 64 });
      if (current.current.revision === revision) setResult({ identity, page: { ...next, items: [...page.items, ...next.items] }, error: "", busy: false });
    } catch {
      if (current.current.revision === revision) setResult({ identity, page, error: "更多韵字暂不可用", busy: false });
    } finally {
      if (pending.current === revision) pending.current = null;
    }
  }
  return { ...state, loadMore, retry: () => state.page ? void loadMore() : setAttempt(value => value + 1) };
}
