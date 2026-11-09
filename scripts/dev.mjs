import "./require_node.mjs";
import { context } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import electronExecutable from "electron";
import { electronBuildOptions } from "./electron_build_options.mjs";

const userData = resolve(process.env.SHIFANG_DEV_USER_DATA ?? ".development/user-data");
mkdirSync(userData, { recursive: true });
mkdirSync("dist-electron", { recursive: true });
console.log(`DEV_USER_DATA ${userData}`);

let electronChild;
let stopping = false;
let ready = false;
let building = 0;
let restartTimer;
let restarting = false;
let restartPending = false;
let electronStop;
const buildErrors = new Set();
const contexts = [];
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { stdio: "inherit" });

function launchElectron() {
  if (stopping) return;
  electronChild = spawn(electronExecutable, [".", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, SHIFANG_DEV_USER_DATA: userData },
  });
  electronChild.on("error", error => { console.error(error); void shutdown(1); });
  console.log(`DEV_ELECTRON_STARTED ${electronChild.pid}`);
}

async function stopElectron() {
  if (electronStop) return electronStop;
  const child = electronChild;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  electronStop = new Promise(resolvePromise => {
    // A failed flush leaves the app alive. Never bypass its close barrier.
    const notice = setTimeout(() => console.error("DEV_WAITING_FOR_SAVE：退出尚未完成；保留开发进程，请在窗口中解决保存问题后退出。"), 6500);
    child.once("exit", () => { clearTimeout(notice); resolvePromise(); });
    child.kill("SIGTERM");
  });
  await electronStop;
  electronStop = undefined;
}

async function restartElectron() {
  restartPending = true;
  if (restarting || stopping) return;
  restarting = true;
  try {
    while (restartPending && !stopping) {
      restartPending = false;
      await stopElectron();
      if (building === 0 && buildErrors.size === 0) launchElectron();
    }
  } finally { restarting = false; }
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  await stopElectron();
  await Promise.all(contexts.map(item => item.dispose()));
  vite.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
vite.on("error", error => { console.error(error); void shutdown(1); });
vite.on("exit", code => { if (!stopping) { console.error(`DEV_VITE_EXITED ${code}`); void shutdown(1); } });

try {
  const firstBuilds = electronBuildOptions.map(async options => {
    const key = options.outfile ?? options.outdir;
    let complete;
    let fail;
    const firstBuild = new Promise((resolvePromise, reject) => { complete = resolvePromise; fail = reject; });
    const watcher = await context({
      ...options,
      plugins: [{ name: "restart-after-build", setup(build) {
        build.onStart(() => { building++; clearTimeout(restartTimer); });
        build.onEnd(result => {
          building--;
          if (result.errors.length) { buildErrors.add(key); fail(new Error(`DEV_BUILD_FAILED ${key}`)); }
          else { buildErrors.delete(key); complete(); console.log(`DEV_BUILT ${key}`); }
          if (ready && !stopping && building === 0 && buildErrors.size === 0) {
            restartTimer = setTimeout(() => { void restartElectron(); }, 150);
          }
        });
      } }],
    });
    contexts.push(watcher);
    await watcher.watch();
    await firstBuild;
  });
  await Promise.all(firstBuilds);
  for (let attempt = 0; ; attempt++) {
    if (stopping) break;
    try {
      const response = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    if (attempt >= 100) throw new Error("Vite 未能在 127.0.0.1:5173 启动");
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  if (!stopping) { ready = true; launchElectron(); }
} catch (error) {
  console.error(error);
  await shutdown(1);
}
