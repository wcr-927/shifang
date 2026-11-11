import assert from "node:assert/strict";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { build } from "esbuild";
import { flushBeforeClose, registerCloseFlush, registerCloseGuard } from "../../src/services/closeCoordinator.ts";
import { CloseService } from "../../electron/services/CloseService.ts";

test("close barrier converts thrown flush to a visible failure and remains retryable", async () => {
  const dispose = registerCloseFlush(async () => { throw new Error("unexpected"); });
  try {
    const result = await flushBeforeClose(20);
    assert.equal(result.status, "failed");
    assert.ok("message" in result && result.message.includes("保留"));
  } finally { dispose(); }
  assert.deepEqual(await flushBeforeClose(), { status: "clean" });
});

test("close barrier times out a never-returning flush without authorizing a late close", async () => {
  let resolve!: (value: { status: "saved" }) => void;
  const dispose = registerCloseFlush(() => new Promise((done) => { resolve = done; }));
  try {
    const pending = flushBeforeClose(15);
    assert.strictEqual(flushBeforeClose(15), pending);
    assert.equal((await pending).status, "timeout");
    resolve({ status: "saved" });
    assert.equal((await pending).status, "timeout");
  } finally { dispose(); }
});

test("close request IDs reject late responses and duplicate requests share one handshake", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: number[] = [], closed: boolean[] = [], cancelled: string[] = [];
  const service = new CloseService((id) => sent.push(id), (quit) => closed.push(quit), (result) => cancelled.push(result.status), 10);
  service.request(false); service.request(true);
  assert.equal(sent.length, 1);
  context.mock.timers.tick(10);
  assert.deepEqual(cancelled, ["timeout"]);
  service.request(false);
  service.respond(sent[0], { status: "saved" });
  assert.deepEqual(closed, []);
  service.respond(sent[1], { status: "clean" });
  assert.deepEqual(closed, [false]);
  service.dispose();
});

