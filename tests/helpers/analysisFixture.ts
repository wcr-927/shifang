import { readFileSync } from "node:fs";
import { analyzePoem, type AnalyzePoemOptions, type MetreDataset } from "../../src/poetry/analysis/poemAnalyzer.ts";
import type { PingzeDataset } from "../../src/poetry/analysis/readingResolver.ts";
export const fixture = JSON.parse(readFileSync(new URL("../fixtures/analysisEvidence.json", import.meta.url), "utf8"));
const metre = JSON.parse(readFileSync(new URL("../../src/rules/metre.json", import.meta.url), "utf8")) as MetreDataset;
const dimension = (values: string[]) => ({ status: new Set(values).size > 1 ? "ambiguous" as const : "resolved" as const, values: [...new Set(values)] });
export const pingze: PingzeDataset = {
  schemaVersion: 2, datasetVersion: fixture.fixture.datasetVersion,
  characters: Object.fromEntries(Object.entries(fixture.fixture.characters).map(([character, entries]) => {
    const candidates = (entries as string[][]).map(([toneType, rhymeGroupId], index) => ({ id: `${character}:audit-${index}`, toneType: toneType as "ping" | "ze", toneCategory: toneType === "ping" ? "ping" as const : "qu" as const, rhymeGroupId, rhymeGroupName: `Synthetic ${rhymeGroupId}`, glosses: [`synthetic meaning ${index}`] }));
    return [character, { character, candidates, baseAmbiguity: { tone: dimension(candidates.map(c => c.toneType)), rhyme: dimension(candidates.map(c => c.rhymeGroupId)), modernPronunciation: { status: "not-evaluated" as const, values: [] } } }];
  })),
};
export const regularLines = ["夜夜春春夜", "春春夜夜春", "春春春夜夜", "夜夜夜春春"];
export function analyzeFixture(lines: string[], options: Partial<AnalyzePoemOptions> = {}) {
  return analyzePoem(lines.join("\n"), metre, pingze, { schemaVersion: 1, rules: [] }, { templateId: "wujue", variantId: "zeqi-first-unrhymed", editorLines: lines, ...options });
}
export function analyzeCase(id: string) {
  const c = fixture.cases.find((item: any) => item.case_id === id);
  if (!c) throw new Error("Unknown fixture case");
  return analyzeFixture(c.slots, { templateId: c.template, variantId: c.variant, overrides: c.overrides });
}
