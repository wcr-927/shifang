import { useRef } from "react";
import { X } from "lucide-react";
import type { PasteChange } from "../../features/editor/pastePlan";
import { useEditorDialogFocus } from "./useEditorDialogFocus";

const excerpt = (text: string) => Array.from(text).length > 120 ? Array.from(text).slice(0, 120).join("") + "…" : text;

export interface PasteReview {
  id: number | string;
  startLine: number;
  changes: PasteChange[];
}

export function PasteConfirmDialog({ review, onConfirm, onCancel }: { review: PasteReview; onConfirm: () => void; onCancel: () => void }): JSX.Element {
  const dialog = useRef<HTMLElement>(null);
  useEditorDialogFocus(dialog, onCancel, false);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialog} className="dialog paste-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="paste-confirm-title">
      <header className="dialog-header"><div><p className="eyebrow">粘贴前确认</p><h2 id="paste-confirm-title">确认多行粘贴</h2></div><button className="icon-button" type="button" aria-label="取消粘贴" onClick={onCancel}><X size={18} /></button></header>
      <p>将修改第{review.changes.map(item => item.lineIndex + 1).join("、")}句。已有文字可能被替换或清空；确认前正文保持不变。</p>
      <div className="paste-preview-list">{review.changes.map(item => <div className="paste-preview-row" key={item.lineIndex}>
        <strong>第{item.lineIndex + 1}句</strong>
        <span>原文</span><pre>{item.previous.length ? `「${excerpt(item.previous)}」` : "（空句）"}</pre>
        <span>粘贴后</span><pre>{item.next.length ? `「${excerpt(item.next)}」` : "（清空）"}</pre>
      </div>)}</div>
      <footer className="dialog-actions"><button data-dialog-initial className="quiet-button" type="button" onClick={onCancel}>取消</button><button className="primary-button" type="button" onClick={onConfirm}>确认覆盖</button></footer>
    </section>
  </div>;
}
