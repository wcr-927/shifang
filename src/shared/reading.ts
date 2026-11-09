import { z } from 'zod';
import type { ReferenceBlock, ReferenceTocNode } from './reference';
export interface ReadingShelfItem{ id:string;sourceId:string;rootId:string|null;title:string;creator:string;navigationVersion?:string }
export interface ReadingIndexPage{nodes:ReferenceTocNode[];nextOffset:number|null;total:number}
export interface ReadingPieceBlock extends ReferenceBlock{documentId:string;section:'title'|'signature'|'poem'|'notes'|'body'}
export interface ReadingPiece{sourceId:string;node:ReferenceTocNode;author:string;blocks:ReadingPieceBlock[];offset:number;nextOffset:number|null;previousId:string|null;nextId:string|null}
export const readingIndexRequest=z.object({sourceId:z.string().min(1).max(256),rootId:z.string().max(1024).nullable().optional(),authorId:z.string().max(1024).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(128).default(128)}).strict();
export const readingPieceRequest=z.object({sourceId:z.string().min(1).max(256),nodeId:z.string().min(1).max(1024),rootId:z.string().max(1024).nullable().optional(),offset:z.number().int().nonnegative().max(4096).default(0),limit:z.number().int().min(1).max(64).default(64)}).strict();
export const readingNoteSchema=z.object({id:z.string().uuid(),sourceId:z.string().min(1).max(256),nodeId:z.string().min(1).max(1024),bookTitle:z.string().max(1000),title:z.string().max(1000),author:z.string().max(200),quote:z.string().min(1).max(10000),note:z.string().max(20000),createdAt:z.string(),updatedAt:z.string()}).strict();
export const createReadingNoteSchema=readingNoteSchema.omit({id:true,createdAt:true,updatedAt:true,note:true});
export type ReadingNote=z.infer<typeof readingNoteSchema>;
export const readingNotesQuerySchema=z.object({author:z.string().max(200).optional(),book:z.object({sourceId:z.string().min(1).max(256),title:z.string().max(1000)}).strict().optional(),query:z.string().max(200).default(''),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(80).default(24)}).strict();
export interface ReadingNotesPage{items:ReadingNote[];total:number;nextOffset:number|null}
export interface ReadingNotesOverview{total:number;authors:{name:string;count:number}[];books:{sourceId:string;title:string;count:number}[]}
