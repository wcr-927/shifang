import type { FlushResult } from "../../shared/close";

// One writer for autosave, manual save and leave/close. A changed revision
// must be persisted again before callers may leave the editor.
export function createSaveCoordinator(saveLatest: () => Promise<FlushResult | { status: "changed" }>) {
  let pending: Promise<FlushResult> | null = null;
  return {
    flush(): Promise<FlushResult> {
      if (pending) return pending;
      pending = Promise.resolve().then(async () => {
        let result = await saveLatest();
        while (result.status === "changed") result = await saveLatest();
        return result;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