// Execute the actual main entry with Electron/SQLite boundaries replaced. This
// verifies BrowserWindow close, before-quit, IPC sender checks and timeout wiring,
// without opening a desktop window or any user database.
test("main lifecycle never destroys an unconfirmed window and only closes on saved/clean IPC", async (context) => {
  const originalSignals = new Map(["SIGINT", "SIGTERM"].map(signal => [signal, process.listeners(signal)]));
  const windows: FakeWindow[] = [];
  const sent: Array<{ channel: string; args: any[] }> = [];
  const notices: string[] = [];
  let destroyCalls = 0, closedCalls = 0, quitCalls = 0;
  class FakeWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { mainFrame: {url:"http://127.0.0.1:5173/"}, setWindowOpenHandler() {}, session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onHeadersReceived(){}}}, send: (channel: string, ...args: any[]) => sent.push({ channel, args }), openDevTools() {} });
    constructor(_options: unknown) { super(); windows.push(this); }
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      this.emit("close", event);
      if (!event.prevented) { closedCalls += 1; this.emit("closed"); }
    }
    destroy() { destroyCalls += 1; this.emit("closed"); }
    isDestroyed() { return false; }
    async loadURL() {} async loadFile() {}
    static getAllWindows() { return []; }
    static fromWebContents() { return windows.at(-1); }
  }
  const appPaths = new Map<string, string>();
  const app = Object.assign(new EventEmitter(), {
    requestSingleInstanceLock:()=>true, isPackaged: false, whenReady: async () => {}, getPath: (key: string) => appPaths.get(key) ?? "/unused-audit-db", setName: () => {}, getVersion: () => "test",
    setPath: (key: string, value: string) => { appPaths.set(key, value); },
    quit: () => {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      app.emit("before-quit", event);
      if (!event.prevented) quitCalls += 1;
    },
  });
  const handlers=new Map<string,(event:any,...args:any[])=>unknown>();
  const ipcMain = Object.assign(new EventEmitter(), { handle(channel:string,handler:(event:any,...args:any[])=>unknown) {handlers.set(channel,handler);} });
  const key = `__shifang_close_test_${Date.now()}`;
  (globalThis as any)[key] = { app, BrowserWindow: FakeWindow, ipcMain, dialog: { showSaveDialog: async () => ({ canceled: true }), showErrorBox: (_title: string, message: string) => notices.push(message) } };
  const output = await build({
    entryPoints: ["electron/main.ts"], bundle: true, write: false, format: "esm", platform: "node",
    define: { "import.meta.url": JSON.stringify(new URL("../../dist-electron/main.js", import.meta.url).href) },
    plugins: [{ name: "isolated-main-boundaries", setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "audit" }));
      builder.onResolve({ filter: /database\/connection\.js$/ }, () => ({ path: "database", namespace: "audit" }));
      builder.onLoad({ filter: /.*/, namespace: "audit" }, ({ path }) => ({ contents: path === "electron"
        ? `export const {app,BrowserWindow,ipcMain,dialog,clipboard}=globalThis[${JSON.stringify(key)}];`
        : "export class DatabaseConnection { db = {}; close() {} } export function defaultMigrationsDirectory() { return ''; }", loader: "js" }));
    } }],
  });
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    assert.equal(appPaths.get("userData"), resolve(".development", "user-data"), "unpackaged app isolates its data before ready");
    const current = () => windows.at(-1)!;
    const requestId = () => sent.filter((item) => item.channel === "app:before-close").at(-1)!.args[0];
    const respond = (status: string, sender = current().webContents, id = requestId()) => ipcMain.emit("app:close-result", { sender, senderFrame:current().webContents.mainFrame }, id, { status });
    const frame=current().webContents.mainFrame;
    for(const [channel,handler] of handlers) {
      if(channel.startsWith("publication:"))continue;
      assert.throws(()=>handler({sender:{},senderFrame:frame}),/Untrusted IPC sender/);
      assert.throws(()=>handler({sender:current().webContents,senderFrame:{url:frame.url}}),/Untrusted IPC sender/);
    }
    const url=frame.url;frame.url="http://127.0.0.1:5174/";
    assert.throws(()=>handlers.get("app:health")!({sender:current().webContents,senderFrame:frame}),/Untrusted IPC sender/);frame.url=url;
    assert.equal((handlers.get("app:health")!({sender:current().webContents,senderFrame:frame}) as {version:string}).version,"test");
    current().close();
    ipcMain.emit("app:close-result",{sender:current().webContents,senderFrame:{url:frame.url}},requestId(),{status:"saved"});
    assert.equal(closedCalls,0,"an iframe cannot acknowledge a pending close");
    respond("failed");
    assert.equal(closedCalls, 0);
    assert.equal(sent.at(-1)!.channel, "app:close-cancelled");
    current().close();
    const expiredId = requestId();
    context.mock.timers.tick(5000);
    assert.equal(destroyCalls, 0);
    assert.equal(closedCalls, 0);
    assert.equal(quitCalls, 0);
    assert.ok(notices.at(-1)?.includes("超时"));
    respond("saved", current().webContents, expiredId);
    assert.equal(closedCalls, 0);
    current().close();
    respond("saved", {} as any);
    assert.equal(closedCalls, 0, "foreign sender must not close the window");
    respond("saved");
    assert.equal(closedCalls, 1);
    app.emit("activate");
    current().close(); respond("clean");
    assert.equal(closedCalls, 2);
    app.emit("activate");
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    app.emit("before-quit", event);
    assert.equal(event.prevented, true);
    context.mock.timers.tick(5000);
    assert.equal(quitCalls, 0);
    assert.equal(destroyCalls, 0);
    app.emit("before-quit", event); respond("saved");
    assert.equal(quitCalls, 1);
    for (const signal of ["SIGTERM", "SIGINT"]) {
      app.emit("activate");
      const handlers = process.listeners(signal).filter(handler => !originalSignals.get(signal)!.includes(handler));
      assert.equal(handlers.length, 1);
      const before = quitCalls;
      handlers[0](); respond("failed");
      assert.equal(quitCalls, before, `${signal} cannot bypass a failed flush`);
      handlers[0](); respond("saved");
      assert.equal(quitCalls, before + 1);
      assert.equal(destroyCalls, 0);
    }
  } finally {
    for (const [signal, originals] of originalSignals) {
      for (const handler of process.listeners(signal)) if (!originals.includes(handler)) process.removeListener(signal, handler);
    }
    delete (globalThis as any)[key];
  }
});


test("pending composition blocks close before the save handler, then permits normal flush",async()=>{let calls=0;const release=registerCloseGuard(()=>"请先完成输入"),dispose=registerCloseFlush(async()=>{calls++;return {status:"saved"}});try{assert.deepEqual(await flushBeforeClose(),{status:"failed",message:"请先完成输入"});assert.equal(calls,0);release();assert.deepEqual(await flushBeforeClose(),{status:"saved"});assert.equal(calls,1);}finally{release();dispose();}});
