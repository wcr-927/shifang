import { z } from 'zod';
import { collectionRecordSchema } from './work';
export const collectionSummarySchema=collectionRecordSchema.extend({count:z.number().int().nonnegative()});
export const libraryOverviewSchema=z.object({collections:z.array(collectionSummarySchema),all:z.number().int().nonnegative(),uncollected:z.number().int().nonnegative(),archived:z.number().int().nonnegative()});
export type LibraryOverview=z.infer<typeof libraryOverviewSchema>;
export type CollectionSummary=z.infer<typeof collectionSummarySchema>;
export const collectionNameSchema=z.string().trim().min(1,'请输入文集题名').max(80,'文集题名最多80字');
