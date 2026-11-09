import { analyzeFirstLineNeighborRhyme, type FirstLineNeighborRhymeEvidence } from "./neighborRhyme";
import { VERSE_GAP } from '../../shared/verseGap';
import { scanAnnotations, withoutAnnotations, matchesEditorAnchor, type SourceAnchor } from "./editorCoordinates.js";
import { resolveTextReadings, type PingzeDataset, type ReadingCandidate, type ReadingOverride, type ReadingResolution, type ReadingRulesDataset } from "./readingResolver.ts";

export type CheckStatus = "match" | "mismatch" | "uncertain" | "unknown" | "not-applicable";
export type AnalysisStatus = "valid" | "invalid" | "needs-confirmation" | "incomplete";
export type Severity = "error" | "warning" | "info";

export interface MetreVariant {
  id: string;
  name: string;
  style: string;
  patterns: string[];
  flexiblePositions: number[][];
  rhymePositions: number[];
  note: string;
}

export interface MetreTemplate {
  id: string;
  name: string;
  shortName: string;
  kind: "jueju" | "lushi";
  lineCount: number;
  lineLength: number;
  rhymeTone: "ping";
  recommendedVariantId: string;
  lineRoles: string[];
  coupletPairs?: number[][];
  nianPositions?: number[];
  variants: MetreVariant[];
}

export interface MetreDataset {
  schemaVersion: number;
  datasetVersion?: string;
  templates: MetreTemplate[];
}

export interface PoemReadingOverride extends SourceAnchor {
  lineIndex: number;
  characterIndex: number;
  character: string;
  candidateId: string;
}

export interface AnalyzePoemOptions {
  firstLineRhyme?: "strict" | "sourced-neighbor";
  templateId: string;
  variantId?: string;
  overrides?: PoemReadingOverride[];
  editorLines?: string[];
}

export interface NormalizedLine {
  index: number;
  text: string;
  characters: string[];
  sourceOffsets?: number[];
}

export interface CharacterAnalysis {
  character: string;
  characterIndex: number;
  sourceOffset?: number;
  expectedTone: "ping" | "ze" | null;
  actualTones: Array<"ping" | "ze">;
  isFlexible: boolean;
  ruleCoverage: "modeled" | "unmodeled-special-position";
  status: CheckStatus;
  reading: ReadingResolution;
  readingConfirmation: "required" | "optional" | "selected" | "none";
}

export interface LineAnalysis {
  lineIndex: number;
  role: string;
  text: string;
  expectedPattern: string;
  expectedLength: number;
  actualLength: number;
  lengthStatus: CheckStatus;
  toneStatus: CheckStatus;
  characters: CharacterAnalysis[];
  isolatedPing: PatternRisk;
  triplePingTail: PatternRisk;
  metreAdjustment?: {
    rule: "special-lvju" | "isolated-ping-self-rescue" | "couplet-rescue";
    partnerLineIndex?: number;
    combinedSelfRescue?: boolean;
    status: "confirmed" | "possible";
    pattern: string;
    source: string;
  };
}

export interface PatternRisk {
  status: "detected" | "possible" | "clear" | "unknown" | "not-applicable";
  evidence: string[];
}

export type RhymeStatus = "missing" | "unknown" | "ambiguous" | "compatible" | "mismatch";

export interface RhymeFootAnalysis {
  lineIndex: number;
  character: string | null;
  toneStatus: CheckStatus;
  rhymeStatus: RhymeStatus;
  candidateGroupIds: string[];
  selectedGroupId: string | null;
}

export interface RhymeEvidence {
  feasibility: "insufficient" | "common" | "no-common";
  comparedLineIndexes: number[];
  unavailableLineIndexes: number[];
  confirmedGroupStatus: "insufficient" | "compatible" | "conflict";
  confirmedLineIndexes: number[];
  confirmedConflictLineIndexes: number[];
  unconfirmedReadingLineIndexes: number[];
}

export interface RhymeAnalysis {
  firstLineBorrow?: FirstLineNeighborRhymeEvidence;
  evidence: RhymeEvidence;
  status: RhymeStatus;
  missingLineIndexes: number[];
  requiredLineIndexes: number[];
  commonGroupIds: string[];
  feet: RhymeFootAnalysis[];
}

export interface RelationCheck {
  kind: "dui" | "nian";
  leftLineIndex: number;
  rightLineIndex: number;
  characterPosition: number;
  status: CheckStatus;
  leftTones: Array<"ping" | "ze">;
  rightTones: Array<"ping" | "ze">;
}

export interface AnalysisIssue {
  code:
    | "LINE_COUNT"
    | "LINE_LENGTH"
    | "TONE_MISMATCH"
    | "RULE_SCOPE_UNMODELED"
    | "RULE_PRECONDITION_UNRESOLVED"
    | "READING_UNRESOLVED"
    | "FIRST_LINE_BORROW"
    | "RHYME_TONE"
    | "RHYME_GROUP"
    | "RHYME_UNRESOLVED"
    | "RHYME_CANDIDATES_DISJOINT"
    | "DUI_MISMATCH"
    | "NIAN_MISMATCH"
    | "ISOLATED_PING"
    | "POSSIBLE_ISOLATED_PING"
    | "TRIPLE_PING_TAIL"
    | "POSSIBLE_TRIPLE_PING_TAIL"
    | "UNSUPPORTED_INPUT";
  severity: Severity;
  message: string;
  lineIndex?: number;
  characterIndex?: number;
}

