import { libraryOverviewSchema, collectionNameSchema } from "../shared/collections";
import { collectionRecordSchema } from "../shared/work";
import { readingExplanationBundleSchema } from "../shared/readingExplanation";
import type { ReferenceApi } from "../shared/reference";
import { queryWorksRequestSchema, queryWorksResponseSchema, type QueryWorksRequest } from "../shared/workSummary";
import { versionSchema } from "../shared/recovery";
import { ciReadingRequestSchema, type CiReadingRequest, saveCiWorkRequestSchema, type SaveCiWorkRequest } from "../shared/ipc";
import { createWorkRequestSchema, exportWorkRequestSchema, exportWorkResponseSchema, listWorksRequestSchema, readingCandidatesRequestSchema, readingCandidatesResponseSchema, saveAnalysisStateRequestSchema, saveEditorStateRequestSchema, saveFreeWorkRequestSchema, updateWorkRequestSchema, workIdRequestSchema } from "../shared/ipc";
import { workAnalysisStateSchema, workRecordSchema, type WorkAnalysisState, type WorkRecord } from "../shared/work";
import type { SaveFreeWorkRequest, AnalyzePoemRequest, CreateWorkRequest, ExportWorkRequest, SaveAnalysisStateRequest, SaveEditorStateRequest, UpdateWorkRequest } from "../shared/ipc";

function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && !error.message.includes("at ")) return error.message;
  return fallback;
}

async function callReference<K extends keyof ReferenceApi>(method: K, ...args: Parameters<ReferenceApi[K]>): Promise<Awaited<ReturnType<ReferenceApi[K]>>> {
  const api = window.shifang.reference;
  if (!api || typeof api[method] !== "function") throw new Error("资料服务暂不可用，请重新打开应用。");
  return (api[method] as (...values: Parameters<ReferenceApi[K]>) => ReturnType<ReferenceApi[K]>)(...args) as Promise<Awaited<ReturnType<ReferenceApi[K]>>>;
}

