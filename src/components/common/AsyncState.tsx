import { AlertCircle, BookOpen, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "正在取卷" }: { label?: string }): JSX.Element {
  return (
    <div className="async-state" role="status">
      <LoaderCircle className="spin" size={22} strokeWidth={1.4} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  const reason = message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, "");
  return (
    <div className="async-state error-state" role="alert">
      <AlertCircle size={22} strokeWidth={1.4} />
      <p>{reason}</p>
      <button className="quiet-button" type="button" onClick={onRetry} title="重新尝试">
        <RotateCcw size={15} strokeWidth={1.5} />
        重试
      </button>
      {reason !== message ? <details className="error-details"><summary>错误详情</summary><p>{message}</p></details> : null}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true"><BookOpen size={24} strokeWidth={1.4} /></div>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