export interface VariantScore {
  variantId: string;
  variantName: string;
  score: number;
  hardMismatchCount: number;
  uncertainCount: number;
}

export interface AnalysisSummary {
  expectedLineCount: number;
  actualLineCount: number;
  expectedLineLength: number;
  checkedTonePositions: number;
  confirmedMatches: number;
  confirmedMismatches: number;
  unresolvedTonePositions: number;
  flexiblePositions: number;
  confirmedCompliancePercent: number | null;
  resolutionCoveragePercent: number;
}

export interface AnalysisScopeWarning {
  code: "UNCLOSED_ANNOTATION";
  coordinateSpace: "editor-line" | "source-text";
  lineIndex?: number;
  /** UTF-16 half-open range [start, end) in the raw editor line or whole text. */
  start: number;
  end: number;
  text: string;
}

export interface PoemAnalysis {
  scope: { complete: boolean; warnings: AnalysisScopeWarning[] };
  status: AnalysisStatus;
  templateId: string;
  templateName: string;
  variantId: string;
  variantName: string;
  normalizedLines: NormalizedLine[];
  lines: LineAnalysis[];
  rhyme: RhymeAnalysis;
  relations: RelationCheck[];
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
  variantRanking: VariantScore[];
  limitations: string[];
  ignoredOverrideCount: number;
}

const CLAUSE_SEPARATORS = /[，。！？；!?;]+/u;
const HAN_CHARACTER = /\p{Script=Han}/u;
const IGNORABLE_NON_HAN = /[\p{P}\p{Z}\s]/u;

function extractHan(text: string): string {
  return Array.from(text).filter((character) => HAN_CHARACTER.test(character)).join("");
}

export function normalizePoemText(text: string): NormalizedLine[] {
  const source = withoutAnnotations(text);
  const physicalLines = source.replace(/\r\n?/g, "\n").split("\n");
  const clauses = physicalLines.flatMap((line) => line.split(CLAUSE_SEPARATORS));
  return clauses
    .map(extractHan)
    .filter(Boolean)
    .map((line, index) => ({ index, text: line, characters: Array.from(line) }));
}

function unsupportedInput(text: string): Array<{ character: string; inputIndex: number }> {
  return Array.from(withoutAnnotations(text))
    .map((character, inputIndex) => ({ character, inputIndex }))
    .filter(({ character }) => !HAN_CHARACTER.test(character) && !IGNORABLE_NON_HAN.test(character));
}

function toneValues(reading: ReadingResolution): Array<"ping" | "ze"> {
  return reading.ambiguity.tone.values.filter(
    (tone): tone is "ping" | "ze" => tone === "ping" || tone === "ze",
  );
}

function compareTone(
  reading: ReadingResolution,
  expectedTone: "ping" | "ze",
  isFlexible: boolean,
): CheckStatus {
  const tones = toneValues(reading);
  if (tones.length === 0) return "unknown";
  const allowed = isFlexible ? ["ping", "ze"] : [expectedTone];
  if (tones.every((tone) => allowed.includes(tone))) return "match";
  if (tones.every((tone) => !allowed.includes(tone))) return "mismatch";
  return "uncertain";
}

function aggregateStatuses(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("mismatch")) return "mismatch";
  if (statuses.includes("unknown")) return "unknown";
  if (statuses.includes("uncertain")) return "uncertain";
  if (statuses.some((status) => status === "match")) return "match";
  return "not-applicable";
}

function lineOverrides(
  overrides: PoemReadingOverride[],
  lineIndex: number,
): ReadingOverride[] {
  return overrides
    .filter((override) => override.lineIndex === lineIndex)
    .map((override) => ({
      index: override.characterIndex,
      character: override.character,
      candidateId: override.candidateId,
    }));
}

function validatePoemOverrides(overrides: PoemReadingOverride[]): void {
  const coordinates = new Set<string>();
  for (const override of overrides) {
    if (
      !Number.isInteger(override.lineIndex) ||
      override.lineIndex < 0 ||
      !Number.isInteger(override.characterIndex) ||
      override.characterIndex < 0
    ) {
      throw new Error("reading override coordinates must be non-negative integers");
    }
    const coordinate = `${override.lineIndex}:${override.characterIndex}`;
    if (coordinates.has(coordinate)) {
      throw new Error(`duplicate poem reading override at ${coordinate}`);
    }
    coordinates.add(coordinate);
  }
}

function possibleToneSequences(characters: CharacterAnalysis[]): string[] | null {
  const toneSets = characters.map((character) => character.actualTones);
  if (toneSets.some((tones) => tones.length === 0)) return null;
  let sequences = [""];
  for (const tones of toneSets) {
    sequences = sequences.flatMap((sequence) => tones.map((tone) => sequence + (tone === "ping" ? "平" : "仄")));
  }
  return [...new Set(sequences)];
}

function riskFromSequences(
  sequences: string[] | null,
  predicate: (sequence: string) => boolean,
  applicable: boolean,
): PatternRisk {
  if (!applicable) return { status: "not-applicable", evidence: [] };
  if (!sequences) return { status: "unknown", evidence: [] };
  const risky = sequences.filter(predicate);
  if (risky.length === 0) return { status: "clear", evidence: [] };
  if (risky.length === sequences.length) return { status: "detected", evidence: risky };
  return { status: "possible", evidence: risky };
}

