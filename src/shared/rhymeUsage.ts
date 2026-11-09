import { z } from "zod";
import type { ReferenceSystem } from "./reference";

const text = z.string().trim().min(1);
export const rhymeViewSchema = z.enum(["all", "common-first", "common-only"]);
export type RhymeView = z.infer<typeof rhymeViewSchema>;
const scopeSchema = z.object({ system: z.enum(["pingshui", "cilin"]), groupId: text }).strict();
const entrySchema = scopeSchema.extend({
  character: z.string().refine(value => Array.from(value).length === 1 && /^\p{Script=Han}$/u.test(value), "Expected one Han character"),
  rank: z.number().int().positive().safe(), sourceIds: z.array(text).min(1),
}).strict();
const scopeId = (scope: { system: ReferenceSystem; groupId: string }) => JSON.stringify([scope.system, scope.groupId]);

export const rhymeUsageBundleSchema = z.object({
  version: text, sourceIds: z.array(text), coverage: z.array(scopeSchema), entries: z.array(entrySchema),
}).strict().superRefine((bundle, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const sources = new Set(bundle.sourceIds);
  if (sources.size !== bundle.sourceIds.length) fail("Duplicate source ID");
  const coverage = new Set(bundle.coverage.map(scopeId));
  if (coverage.size !== bundle.coverage.length) fail("Duplicate coverage scope");
  const entries = new Set<string>();
  for (const entry of bundle.entries) {
    const key = JSON.stringify([entry.system, entry.groupId, entry.character]);
    if (entries.has(key)) fail("Duplicate usage character: " + key);
    entries.add(key);
    if (!coverage.has(scopeId(entry))) fail("Usage entry has no declared coverage");
    if (new Set(entry.sourceIds).size !== entry.sourceIds.length) fail("Duplicate entry source ID");
    if (entry.sourceIds.some(id => !sources.has(id))) fail("Unknown usage source ID");
  }
});
export type RhymeUsageBundle = z.infer<typeof rhymeUsageBundleSchema>;
export interface RhymeUsageGroup { system: ReferenceSystem; groupId: string; characters: readonly string[] }

/** Validate foreign keys against the original tables without editing either table. */
export function validateRhymeUsageBundle(value: unknown, groups: readonly RhymeUsageGroup[]): RhymeUsageBundle {
  const bundle = rhymeUsageBundleSchema.parse(value);
  const known = new Map(groups.map(group => [scopeId(group), new Set(group.characters)]));
  for (const scope of bundle.coverage) if (!known.has(scopeId(scope))) throw new Error("Unknown usage group: " + scopeId(scope));
  for (const entry of bundle.entries) if (!known.get(scopeId(entry))?.has(entry.character)) throw new Error("Usage character is absent from its original group: " + entry.character);
  return bundle;
}

export function hasRhymeUsage(usage: RhymeUsageBundle, scope: { system: ReferenceSystem; groupId: string }): boolean {
  return usage.coverage.some(item => item.system === scope.system && item.groupId === scope.groupId);
}
