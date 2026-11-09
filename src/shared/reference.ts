import type { ReadingExplanationBundle } from "./readingExplanation";
import { rhymeViewSchema, type RhymeView } from "./rhymeUsage";
import { z } from "zod";

export const REFERENCE_NAVIGATION_VERSION = 'literary-navigation-5';

export type ReferenceSystem = "pingshui" | "cilin";
export interface ReferenceSource { id:string; title:string; author:string; version:string; description:string; boundary:string; urls:string[]; bookHash?:string; internalPath?:string; sourceDocumentId?:string; context?:string; metadata?:Record<string,string> }
export interface ReferenceReading { id:string; tone:string; groupId:string; groupName:string; glosses:string[] }
export interface ReferenceLookup { system:ReferenceSystem; character:string; readings:ReferenceReading[]; sourceId:string; version:string; mappedFrom?:string; total?:number; truncated?:boolean }
export interface ReferenceGroup { id:string; name:string; tone:string; count:number }
export interface ReferenceGroupPage { group:ReferenceGroup; items:{character:string;readings:ReferenceReading[]}[]; nextOffset:number|null; view:RhymeView; filteredCount:number; usageVersion:string; usageAvailable:boolean }
export interface ReferencePattern { id:string; kind:"metre"|"ci"; name:string; variant:string; summary:string; lines:{pattern:string;section:number;rhyme:boolean;example?:string;note?:string;rhymeGroup?:string|null;rhymeTone?:string|null;caesura?:number|null}[]; notes:string[]; sourceId:string; sourceUrl?:string; internalPath?:string; scope:string; version:string; repeat?:number[][]; rhymeChanges?:number[][]; flexiblePositions?:number[][]; rhymePositions?:number[] }
export interface ReferenceBook { id:string; title:string; creator:string; publisher:string; hash:string; chapterCount:number; tocCount:number; importedAt:string; warnings:string[]; navigationVersion?:string }
export interface ReferenceTocNode { id:string; parentId:string|null; label:string; documentId:string; anchor:string; hasChildren:boolean; order?:number; blockId?:string; kind?:"section"|"author"|"work"|"intro"; firstLine?:string; originalLabel?:string; path?:string; pageOffset?:number; pending?:boolean }
export interface ReferenceTocPage { nodes:ReferenceTocNode[]; nextOffset:number|null }
export interface ReferenceTarget { documentId:string; anchor:string; blockId?:string }
export type ReferenceNodeType="text"|"p"|"h1"|"h2"|"h3"|"h4"|"h5"|"h6"|"strong"|"em"|"sup"|"sub"|"br"|"ul"|"ol"|"li"|"table"|"thead"|"tbody"|"tfoot"|"caption"|"tr"|"td"|"th"|"dl"|"dt"|"dd"|"figure"|"figcaption"|"blockquote"|"pre"|"code"|"a"|"img"|"span";
export interface ReferenceNode { type:ReferenceNodeType; text?:string; children?:ReferenceNode[]; target?:ReferenceTarget; imageId?:string; alt?:string }
export interface ReferenceBlock { id:string; anchors:string[]; text:string; node:ReferenceNode }
export interface ReferenceChapterPage { sourceId:string; documentId:string; title:string; blocks:ReferenceBlock[]; offset:number; nextOffset:number|null; totalBlocks:number; previousId:string|null; nextId:string|null; targetBlockId?:string }
export interface ReferenceSearchHit { id:string; sourceId:string; documentId:string; blockId:string; title:string; context:string; preview:string; previewStart:number; matchStart:number; matchEnd:number }
export interface ReferenceSearchPage { requestId:string; items:ReferenceSearchHit[]; nextOffset:number|null }
export interface ReferencePosition { sourceId:string; documentId:string; blockId:string; scrollTop:number }
export interface ReferenceImportProgress { requestId:string; status:"running"|"done"|"cancelled"|"error"; phase:string; completed:number; total:number; message:string; sourceId?:string }