function detectIsolatedPing(characters: CharacterAnalysis[], lineLength: number): PatternRisk {
  if (characters.length !== lineLength || ![5, 7].includes(lineLength)) {
    return { status: "not-applicable", evidence: [] };
  }
  const core = lineLength === 7 ? characters.slice(2) : characters;
  const sequences = possibleToneSequences(core);
  return riskFromSequences(
    sequences,
    (sequence) => sequence === "仄平仄仄平",
    true,
  );
}

function detectTriplePingTail(characters: CharacterAnalysis[], lineLength: number): PatternRisk {
  if (characters.length !== lineLength) return { status: "not-applicable", evidence: [] };
  const tail = characters.slice(-3);
  return riskFromSequences(possibleToneSequences(tail), (sequence) => sequence === "平平平", true);
}

function matchesUnmodeledSevenCharacterExemplar(
  readings: ReadingResolution[],
  expectedPattern: string,
  characterIndex: number,
): boolean {
  if (characterIndex !== 4 || expectedPattern !== "仄仄平平仄仄平" || readings.length !== 7) return false;
  // The project's Wang Li source prints both 登高 and 钱塘湖春行 with this
  // ?仄平平平仄平 line shape, but the current static templates do not encode
  // the condition that admits it. Keep this exact source-attested shape out of
  // hard-error claims without making every seventh-character fifth position free.
  const requiredTail: Array<"ping" | "ze"> = ["ze", "ping", "ping", "ping", "ze", "ping"];
  return requiredTail.every((tone, index) => {
    const tones = toneValues(readings[index + 1]);
    return tones.length === 1 && tones[0] === tone;
  });
}

// Wang Li, 诗词格律, ch2-03 §五 and §六(a). Only these complete
// five-character cores are admitted; seven-character lines retain their prefix.
function applyLocalMetreRule(line: LineAnalysis): void {
  if (line.actualLength !== line.expectedLength || ![5, 7].includes(line.expectedLength)) return;
  const offset = line.expectedLength - 5;
  const core = line.expectedPattern.slice(offset);
  const target = core === "平平平仄仄" ? "平平仄平仄"
    : core === "平平仄仄平" ? "仄平平仄平" : null;
  if (!target) return;
  const characters = line.characters.slice(offset);
  // A missing reading may still complete the form, but must never certify it.
  const compatible = characters.every((character, index) =>
    character.actualTones.length === 0 || character.actualTones.includes(target[index] === "平" ? "ping" : "ze"));
  if (!compatible) return;
  const confirmed = characters.every((character, index) =>
    character.actualTones.length === 1 && character.actualTones[0] === (target[index] === "平" ? "ping" : "ze"));
  // Do not annotate ordinary lines merely because a missing reading permits a rule.
  if (!characters.some((character, index) => target[index] !== core[index] && ["mismatch", "uncertain"].includes(character.status))) return;
  line.metreAdjustment = {
    rule: core === "平平平仄仄" ? "special-lvju" : "isolated-ping-self-rescue",
    status: confirmed ? "confirmed" : "possible",
    pattern: line.expectedPattern.slice(0, offset) + target,
    source: `OEBPS/Text/scgl-ch2-03.html#${core === "平平平仄仄" ? "sigil_toc_id_11" : "sigil_toc_id_12"}`,
  };
  for (const [index, character] of characters.entries()) {
    if (confirmed) {
      character.expectedTone = target[index] === "平" ? "ping" : "ze";
      character.isFlexible = false;
      character.status = "match";
    } else if (target[index] !== core[index] || character.actualTones.length !== 1) {
      character.status = character.actualTones.length === 0 ? "unknown" : "uncertain";
    }
  }
  line.toneStatus = aggregateStatuses(line.characters.map(character => character.ruleCoverage === "modeled" ? character.status : "unknown"));
}

// Wang Li ch2-03 §六(b), including (a)+(b); ch5-01 defines the
// complete five-character core independently of the misprinted seven-character formula.
function applyCoupletRescue(lines: LineAnalysis[]): void {
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const left = lines[i], right = lines[i + 1];
    const offset = left.expectedLength - 5;
    if (![5, 7].includes(left.expectedLength) || right.expectedLength !== left.expectedLength ||
        [left, right].some(line => line.actualLength !== line.expectedLength || line.characters.some(c => c.character === VERSE_GAP)) ||
        left.expectedPattern.slice(offset) !== "仄仄平平仄" || right.expectedPattern.slice(offset) !== "平平仄仄平") continue;
    // First/third core positions admit the explicitly attested variants. Prefix
    // checks remain independent, as do rhyme and second-character relations.
    const allowed = [["平仄", "仄", "平仄", "仄", "仄"], ["平仄", "平", "平", "仄", "平"]];
    const pair = [left, right];
    const cores = pair.map(line => line.characters.slice(offset));
    const symbol = (tone: "ping" | "ze") => tone === "ping" ? "平" : "仄";
    if (!cores.every((core, side) => core.every((c, j) => c.actualTones.length === 0 || c.actualTones.some(t => allowed[side][j].includes(symbol(t)))))) continue;
    const confirmed = cores.every(core => core.every(c => c.actualTones.length === 1));
    // Require evidence of the departing fourth-position departure.
    if (!cores[0][3].actualTones.includes("ze")) continue;
    for (const [side, line] of pair.entries()) {
      const core = cores[side];
      const target = core.map((c, j) => allowed[side][j].length === 1 ? allowed[side][j] :
        c.actualTones.length === 1 ? symbol(c.actualTones[0]) : line.expectedPattern[offset + j]).join("");
      line.metreAdjustment = {
        rule: "couplet-rescue", status: confirmed ? "confirmed" : "possible",
        partnerLineIndex: pair[1 - side].lineIndex,
        combinedSelfRescue: cores[1][0].actualTones.length === 1 && cores[1][0].actualTones[0] === "ze",
        pattern: line.expectedPattern.slice(0, offset) + target,
        source: "OEBPS/Text/scgl-ch2-03.html#sigil_toc_id_12; OEBPS/Text/scgl-ch5-01.html",
      };
      for (const [j, c] of core.entries()) {
        if (confirmed) {
          c.expectedTone = target[j] === "平" ? "ping" : "ze";
          c.isFlexible = allowed[side][j].length > 1;
          c.ruleCoverage = "modeled";
          c.status = "match";
        } else if (target[j] !== line.expectedPattern[offset + j] || c.actualTones.length !== 1) {
          c.status = c.actualTones.length === 0 ? "unknown" : "uncertain";
        }
      }
      line.toneStatus = aggregateStatuses(line.characters.map(c => c.ruleCoverage === "modeled" ? c.status : "unknown"));
    }
  }
}

