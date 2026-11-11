import {readingIndexRequest,readingPieceRequest} from "../../src/shared/reading.js";
import type { ReadingExplanationService } from "../services/ReadingExplanationService.js";
import { randomUUID } from "node:crypto";
import { handleTrusted } from "../security.js";
import type { ReferenceRuleService } from "../services/ReferenceRuleService.js";
import type { ReferenceLibraryService } from "../reference/ReferenceLibraryService.js";
import { referenceLookupSchema, referenceSystemSchema, referenceGroupSchema, referencePatternSchema, referenceRequestSchema, referenceTocSchema,referenceTocPathSchema,referenceTocSearchSchema, referenceChapterSchema, referenceSearchSchema, referenceImageSchema, referenceSourceSchema, referencePositionSchema, referenceResolveSchema } from "../../src/shared/reference.js";

export function registerReferenceHandlers(rules:ReferenceRuleService, library:ReferenceLibraryService, chooseFile:()=>Promise<string|null>,copy:(character:string)=>void=()=>{},explanations?:ReadingExplanationService):void {
  handleTrusted("reference:recommendationTarget",(_e,id)=>{if(typeof id!=="string"||id.length>128)throw Error("篇目标识无效");return library.recommendationTarget(id);});
  handleTrusted("reference:readingShelf",()=>library.readingShelf());
  handleTrusted("reference:readingIndex",(_e,raw)=>library.readingIndex(readingIndexRequest.parse(raw)));
  handleTrusted("reference:readingPiece",(_e,raw)=>library.readingPiece(readingPieceRequest.parse(raw)));
  handleTrusted("reference:copy",(_e,raw)=>{const {character}=referenceLookupSchema.omit({system:true}).parse(raw);if(/^[\uD800-\uDFFF]$/u.test(character))throw new Error("请选择完整字符");copy(character);});
  handleTrusted("reference:explanations",(_e,raw)=>{if(!explanations)throw new Error("字义资料暂不可用");return explanations.lookup(referenceLookupSchema.parse(raw));});
  handleTrusted("reference:lookup",(_e,raw)=>rules.lookup(referenceLookupSchema.parse(raw)));
  handleTrusted("reference:groups",(_e,raw)=>rules.groups(referenceSystemSchema.parse(raw)));
  handleTrusted("reference:group",(_e,raw)=>rules.group(referenceGroupSchema.parse(raw)));
  handleTrusted("reference:patterns",(_e,raw)=>rules.patterns(referencePatternSchema.parse(raw)));
  handleTrusted("reference:sources",()=>rules.sources());
  handleTrusted("reference:books",()=>library.listSources());
  handleTrusted("reference:importBook",async()=>{const path=await chooseFile();if(!path)return {status:"cancelled"};const requestId=randomUUID();void library.importFile(path,requestId).catch(()=>{});return {status:"started",requestId};});
  handleTrusted("reference:importProgress",(_e,raw)=>library.importProgress(referenceRequestSchema.parse(raw).requestId));
  handleTrusted("reference:cancel",(_e,raw)=>library.cancel(referenceRequestSchema.parse(raw).requestId));
  handleTrusted("reference:reindex",(_e,raw)=>{const {sourceId}=referenceSourceSchema.parse(raw);const requestId=randomUUID();void library.rebuildNavigation(sourceId,requestId).catch(()=>{});return {status:"started",requestId};});
  handleTrusted("reference:tocPath",(_e,raw)=>library.getTocPath(referenceTocPathSchema.parse(raw)));
  handleTrusted("reference:tocSearch",(_e,raw)=>library.getTocSearch(referenceTocSearchSchema.parse(raw)));
  handleTrusted("reference:toc",(_e,raw)=>library.getToc(referenceTocSchema.parse(raw)));
  handleTrusted("reference:read",(_e,raw)=>library.getChapter(referenceChapterSchema.parse(raw)));
  handleTrusted("reference:search",(_e,raw)=>library.search(referenceSearchSchema.parse(raw)));
  handleTrusted("reference:image",(_e,raw)=>{const r=referenceImageSchema.parse(raw);return library.getImage(r.sourceId,r.imageId);});
  handleTrusted("reference:position",(_e,raw)=>library.getPosition(referenceSourceSchema.parse(raw).sourceId));
  handleTrusted("reference:savePosition",(_e,raw)=>library.savePosition(referencePositionSchema.parse(raw)));
  handleTrusted("reference:resolve",(_e,raw)=>library.resolve(referenceResolveSchema.parse(raw)));
}
