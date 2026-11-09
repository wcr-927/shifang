import { Check, CircleAlert, LoaderCircle, Save } from "lucide-react";
import type { SaveStatus as SaveState } from "../../features/editor/useEditorController";

export function SaveStatus({ status, error, onSave }: { status: SaveState; error: string; onSave: () => void }): JSX.Element {
  const content = status === "saving"
    ? <><LoaderCircle className="spin" size={15} strokeWidth={1.5} />保存中…</>
    : status === "error"
      ? <><CircleAlert size={15} strokeWidth={1.5} />重试保存</>
      : status === "dirty"
        ? <><Save size={15} strokeWidth={1.5} />保存</>
        : <><Check size={15} strokeWidth={1.5} />已保存</>;
  if(status==='saved')return <span className="editor-save-indicator" role="status">已保存</span>;
  return <button
    className="quiet-button editor-save-button"
    data-emphasis={status === "dirty" || status === "error"}
    type="button"
    onClick={onSave}
    disabled={status === "saving"}
    title="立即保存"
    aria-label={status === "error" ? `保存失败：${error || "未知错误"}。重试保存` : undefined}
  ><span className={`save-status is-${status}`} role={status === "error" ? "alert" : "status"}>{content}</span></button>;
}

export function SaveErrorNotice({ status, error, onSave }: { status: SaveState; error: string; onSave: () => void }): JSX.Element | null {
  if (status !== "error" || !error) return null;
  return <div className="operation-error save-error-notice" role="alert"><span>{error}</span><button className="inline-action" type="button" onClick={onSave}>重试保存</button></div>;
}
