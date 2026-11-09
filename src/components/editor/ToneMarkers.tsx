import { useLayoutEffect, useState, type RefObject } from "react";
import type { ToneMarker } from "../../features/editor/toneMarkers";

export interface InputTextMeasurement {
  origin: number;
  width: number;
  advance: (offset: number) => number;
  emptyWidth: number;
  letterSpacing: number;
}

const contexts = new WeakMap<Document, CanvasRenderingContext2D | null>();
const px = (value: string): number => Number.parseFloat(value) || 0;

/** Uses the input's font and real glyph advances, preserving punctuation/space widths. */
export function measureInputText(input: HTMLInputElement | HTMLTextAreaElement, source: string): InputTextMeasurement {
  const document = input.ownerDocument, style = document.defaultView!.getComputedStyle(input);
  if (!contexts.has(document)) contexts.set(document, document.createElement("canvas").getContext("2d"));
  const context = contexts.get(document);
  if (context) {
    context.font = style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fontKerning = style.fontKerning as CanvasFontKerning;
    // Add CSS spacing ourselves so supplementary Han count as one glyph.
    if ("letterSpacing" in context) context.letterSpacing = "0px";
  }
  const letterSpacing = px(style.letterSpacing);
  const measured = (text: string) => {
    if (context) return context.measureText(text).width;
    // Canvas can be unavailable in restricted renderers; measure native text
    // rather than replacing proportional punctuation with a character grid.
    const mirror = document.createElement("span");
    Object.assign(mirror.style, { position: "fixed", visibility: "hidden", whiteSpace: "pre", fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontKerning: style.fontKerning, letterSpacing: "0px" });
    mirror.textContent = text;
    document.body.append(mirror);
    const width = mirror.getBoundingClientRect().width;
    mirror.remove();
    return width;
  };
  return {
    origin: px(style.borderLeftWidth) + px(style.paddingLeft) + px(style.textIndent),
    width: input.getBoundingClientRect().width || input.clientWidth,
    advance: offset => { const text = source.slice(0, offset); return measured(text) + Array.from(text).length * letterSpacing; },
    emptyWidth: measured("汉") + letterSpacing,
    letterSpacing,
  };
}

export function ToneMarkers({ source, markers, inputRef, scrollLeft, label }: {
  source: string;
  markers: ToneMarker[];
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement>;
  scrollLeft: number;
  label: string;
}): JSX.Element {
  const [layout, setLayout] = useState<{ width: number; positions: number[] }>({ width: 0, positions: [] });
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const text = measureInputText(input, source);
      let emptyIndex = 0;
      setLayout({ width: text.width, positions: markers.map(item => {
        if (item.start === item.end) return text.origin + text.advance(source.length) + text.emptyWidth * (emptyIndex++ + .5) - text.letterSpacing / 2;
        return text.origin + (text.advance(item.start) + text.advance(item.end) - text.letterSpacing) / 2;
      }) });
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    resize?.observe(input);
    input.ownerDocument.defaultView?.addEventListener("resize", measure);
    const fonts = input.ownerDocument.fonts;
    void fonts?.ready.then(measure);
    fonts?.addEventListener("loadingdone", measure);
    return () => { active = false; resize?.disconnect(); input.ownerDocument.defaultView?.removeEventListener("resize", measure); fonts?.removeEventListener("loadingdone", measure); };
  }, [source, markers, inputRef]);
  return <div className="tone-markers" role="group" aria-label={label} style={{ width: layout.width || undefined, position: "relative", overflow: "hidden", pointerEvents: "none" }}>
    {markers.map((item, index) => <span key={index} className={`tone-marker tone-marker-${item.state}`} title={item.message} aria-label={`第${index + 1}字位：${item.message}`} data-source-start={item.start} data-source-end={item.end} style={{ position: "absolute", left: (layout.positions[index] ?? 0) - scrollLeft, transform: "translateX(-50%)" }}>{item.expected}</span>)}
  </div>;
}
