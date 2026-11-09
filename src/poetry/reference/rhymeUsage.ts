import { hasRhymeUsage, type RhymeUsageBundle, type RhymeView } from "../../shared/rhymeUsage";
import type { ReferenceSystem } from "../../shared/reference";

/** Browsing only: the original character and reading inventories remain untouched. */
export function rankRhymeCharacters(chars: readonly string[], usage: RhymeUsageBundle,
  scope: { system: ReferenceSystem; groupId: string; view: RhymeView }): string[] {
  if (scope.view === "all") return [...chars];
  if (!hasRhymeUsage(usage, scope)) return scope.view === "common-only" ? [] : [...chars];
  const ranks = new Map(usage.entries.filter(entry => entry.system === scope.system && entry.groupId === scope.groupId)
    .map(entry => [entry.character, entry.rank]));
  return chars.map((character, index) => ({ character, index, rank: ranks.get(character) }))
    .filter(item => scope.view !== "common-only" || item.rank !== undefined)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.index - b.index)
    .map(item => item.character);
}
