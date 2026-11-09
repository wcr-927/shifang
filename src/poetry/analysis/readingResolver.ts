export type ResolutionStatus = "resolved" | "ambiguous" | "unknown";
export type AmbiguityStatus = "resolved" | "ambiguous" | "not-evaluated" | "unknown";

export interface ReadingCandidate {
  id: string;
  toneType: "ping" | "ze";
  toneCategory: "ping" | "shang" | "qu" | "ru";
  rhymeGroupId: string;
  rhymeGroupName: string;
  glosses: string[];
}

export interface AmbiguityDimension {
  status: AmbiguityStatus;
  values: string[];
}

export interface ReadingEntry {
  character: string;
  candidates: ReadingCandidate[];
  baseAmbiguity: {
    tone: AmbiguityDimension;
    rhyme: AmbiguityDimension;
    modernPronunciation: AmbiguityDimension;
  };
}

export interface PingzeDataset {
  schemaVersion: number;
  datasetVersion?: string;
  characters: Record<string, ReadingEntry>;
}

export interface ReadingRule {
  id: string;
  targetCharacter: string;
  phrase: string;
  targetOffset: number;
  candidateId: string;
  priority: number;
  sourceGloss: string;
}

export interface ReadingRulesDataset {
  schemaVersion: number;
  datasetVersion?: string;
  rules: ReadingRule[];
}

export interface ReadingOverride {
  index: number;
  character: string;
  candidateId: string;
}

export interface ReadingResolution {
  /** Full dictionary choices for UI; candidates remains the effective analysis set. */
  allCandidates?: ReadingCandidate[];
  character: string;
  index: number;
  status: ResolutionStatus;
  source: "user-override" | "phrase-rule" | "single-candidate" | "unresolved" | "unknown-character";
  candidates: ReadingCandidate[];
  selectedCandidate: ReadingCandidate | null;
  appliedRuleId: string | null;
  ambiguity: {
    tone: AmbiguityDimension;
    rhyme: AmbiguityDimension;
    modernPronunciation: AmbiguityDimension;
  };
}

function dimension(values: string[]): AmbiguityDimension {
  const uniqueValues = [...new Set(values)].sort();
  return {
    status: uniqueValues.length <= 1 ? "resolved" : "ambiguous",
    values: uniqueValues,
  };
}

function summarizeAmbiguity(
  candidates: ReadingCandidate[],
  modernPronunciation: AmbiguityDimension,
): ReadingResolution["ambiguity"] {
  return {
    tone: dimension(candidates.map((candidate) => candidate.toneType)),
    rhyme: dimension(candidates.map((candidate) => candidate.rhymeGroupId)),
    modernPronunciation,
  };
}

function matchingRules(characters: string[], index: number, rules: ReadingRule[]): ReadingRule[] {
  const character = characters[index];
  return rules
    .filter((rule) => {
      if (rule.targetCharacter !== character) return false;
      const phraseStart = index - rule.targetOffset;
      if (phraseStart < 0) return false;
      const phraseCharacters = Array.from(rule.phrase);
      return (
        characters.slice(phraseStart, phraseStart + phraseCharacters.length).join("") === rule.phrase
      );
    })
    .sort(
      (left, right) =>
        right.phrase.length - left.phrase.length ||
        right.priority - left.priority ||
        left.id.localeCompare(right.id, "zh-Hans-CN"),
    );
}

function findCandidate(entry: ReadingEntry, candidateId: string): ReadingCandidate | null {
  return entry.candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

function resolved(
  entry: ReadingEntry,
  index: number,
  candidate: ReadingCandidate,
  source: ReadingResolution["source"],
  appliedRuleId: string | null,
): ReadingResolution {
  const candidates = [candidate];
  return {
    character: entry.character,
    index,
    status: "resolved",
    source,
    candidates,
    selectedCandidate: candidate,
    allCandidates: entry.candidates,
    appliedRuleId,
    ambiguity: summarizeAmbiguity(candidates, entry.baseAmbiguity.modernPronunciation),
  };
}

export function resolveTextReadings(
  text: string,
  pingze: PingzeDataset,
  readingRules: ReadingRulesDataset,
  overrides: ReadingOverride[] = [],
): ReadingResolution[] {
  const overrideByIndex = new Map<number, ReadingOverride>();
  for (const override of overrides) {
    if (!Number.isInteger(override.index) || override.index < 0) {
      throw new Error(`invalid reading override index ${override.index}`);
    }
    if (overrideByIndex.has(override.index)) {
      throw new Error(`duplicate reading override at index ${override.index}`);
    }
    overrideByIndex.set(override.index, override);
  }
  const characters = Array.from(text);

  return characters.map((character, index) => {
    const entry = pingze.characters[character];
    if (!entry) {
      return {
        character,
        index,
        status: "unknown",
        source: "unknown-character",
        candidates: [],
        selectedCandidate: null,
        appliedRuleId: null,
        ambiguity: {
          tone: { status: "unknown", values: [] },
          rhyme: { status: "unknown", values: [] },
          modernPronunciation: { status: "not-evaluated", values: [] },
        },
      };
    }

    const override = overrideByIndex.get(index);
    if (override && override.character === character) {
      const overrideCandidate = findCandidate(entry, override.candidateId);
      if (!overrideCandidate) {
        throw new Error(`invalid reading override ${override.candidateId} at index ${index}`);
      }
      return resolved(entry, index, overrideCandidate, "user-override", null);
    }

    const rule = matchingRules(characters, index, readingRules.rules)[0];
    if (rule) {
      const ruleCandidate = findCandidate(entry, rule.candidateId);
      if (!ruleCandidate) {
        throw new Error(`reading rule ${rule.id} references an invalid candidate`);
      }
      return resolved(entry, index, ruleCandidate, "phrase-rule", rule.id);
    }

    if (entry.candidates.length === 1) {
      return resolved(entry, index, entry.candidates[0], "single-candidate", null);
    }

    return {
      character,
      index,
      status: "ambiguous",
      source: "unresolved",
      candidates: entry.candidates,
      selectedCandidate: null,
      appliedRuleId: null,
      ambiguity: summarizeAmbiguity(entry.candidates, entry.baseAmbiguity.modernPronunciation),
    };
  });
}