function analyzeLines(
  normalizedLines: NormalizedLine[],
  template: MetreTemplate,
  variant: MetreVariant,
  pingze: PingzeDataset,
  readingRules: ReadingRulesDataset,
  overrides: PoemReadingOverride[],
): LineAnalysis[] {
  const lines = normalizedLines.map((line, lineIndex) => {
    const readings = resolveTextReadings(
      line.text,
      pingze,
      readingRules,
      lineOverrides(overrides, lineIndex),
    );
    const expectedPattern = variant.patterns[lineIndex] ?? "";
    const flexible = new Set(variant.flexiblePositions[lineIndex] ?? []);
    const characters = readings.map((reading, characterIndex): CharacterAnalysis => {
      const expectedSymbol = expectedPattern[characterIndex];
      const expectedTone = expectedSymbol === "平" ? "ping" : expectedSymbol === "仄" ? "ze" : null;
      const isFlexible = flexible.has(characterIndex);
      const status = reading.character===VERSE_GAP ? "not-applicable" : expectedTone ? compareTone(reading, expectedTone, isFlexible) : "not-applicable";
      const ruleCoverage = status === "mismatch" && !isFlexible && matchesUnmodeledSevenCharacterExemplar(readings, expectedPattern, characterIndex)
        ? "unmodeled-special-position" as const
        : "modeled" as const;
      return {
        character: reading.character,
        characterIndex,
        sourceOffset: line.sourceOffsets?.[characterIndex],
        expectedTone,
        actualTones: toneValues(reading),
        isFlexible,
        ruleCoverage,
        status,
        reading,
        readingConfirmation: "none",
      };
    });
    const lengthStatus: CheckStatus =
      line.characters.length === 0 ? "unknown" : line.characters.length === template.lineLength ? "match" : "mismatch";
    const toneStatus = aggregateStatuses(characters.map((character) => character.ruleCoverage === "modeled" ? character.status : "unknown"));
    const analysis: LineAnalysis = {
      lineIndex,
      role: template.lineRoles[lineIndex] ?? `第${lineIndex + 1}句`,
      text: line.text,
      expectedPattern,
      expectedLength: template.lineLength,
      actualLength: line.characters.length,
      lengthStatus,
      toneStatus,
      characters,
      isolatedPing: detectIsolatedPing(characters, template.lineLength),
      triplePingTail: detectTriplePingTail(characters, template.lineLength),
    };
    applyLocalMetreRule(analysis);
    return analysis;
  });
  applyCoupletRescue(lines);
  return lines;
}

function pingCandidates(reading: ReadingResolution): ReadingCandidate[] {
  return reading.candidates.filter((candidate) => candidate.toneType === "ping");
}

