import { VERSE_GAP } from '../../shared/verseGap';
/** Fixed editor slots are never compacted or split by punctuation. Offsets use
 * UTF-16 (DOM input coordinates); characterIndex addresses the analyzed Han. */
export interface SourceAnchor {
  sourceText?: string;
  sourceOffset?: number;
}

export interface AnnotationRange { start: number; end: number; closed: boolean }

/** Ranges are raw UTF-16 half-open [start, end), including the opening bracket. */
export function scanAnnotations(sourceText: string): {
  characters: Array<{ character: string; sourceOffset: number }>;
  ranges: AnnotationRange[];
} {
  const characters: Array<{ character: string; sourceOffset: number }> = [];
  const ranges: AnnotationRange[] = [];
  const closing: Record<string, string> = { "（": "）", "(": ")", "[": "]", "【": "】" };
  const stack: Array<{ closing: string; start: number }> = [];
  let sourceOffset = 0;
  for (const character of sourceText) {
    if (closing[character]) stack.push({ closing: closing[character], start: sourceOffset });
    else if (stack.length && character === stack.at(-1)?.closing) {
      const opening = stack.pop()!;
      if (!stack.length) ranges.push({ start: opening.start, end: sourceOffset + character.length, closed: true });
    }
    else if (!stack.length && (character===VERSE_GAP || /\p{Script=Han}/u.test(character))) characters.push({ character, sourceOffset });
    sourceOffset += character.length;
  }
  if (stack.length) ranges.push({ start: stack[0].start, end: sourceText.length, closed: false });
  return { characters, ranges };
}

export function editorLineCharacters(sourceText: string): Array<{ character: string; sourceOffset: number }> {
  return scanAnnotations(sourceText).characters;
}

// Free text still splits clauses after removing annotations. Scope offsets stay
// in the original whole input, never in the compacted analysis-line numbering.
export function withoutAnnotations(sourceText: string): string {
  const { ranges } = scanAnnotations(sourceText);
  let offset = 0;
  let text = "";
  for (const range of ranges) { text += sourceText.slice(offset, range.start); offset = range.end; }
  return text + sourceText.slice(offset);
}

export function matchesEditorAnchor(
  lines: string[],
  override: SourceAnchor & { lineIndex: number; characterIndex: number; character: string },
): boolean {
  const sourceText = lines[override.lineIndex];
  if (sourceText === undefined || override.sourceText !== sourceText) return false;
  const target = editorLineCharacters(sourceText)[override.characterIndex];
  return target?.character === override.character && target.sourceOffset === override.sourceOffset;
}
