export type FlushResult =
  | { status: "saved" | "clean" }
  | { status: "failed" | "timeout"; message: string };

export function canLeave(result: FlushResult): boolean {
  return result.status === "saved" || result.status === "clean";
}

export const flushFailureMessage = "保存未完成，已保留当前诗稿，请重试。";
export const flushTimeoutMessage = "等待保存超时，已取消离开并保留当前窗口。请确认保存状态后重试。";