function analyzeRhyme(lines: LineAnalysis[], variant: MetreVariant, firstLineRhyme: "strict" | "sourced-neighbor" = "strict"): RhymeAnalysis {
  const feet = variant.rhymePositions.map((lineIndex): RhymeFootAnalysis => {
    const line = lines[lineIndex];
    // Until the slot has its expected length, its current last character is
    // not reliable evidence of a rhyme foot.
    const foot = line?.actualLength === line?.expectedLength ? line?.characters.at(-1) : undefined;
    if (!foot || foot.character===VERSE_GAP) {
      return {
        lineIndex,
        character: null,
        toneStatus: "unknown",
        rhymeStatus: line && line.actualLength > line.expectedLength ? "unknown" : "missing",
        candidateGroupIds: [],
        selectedGroupId: null,
      };
    }
    const candidates = pingCandidates(foot.reading);
    const candidateGroupIds = [...new Set(candidates.map((candidate) => candidate.rhymeGroupId))].sort();
    const toneStatus: CheckStatus =
      foot.actualTones.length === 0
        ? "unknown"
        : foot.actualTones.length === 1 && foot.actualTones[0] === "ping"
          ? "match"
          : foot.actualTones.includes("ping")
            ? "uncertain"
            : "mismatch";
    return {
      lineIndex,
      character: foot.character,
      toneStatus,
      rhymeStatus: candidateGroupIds.length === 0 ? "unknown" : "ambiguous",
      candidateGroupIds,
      selectedGroupId:
        foot.reading.selectedCandidate?.toneType === "ping"
          ? foot.reading.selectedCandidate.rhymeGroupId
          : foot.actualTones.length === 1 &&
              foot.actualTones[0] === "ping" &&
              candidateGroupIds.length === 1
            ? candidateGroupIds[0]
            : null,
    };
  });

  const firstLineBorrow = firstLineRhyme === "sourced-neighbor" ? analyzeFirstLineNeighborRhyme(feet, variant.rhymePositions) : undefined;
  const comparedFeet = firstLineBorrow?.status === "confirmed" ? feet.filter(f => f.lineIndex !== 0) : feet;
  const availableSets = comparedFeet.filter((foot) => foot.candidateGroupIds.length > 0).map((foot) => foot.candidateGroupIds);
  const commonGroupIds = availableSets.length
    ? availableSets.reduce((common, groups) => common.filter((group) => groups.includes(group)))
    : [];
  // Missing or uncertain evidence must never turn into a definite group conflict.
  const confirmed = comparedFeet.filter((foot) => foot.selectedGroupId !== null);
  const mismatch = confirmed.length >= 2 && new Set(confirmed.map((foot) => foot.selectedGroupId)).size > 1;
  for (const foot of feet) {
    if (foot.rhymeStatus === "missing") continue;
    else if (!foot.candidateGroupIds.length) foot.rhymeStatus = "unknown";
    else if (foot.selectedGroupId === null) foot.rhymeStatus = "ambiguous";
    else foot.rhymeStatus = mismatch ? "mismatch" : "compatible";
  }
  const missingLineIndexes = feet.filter((foot) => foot.rhymeStatus === "missing").map((foot) => foot.lineIndex);
  const status: RhymeStatus = mismatch ? "mismatch"
    : missingLineIndexes.length ? "missing"
    : feet.some((foot) => foot.rhymeStatus === "unknown") ? "unknown"
    : feet.some((foot) => foot.rhymeStatus === "ambiguous") ? "ambiguous"
    : "compatible";
  const comparable = comparedFeet.filter((foot) => foot.candidateGroupIds.length > 0);
  const evidence: RhymeEvidence = {
    feasibility: comparable.length < 2 ? "insufficient" : commonGroupIds.length ? "common" : "no-common",
    comparedLineIndexes: comparable.map((foot) => foot.lineIndex),
    unavailableLineIndexes: feet.filter((foot) => !foot.candidateGroupIds.length).map((foot) => foot.lineIndex),
    confirmedGroupStatus: mismatch ? "conflict" : confirmed.length >= 2 ? "compatible" : "insufficient",
    confirmedLineIndexes: confirmed.map((foot) => foot.lineIndex),
    confirmedConflictLineIndexes: mismatch ? confirmed.map((foot) => foot.lineIndex) : [],
    unconfirmedReadingLineIndexes: comparable.filter((foot) => lines[foot.lineIndex]?.characters.at(-1)?.reading.status !== "resolved").map((foot) => foot.lineIndex),
  };
  return { status, missingLineIndexes, requiredLineIndexes: variant.rhymePositions, commonGroupIds, feet, evidence, ...(firstLineBorrow ? { firstLineBorrow } : {}) };

}

function relationStatus(
  left: CharacterAnalysis | undefined,
  right: CharacterAnalysis | undefined,
  relation: "same" | "opposite",
): CheckStatus {
  if (!left || !right || left.actualTones.length === 0 || right.actualTones.length === 0) return "unknown";
  const possibilities = left.actualTones.flatMap((leftTone) =>
    right.actualTones.map((rightTone) =>
      relation === "same" ? leftTone === rightTone : leftTone !== rightTone,
    ),
  );
  if (possibilities.every(Boolean)) return "match";
  if (possibilities.every((value) => !value)) return "mismatch";
  return "uncertain";
}

function analyzeRelations(lines: LineAnalysis[], template: MetreTemplate): RelationCheck[] {
  const position = 1;
  const coupletPairs =
    template.coupletPairs ??
    Array.from({ length: Math.floor(template.lineCount / 2) }, (_, index) => [index * 2, index * 2 + 1]);
  const nianPositions =
    template.nianPositions ??
    Array.from({ length: Math.max(0, Math.floor(template.lineCount / 2) - 1) }, (_, index) => (index + 1) * 2);
  const dui = coupletPairs.map(([leftLineIndex, rightLineIndex]): RelationCheck => {
    const left = lines[leftLineIndex]?.characters[position];
    const right = lines[rightLineIndex]?.characters[position];
    return {
      kind: "dui",
      leftLineIndex,
      rightLineIndex,
      characterPosition: position,
      status: relationStatus(left, right, "opposite"),
      leftTones: left?.actualTones ?? [],
      rightTones: right?.actualTones ?? [],
    };
  });
  const nian = nianPositions.map((rightLineIndex): RelationCheck => {
    const leftLineIndex = rightLineIndex - 1;
    const left = lines[leftLineIndex]?.characters[position];
    const right = lines[rightLineIndex]?.characters[position];
    return {
      kind: "nian",
      leftLineIndex,
      rightLineIndex,
      characterPosition: position,
      status: relationStatus(left, right, "same"),
      leftTones: left?.actualTones ?? [],
      rightTones: right?.actualTones ?? [],
    };
  });
  return [...dui, ...nian];
}

