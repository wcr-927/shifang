import { VERSE_GAP } from '../../shared/verseGap';
export interface VersePoint {
    line: number;
    offset: number;
}
export interface VerseSelection {
    anchor: VersePoint;
    head: VersePoint;
}
export interface VerseDocument {
    lines: string[];
    sourceLineCount: number;
}
export function decodeVerseBody(body: string, minimumSlots: number): VerseDocument { const lines = body.split('\n'), sourceLineCount = lines.length; while (lines.length < minimumSlots)
    lines.push(''); return { lines, sourceLineCount }; }
export function encodeVerseBody(doc: VerseDocument): string { let count = doc.sourceLineCount; doc.lines.forEach((line, i) => { if (line.length)
    count = Math.max(count, i + 1); }); return doc.lines.slice(0, count).join('\n'); }
export function orderedVerseSelection(selection: VerseSelection): {
    from: VersePoint;
    to: VersePoint;
} { const { anchor, head } = selection; return anchor.line < head.line || anchor.line === head.line && anchor.offset <= head.offset ? { from: anchor, to: head } : { from: head, to: anchor }; }
function boundary(text: string, offset: number, ceil: boolean) { let value = Math.max(0, Math.min(offset, text.length)); if (value > 0 && value < text.length && /[\uD800-\uDBFF]/u.test(text[value - 1]) && /[\uDC00-\uDFFF]/u.test(text[value]))
    value += ceil ? 1 : -1; return value; }
export function replaceVerseSelection(original: readonly string[], selection: VerseSelection, text: string): {
    lines: string[];
    selection: VerseSelection;
} {
    const lines = original.length ? [...original] : [''];
    const ordered = orderedVerseSelection(selection), last = lines.length - 1;
    const collapsed = ordered.from.line === ordered.to.line && ordered.from.offset === ordered.to.offset;
    const from = { line: Math.max(0, Math.min(last, ordered.from.line)), offset: 0 }, to = { line: Math.max(0, Math.min(last, ordered.to.line)), offset: 0 };
    from.offset = boundary(lines[from.line], ordered.from.offset, false);
    to.offset = collapsed ? from.offset : boundary(lines[to.line], ordered.to.offset, true);
    for (let i = from.line; i <= to.line; i++)
        lines[i] = lines[i].slice(0, i === from.line ? from.offset : 0) + lines[i].slice(i === to.line ? to.offset : lines[i].length);
    const parts = text.replace(/\r\n?/g, '\n').split('\n');
    parts.forEach((part, i) => { const line = from.line + i; while (lines.length <= line)
        lines.push(''); const offset = i ? 0 : from.offset; lines[line] = lines[line].slice(0, offset) + part + lines[line].slice(offset); });
    const point = { line: from.line + parts.length - 1, offset: (parts.length === 1 ? from.offset : 0) + parts.at(-1)!.length };
    return { lines, selection: { anchor: point, head: point } };
}

/** Fixed character slots; reject the whole insertion rather than overwrite an occupied suffix. */
export function replaceFixedVerseSelection(original:readonly string[], selection:VerseSelection, text:string, capacities:readonly number[]){
 const lines=original.length?[...original]:[''];const {from:rawFrom,to:rawTo}=orderedVerseSelection(selection);
 const from={line:Math.min(lines.length-1,rawFrom.line),offset:0},to={line:Math.min(lines.length-1,rawTo.line),offset:0};
 from.offset=boundary(lines[from.line],rawFrom.offset,false);to.offset=boundary(lines[to.line],rawTo.offset,true);
 for(let i=from.line;i<=to.line;i++){
  const a=i===from.line?from.offset:0,b=i===to.line?to.offset:lines[i].length;
  lines[i]=lines[i].slice(0,a)+Array.from(lines[i].slice(a,b),c=>/\p{Script=Han}/u.test(c)||c===VERSE_GAP?VERSE_GAP:'').join('')+lines[i].slice(b);
 }
 const parts=text.replace(/\r\n?/g,'\n').split('\n');let final={...from};
 for(let i=0;i<parts.length;i++){
  const line=from.line+i;while(lines.length<=line)lines.push('');
  const offset=i===0?from.offset:0,prefix=lines[line].slice(0,offset),suffix=lines[line].slice(offset),input=parts[i];
  const isSlot=(c:string)=>c===VERSE_GAP||/\p{Script=Han}/u.test(c);
  const count=(t:string)=>Array.from(t).filter(isSlot).length;
  let gaps=0;while(suffix[gaps]===VERSE_GAP)gaps++;
  const remaining=suffix.slice(gaps),capacity=capacities[line]??Math.max(count(lines[line]),count(prefix)+count(input));
  const extra=count(remaining)===0?Math.max(0,capacity-count(lines[line])):0;
  if(count(input)>gaps+extra)return {lines:[...original],selection,rejected:true};
  lines[line]=prefix+input+suffix.slice(Math.min(gaps,count(input)));final={line,offset:prefix.length+input.length};
 }
 return {lines,selection:{anchor:final,head:final},rejected:false};
}
