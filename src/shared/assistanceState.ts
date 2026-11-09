import { z } from "zod";
export const firstLineRhymeSchema = z.enum(["strict", "sourced-neighbor"]);
export const rhymeReferenceSchema = z.object({
  segmentId: z.string().min(1).max(256),
  system: z.enum(["pingshui", "cilin"]),
  groupId: z.string().min(1).max(100),
  mode: z.enum(["automatic", "manual"]),
  feet: z.array(z.object({line:z.number().int().nonnegative(),character:z.string().max(2)}).strict()).max(256).optional(),
  anchor: z.object({
    line: z.number().int().nonnegative(), offset: z.number().int().nonnegative(),
    character: z.string().refine(s => Array.from(s).length === 1),
    source: z.string().max(100_000),
  }).strict().optional(),
}).strict();
export const workAssistanceStateSchema = z.object({
  version: z.literal(1),
  firstLineRhyme: firstLineRhymeSchema.optional(),
  freeColumns: z.object({ breakOffset: z.number().int().nonnegative().max(100_000) }).strict().optional(),
  references: z.array(rhymeReferenceSchema).max(256),
  ancientSegments: z.array(z.object({
    id: z.string().min(1).max(256), startLine: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(), rhymeLines: z.array(z.number().int().nonnegative()).max(100_001),
  }).strict().refine(s => s.endLine >= s.startLine && s.rhymeLines.every(l => l >= s.startLine && l <= s.endLine))).max(256),
}).strict().refine(s => new Set(s.references.map(r => r.segmentId)).size === s.references.length, "韵段不可重复")
  .refine(s => new Set(s.ancientSegments.map(r => r.id)).size === s.ancientSegments.length, "古体韵段不可重复");
export type RhymeReference = z.infer<typeof rhymeReferenceSchema>;
export type WorkAssistanceState = z.infer<typeof workAssistanceStateSchema>;
export const emptyAssistance = (): WorkAssistanceState => ({ version: 1, references: [], ancientSegments: [] });
export function setRhymeReference(state: WorkAssistanceState | undefined, reference: RhymeReference | null, segmentId: string): WorkAssistanceState {
  const current = state ?? emptyAssistance();
  return { ...current, references: [...current.references.filter(r => r.segmentId !== segmentId), ...(reference ? [reference] : [])] };
}