// Only prove optionality within the checks we actually implement. Reuse their
// line-local risk results; never enumerate whole-poem reading combinations.
function classifyReadingConfirmation(lines: LineAnalysis[], rhyme: RhymeAnalysis, relations: RelationCheck[]): void {
  for (const line of lines) for (const character of line.characters) {
    if(character.character===VERSE_GAP){character.readingConfirmation="none";continue;}
    if (character.reading.source === "user-override") { character.readingConfirmation = "selected"; continue; }
    if (character.expectedTone === null) continue;
    if (character.reading.status === "unknown") { character.readingConfirmation = "required"; continue; }
    if (character.reading.status !== "ambiguous") continue;
    const index = character.characterIndex;
    const changesTone = character.actualTones.length > 1;
    const complete = line.actualLength === line.expectedLength;
    const unresolvedRisk = (risk: PatternRisk) => risk.status === "possible" || risk.status === "unknown";
    const affectsIsolated = complete && changesTone && index >= (line.expectedLength === 7 ? 2 : 0) && unresolvedRisk(line.isolatedPing);
    const affectsTail = complete && changesTone && index >= line.actualLength - 3 && unresolvedRisk(line.triplePingTail);
    const affectsRelation = relations.some((relation) => relation.status === "uncertain" && relation.characterPosition === index &&
      (relation.leftLineIndex === line.lineIndex || relation.rightLineIndex === line.lineIndex));
    const foot = rhyme.feet.find((item) => item.lineIndex === line.lineIndex);
    const affectsRhyme = complete && index === line.actualLength - 1 && foot !== undefined && foot.selectedGroupId === null;
    const ruleOnlyUncertainty = line.metreAdjustment?.status === "possible" &&
      index >= line.expectedLength - 5 && character.actualTones.length === 1;
    character.readingConfirmation = (character.status === "uncertain" && !ruleOnlyUncertainty) || character.status === "unknown" ||
      affectsIsolated || affectsTail || affectsRelation || affectsRhyme ? "required" : "optional";
  }
}

function buildIssues(
  normalizedLines: NormalizedLine[],
  lines: LineAnalysis[],
  template: MetreTemplate,
  rhyme: RhymeAnalysis,
  relations: RelationCheck[],
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  if (normalizedLines.length !== template.lineCount) {
    issues.push({
      code: "LINE_COUNT",
      severity: "error",
      message: `应为${template.lineCount}句，当前为${normalizedLines.length}句。`,
    });
  }
  for (const line of lines) {
    if (line.lengthStatus === "mismatch") {
      issues.push({
        code: "LINE_LENGTH",
        severity: "error",
        message: `第${line.lineIndex + 1}句应为${line.expectedLength}字，当前为${line.actualLength}字。`,
        lineIndex: line.lineIndex,
      });
    }
    if (line.metreAdjustment?.status === "possible") {
      issues.push({
        code: "RULE_PRECONDITION_UNRESOLVED",
        severity: "warning",
        message: `第${line.lineIndex + 1}句可能采用${line.metreAdjustment.rule === "special-lvju" ? "特定律句" : line.metreAdjustment.rule === "couplet-rescue" ? "对句相救" : "孤平本句自救"}；须确认相关多音字或缺失读音后才能判定成立。`,
        lineIndex: line.lineIndex,
      });
    }
    for (const character of line.characters) {
      if(character.character===VERSE_GAP)continue;
      if (character.status === "mismatch" && character.ruleCoverage === "unmodeled-special-position") {
        issues.push({
          code: "RULE_SCOPE_UNMODELED",
          severity: "warning",
          message: `第${line.lineIndex + 1}句第${character.characterIndex + 1}字“${character.character}”与正格模板不同，但整句形态见于当前格律底本例诗；规则尚未覆盖其成立条件，不作出律结论。`,
          lineIndex: line.lineIndex,
          characterIndex: character.characterIndex,
        });
      } else if (character.status === "mismatch") {
        issues.push({
          code: "TONE_MISMATCH",
          severity: "error",
          message: `第${line.lineIndex + 1}句第${character.characterIndex + 1}字“${character.character}”平仄不符。`,
          lineIndex: line.lineIndex,
          characterIndex: character.characterIndex,
        });
      } else if (character.status === "uncertain" || character.status === "unknown") {
        // A known tone can depend on an unresolved rule premise elsewhere in
        // the line. Its pronunciation itself does not need confirmation.
        if (line.metreAdjustment?.status === "possible" &&
            character.characterIndex >= line.expectedLength - 5 && character.actualTones.length === 1) continue;
        issues.push({
          code: "READING_UNRESOLVED",
          severity: "warning",
          message: `第${line.lineIndex + 1}句第${character.characterIndex + 1}字“${character.character}”读音待确认。`,
          lineIndex: line.lineIndex,
          characterIndex: character.characterIndex,
        });
      }
    }
    if (line.isolatedPing.status === "detected" || line.isolatedPing.status === "possible") {
      issues.push({
        code: line.isolatedPing.status === "detected" ? "ISOLATED_PING" : "POSSIBLE_ISOLATED_PING",
        severity: line.isolatedPing.status === "detected" ? "error" : "warning",
        message: `第${line.lineIndex + 1}句${line.isolatedPing.status === "detected" ? "犯孤平" : "可能犯孤平"}。`,
        lineIndex: line.lineIndex,
      });
    }
    if (line.triplePingTail.status === "detected" || line.triplePingTail.status === "possible") {
      issues.push({
        code:
          line.triplePingTail.status === "detected"
            ? "TRIPLE_PING_TAIL"
            : "POSSIBLE_TRIPLE_PING_TAIL",
        severity: line.triplePingTail.status === "detected" ? "error" : "warning",
        message: `第${line.lineIndex + 1}句${line.triplePingTail.status === "detected" ? "出现三平调" : "可能出现三平调"}。`,
        lineIndex: line.lineIndex,
      });
    }
  }
  if (rhyme.firstLineBorrow) issues.push({ code: "FIRST_LINE_BORROW", severity: rhyme.firstLineBorrow.status === "confirmed" ? "info" : "warning", lineIndex: 0, message: rhyme.firstLineBorrow.status === "confirmed" ? "首句借邻韵；正文韵脚仍按主韵核对。" : "首句可能借邻韵，请先确认读音。" });
  for (const foot of rhyme.feet) {
    if (foot.toneStatus === "mismatch") {
      issues.push({
        code: "RHYME_TONE",
        severity: "error",
        message: `第${foot.lineIndex + 1}句韵脚不是平声。`,
        lineIndex: foot.lineIndex,
      });
    } else if (foot.rhymeStatus === "mismatch") {
      issues.push({
        code: "RHYME_GROUP",
        severity: "error",
        message: `第${foot.lineIndex + 1}句韵脚与其他韵脚不在同一平水韵部。`,
        lineIndex: foot.lineIndex,
      });
    } else if (foot.rhymeStatus === "ambiguous" || foot.rhymeStatus === "unknown" || foot.rhymeStatus === "missing") {
      issues.push({
        code: "RHYME_UNRESOLVED",
        severity: "warning",
        message: foot.rhymeStatus === "missing" ? `尚缺第${foot.lineIndex + 1}句韵脚。` : `第${foot.lineIndex + 1}句韵脚韵部待确认。`,
        lineIndex: foot.lineIndex,
      });
    }
  }
  if (rhyme.evidence.feasibility === "no-common" && rhyme.evidence.confirmedGroupStatus !== "conflict") {
    issues.push({
      code: "RHYME_CANDIDATES_DISJOINT", severity: "warning",
      message: "当前已知候选没有共同韵部，请核对字义、读音和字典覆盖情况。",
    });
  }
  for (const relation of relations) {
    if (relation.status !== "mismatch") continue;
    issues.push({
      code: relation.kind === "dui" ? "DUI_MISMATCH" : "NIAN_MISMATCH",
      severity: "error",
      message:
        relation.kind === "dui"
          ? `第${relation.leftLineIndex + 1}、${relation.rightLineIndex + 1}句第二字失对。`
          : `第${relation.leftLineIndex + 1}、${relation.rightLineIndex + 1}句第二字失粘。`,
      lineIndex: relation.rightLineIndex,
      characterIndex: relation.characterPosition,
    });
  }
  return issues;
}

