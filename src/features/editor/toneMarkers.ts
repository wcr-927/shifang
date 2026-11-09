import { VERSE_GAP } from '../../shared/verseGap';
import type { CiAnalysis, Reading } from "../../ci/analyze";
import { editorLineCharacters } from "../../poetry/analysis/editorCoordinates";
import type { LineAnalysis } from "../../poetry/analysis/poemAnalyzer";

export interface ToneMarker {
  /** UTF-16 half-open source range. Empty slots share source.length. */
  start: number;
  end: number;
  expected: string;
  state: "match" | "conflict" | "pending" | "uncovered" | "empty";
  kind: "tone";
  rhymeState?: "mismatch"|"pending";
  message: string;
}

function marker(start: number, end: number, expected: string, state: ToneMarker["state"], message: string): ToneMarker {
  return { start, end, expected, state, kind: "tone", message };
}

/** Only character tone evidence participates; rhyme and sentence risks do not. */
export function metreToneMarkers(source: string, line: LineAnalysis | null, expectedPattern: string, flexiblePositions: readonly number[] = []): ToneMarker[] {
  const characters = editorLineCharacters(source);
  const current = line?.expectedPattern === expectedPattern && line.text === characters.map(item => item.character).join("")
    && line.characters.length === characters.length && line.characters.every((item, index) =>
      item.character === characters[index].character && item.characterIndex === index
      && (item.sourceOffset === undefined || item.sourceOffset === characters[index].sourceOffset));
  return Array.from(expectedPattern, (symbol, index) => {
    const evidence = current ? line?.characters[index] : undefined;
    const expected = evidence
      ? evidence.isFlexible ? "中" : evidence.expectedTone === "ping" ? "平" : evidence.expectedTone === "ze" ? "仄" : symbol
      : flexiblePositions.includes(index) ? "中" : symbol;
    const sourceCharacter = characters[index];
    if (!sourceCharacter) return marker(source.length, source.length, expected, "empty", `预期${expected}，尚未填写`);
    const start = sourceCharacter.sourceOffset, end = start + sourceCharacter.character.length;
    if(sourceCharacter.character===VERSE_GAP)return marker(start,end,expected,"empty",`预期${expected}，尚未填写`);
    if (!current || !line || !evidence) return marker(start, end, expected, "pending", `预期${expected}，等待当前原文分析`);
    const requirement = evidence.isFlexible ? "此字位允许平或仄" : `预期${expected}`;
    if (evidence.ruleCoverage !== "modeled") return marker(start, end, expected, "uncovered", `${requirement}，当前规则未覆盖`);
    if (!evidence.actualTones.length || evidence.status === "unknown" || evidence.status === "not-applicable") return marker(start, end, expected, "uncovered", `${requirement}，字音未定`);
    if (evidence.status === "uncertain") return marker(start, end, expected, "pending", `${requirement}，请按字义确认读音`);
    return marker(start, end, expected, evidence.status === "mismatch" ? "conflict" : "match", `${requirement}，${evidence.status === "mismatch" ? "平仄不符" : "平仄符合"}`);
  });
}

const ciExpected: Record<string, string> = { P: "平", Z: "仄", A: "中", I: "平/入" };
function fitsCiTone(reading: Reading, expected: string): boolean {
  return expected === "A" || (expected === "P" ? reading.tone === "P" : expected === "I" ? reading.tone === "P" || reading.tone === "R" : reading.tone !== "P");
}

/** Ci offsets are already UTF-16. Keep its own source mapping (including notes). */
export function ciToneMarkers(source: string, pattern: string, analysis: CiAnalysis, lineIndex: number): ToneMarker[] {
  // Ci treats every Han as a slot, including bracketed Han. It does not use the
  // metre engine's annotation filtering, and its offsets are already UTF-16.
  const characters: Array<{ character: string; offset: number }> = [];
  let offset = 0;
  for (const character of source) { if (character===VERSE_GAP||/\p{Script=Han}/u.test(character)) characters.push({ character, offset }); offset += character.length; }
  const readings = analysis.readings.filter(item => item.line === lineIndex);
  const current = readings.length === characters.length && readings.every((item, index) =>
    item.source === source && item.offset === characters[index].offset && item.character === characters[index].character);
  return Array.from(pattern, (symbol, index) => {
    const expected = ciExpected[symbol] ?? symbol, sourceCharacter = characters[index];
    if (!sourceCharacter) return marker(source.length, source.length, expected, "empty", `预期${expected}，尚未填写`);
    const start = sourceCharacter.offset, end = start + sourceCharacter.character.length;
    if(sourceCharacter.character===VERSE_GAP)return marker(start,end,expected,"empty",`预期${expected}，尚未填写`);
    if (!current) return marker(start, end, expected, "pending", `预期${expected}，等待当前原文分析`);
    const evidence = readings[index], active = evidence.selected ? [evidence.selected] : evidence.options;
    if (!active.length || !(symbol in ciExpected)) return marker(start, end, expected, "uncovered", `预期${expected}，当前字音或规则未覆盖`);
    const fits = active.map(reading => fitsCiTone(reading, symbol));
    const state = fits.every(Boolean) ? "match" : fits.some(Boolean) ? "pending" : "conflict";
    return marker(start, end, expected, state, `预期${expected}，${state === "match" ? "平仄符合" : state === "pending" ? "请按字义确认读音" : "平仄不符"}`);
  });
}
