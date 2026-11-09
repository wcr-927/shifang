import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { undo, redo, closeHistory } from 'prosemirror-history';
import { pointAt, posAt, replaceVerseTransaction, verseLines, verseSelection } from './verseEditorSchema';
export function replaceSelected(view: EditorView, text: string, separate = false) { let tr = replaceVerseTransaction(view.state, verseSelection(view.state), text); if (separate)
    tr = closeHistory(tr); view.dispatch(tr); return true; }
export function deleteSelected(view: EditorView, backward: boolean, extent: "character" | "word" | "line" = "character") {
    const { state } = view;
    if (!state.selection.empty)
        return replaceSelected(view, '', true);
    const point = pointAt(state.doc, state.selection.from), text = state.doc.child(point.line).textContent;
    if (backward && point.offset === 0 || !backward && point.offset === text.length) {
        const next = backward ? { line: Math.max(0, point.line - 1), offset: point.line ? state.doc.child(point.line - 1).content.size : 0 } : { line: Math.min(state.doc.childCount - 1, point.line + 1), offset: point.line === state.doc.childCount - 1 ? point.offset : 0 };
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, posAt(state.doc, next))).scrollIntoView());
        return true;
    }
    const boundaries = extent === 'line' ? [0,text.length] : [...new Intl.Segmenter(undefined, { granularity: extent === 'word' ? 'word' : 'grapheme' }).segment(text)].map(part => part.index).concat(text.length);
    const other = backward ? boundaries.filter(i => i < point.offset).at(-1) ?? 0 : boundaries.find(i => i > point.offset) ?? text.length;
    view.dispatch(replaceVerseTransaction(state, { anchor: point, head: { line: point.line, offset: other } }, ''));
    return true;
}
export function handleVerseKey(view: EditorView, event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229 || view.composing)
        return false;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'z')
        return (event.shiftKey ? redo : undo)(view.state, view.dispatch);
    if (command && event.key.toLowerCase() === 'a') {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1)));
        return true;
    }
    if (event.key === 'Backspace' || event.key === 'Delete')
        return deleteSelected(view, event.key === 'Backspace', event.metaKey ? 'line' : event.altKey || event.ctrlKey ? 'word' : 'character');
    const p = pointAt(view.state.doc, view.state.selection.head);
    if (event.key === 'Enter' || event.key === 'Tab') {
        const line = Math.max(0, Math.min(view.state.doc.childCount - 1, p.line + (event.shiftKey ? -1 : 1)));
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posAt(view.state.doc, { line, offset: 0 }))).scrollIntoView());
        return true;
    }
    if ((view.state.selection.empty || event.shiftKey) && !command && !event.altKey && ((event.key === 'ArrowLeft' && p.offset === 0) || (event.key === 'ArrowRight' && p.offset === view.state.doc.child(p.line).content.size))) {
        const left = event.key === 'ArrowLeft', line = Math.max(0, Math.min(view.state.doc.childCount - 1, p.line + (left ? -1 : 1))), offset = left ? view.state.doc.child(line).content.size : 0, to = posAt(view.state.doc, { line, offset });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, event.shiftKey ? view.state.selection.anchor : to, to)).scrollIntoView());
        return true;
    }
    return false;
}
export function selectedVerseText(view: EditorView) { const from = pointAt(view.state.doc, view.state.selection.from), to = pointAt(view.state.doc, view.state.selection.to), lines = verseLines(view.state.doc); return lines.slice(from.line, to.line + 1).map((line, i) => line.slice(i === 0 ? from.offset : 0, from.line + i === to.line ? to.offset : undefined)).join('\n'); }
