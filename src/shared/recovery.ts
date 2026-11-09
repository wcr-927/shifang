import { readingNoteSchema } from "./reading";
import { z } from "zod";
import { workRecordTransportSchema, workAnalysisStateSchema, collectionRecordSchema, documentGenreSchema, workStatusSchema, workRoomSchema, freeCategorySchema, assertWorkProfile } from "./work";
import { ciStateSchema } from "../ci/schema";

const anchorSchema=z.object({lineIndex:z.number().int().nonnegative(),characterIndex:z.number().int().nonnegative(),character:z.string().refine(s=>Array.from(s).length===1),candidateId:z.string().min(1),sourceText:z.string().optional(),sourceOffset:z.number().int().nonnegative().optional()}).strict();
const analysisSchema=workAnalysisStateSchema.extend({readingOverrides:z.array(anchorSchema),ruleDatasetVersions:z.record(z.string(), z.string().min(1))}).strict();
const workFields=workRecordTransportSchema.extend({room:workRoomSchema,category:freeCategorySchema,ci:ciStateSchema.strict().optional()}).strict();
const workSchema=z.discriminatedUnion("genre", [
  workFields.extend({genre: z.enum(["wujue", "qijue", "wulv", "qilv"]), room:z.literal("poetry"), category:z.literal("unclassified")}),
  workFields.extend({genre:z.literal("free"),room:z.enum(["poetry","song"])}),
  workFields.extend({genre:z.literal("ci"),room:z.literal("ci"),category:z.literal("unclassified"),ci:ciStateSchema.strict()}),
]);
export const snapshotSchema = z.object({ work: workSchema, analysisState: analysisSchema.nullable() }).strict();
export type WorkSnapshot = z.infer<typeof snapshotSchema>;
export const versionSchema = z.object({
  id: z.string().min(1), workId: z.string().uuid(), title: z.string(), body: z.string(), genre: documentGenreSchema,
  status: workStatusSchema, location: z.string(), notes: z.string(), reason: z.enum(["manual_save", "autosave", "status_change"]),
  createdAt: z.string(), room: workRoomSchema, category: freeCategorySchema, ci: ciStateSchema.strict().nullable(),
  pinned: z.boolean().default(false),
  completeness: z.enum(["legacy", "complete"]), snapshot: snapshotSchema.nullable(),
}).strict().superRefine((v, ctx) => {
  if ((v.completeness === "complete") !== (v.snapshot !== null)) ctx.addIssue({code:"custom",message:"版本完整性标记不一致"});
  if (v.snapshot) {
    const w = v.snapshot.work;
    if (w.id !== v.workId || w.title !== v.title || w.body !== v.body || w.notes !== v.notes || w.genre !== v.genre || w.status !== v.status || w.location !== v.location || w.room !== v.room || w.category !== v.category || JSON.stringify(w.ci ?? null) !== JSON.stringify(v.ci)) ctx.addIssue({code:"custom",message:"版本摘要与快照不一致"});
  }
});
export type WorkVersion = z.infer<typeof versionSchema>;
export const backupSchema = z.object({
  format: z.literal("shifang-complete-backup"), formatVersion: z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]), schemaVersion: z.union([z.literal(4),z.literal(5),z.literal(6),z.literal(7),z.literal(8)]),
  createdAt: z.string().datetime(), collections: z.array(collectionRecordSchema.strict()), works: z.array(workSchema),
  analysisStates: z.array(analysisSchema), versions: z.array(versionSchema), readingNotes:z.array(readingNoteSchema).optional(),
}).strict();
export type CompleteBackup = z.infer<typeof backupSchema>;
export function validateBackup(raw: unknown): CompleteBackup {
  const b = backupSchema.parse(raw);
  if ((b.formatVersion === 1 && b.schemaVersion !== 4) || (b.formatVersion === 2 && b.schemaVersion !== 5) || (b.formatVersion === 3 && b.schemaVersion !== 6) || (b.formatVersion === 4 && b.schemaVersion !== 7) || (b.formatVersion === 5 && b.schemaVersion !== 8)) throw new Error("备份格式与数据库版本不一致");
  if (b.formatVersion >= 2 && b.works.some(w => w.assistance === undefined)) throw new Error("新备份缺少用韵辅助状态");
  function unique(ids: string[], name: string) { if (new Set(ids).size !== ids.length) throw new Error(`${name}存在重复标识`); }
  if(b.formatVersion===5&&!b.readingNotes)throw new Error("备份缺少摘记");
  unique((b.readingNotes??[]).map(n=>n.id),"摘记");
  unique((b.readingNotes??[]).map(n=>JSON.stringify([n.sourceId,n.nodeId,n.quote])),"摘录");
  unique(b.collections.map(c=>c.id),"归集"); unique(b.works.map(w=>w.id),"作品"); unique(b.analysisStates.map(s=>s.workId),"分析状态"); unique(b.versions.map(v=>v.id),"历史版本");
  const works = new Map(b.works.map(w=>[w.id,w])), collections = new Set(b.collections.map(c=>c.id));
  function workValid(w: CompleteBackup["works"][number]) {
    assertWorkProfile(w);
    if (w.collectionId && !collections.has(w.collectionId)) throw new Error("作品引用不存在的归集");
    if ((w.genre === "ci") !== Boolean(w.ci)) throw new Error("词谱状态与作品类型不一致");
    unique(w.tags,"标签");
  }
  function analysisValid(s: CompleteBackup["analysisStates"][number], w: CompleteBackup["works"][number]) {
    if (s.workId !== w.id || s.templateId !== w.genre) throw new Error("分析状态引用或诗体不一致");
  }
  b.works.forEach(workValid);
  for (const s of b.analysisStates) { const w=works.get(s.workId); if(!w)throw new Error("分析状态引用不存在的作品"); analysisValid(s,w); }
  for (const v of b.versions) {
    const current=works.get(v.workId); if(!current)throw new Error("历史引用不存在的作品");
    if(v.room!==current.room || (v.genre==="free")!==(current.genre==="free") || (v.genre==="ci")!==(current.genre==="ci"))throw new Error("历史与当前作品的编辑方式不一致");
    if(v.snapshot) { workValid(v.snapshot.work); if(v.snapshot.analysisState)analysisValid(v.snapshot.analysisState,v.snapshot.work); }
  }
  return b;
}

export interface BackupPreview { status: "selected"; token: string; path: string; createdAt: string; works: number; collections: number; versions: number; analysisStates: number; notes: number; schemaVersion: number }
