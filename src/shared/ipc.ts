import { firstLineRhymeSchema, workAssistanceStateSchema } from "./assistanceState";
import { ciStateSchema } from "../ci/schema";
import { z } from "zod";
import type { FlushResult } from "./close.js";
import { workGenreSchema, documentGenreSchema, workRoomSchema, freeCategorySchema, workStatusSchema, type WorkAnalysisState, type WorkRecord } from "./work";
import type { PoemAnalysis } from "../poetry/analysis/poemAnalyzer";

export const readingOverrideSchema = z.object({
  lineIndex: z.number().int().nonnegative(),
  characterIndex: z.number().int().nonnegative(),
  character: z.string().min(1).max(2),
  candidateId: z.string().min(1),
  sourceText: z.string().max(100_000).optional(),
  sourceOffset: z.number().int().nonnegative().optional(),
});

export const analyzePoemRequestSchema = z.object({
  firstLineRhyme: firstLineRhymeSchema.optional(),
  text: z.string().max(100_000),
  editorLines: z.array(z.string()).max(100_001).refine((lines) => lines.join("\n").length <= 100_000).optional(),
  templateId: z.enum(["wujue", "qijue", "wulv", "qilv"]),
  variantId: z.string().min(1).optional(),
  overrides: z.array(readingOverrideSchema).max(1_000).default([]),
  requestId: z.string().min(1).max(128),
});

export type AnalyzePoemRequest = z.infer<typeof analyzePoemRequestSchema>;

export const createWorkRequestSchema = z.object({
  assistance: workAssistanceStateSchema.optional(),
  room: workRoomSchema.optional(),
  category: freeCategorySchema.optional(),
  ci: ciStateSchema.optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
  genre: documentGenreSchema,
  collectionId: z.string().uuid().nullable().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(20_000).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
});

export const updateWorkRequestSchema = createWorkRequestSchema.partial().extend({
  status: workStatusSchema.optional(),
  rhymeGroupId: z.string().max(100).nullable().optional(),
});

export const workIdRequestSchema = z.object({ id: z.string().uuid() });
export const listWorksRequestSchema = z.object({ includeArchived: z.boolean().optional() }).default({});

export const saveAnalysisStateRequestSchema = z.object({
  workId: z.string().uuid(),
  templateId: workGenreSchema,
  variantId: z.string().nullable(),
  readingOverrides: z.array(readingOverrideSchema).max(1_000),
  ruleDatasetVersions: z.record(z.string(), z.string()),
});

export const saveEditorStateRequestSchema = z.object({
  assistance: workAssistanceStateSchema.optional(),
  workId: z.string().uuid(),
  title: z.string().max(200),
  body: z.string().max(100_000),
  genre: workGenreSchema,
  status: workStatusSchema,
  collectionId: z.string().uuid().nullable(),
  location: z.string().max(200),
  notes: z.string().max(20_000),
  rhymeGroupId: z.string().max(100).nullable(),
  tags: z.array(z.string().max(80)).max(50),
  templateId: workGenreSchema,
  variantId: z.string().nullable(),
  readingOverrides: z.array(readingOverrideSchema).max(1_000),
  ruleDatasetVersions: z.record(z.string(), z.string()),
});

export const exportWorkRequestSchema = z.object({
  room: workRoomSchema.optional(),
  category: freeCategorySchema.optional(),
  ci: ciStateSchema.optional(),
  workId: z.string().uuid(),
  title: z.string().max(200),
  body: z.string().max(100_000),
  genre: documentGenreSchema,
  status: workStatusSchema,
  location: z.string().max(200),
  notes: z.string().max(20_000),
  tags: z.array(z.string().max(80)).max(50),
  format: z.enum(["markdown", "txt"]),
});

export const exportWorkResponseSchema = z.object({
  status: z.enum(["exported", "cancelled"]),
  path: z.string().optional(),
});

export type CreateWorkRequest = z.infer<typeof createWorkRequestSchema>;
export type UpdateWorkRequest = z.infer<typeof updateWorkRequestSchema>;
export type SaveAnalysisStateRequest = z.infer<typeof saveAnalysisStateRequestSchema>;
export type SaveEditorStateRequest = z.infer<typeof saveEditorStateRequestSchema>;
export type ExportWorkRequest = z.infer<typeof exportWorkRequestSchema>;

export const analysisErrorSchema = z.object({
  code: z.enum(["INVALID_REQUEST", "RULES_UNAVAILABLE", "ANALYSIS_FAILED"]),
  message: z.string(),
  requestId: z.string().optional(),
});

export type AnalysisError = z.infer<typeof analysisErrorSchema>;

export const listTemplatesResponseSchema = z.object({
  templates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      shortName: z.string(),
      lineCount: z.number().int().positive(),
      lineLength: z.number().int().positive(),
      recommendedVariantId: z.string(),
      variants: z.array(z.object({ id: z.string(), name: z.string(), style: z.string() })),
    }),
  ),
  datasetVersion: z.string(),
});

export const readingCandidatesRequestSchema = z.object({
  character: z.string().min(1).max(2),
});

