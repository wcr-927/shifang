import { canLeave, type FlushResult } from "../shared/close";
import type { AppRoute } from "./routes";

export function createNavigationCoordinator(
  flush: () => Promise<FlushResult>,
  commit: (route: AppRoute, replace: boolean, historyIndex?: number) => void,
  report: (message: string) => void,
) {
  let target: { route: AppRoute; replace: boolean; historyIndex?: number } | null = null;
  let pending: Promise<void> | null = null;
  let disposed = false;
  return {
    request(route: AppRoute, replace = false, historyIndex?: number): void {
      target = { route, replace, historyIndex };
      if (pending) return;
      report("");
      pending = Promise.resolve().then(flush).then((result) => {
        if (disposed) return;
        if (canLeave(result) && target) commit(target.route, target.replace, target.historyIndex);
        else if (!canLeave(result)) report("message" in result ? result.message : "保存未完成，请重试。");
      }).catch(() => {
        if (!disposed) report("保存未完成，已保留当前诗稿，请重试。");
      }).finally(() => { pending = null; target = null; });
    },
    dispose(): void { disposed = true; },
  };
}
