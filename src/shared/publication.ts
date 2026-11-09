import { z } from 'zod';
export const publicationRequestSchema=z.union([z.object({workId:z.string().uuid()}).strict(),z.object({collectionId:z.string().uuid()}).strict()]);
export type PublicationRequest=z.infer<typeof publicationRequestSchema>;
export interface PublicationWork{id:string;title:string;body:string;genre:string;category?:string;sections?:number[]}
export interface PublicationDocument{title:string;collection:boolean;works:PublicationWork[]}
export interface PublicationOptions{background:'mountain'|'bamboo'|'water';author:string;date:string;showTitle:boolean;showAuthor:boolean;showDate:boolean}
export interface PublicationBridge{document:()=>Promise<PublicationDocument>;export:(format:'png'|'pdf')=>Promise<{status:'exported'|'cancelled';path?:string}>;close:()=>void}