export const readingCandidatesResponseSchema = z.object({
  character: z.string(),
  candidates: z.array(z.unknown()),
});

export interface ShifangAnalysisApi {
  analyzePoem: (request: AnalyzePoemRequest) => Promise<PoemAnalysis & { requestId: string; datasetVersions: Record<string, string> }>;
}

export interface ShifangRulesApi {
  listTemplates: () => Promise<z.infer<typeof listTemplatesResponseSchema>>;
  getReadingCandidates: (request: z.infer<typeof readingCandidatesRequestSchema>) => Promise<z.infer<typeof readingCandidatesResponseSchema>>;
}

export interface ShifangWorksApi {
  openPublication?:(request:import("./publication").PublicationRequest)=>Promise<{status:string}>;
  collectionOverview?:()=>Promise<import('./collections').LibraryOverview>;
  createCollection?:(request:{name:string})=>Promise<import('./work').CollectionRecord>;
  renameCollection?:(request:{id:string;name:string})=>Promise<void>;
  removeCollection?:(request:{id:string})=>Promise<void>;
  moveToCollection?:(request:{id:string;collectionId:string|null})=>Promise<void>;
  reorderCollectionWork?:(request:{id:string;direction:'up'|'down'})=>Promise<void>;
  unarchive?:(request:{id:string})=>Promise<import('./work').WorkRecord>;
  copyReading?: (request: CiReadingRequest) => Promise<void>;
  exportReading?: (request: CiReadingRequest) => Promise<{ status: "exported" | "cancelled"; path?: string }>;
  query: (request?: import("./workSummary").QueryWorksRequest) => Promise<import("./workSummary").QueryWorksResponse>;
  setVersionPinned?: (request:{id:string;versionId:string;pinned:boolean})=>Promise<void>;
  listVersions?: (request: {id:string})=>Promise<import("./recovery").WorkVersion[]>;
  saveVersion?: (request: {id:string})=>Promise<boolean>;
  restoreVersion?: (request:{id:string;versionId:string})=>Promise<WorkRecord>;
  exportBackup?: ()=>Promise<{status:"exported"|"cancelled";path?:string}>;
  previewBackup?: ()=>Promise<import("./recovery").BackupPreview|{status:"cancelled"}>;
  restoreBackup?: (request:{token:string})=>Promise<{status:"restored";backupPath:string}>;
  saveCiWork?: (request: SaveCiWorkRequest) => Promise<WorkRecord>;
  saveFreeWork?: (request: SaveFreeWorkRequest) => Promise<WorkRecord>;
  create: (request: CreateWorkRequest) => Promise<WorkRecord>;
  get: (request: z.infer<typeof workIdRequestSchema>) => Promise<WorkRecord | null>;
  list: (request?: z.input<typeof listWorksRequestSchema>) => Promise<WorkRecord[]>;
  update: (request: UpdateWorkRequest & { id: string }) => Promise<WorkRecord>;
  archive: (request: z.infer<typeof workIdRequestSchema>) => Promise<WorkRecord>;
  saveAnalysisState: (request: SaveAnalysisStateRequest) => Promise<WorkAnalysisState>;
  getAnalysisState: (request: z.infer<typeof workIdRequestSchema>) => Promise<WorkAnalysisState | null>;
  saveEditorState: (request: SaveEditorStateRequest) => Promise<{ work: WorkRecord; analysisState: WorkAnalysisState }>;
  export: (request: ExportWorkRequest) => Promise<z.infer<typeof exportWorkResponseSchema>>;
}

export interface ShifangWindowApi {
  reference?: import("./reference").ReferenceApi;
  app: {
    health: () => Promise<{
      name: string;
      version: string;
      packaged: boolean;
      candidate?: boolean;
    }>;
    onBeforeClose: (callback: (requestId: number) => void | Promise<void>) => () => void;
    completeClose: (requestId: number, result: FlushResult) => void;
    onCloseCancelled: (callback: (result: FlushResult) => void) => () => void;
  };
  analysis: ShifangAnalysisApi;
  rules: ShifangRulesApi;
  works: ShifangWorksApi;
}

export const saveFreeWorkRequestSchema = z.object({
  assistance: workAssistanceStateSchema.optional(),
  workId: z.string().uuid(), title: z.string().max(200), body: z.string().max(100_000),
  status: workStatusSchema, category: freeCategorySchema, notes: z.string().max(20_000),
});
export type SaveFreeWorkRequest = z.infer<typeof saveFreeWorkRequestSchema>;

export const saveCiWorkRequestSchema=z.object({assistance:workAssistanceStateSchema.optional(),workId:z.string().uuid(),title:z.string().max(200),body:z.string().max(100000),notes:z.string().max(20000),status:workStatusSchema,ci:ciStateSchema});
export type SaveCiWorkRequest=z.infer<typeof saveCiWorkRequestSchema>;

export const ciReadingRequestSchema = z.object({ title: z.string().max(200), body: z.string().max(100000), formId: z.string().min(1).max(200), includeTitle: z.boolean(), includeForm: z.boolean() }).strict();
export type CiReadingRequest = z.infer<typeof ciReadingRequestSchema>;
