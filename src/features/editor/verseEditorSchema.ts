import { Schema, type Node as PMNode } from 'prosemirror-model';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { decodeVerseBody, encodeVerseBody, replaceVerseSelection, replaceFixedVerseSelection, type VersePoint, type VerseSelection } from './verseDocument';
export const verseSchema = new Schema({ nodes: { doc: { content: 'verse+', attrs: { sourceLineCount: { default: 1 }, capacities: {default:null} } }, verse: { content: 'text*', group: 'block', attrs: { line: { default: 0 } }, toDOM: node => ['div', { 'data-verse-line': node.attrs.line }, 0], parseDOM: [{ tag: 'div[data-verse-line]', getAttrs: node => ({ line: Number((node as HTMLElement).dataset.verseLine) }) }] }, text: { group: 'inline' } } });
export function verseDoc(body: string, slots: number, capacities?:number[]) { const decoded = decodeVerseBody(body, slots); return verseSchema.node('doc', { sourceLineCount: decoded.sourceLineCount,capacities:capacities??null }, decoded.lines.map((line, i) => verseSchema.node('verse', { line: i }, line ? verseSchema.text(line) : undefined))); }
export function verseLines(doc: PMNode): string[] { const lines: string[] = []; doc.forEach(node => lines.push(node.textContent)); return lines; }
export function verseBody(doc: PMNode) { return encodeVerseBody({ lines: verseLines(doc), sourceLineCount: doc.attrs.sourceLineCount }); }
export function pointAt(doc: PMNode, pos: number): VersePoint { let result = { line: 0, offset: 0 }; doc.forEach((node, offset, index) => { if (pos >= offset)
    result = { line: index, offset: Math.max(0, Math.min(node.content.size, pos - offset - 1)) }; }); return result; }
export function posAt(doc: PMNode, point: VersePoint) { let result = 1; doc.forEach((node, offset, index) => { if (index === Math.max(0, Math.min(point.line, doc.childCount - 1)))
    result = offset + 1 + Math.min(Math.max(0, point.offset), node.content.size); }); return result; }
export function verseSelection(state: EditorState): VerseSelection { return { anchor: pointAt(state.doc, state.selection.anchor), head: pointAt(state.doc, state.selection.head) }; }
export function replaceVerseTransaction(state: EditorState, selection: VerseSelection, text: string): Transaction {
    const old = verseLines(state.doc), next = state.doc.attrs.capacities?replaceFixedVerseSelection(old,selection,text,state.doc.attrs.capacities):replaceVerseSelection(old, selection, text), tr = state.tr;
    if('rejected' in next && next.rejected)return tr.setMeta('rejectedInput',{text,selection});
    // Text-only minimal changes keep unaffected DOM, sentence nodes and composition anchors stable.
    for (let i = old.length - 1; i >= 0; i--) {
        if (old[i] === next.lines[i])
            continue;
        const a = old[i], b = next.lines[i];
        let prefix = 0;
        while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
            prefix++;
        if (prefix && /[\uD800-\uDBFF]/u.test(a[prefix - 1]))
            prefix--;
        let suffix = 0;
        while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix])
            suffix++;
        if (suffix && /[\uDC00-\uDFFF]/u.test(a[a.length - suffix]))
            suffix--;
        const start = posAt(state.doc, { line: i, offset: 0 });
        tr.insertText(b.slice(prefix, b.length - suffix), start + prefix, start + a.length - suffix);
    }
    if (next.lines.length > old.length)
        tr.insert(tr.doc.content.size, next.lines.slice(old.length).map((line, i) => verseSchema.node('verse', { line: old.length + i }, line ? verseSchema.text(line) : undefined)));
    tr.setSelection(TextSelection.create(tr.doc, posAt(tr.doc, next.selection.anchor))).scrollIntoView();
    return tr;
}
