import { Fragment, createElement, useEffect, useState, type ReactNode } from "react";
import { desktopApi } from "../../services/desktopApi";
import type { ReferenceBlock, ReferenceNode, ReferenceTarget } from "../../shared/reference";

function BookImage({ sourceId, node }: { sourceId: string; node: ReferenceNode }): JSX.Element {
  const [src, setSrc] = useState("");
  useEffect(() => { let stale = false; if (node.imageId) void desktopApi.reference.image({ sourceId, imageId: node.imageId }).then(result => { if (!stale && /^data:image\/(png|jpeg);base64,/u.test(result.dataUrl)) setSrc(result.dataUrl); }).catch(() => {}); return () => { stale = true; }; }, [sourceId, node.imageId]);
  return src ? <img className="reference-book-image" src={src} alt={node.alt ?? "书内插图"} /> : <span>{node.alt ?? "书内插图暂不可读取"}</span>;
}
export function ReadingContent({ block, sourceId, highlight, onLink, onNote, opticalPoem = false, verseFlow = false }: { block: ReferenceBlock; sourceId: string; highlight?: { start: number; end: number }; onLink: (target: ReferenceTarget) => void; onNote?: (number:string)=>void; opticalPoem?: boolean; verseFlow?: boolean }): JSX.Element {
  let cursor = 0;
  function plain(value: string): ReactNode {
    if (verseFlow) {
      const lines:ReactNode[]=[];let start=0;
      for(const m of value.matchAll(/[。！？][”’」』]?([ \t]*)/gu)){
        const end=m.index+m[0].length;lines.push(value.slice(start,end));
        if(end<value.length)lines.push(<Fragment key={end}><br/>{m[1]?<span className="reading-stanza-break" aria-hidden="true"/>:null}</Fragment>);
        start=end;
      }
      lines.push(value.slice(start));return lines;
    }
    if (!opticalPoem) return value;
    const parts: ReactNode[] = []; let offset = 0;
    for (const match of value.matchAll(/[，。！？；、](?=[ \t]*(?:\n|$))/gu)) {
      parts.push(value.slice(offset, match.index));
      parts.push(<span className="reading-terminal-mark" key={match.index}>{match[0]}</span>);
      offset = match.index + match[0].length;
    }
    parts.push(value.slice(offset)); return parts;
  }
  function text(value: string, allowNotes=true): ReactNode { const start = cursor; cursor += value.length; if (!highlight || highlight.end <= start || highlight.start >= cursor) return onNote&&allowNotes?value.split(/(\[\d+\]|[①-⑳])/u).map((part,index)=>/^(?:\[\d+\]|[①-⑳])$/u.test(part)?<button type="button" className="reading-note-mark" key={index} onClick={()=>onNote(part.startsWith('[')?part.slice(1,-1):part)}>{part.startsWith('[')?part.slice(1,-1):part}</button>:plain(part)):plain(value); const left = Math.max(0, highlight.start - start), right = Math.min(value.length, highlight.end - start); return <>{value.slice(0, left)}<mark data-reference-hit>{value.slice(left, right)}</mark>{value.slice(right)}</>; }
  function render(node: ReferenceNode, key: number, withinLink=false): ReactNode {
    if (node.type === "text") return <Fragment key={key}>{text(node.text ?? "",!withinLink)}</Fragment>;
    if (node.type === "img") { cursor += (node.alt ?? "").length; return <BookImage key={key} sourceId={sourceId} node={node} />; }
    if (node.type === "br") { cursor++; return <br key={key} />; }
    const children = node.children?.map((child,index)=>render(child,index,withinLink||node.type==='a')) ?? (node.text ? text(node.text,!withinLink&&node.type!=='a') : null);
    if (node.type === "a") return node.target ? <button type="button" className="reference-internal-link" key={key} onClick={() => onLink(node.target!)}>{children}</button> : <span key={key}>{children}</span>;
    const allowed = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "sup", "sub", "br", "ul", "ol", "li", "table", "tr", "td", "th", "blockquote", "pre", "code", "span", "thead", "tbody", "tfoot", "caption", "dl", "dt", "dd", "figure", "figcaption"];
    return createElement(allowed.includes(node.type) ? node.type : "span", { key }, children);
  }
  return <div className="reference-reading-block" data-block-id={block.id}>{render(block.node, 0)}</div>;
}
