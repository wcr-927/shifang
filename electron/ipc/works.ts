import {readingNotesQuerySchema,createReadingNoteSchema,readingNoteSchema} from "../../src/shared/reading.js";
import {collectionNameSchema} from "../../src/shared/collections.js";
import { handleTrusted } from "../security.js";
import { queryWorksRequestSchema } from "../../src/shared/workSummary.js";
import { z } from "zod";
import type { BackupService } from "../services/BackupService.js";
import { BrowserWindow } from "electron";
import {
  ciReadingRequestSchema,
  createWorkRequestSchema,
  exportWorkRequestSchema,
  listWorksRequestSchema,
  saveAnalysisStateRequestSchema,
  saveEditorStateRequestSchema,
  saveFreeWorkRequestSchema, saveCiWorkRequestSchema,
  updateWorkRequestSchema,
  workIdRequestSchema,
} from "../../src/shared/ipc.js";
import type { WorkRepository } from "../database/repositories/WorkRepository.js";
import type { ExportService } from "../services/ExportService.js";

export function registerWorkHandlers(repository: WorkRepository, exportService: ExportService, backupService?: BackupService, copyText: (text: string) => void = () => {}): void {
  handleTrusted("reference:notesOverview",()=>repository.readingNotesOverview());
  handleTrusted("reference:queryNotes",(_e,raw)=>repository.queryReadingNotes(readingNotesQuerySchema.parse(raw)));
  handleTrusted("reference:readingNotes",(_e,raw)=>{const r=readingNoteSchema.pick({sourceId:true,nodeId:true}).parse(raw);return repository.readingNotes(r.sourceId,r.nodeId);});
  handleTrusted("reference:createReadingNote",(_e,raw)=>repository.createReadingNote(createReadingNoteSchema.parse(raw)));
  handleTrusted("reference:updateReadingNote",(_e,raw)=>{const r=readingNoteSchema.pick({id:true,note:true}).parse(raw);return repository.updateReadingNote(r.id,r.note);});
  handleTrusted("reference:removeReadingNote",(_e,raw)=>repository.removeReadingNote(readingNoteSchema.pick({id:true}).parse(raw).id));
  const collectionId=z.object({id:z.string().uuid()}).strict();
  handleTrusted("collections:overview",()=>repository.libraryOverview());
  handleTrusted("collections:create",(_e,raw)=>repository.createCollection(z.object({name:collectionNameSchema}).strict().parse(raw).name));
  handleTrusted("collections:rename",(_e,raw)=>{const r=collectionId.extend({name:collectionNameSchema}).parse(raw);return repository.renameCollection(r.id,r.name);});
  handleTrusted("collections:remove",(_e,raw)=>repository.removeCollection(collectionId.parse(raw).id));
  handleTrusted("collections:move",(_e,raw)=>{const r=collectionId.extend({collectionId:z.string().uuid().nullable()}).parse(raw);return repository.moveToCollection(r.id,r.collectionId);});
  handleTrusted("collections:reorder",(_e,raw)=>{const r=collectionId.extend({direction:z.enum(['up','down'])}).parse(raw);return repository.reorderCollectionWork(r.id,r.direction);});
  handleTrusted("works:unarchive",(_e,raw)=>repository.unarchiveWork(collectionId.parse(raw).id));
  async function readingCopy(raw: unknown) {
    const request = ciReadingRequestSchema.parse(raw);
    const { ciForm } = await import("../../src/ci/catalogue.js");
    const { formatCiReading } = await import("../../src/ci/presentation.js");
    const form = ciForm(request.formId); if (!form) throw new Error("原词谱暂不可用，仍可导出原文。");
    return { title: request.title, text: formatCiReading(request.title, request.body, form, { title: request.includeTitle, form: request.includeForm }) };
  }
  handleTrusted("works:copy-reading", async (_event, raw) => { copyText((await readingCopy(raw)).text); });
  handleTrusted("works:export-reading", async (event, raw) => { const copy = await readingCopy(raw); return exportService.exportReading(BrowserWindow.fromWebContents(event.sender) ?? undefined, copy.title, copy.text); });
  handleTrusted("works:query", (_event, raw: unknown) => repository.queryWorks(queryWorksRequestSchema.parse(raw ?? {})));
  handleTrusted("works:pin-version",(_event,raw:unknown)=>{const r=workIdRequestSchema.extend({versionId:z.string().min(1).max(200),pinned:z.boolean()}).strict().parse(raw);return repository.setVersionPinned(r.id,r.versionId,r.pinned);});
  handleTrusted("works:versions",(_event,raw:unknown)=>repository.listVersions(workIdRequestSchema.parse(raw).id));
  handleTrusted("works:save-version",(_event,raw:unknown)=>repository.saveVersion(workIdRequestSchema.parse(raw).id,"manual_save"));
  handleTrusted("works:restore-version",(_event,raw:unknown)=>{const request=workIdRequestSchema.extend({versionId:z.string().min(1).max(200)}).parse(raw);return repository.restoreVersion(request.id,request.versionId);});
  if(backupService){
    handleTrusted("works:backup-export",event=>backupService.export(BrowserWindow.fromWebContents(event.sender)??undefined));
    handleTrusted("works:backup-preview",event=>backupService.preview(BrowserWindow.fromWebContents(event.sender)??undefined));
    handleTrusted("works:backup-restore",(_event,raw:unknown)=>backupService.restore(z.object({token:z.string().uuid()}).parse(raw).token));
  }
  handleTrusted("works:create", async (_event, rawRequest: unknown) => {
    const request=createWorkRequestSchema.parse(rawRequest);
    if(request.genre === "ci") {
      const rules=await import("../../src/ci/catalogue.js");
      const form=request.ci && rules.ciForm(request.ci.formId);
      if(!form || request.ci?.version!==form.version || request.ci.rhymeVersion!==rules.ciRuleData.dictionary.version) throw new Error(rules.ciRuleError || "请选择当前可用的词谱与词韵版本");
    }
    return repository.createWork(request);
  });
  handleTrusted("works:get", (_event, rawRequest: unknown) => {
    const request = workIdRequestSchema.parse(rawRequest);
    return repository.getWork(request.id);
  });
  handleTrusted("works:list", (_event, rawRequest: unknown) => {
    const request = listWorksRequestSchema.parse(rawRequest ?? {});
    return repository.listWorks(request.includeArchived ?? false);
  });
  handleTrusted("works:update", (_event, rawRequest: unknown) => {
    if (typeof rawRequest !== "object" || rawRequest === null) throw new Error("invalid work update request");
    const { id, ...payload } = rawRequest as { id?: unknown } & Record<string, unknown>;
    const workId = workIdRequestSchema.parse({ id }).id;
    return repository.updateWork(workId, updateWorkRequestSchema.parse(payload));
  });
  handleTrusted("works:archive", (_event, rawRequest: unknown) => {
    const request = workIdRequestSchema.parse(rawRequest);
    return repository.archiveWork(request.id);
  });
  handleTrusted("works:save-analysis-state", (_event, rawRequest: unknown) => {
    return repository.saveAnalysisState(saveAnalysisStateRequestSchema.parse(rawRequest));
  });
  handleTrusted("works:get-analysis-state", (_event, rawRequest: unknown) => {
    const request = workIdRequestSchema.parse(rawRequest);
    return repository.getAnalysisState(request.id);
  });
  handleTrusted("works:save-editor-state", (_event, rawRequest: unknown) => {
    return repository.saveEditorState(saveEditorStateRequestSchema.parse(rawRequest));
  });
  handleTrusted("works:save-ci", (_event,raw:unknown)=>repository.saveCiWork(saveCiWorkRequestSchema.parse(raw)));
  handleTrusted("works:save-free", (_event, raw: unknown) => repository.saveFreeWork(saveFreeWorkRequestSchema.parse(raw)));
  handleTrusted("works:export", async (event, rawRequest: unknown) => {
    const request = exportWorkRequestSchema.parse(rawRequest);
    return exportService.export(BrowserWindow.fromWebContents(event.sender) ?? undefined, request);
  });
}
