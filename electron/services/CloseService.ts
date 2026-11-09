import { flushFailureMessage, flushTimeoutMessage, type FlushResult } from "../../src/shared/close.js";

// A timeout cancels this request. Late renderer responses cannot close a later
// window or turn a cancelled request into permission to quit.
export class CloseService {
  private sequence = 0;
  private pending: { id: number; quit: boolean; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private readonly send: (requestId: number) => void,
    private readonly close: (quit: boolean) => void,
    private readonly cancel: (result: FlushResult) => void,
    private readonly timeoutMs = 5000,
  ) {}

  request(quit: boolean): void {
    if (this.pending) { this.pending.quit ||= quit; return; }
    const id = ++this.sequence;
    const timer = setTimeout(() => {
      if (this.pending?.id !== id) return;
      this.pending = null;
      this.cancel({ status: "timeout", message: flushTimeoutMessage });
    }, this.timeoutMs);
    this.pending = { id, quit, timer };
    try { this.send(id); }
    catch { this.respond(id, { status: "failed", message: flushFailureMessage }); }
  }

  respond(requestId: number, result: unknown): void {
    if (!this.pending || this.pending.id !== requestId) return;
    const { quit, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    const status = typeof result === "object" && result !== null && "status" in result ? result.status : undefined;
    if (status === "saved" || status === "clean") this.close(quit);
    else this.cancel(status === "timeout"
      ? { status: "timeout", message: flushTimeoutMessage }
      : { status: "failed", message: flushFailureMessage });
  }

  dispose(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
