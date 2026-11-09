import { createPortal } from "react-dom";
import { useEffect, useRef, type RefObject } from "react";
import { useEditorDialogFocus } from "../editor/useEditorDialogFocus";
import { PaperReferenceWorkspace } from "./PaperReferenceWorkspace";
import type { ReferenceContextRequest, ReferencePatternContext } from "../../shared/referenceContext";

function ModalFocus({ dialog, onClose }: { dialog: RefObject<HTMLElement>; onClose: () => void }): null {
  useEditorDialogFocus(dialog, onClose, false);
  return null;
}

export function ReferenceDrawer({ contextLabel, open = true, onClose, restorePosition, request, referenceContext }: {
  contextLabel: string; open?: boolean; onClose: () => void; restorePosition: () => void;
  request?: ReferenceContextRequest; editorRoot?: HTMLElement | null; referenceContext?: ReferencePatternContext;
}): JSX.Element {
  const dialog = useRef<HTMLElement>(null), previouslyOpen = useRef(false), latestOpen = useRef(open);
  latestOpen.current = open;
  useEffect(() => {
    if (previouslyOpen.current && !open) queueMicrotask(() => { if (!latestOpen.current) restorePosition(); });
    previouslyOpen.current = open;
  }, [open, restorePosition]);
  return createPortal(<div hidden={!open} className="reference-session dialog-backdrop reference-backdrop paper-reference-backdrop">
    <section ref={dialog} className="dialog reference-drawer paper-reference" role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-labelledby="reference-drawer-title" tabIndex={-1}>
      {open ? <ModalFocus dialog={dialog} onClose={onClose} /> : null}
      <PaperReferenceWorkspace onClose={onClose} request={request} referenceContext={referenceContext} initialSystem={referenceContext?.kind === "ci" || /词稿|词房|\bci\b/u.test(contextLabel) ? "cilin" : "pingshui"} />
    </section>
  </div>, document.querySelector(".app-shell") ?? document.body);
}
