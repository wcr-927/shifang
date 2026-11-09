import {PublicationService} from "./services/PublicationService.js";
import { ReadingExplanationService } from "./services/ReadingExplanationService.js";
import { configureIpcSecurity, handleTrusted, isTrustedSender } from "./security.js";
import { isTrustedDocument, productionCsp, developmentCsp } from "./securityPolicy.js";
import { BackupService } from "./services/BackupService.js";
import { app, BrowserWindow, ipcMain, clipboard } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AnalysisService } from "./services/AnalysisService.js";
import { registerAnalysisHandlers } from "./ipc/analysis.js";
import { registerRuleHandlers } from "./ipc/rules.js";
import { RuleService, defaultRulesDirectory } from "./services/RuleService.js";
import { DatabaseConnection, defaultMigrationsDirectory } from "./database/connection.js";
import { WorkRepository } from "./database/repositories/WorkRepository.js";
import { registerWorkHandlers } from "./ipc/works.js";
import { ExportService } from "./services/ExportService.js";
import { dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync } from "node:fs";
import { CloseService } from "./services/CloseService.js";
import { ReferenceRuleService, defaultCiDirectory } from "./services/ReferenceRuleService.js";
import { ReferenceLibraryService } from "./reference/ReferenceLibraryService.js";
import { registerReferenceHandlers } from "./ipc/reference.js";

app.setName("诗房开源版");
const isDevelopment = !app.isPackaged;
const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
if (isDevelopment) {
  const developmentUserData = resolve(process.env.SHIFANG_DEV_USER_DATA ?? join(currentDirectory, "../.development/user-data"));
  mkdirSync(developmentUserData, { recursive: true });
  app.setPath("userData", developmentUserData);
}
const candidate = app.isPackaged && JSON.parse(readFileSync(join(app.getAppPath(),"package.json"),"utf8")).shifangCandidate === true;
if (candidate && !app.commandLine.hasSwitch("user-data-dir")) {
  const candidateUserData=resolve(process.env.SHIFANG_CANDIDATE_USER_DATA??join(app.getPath("appData"),"诗房候选"));
  mkdirSync(candidateUserData,{recursive:true});app.setPath("userData",candidateUserData);
}
// Electron's instance lock is keyed by userData: isolated QA instances remain independent.
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const documentUrl=isDevelopment?"http://127.0.0.1:5173/":pathToFileURL(join(currentDirectory,"../dist/index.html")).href;
let mainWindow: BrowserWindow | null = null;
configureIpcSecurity(()=>mainWindow,documentUrl);
app.on("second-instance",()=>{if(mainWindow?.isMinimized())mainWindow.restore();mainWindow?.show();mainWindow?.focus();});
// Signals from launchers and dev rebuilds share the normal renderer flush barrier.
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());
let closeAllowed = false;
const closeService = new CloseService(
  (requestId) => mainWindow?.webContents.send("app:before-close", requestId),
  (quit) => {
    closeAllowed = true;
    if (quit) app.quit();
    else mainWindow?.close();
  },
  (result) => {
    mainWindow?.webContents.send("app:close-cancelled", result);
    if (isDevelopment && "message" in result) console.error(`DEV_QUIT_CANCELLED ${result.message}`);
    if (result.status === "timeout") dialog.showErrorBox("诗房未关闭", result.message);
  },
);

function requestCloseFlush(quit: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    closeAllowed = true;
    if (quit) app.quit();
    return;
  }
  closeService.request(quit);
}

function createWindow(): void {
  closeAllowed = false;
  closeService.dispose();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: candidate ? "诗房 · 候选版" : "诗房",
    backgroundColor: "#f7f5ef",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 25 } } : {}),
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  const rejectNavigation=(event:Electron.Event,url:string)=>{if(!isTrustedDocument(url,documentUrl))event.preventDefault();};
  window.webContents.on("will-navigate",rejectNavigation);
  window.webContents.on("will-redirect",rejectNavigation);
  window.webContents.on("will-frame-navigate",event=>{if(!event.isMainFrame || !isTrustedDocument(event.url,documentUrl))event.preventDefault();});
  window.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  window.webContents.on("will-attach-webview",event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.webContents.session.setPermissionCheckHandler(()=>false);
  window.webContents.session.webRequest.onHeadersReceived((details,callback)=>{
    if(details.resourceType==="mainFrame"&&isTrustedDocument(details.url,documentUrl))callback({responseHeaders:{...details.responseHeaders,"Content-Security-Policy":[isDevelopment?developmentCsp:productionCsp]}});
    else callback({});
  });
  window.on("close", (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    requestCloseFlush(false);
  });
  window.on("closed", () => { closeService.dispose(); mainWindow = null; });

  if (isDevelopment) {
    void window.loadURL("http://127.0.0.1:5173");
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(join(currentDirectory, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  if(!primaryInstance)return;
  const ruleService = new RuleService(defaultRulesDirectory(app.isPackaged, process.resourcesPath));
  const referenceLibrary=new ReferenceLibraryService(join(app.getPath("userData"),"reference"),join(currentDirectory,"reference/libraryWorker.js"));
  const referenceRules=new ReferenceRuleService(ruleService,defaultCiDirectory(app.isPackaged,process.resourcesPath));
  const explanations=new ReadingExplanationService(referenceRules,join(defaultRulesDirectory(app.isPackaged,process.resourcesPath),"reading_explanations.json"));
  registerReferenceHandlers(referenceRules,referenceLibrary,async()=>{
    const options={title:"接入本地EPUB资料",properties:["openFile" as const],filters:[{name:"EPUB书籍",extensions:["epub"]}]};
    const result=mainWindow?await dialog.showOpenDialog(mainWindow,options):await dialog.showOpenDialog(options);
    return result.canceled?null:result.filePaths[0]??null;
  },character=>clipboard.writeText(character),explanations);
  const analysisService = new AnalysisService(ruleService);
  const database = new DatabaseConnection(
    join(app.getPath("userData"), "shifang.sqlite"),
    defaultMigrationsDirectory(app.isPackaged, process.resourcesPath),
  );
  const workRepository = new WorkRepository(database.db);
  new PublicationService(workRepository,currentDirectory,isDevelopment);
  const exportService = new ExportService(
    (window, options) => window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options),
    (path, content) => writeFile(path, content, "utf8"),
  );

  handleTrusted("app:health", () => ({
    name: "诗房",
    version: app.getVersion(),
    packaged: app.isPackaged,
    candidate,
  }));
  registerAnalysisHandlers(analysisService);
  registerRuleHandlers(ruleService);
  registerWorkHandlers(workRepository, exportService, new BackupService(workRepository,join(app.getPath("userData"),"backups"),
    (window,options)=>window?dialog.showSaveDialog(window,options):dialog.showSaveDialog(options),
    window=>{const options={title:"选择完整备份",properties:["openFile" as const],filters:[{name:"诗房完整备份",extensions:["json"]}]};return window?dialog.showOpenDialog(window,options):dialog.showOpenDialog(options);}
  ), text => clipboard.writeText(text));
  ipcMain.on("app:close-result", (event, requestId: number, result: unknown) => {
    if (!isTrustedSender(event)) return;
    closeService.respond(requestId, result);
  });
  app.on("before-quit", (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    requestCloseFlush(true);
  });
  app.on("will-quit", () => {database.close();void referenceLibrary.close().catch(()=>{});});

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  dialog.showErrorBox("诗房未能打开", error instanceof Error ? error.message : String(error));
  closeAllowed = true;
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