function scoreVariant(
  normalizedLines: NormalizedLine[],
  template: MetreTemplate,
  variant: MetreVariant,
  pingze: PingzeDataset,
  readingRules: ReadingRulesDataset,
  overrides: PoemReadingOverride[],
  firstLineRhyme: "strict" | "sourced-neighbor" = "strict",
): VariantScore {
  const lines = analyzeLines(normalizedLines, template, variant, pingze, readingRules, overrides);
  const rhyme = analyzeRhyme(lines, variant, firstLineRhyme);
  const relations = analyzeRelations(lines, template);
  const structural = Math.abs(normalizedLines.length - template.lineCount) * 100;
  const lengthMismatch = lines.filter((line) => line.lengthStatus === "mismatch").length * 30;
  const toneMismatch = lines.flatMap((line) => line.characters).filter((item) => item.status === "mismatch" && item.ruleCoverage === "modeled").length;
  const relationMismatch = relations.filter((item) => item.status === "mismatch").length * 2;
  const rhymeMismatch = rhyme.status === "mismatch" ? 20 : 0;
  const uncertainCount =
    lines.flatMap((line) => line.characters).filter((item) => item.ruleCoverage !== "modeled" || ["uncertain", "unknown"].includes(item.status)).length +
    (["missing", "ambiguous", "unknown"].includes(rhyme.status) ? 1 : 0);
  const hardMismatchCount =
    Math.abs(normalizedLines.length - template.lineCount) +
    lines.filter((line) => line.lengthStatus === "mismatch").length +
    toneMismatch +
    relations.filter((item) => item.status === "mismatch").length +
    (rhyme.status === "mismatch" ? 1 : 0);
  return {
    variantId: variant.id,
    variantName: variant.name,
    score: structural + lengthMismatch + toneMismatch + relationMismatch + rhymeMismatch + uncertainCount * 0.01,
    hardMismatchCount,
    uncertainCount,
  };
}

function analysisStatus(issues: AnalysisIssue[], normalizedLines: NormalizedLine[], template: MetreTemplate): AnalysisStatus {
  if (
    normalizedLines.length < template.lineCount ||
    normalizedLines.some((line) => line.characters.length < template.lineLength || line.characters.includes(VERSE_GAP))
  ) {
    return "incomplete";
  }
  if (issues.some((issue) => issue.severity === "error")) return "invalid";
  if (issues.some((issue) => issue.severity === "warning")) return "needs-confirmation";
  return "valid";
}

