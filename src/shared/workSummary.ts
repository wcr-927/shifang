import { z } from "zod";
import { documentGenreSchema, freeCategorySchema, workRoomSchema, workStatusSchema } from "./work";

export const workCursorSchema = z.object({ updatedAt: z.string().min(1).max(64), id: z.string().uuid(), position:z.number().int().nonnegative().optional() }).strict();
/** Title-only, case-sensitive literal substring. Outer whitespace is ignored; %, _ and \\ are ordinary characters. */
export const queryWorksRequestSchema = z.object({
  collectionId:z.string().uuid().nullable().optional(),
  categoryGroup:z.enum(["regulated","ci","ancient","modern","prose"]).optional(),
  includeArchived: z.boolean().default(false),
  includeTagOptions: z.boolean().default(false),
  room: workRoomSchema.optional(), status: workStatusSchema.optional(),
  genre: documentGenreSchema.optional(), category: freeCategorySchema.optional(),
  tag: z.string().max(80).optional(), query: z.string().max(200).transform(value => value.trim()).default(""),
  limit: z.number().int().min(1).max(100).default(24), cursor: workCursorSchema.optional(),
}).strict().prefault({});
export const workSummarySchema = z.object({
  collectionId:z.string().uuid().nullable().optional(), collectionPosition:z.number().int().nonnegative().optional(),
  id: z.string().uuid(), title: z.string(), preview: z.string().max(320),
  genre: documentGenreSchema, room: workRoomSchema, category: freeCategorySchema,
  status: workStatusSchema, tags: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
}).strict();
export const queryWorksResponseSchema = z.object({
  items: z.array(workSummarySchema), nextCursor: workCursorSchema.nullable(),
  total: z.number().int().nonnegative(), tags: z.array(z.string()),
}).strict();
export type WorkSummary = z.infer<typeof workSummarySchema>;
export type WorkCursor = z.infer<typeof workCursorSchema>;
export type QueryWorksRequest = z.input<typeof queryWorksRequestSchema>;
export type QueryWorksResponse = z.infer<typeof queryWorksResponseSchema>;
