import { contextBridge, ipcRenderer } from "electron";
import type { FlushResult } from "../src/shared/close.js";

contextBridge.exposeInMainWorld("shifang", {
  reference: Object.fromEntries(["notesOverview","queryNotes","recommendationTarget","readingShelf","readingIndex","readingPiece","readingNotes","createReadingNote","updateReadingNote","removeReadingNote","explanations","lookup","groups","group","patterns","sources","books","importBook","importProgress","cancel","toc","read","search","image","position","savePosition","resolve","copy","reindex","tocPath","tocSearch"].map(method=>[method,(request?:unknown)=>ipcRenderer.invoke(`reference:${method}`,request)])),
  app: {
    isWindows: process.platform === "win32",
    health: () => ipcRenderer.invoke("app:health"),
    onBeforeClose: (callback: (requestId: number) => void | Promise<void>) => {
      const listener = (_event: unknown, requestId: number) => {
        void Promise.resolve().then(() => callback(requestId)).catch(() => {
          ipcRenderer.send("app:close-result", requestId, { status: "failed", message: "保存未完成，已取消关闭，请重试。" });
        });
      };
      ipcRenderer.on("app:before-close", listener);
      return () => ipcRenderer.removeListener("app:before-close", listener);
    },
    completeClose: (requestId: number, result: FlushResult) => ipcRenderer.send("app:close-result", requestId, result),
    onCloseCancelled: (callback: (result: FlushResult) => void) => {
      const listener = (_event: unknown, result: FlushResult) => callback(result);
      ipcRenderer.on("app:close-cancelled", listener);
      return () => ipcRenderer.removeListener("app:close-cancelled", listener);
    },
  },
  analysis: {
    analyzePoem: (request: unknown) => ipcRenderer.invoke("analysis:analyze-poem", request),
  },
  rules: {
    listTemplates: () => ipcRenderer.invoke("rules:list-templates"),
    getReadingCandidates: (request: unknown) =>
      ipcRenderer.invoke("rules:get-reading-candidates", request),
  },
  works: {
    openPublication:(request:unknown)=>ipcRenderer.invoke("publication:open",request),
    collectionOverview:()=>ipcRenderer.invoke("collections:overview"),
    createCollection:(request:unknown)=>ipcRenderer.invoke("collections:create",request),
    renameCollection:(request:unknown)=>ipcRenderer.invoke("collections:rename",request),
    removeCollection:(request:unknown)=>ipcRenderer.invoke("collections:remove",request),
    moveToCollection:(request:unknown)=>ipcRenderer.invoke("collections:move",request),
    reorderCollectionWork:(request:unknown)=>ipcRenderer.invoke("collections:reorder",request),
    unarchive:(request:unknown)=>ipcRenderer.invoke("works:unarchive",request),
    copyReading: (request: unknown) => ipcRenderer.invoke("works:copy-reading", request),
    exportReading: (request: unknown) => ipcRenderer.invoke("works:export-reading", request),
    query: (request?: unknown) => ipcRenderer.invoke("works:query", request),
    setVersionPinned: (request:unknown)=>ipcRenderer.invoke("works:pin-version",request),
    listVersions: (request:unknown)=>ipcRenderer.invoke("works:versions",request),
    saveVersion: (request:unknown)=>ipcRenderer.invoke("works:save-version",request),
    restoreVersion: (request:unknown)=>ipcRenderer.invoke("works:restore-version",request),
    exportBackup: ()=>ipcRenderer.invoke("works:backup-export"),
    previewBackup: ()=>ipcRenderer.invoke("works:backup-preview"),
    restoreBackup: (request:unknown)=>ipcRenderer.invoke("works:backup-restore",request),
    saveCiWork: (request: unknown) => ipcRenderer.invoke("works:save-ci", request),
    saveFreeWork: (request: unknown) => ipcRenderer.invoke("works:save-free", request),
    create: (request: unknown) => ipcRenderer.invoke("works:create", request),
    get: (request: unknown) => ipcRenderer.invoke("works:get", request),
    list: (request?: unknown) => ipcRenderer.invoke("works:list", request),
    update: (request: unknown) => ipcRenderer.invoke("works:update", request),
    archive: (request: unknown) => ipcRenderer.invoke("works:archive", request),
    saveAnalysisState: (request: unknown) => ipcRenderer.invoke("works:save-analysis-state", request),
    getAnalysisState: (request: unknown) => ipcRenderer.invoke("works:get-analysis-state", request),
    saveEditorState: (request: unknown) => ipcRenderer.invoke("works:save-editor-state", request),
    export: (request: unknown) => ipcRenderer.invoke("works:export", request),
  },
});
