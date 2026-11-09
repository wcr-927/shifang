/** Capture before pointer focus moves to an action. Restoring keeps native nodes and undo intact. */
export function captureEditorPosition(scope: ParentNode = document, focused: HTMLElement | null = document.activeElement as HTMLElement | null): () => void {
  const active = focused;
  const verse=active?.closest('.verse-editor') as (HTMLElement & {verseCaptureSelection?:()=>()=>void})|null;
  const verseRestore=verse?.verseCaptureSelection?.();
  const field = active?.tagName === "TEXTAREA" || active?.tagName === "INPUT" ? active as HTMLTextAreaElement | HTMLInputElement : null;
  const selection = field ? { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection } : null;
  const nativeSelection = window.getSelection();
  const range = nativeSelection?.rangeCount ? nativeSelection.getRangeAt(0).cloneRange() : null;
  const anchor = nativeSelection?.anchorNode, anchorOffset = nativeSelection?.anchorOffset;
  const focus = nativeSelection?.focusNode, focusOffset = nativeSelection?.focusOffset;
  const scrolls = [...scope.querySelectorAll<HTMLElement>('.manuscript-scroll, .free-scroll, .free-manuscript-scroll, .ci-manuscript-scroll, .notes-panel, .editor-main, textarea, input')].map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  return () => {
    if(verseRestore){verseRestore();for(const {element,top,left} of scrolls)if(element.isConnected){element.scrollTop=top;element.scrollLeft=left;}return;}
    if (active?.isConnected) active.focus({ preventScroll: true });
    if (field?.isConnected && selection?.start != null && selection.end != null) {
      try { field.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined); } catch { /* Non-text input types have no native text selection. */ }
    } else if (range && range.startContainer.isConnected && range.endContainer.isConnected) {
      const current = window.getSelection();
      current?.removeAllRanges();
      if (anchor?.isConnected && focus?.isConnected && anchorOffset != null && focusOffset != null && current?.setBaseAndExtent) current.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      else current?.addRange(range);
    }
    for (const { element, top, left } of scrolls) if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
  };
}

/** A Unicode code point, never a half surrogate or a trimmed multi-character selection. */
export function selectedEditorCharacter(): string | undefined {
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  let text: string;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    if (active.selectionStart == null || active.selectionEnd == null) return;
    text = active.value.slice(active.selectionStart, active.selectionEnd);
  } else text = window.getSelection()?.toString() ?? "";
  return Array.from(text).length === 1 && !/[\uD800-\uDFFF]/u.test(text) ? text : undefined;
}