export const desktopApi = {
  reference: {
    notesOverview:()=>callReference("notesOverview"),
    queryNotes:(request:Parameters<ReferenceApi["queryNotes"]>[0])=>callReference("queryNotes",request),
    readingIndex: (request: Parameters<ReferenceApi["readingIndex"]>[0]) => callReference("readingIndex",request),
    readingPiece: (request: Parameters<ReferenceApi["readingPiece"]>[0]) => callReference("readingPiece",request),
    readingNotes: (request: Parameters<ReferenceApi["readingNotes"]>[0]) => callReference("readingNotes",request),
    createReadingNote: (request: Parameters<ReferenceApi["createReadingNote"]>[0]) => callReference("createReadingNote",request),
    updateReadingNote: (request: Parameters<ReferenceApi["updateReadingNote"]>[0]) => callReference("updateReadingNote",request),
    removeReadingNote: (request: Parameters<ReferenceApi["removeReadingNote"]>[0]) => callReference("removeReadingNote",request),
    recommendationTarget:(id:string)=>callReference("recommendationTarget",id),
    readingShelf:()=>callReference("readingShelf"),
    explanations: async (request: Parameters<ReferenceApi["explanations"]>[0]) => {
      const result=readingExplanationBundleSchema.parse(await callReference("explanations",request));
      if(result.entries.some(e=>e.key.system!==request.system||e.key.character!==request.character))throw new Error("字义资料与当前字不符");
      return result;
    },
    reindex: (request: Parameters<ReferenceApi["reindex"]>[0]) => callReference("reindex", request),
    tocPath: (request: Parameters<ReferenceApi["tocPath"]>[0]) => callReference("tocPath", request),
    tocSearch: (request: Parameters<ReferenceApi["tocSearch"]>[0]) => callReference("tocSearch", request),
    copy: (request: Parameters<ReferenceApi["copy"]>[0]) => callReference("copy", request),
    lookup: (request: Parameters<ReferenceApi["lookup"]>[0]) => callReference("lookup", request),
    groups: (request: Parameters<ReferenceApi["groups"]>[0]) => callReference("groups", request),
    group: (request: Parameters<ReferenceApi["group"]>[0]) => callReference("group", request),
    patterns: (request: Parameters<ReferenceApi["patterns"]>[0]) => callReference("patterns", request),
    importProgress: (request: Parameters<ReferenceApi["importProgress"]>[0]) => callReference("importProgress", request),
    cancel: (request: Parameters<ReferenceApi["cancel"]>[0]) => callReference("cancel", request),
    toc: (request: Parameters<ReferenceApi["toc"]>[0]) => callReference("toc", request),
    read: (request: Parameters<ReferenceApi["read"]>[0]) => callReference("read", request),
    search: (request: Parameters<ReferenceApi["search"]>[0]) => callReference("search", request),
    image: (request: Parameters<ReferenceApi["image"]>[0]) => callReference("image", request),
    position: (request: Parameters<ReferenceApi["position"]>[0]) => callReference("position", request),
    savePosition: (request: Parameters<ReferenceApi["savePosition"]>[0]) => callReference("savePosition", request),
    resolve: (request: Parameters<ReferenceApi["resolve"]>[0]) => callReference("resolve", request),
    sources: () => callReference("sources"),
    books: () => callReference("books"),
    importBook: () => callReference("importBook"),
  },
  app: {
    health: () => window.shifang.app.health(),
  },
  analysis: {
    analyzePoem: async (request: AnalyzePoemRequest) => {
      return window.shifang.analysis.analyzePoem(request);
    },
  },
  rules: {
    listTemplates: () => window.shifang.rules.listTemplates(),
    async getReadingCandidates(character: string) {
      const request = readingCandidatesRequestSchema.parse({ character });
      const response = await window.shifang.rules.getReadingCandidates(request);
      return readingCandidatesResponseSchema.parse(response);
    },
  },
  works: {
    openPublication:async(request:import("../shared/publication").PublicationRequest)=>{if(!window.shifang?.works.openPublication)throw Error("当前版本尚未支持排版导出");return window.shifang.works.openPublication(request);},
    async collectionOverview(){return window.shifang.works.collectionOverview?libraryOverviewSchema.parse(await window.shifang.works.collectionOverview()):null;},
    async createCollection(name:string){return collectionRecordSchema.parse(await window.shifang.works.createCollection!({name:collectionNameSchema.parse(name)}));},
    renameCollection(id:string,name:string){return window.shifang.works.renameCollection!({id,name:collectionNameSchema.parse(name)});},
    removeCollection(id:string){return window.shifang.works.removeCollection!({id});},
    moveToCollection(id:string,collectionId:string|null){return window.shifang.works.moveToCollection!({id,collectionId});},
    reorderCollectionWork(id:string,direction:'up'|'down'){return window.shifang.works.reorderCollectionWork!({id,direction});},
    async unarchive(id:string){return workRecordSchema.parse(await window.shifang.works.unarchive!({id}));},
    copyReading: (request: CiReadingRequest) => window.shifang.works.copyReading!(ciReadingRequestSchema.parse(request)),
    exportReading: (request: CiReadingRequest) => window.shifang.works.exportReading!(ciReadingRequestSchema.parse(request)),
    async query(request: QueryWorksRequest = {}) { return queryWorksResponseSchema.parse(await window.shifang.works.query(queryWorksRequestSchema.parse(request))); },
    setVersionPinned(id:string,versionId:string,pinned:boolean){return window.shifang.works.setVersionPinned!({id,versionId,pinned});},
    async listVersions(id:string){return versionSchema.array().parse(await window.shifang.works.listVersions!({id}));},
    saveVersion(id:string){return window.shifang.works.saveVersion!({id});},
    async restoreVersion(id:string,versionId:string){return workRecordSchema.parse(await window.shifang.works.restoreVersion!({id,versionId}));},
    exportBackup(){return window.shifang.works.exportBackup!();},
    previewBackup(){return window.shifang.works.previewBackup!();},
    restoreBackup(token:string){return window.shifang.works.restoreBackup!({token});},
    async saveCiWork(request:SaveCiWorkRequest):Promise<WorkRecord>{return workRecordSchema.parse(await window.shifang.works.saveCiWork!(saveCiWorkRequestSchema.parse(request)));},
    async saveFreeWork(request: SaveFreeWorkRequest): Promise<WorkRecord> { return workRecordSchema.parse(await window.shifang.works.saveFreeWork!(saveFreeWorkRequestSchema.parse(request))); },
    async create(request: CreateWorkRequest): Promise<WorkRecord> {
      const response = await window.shifang.works.create(createWorkRequestSchema.parse(request));
      return workRecordSchema.parse(response);
    },
    async get(id: string): Promise<WorkRecord | null> {
      const response = await window.shifang.works.get(workIdRequestSchema.parse({ id }));
      return response === null ? null : workRecordSchema.parse(response);
    },
    async list(includeArchived = false): Promise<WorkRecord[]> {
      const response = await window.shifang.works.list(listWorksRequestSchema.parse({ includeArchived }));
      return workRecordSchema.array().parse(response);
    },
    async update(id: string, request: UpdateWorkRequest): Promise<WorkRecord> {
      const response = await window.shifang.works.update({ id, ...updateWorkRequestSchema.parse(request) });
      return workRecordSchema.parse(response);
    },
    async archive(id: string): Promise<WorkRecord> {
      const response = await window.shifang.works.archive(workIdRequestSchema.parse({ id }));
      return workRecordSchema.parse(response);
    },
    async saveAnalysisState(request: SaveAnalysisStateRequest): Promise<WorkAnalysisState> {
      const response = await window.shifang.works.saveAnalysisState(saveAnalysisStateRequestSchema.parse(request));
      return workAnalysisStateSchema.parse(response);
    },
    async getAnalysisState(id: string): Promise<WorkAnalysisState | null> {
      const response = await window.shifang.works.getAnalysisState(workIdRequestSchema.parse({ id }));
      return response === null ? null : workAnalysisStateSchema.parse(response);
    },
    async saveEditorState(request: SaveEditorStateRequest) {
      const response = await window.shifang.works.saveEditorState(saveEditorStateRequestSchema.parse(request));
      return {
        work: workRecordSchema.parse(response.work),
        analysisState: workAnalysisStateSchema.parse(response.analysisState),
      };
    },
    async export(request: ExportWorkRequest) {
      return exportWorkResponseSchema.parse(await window.shifang.works.export(exportWorkRequestSchema.parse(request)));
    },
  },
};

export function getDesktopErrorMessage(error: unknown, fallback: string): string {
  return safeMessage(error, fallback);
}
