import { canLeave, flushFailureMessage } from "../../shared/close";
import { getDesktopErrorMessage } from "../../services/desktopApi";
import { createSaveCoordinator } from "./saveCoordinator";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";
export const AUTOSAVE_DELAY = 800;

// The adapter owns document/analysis identity. This driver owns the one writer,
// revision acknowledgement and explicit checkpoint semantics for every editor.
export function createDocumentSaveDriver<S, R>(adapter: {
  snapshot: () => S | null;
  dirty: (snapshot: S) => boolean;
  token: () => string | number;
  active: (snapshot: S) => boolean;
  persist: (snapshot: S) => Promise<R>;
  saving: () => void;
  saved: (result: R) => void;
  failed: (message: string) => void;
  checkpoint: () => Promise<unknown>;
  checkpointSaved: () => void;
  errorMessage?: (cause: unknown, snapshot: S) => string;
}) {
  const coordinator = createSaveCoordinator(async () => {
    const snapshot = adapter.snapshot();
    if (!snapshot || !adapter.dirty(snapshot)) return { status: "clean" };
    if (!adapter.active(snapshot)) return { status: "failed", message: flushFailureMessage };
    const token = adapter.token();
    adapter.saving();
    try {
      const result = await adapter.persist(snapshot);
      if (!adapter.active(snapshot)) return { status: "failed", message: flushFailureMessage };
      if (adapter.token() !== token) return { status: "changed" };
      adapter.saved(result);
      return { status: "saved" };
    } catch (cause) {
      const message = adapter.errorMessage?.(cause, snapshot) ?? getDesktopErrorMessage(cause, flushFailureMessage);
      if (adapter.active(snapshot)) {
        if (adapter.token() !== token) return { status: "changed" };
        adapter.failed(message);
      }
      return { status: "failed", message };
    }
  });
  let manual: Promise<boolean> | null = null;
  let requestedToken: string | number;
  return {
    flush: coordinator.flush,
    saveNow(): Promise<boolean> {
      requestedToken = adapter.token();
      if (manual) return manual;
      manual = (async () => {
        while (true) {
          if (!canLeave(await coordinator.flush())) return false;
          const snapshot = adapter.snapshot();
          if (!snapshot || !adapter.active(snapshot)) return false;
          const token = adapter.token();
          const checkpointRequest = requestedToken;
          let succeeded = false;
          try {
            await adapter.checkpoint();
            if (!adapter.active(snapshot)) return false;
            if (adapter.token() === token) adapter.checkpointSaved();
            succeeded = true;
          } catch (cause) {
            // A late checkpoint must never overwrite the status of newer input.
            if (adapter.active(snapshot) && adapter.token() === token) {
              adapter.failed(getDesktopErrorMessage(cause, "正文已保存，但历史快照未完成，请重试保存。"));
            }
          }
          // Coalesce the same revision, but drain a newer explicit save request.
          // Input alone does not request an extra manual checkpoint.
          if (requestedToken === checkpointRequest) return succeeded;
        }
      })().finally(() => { manual = null; });
      return manual;
    },
  };
}

export function documentSaveError(cause: unknown, snapshot: { body: string; notes: string }): string {
  if (snapshot.body.length > 100000) return "正文超过当前保存长度上限，输入已完整保留，请缩短后重试。";
  if (snapshot.notes.length > 20000) return "创作记超过当前保存长度上限，输入已完整保留，请缩短后重试。";
  return getDesktopErrorMessage(cause, "保存未完成，请重试；正文和创作记仍保留在当前窗口。");
}
