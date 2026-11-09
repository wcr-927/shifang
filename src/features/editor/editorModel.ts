import type { WorkGenre } from "../../shared/work";

export const genreLineCounts: Record<WorkGenre, number> = {
  wujue: 4,
  qijue: 4,
  wulv: 8,
  qilv: 8,
};

export function bodyToLines(body: string, expectedLineCount: number): string[] {
  const source = body.replace(/\r\n?/gu, "\n");
  // Loading derives a view only. A physical line remains the same editor slot,
  // including empty lines, punctuation and annotations; body stays authoritative.
  const lines = source.split("\n");
  return lines.length >= expectedLineCount
    ? lines
    : [...lines, ...Array.from({ length: expectedLineCount - lines.length }, () => "")];
}

export function linesToBody(lines: string[]): string {
  return lines.join("\n");
}

export function lineSlots(lines: string[], expectedLineCount: number): string[] {
  return Array.from({ length: expectedLineCount }, (_, index) => lines[index] ?? "");
}

export function hasOverflowLines(lines: string[], expectedLineCount: number): boolean {
  return lines.length > expectedLineCount && lines.slice(expectedLineCount).some((line) => line.trim());
}

/** Analysis must see the same empty slots as the editor without rewriting the stored body.
 * Preserve extra source lines and indices, including blank interior and trailing lines. */
export function analysisLineSlots(lines: string[], expectedLineCount: number): string[] {
  return Array.from({ length: Math.max(lines.length, expectedLineCount) }, (_, index) => lines[index] ?? "");
}
