import { workAssistanceStateSchema } from "./assistanceState";
import { ciStateSchema } from "../ci/schema";
import { z } from "zod";

export const workGenreSchema = z.enum(["wujue", "qijue", "wulv", "qilv"]);
export const documentGenreSchema = z.enum(["wujue", "qijue", "wulv", "qilv", "free", "ci"]);
export const workRoomSchema = z.enum(["poetry", "ci", "song"]);
export const freeCategorySchema = z.enum(["unclassified", "ancient", "prose", "fu", "modern"]);
export type DocumentGenre = z.infer<typeof documentGenreSchema>;
export type WorkRoom = z.infer<typeof workRoomSchema>;
export type FreeCategory = z.infer<typeof freeCategorySchema>;
export const workStatusSchema = z.enum(["draft", "completed", "archived"]);

export type WorkGenre = z.infer<typeof workGenreSchema>;
export type WorkStatus = z.infer<typeof workStatusSchema>;

export const workRecordTransportSchema = z.object({
  id: z.string().uuid(),
  collectionId: z.string().uuid().nullable(),
  collectionPosition: z.number().int().nonnegative().optional(),
  title: z.string(),
  body: z.string(),
  genre: documentGenreSchema,
  room: workRoomSchema.optional(),
  category: freeCategorySchema.optional(),
  ci: ciStateSchema.optional(),
  status: workStatusSchema,
  location: z.string(),
  notes: z.string(),
  rhymeGroupId: z.string().nullable(),
  assistance: workAssistanceStateSchema.optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Transport fields remain optional for records from older IPC callers. The
// domain union guarantees that a ci editor always has its original ci state.
export const workRecordSchema = z.discriminatedUnion("genre", [
  workRecordTransportSchema.extend({ genre: workGenreSchema, room: z.literal("poetry").optional(), category: z.literal("unclassified").optional() }),
  workRecordTransportSchema.extend({ genre: z.literal("free"), room: z.enum(["poetry", "song"]).optional() }),
  workRecordTransportSchema.extend({ genre: z.literal("ci"), room: z.literal("ci").optional(), category: z.literal("unclassified").optional(), ci: ciStateSchema }),
]).superRefine((work, context) => {
  try { assertWorkProfile(work); }
  catch { context.addIssue({ code: "custom", message: "房间、创作方式与文体不相符" }); }
});

export const collectionRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workAnalysisStateSchema = z.object({
  workId: z.string().uuid(),
  templateId: workGenreSchema,
  variantId: z.string().nullable(),
  readingOverrides: z.array(z.unknown()),
  ruleDatasetVersions: z.record(z.string(), z.string()),
  updatedAt: z.string(),
});

export type WorkRecord = z.infer<typeof workRecordSchema>;
export type CiWorkRecord = Extract<WorkRecord, { genre: "ci" }>;
export type FreeWorkRecord = Extract<WorkRecord, { genre: "free" }>;
export type PoemWorkRecord = Extract<WorkRecord, { genre: WorkGenre }>;
export type CollectionRecord = z.infer<typeof collectionRecordSchema>;
export type WorkAnalysisState = z.infer<typeof workAnalysisStateSchema>;

export const genreLabels: Record<WorkGenre, string> = {
  wujue: "五绝",
  qijue: "七绝",
  wulv: "五律",
  qilv: "七律",
};

export const statusLabels: Record<WorkStatus, string> = {
  draft: "草稿",
  completed: "已完成",
  archived: "已归档",
};

export const roomLabels: Record<WorkRoom, string> = { poetry: "诗房", ci: "词房", song: "歌房" };
export const freeCategoryLabels: Record<FreeCategory, string> = { unclassified: "未分类", ancient: "古体诗", prose: "文章", fu: "赋", modern: "现代诗" };
export function roomOf(work: Pick<WorkRecord, "room">): WorkRoom { return work.room ?? "poetry"; }
export function categoryOf(work: Pick<WorkRecord, "room" | "category">): FreeCategory { return work.category ?? (roomOf(work) === "song" ? "modern" : "unclassified"); }
export function workTypeLabel(work: Pick<WorkRecord, "genre" | "room" | "category">): string { return work.genre === "ci" ? "词" : work.genre === "free" ? freeCategoryLabels[categoryOf(work)] : genreLabels[work.genre]; }
export function assertWorkProfile(work: Pick<WorkRecord, "genre" | "room" | "category">): void {
  const room=roomOf(work), category=categoryOf(work);
  let valid: boolean;
  if (room === "ci") valid = work.genre === "ci" && category === "unclassified";
  else if (room === "song") valid = work.genre === "free" && category === "modern";
  else if (work.genre === "free") valid = category !== "modern";
  else valid = work.genre !== "ci" && category === "unclassified";
  if (!valid) throw new Error("房间、创作方式与文体不相符");
}
