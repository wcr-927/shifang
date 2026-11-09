import { useEffect, useRef, type RefObject } from "react";

/** Presentation-only modal focus; does not participate in saving or exporting. */
export function useEditorDialogFocus(dialog: RefObject<HTMLElement>, onClose: () => void, busy: boolean): void {
  const current = useRef({ onClose, busy });
  current.current = { onClose, busy };
  useEffect(() => {
    const root = dialog.current;
    if (!root) return;
    const trigger = document.activeElement as HTMLElement | null;
    const outside: Array<{ element: Element; inert: boolean }> = [];
    let branch: Element | null = root.closest(".dialog-backdrop");
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch) {
          outside.push({ element: sibling, inert: sibling.hasAttribute("inert") });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const focusable = () => [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]')].filter(element => element.tabIndex >= 0 && !element.closest("[hidden]"));
    (root.querySelector<HTMLElement>('[data-dialog-initial]') ?? root.querySelector<HTMLElement>('[aria-checked="true"]') ?? focusable()[0] ?? root).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); root.focus(); }
      else if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      for (const { element, inert } of outside) if (!inert) element.removeAttribute("inert");
      if (trigger?.isConnected) trigger.focus();
    };
  }, [dialog]);
  useEffect(() => { if (busy) dialog.current?.focus(); }, [busy, dialog]);
}