const id=z.string().min(1).max(256), requestId=z.string().min(1).max(128);
const offset=z.number().int().nonnegative().max(1_000_000).default(0);
const bounded=(maximum:number,initial:number)=>z.number().int().min(1).max(maximum).default(initial);
export const referenceLookupSchema=z.object({system:z.enum(["pingshui","cilin"]),character:z.string().min(1).max(2).refine(value=>Array.from(value).length===1,"请输入一个完整字符")}).strict();
export const referenceSystemSchema=z.object({system:z.enum(["pingshui","cilin"])}).strict();
export const referenceGroupSchema=referenceSystemSchema.extend({id,offset,limit:bounded(128,64),view:rhymeViewSchema.default("all")}).strict();
export const referencePatternSchema=z.object({kind:z.enum(["metre","ci"])}).strict();
export const referenceRequestSchema=z.object({requestId}).strict();
export const referenceSourceSchema=z.object({sourceId:id}).strict();
export const referenceTocSchema=referenceSourceSchema.extend({parentId:id.nullable().optional(),mode:z.enum(["reading","original"]).optional(),offset,limit:bounded(256,128)}).strict();
export const referenceChapterSchema=referenceSourceSchema.extend({documentId:id,offset,limit:bounded(64,36),anchor:z.string().max(256).optional(),blockId:id.optional()}).strict();
export const referenceSearchSchema=z.object({requestId,sourceId:id.optional(),query:z.string().min(1).max(100).transform(value=>value.trim()).refine(Boolean,"请输入查询文字"),scope:z.enum(["all","catalogue","text"]).default("all"),offset,limit:bounded(48,24)}).strict();
export const referenceImageSchema=referenceSourceSchema.extend({imageId:id}).strict();
export const referencePositionSchema=referenceSourceSchema.extend({documentId:id,blockId:z.string().max(256),scrollTop:z.number().min(0).max(100_000_000)}).strict();
export const referenceResolveSchema=referenceSourceSchema.extend({internalPath:z.string().min(1).max(512)}).strict();

export interface ReferenceApi {
  notesOverview():Promise<import('./reading').ReadingNotesOverview>;
  queryNotes(request:z.input<typeof import('./reading').readingNotesQuerySchema>):Promise<import('./reading').ReadingNotesPage>;
  readingShelf():Promise<import('./reading').ReadingShelfItem[]>;
  readingIndex(request:z.input<typeof import('./reading').readingIndexRequest>):Promise<import('./reading').ReadingIndexPage>;
  readingPiece(request:z.input<typeof import('./reading').readingPieceRequest>):Promise<import('./reading').ReadingPiece>;
  readingNotes(request:{sourceId:string;nodeId:string}):Promise<import('./reading').ReadingNote[]>;
  createReadingNote(request:z.input<typeof import('./reading').createReadingNoteSchema>):Promise<import('./reading').ReadingNote>;
  updateReadingNote(request:{id:string;note:string}):Promise<void>;
  removeReadingNote(request:{id:string}):Promise<void>;
  explanations(request:z.input<typeof referenceLookupSchema>):Promise<ReadingExplanationBundle>;
  copy(request:{character:string}):Promise<void>;
  lookup(request:z.input<typeof referenceLookupSchema>):Promise<ReferenceLookup>;
  groups(request:z.input<typeof referenceSystemSchema>):Promise<ReferenceGroup[]>;
  group(request:z.input<typeof referenceGroupSchema>):Promise<ReferenceGroupPage>;
  patterns(request:z.input<typeof referencePatternSchema>):Promise<ReferencePattern[]>;
  sources():Promise<ReferenceSource[]>;
  books():Promise<ReferenceBook[]>;
  importBook():Promise<{status:"started";requestId:string}|{status:"cancelled"}>;
  importProgress(request:{requestId:string}):Promise<ReferenceImportProgress>;
  cancel(request:{requestId:string}):Promise<void>;
  reindex(request:{sourceId:string}):Promise<{status:"started";requestId:string}>;
  tocPath(request:z.input<typeof referenceTocPathSchema>):Promise<ReferenceTocPath>;
  tocSearch(request:z.input<typeof referenceTocSearchSchema>):Promise<ReferenceTocSearchPage>;
  toc(request:z.input<typeof referenceTocSchema>):Promise<ReferenceTocPage>;
  read(request:z.input<typeof referenceChapterSchema>):Promise<ReferenceChapterPage>;
  search(request:z.input<typeof referenceSearchSchema>):Promise<ReferenceSearchPage>;
  image(request:{sourceId:string;imageId:string}):Promise<{dataUrl:string}>;
  position(request:{sourceId:string}):Promise<ReferencePosition|null>;
  savePosition(request:ReferencePosition):Promise<void>;
  resolve(request:{sourceId:string;internalPath:string}):Promise<ReferenceTarget|null>;
}

export const referenceTocPathSchema = referenceSourceSchema.extend({ documentId:id, blockId:id.optional(), mode:z.enum(["reading","original"]).optional() }).strict();
export const referenceTocSearchSchema = referenceSourceSchema.extend({ query:z.string().max(100), mode:z.enum(["reading","original"]).optional(), offset, limit:bounded(48,24) }).strict();
export interface ReferenceTocPath { nodes:ReferenceTocNode[]; currentId:string|null }
export interface ReferenceTocSearchPage { nodes:ReferenceTocNode[]; nextOffset:number|null }