function buildSummary(
  normalizedLines: NormalizedLine[],
  lines: LineAnalysis[],
  template: MetreTemplate,
): AnalysisSummary {
  const checked = lines
    .flatMap((line) => line.characters)
    .filter((character) => character.expectedTone !== null);
  const confirmedMatches = checked.filter((character) => character.ruleCoverage === "modeled" && character.status === "match").length;
  const confirmedMismatches = checked.filter((character) => character.ruleCoverage === "modeled" && character.status === "mismatch").length;
  const unresolvedTonePositions = checked.filter((character) =>
    character.ruleCoverage !== "modeled" || ["uncertain", "unknown"].includes(character.status),
  ).length;
  const confirmedTotal = confirmedMatches + confirmedMismatches;
  return {
    expectedLineCount: template.lineCount,
    actualLineCount: normalizedLines.length,
    expectedLineLength: template.lineLength,
    checkedTonePositions: checked.length,
    confirmedMatches,
    confirmedMismatches,
    unresolvedTonePositions,
    flexiblePositions: checked.filter((character) => character.isFlexible).length,
    confirmedCompliancePercent:
      confirmedTotal === 0 ? null : Math.round((confirmedMatches / confirmedTotal) * 10000) / 100,
    resolutionCoveragePercent:
      checked.length === 0 ? 0 : Math.round((confirmedTotal / checked.length) * 10000) / 100,
  };
}

export function analyzePoem(
  text: string,
  metre: MetreDataset,
  pingze: PingzeDataset,
  readingRules: ReadingRulesDataset,
  options: AnalyzePoemOptions,
): PoemAnalysis {
  const template = metre.templates.find((item) => item.id === options.templateId);
  if (!template) throw new Error(`unknown metre template ${options.templateId}`);
  const scopeWarnings: AnalysisScopeWarning[] = [];
  const recordScope = (source: string, coordinateSpace: AnalysisScopeWarning["coordinateSpace"], lineIndex?: number) => {
    const scanned = scanAnnotations(source);
    for (const range of scanned.ranges.filter((item) => !item.closed)) scopeWarnings.push({
      code: "UNCLOSED_ANNOTATION", coordinateSpace, ...(lineIndex === undefined ? {} : { lineIndex }),
      start: range.start, end: range.end, text: source.slice(range.start, range.end),
    });
    return scanned.characters;
  };
  if (!options.editorLines) recordScope(text, "source-text");
  const normalizedLines = options.editorLines
    ? options.editorLines.map((source, index) => {
        const mapped = recordScope(source, "editor-line", index);
        const characters = mapped.map((item) => item.character);
        return { index, text: characters.join(""), characters, sourceOffsets: mapped.map((item) => item.sourceOffset) };
      })
    : normalizePoemText(text);
  const requestedOverrides = options.overrides ?? [];
  validatePoemOverrides(requestedOverrides);
  const overrides = requestedOverrides.filter((override) => {
    const line = normalizedLines[override.lineIndex];
    return (!options.editorLines || matchesEditorAnchor(options.editorLines, override)) &&
      line?.characters[override.characterIndex] === override.character &&
      pingze.characters[override.character]?.candidates.some((candidate) => candidate.id === override.candidateId);
  });
  const variantRanking = template.variants
    .map((variant) => scoreVariant(normalizedLines, template, variant, pingze, readingRules, overrides, options.firstLineRhyme))
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(left.variantId !== template.recommendedVariantId) -
          Number(right.variantId !== template.recommendedVariantId) ||
        left.variantId.localeCompare(right.variantId),
    );
  const variantId = options.variantId ?? variantRanking[0]?.variantId ?? template.recommendedVariantId;
  const variant = template.variants.find((item) => item.id === variantId);
  if (!variant) throw new Error(`unknown metre variant ${variantId} for ${template.id}`);
  const lines = analyzeLines(normalizedLines, template, variant, pingze, readingRules, overrides);
  const rhyme = analyzeRhyme(lines, variant, options.firstLineRhyme);
  const relations = analyzeRelations(lines, template);
  classifyReadingConfirmation(lines, rhyme, relations);
  const issues = buildIssues(normalizedLines, lines, template, rhyme, relations);
  const unsupported = options.editorLines
    ? options.editorLines.flatMap((line) => unsupportedInput(line))
    : unsupportedInput(text);
  for (const item of unsupported) {
    issues.push({
      code: "UNSUPPORTED_INPUT",
      severity: "warning",
      message: `输入中的“${item.character}”不是汉字或标点，分析时已忽略。`,
    });
  }
  return {
    scope: { complete: scopeWarnings.length === 0, warnings: scopeWarnings },
    status: analysisStatus(issues, normalizedLines, template),
    ignoredOverrideCount: requestedOverrides.length - overrides.length,
    templateId: template.id,
    templateName: template.name,
    variantId: variant.id,
    variantName: variant.name,
    normalizedLines,
    lines,
    rhyme,
    relations,
    issues,
    summary: buildSummary(normalizedLines, lines, template),
    variantRanking,
    limitations: [
      "只检查王力体系下的字数、平仄、平水韵、粘对、孤平和三平调。",
      "已覆盖特定律句、本句自救及有据的对句相救；首句借韵需启用且限已核邻韵对，其余拗救、语义对仗和古风式律诗尚未自动判定。",
      "格律符合度不会用于自动选择多音字读音。",
    ],
  };
}
