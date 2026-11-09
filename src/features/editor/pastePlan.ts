export interface PasteChange { lineIndex: number; previous: string; next: string }
export interface PastePlan {
  id: number;
  workId: string;
  generation: number;
  sourceKey: string;
  startLine: number;
  lines: string[];
  changes: PasteChange[];
}

export function pasteSourceKey(editor: { work: { id: string }; body: string; lines: string[] }, generation: number): string {
  return JSON.stringify([editor.work.id, generation, editor.body, editor.lines]);
}

export function pasteChanges(lines: string[], start: number, pasted: string[]): PasteChange[] {
  return pasted.flatMap((next, offset) => {
    const lineIndex = start + offset;
    return lineIndex >= lines.length || lines[lineIndex] !== next
      ? [{ lineIndex, previous: lines[lineIndex] ?? "", next }] : [];
  });
}

export interface LinePastePlan { startLine: number; lines: string[]; changes: PasteChange[] }

/** Normalize only the incoming clipboard delimiters, retaining every empty slot. */
export function linePastePlan(source: string[], startLine: number, text: string): LinePastePlan {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  return { startLine, lines, changes: pasteChanges(source, startLine, lines) };
}

/** Overwrite the planned slots without dropping later source or overflow lines. */
export function applyLinePaste(source: string[], plan: LinePastePlan): string[] {
  const next = [...source];
  while (next.length < plan.startLine + plan.lines.length) next.push("");
  plan.lines.forEach((line, offset) => { next[plan.startLine + offset] = line; });
  return next;
}
