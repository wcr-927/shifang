// Run against the installed app in an isolated profile on the Windows CI runner.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const exe = process.argv[2];
const profile = await mkdtemp(join(tmpdir(), "采章 验收-"));
async function session(expression) {
  const portFile = join(profile, "DevToolsActivePort");
  await rm(portFile, { force: true });
  const child = spawn(exe, ["--user-data-dir=" + profile, "--remote-debugging-port=0"], {stdio:"inherit"});
  const exited = once(child, "exit");
  let socket;
  try {
    let tab;
    for (let i=0; i<160 && !tab; i++) {
      if (child.exitCode !== null) throw Error("App exited before opening its window: " + child.exitCode);
      await delay(250);
      try {
        const port = (await readFile(portFile, "utf8")).split(/\r?\n/)[0];
        const pages = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
        tab = pages.find(p => p.url.endsWith("/index.html"));
      } catch { /* The debugging endpoint appears after Chromium starts. */ }
    }
    assert(tab, "The installed application did not open the home window");
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject) => {socket.onopen=resolve; socket.onerror=reject;});
    const message = new Promise((resolve,reject) => {
      socket.onmessage = event => {
        const packet = JSON.parse(event.data);
        if (packet.id !== 1) return;
        if (packet.error || packet.result?.exceptionDetails) reject(Error(JSON.stringify(packet)));
        else resolve(packet.result.result.value);
      };
    });
    socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression,awaitPromise:true,returnByValue:true}}));
    const value = await message;
    execFileSync("powershell.exe", ["-NoProfile","-Command",
      "if (-not (Get-Process -Id " + child.pid + ").CloseMainWindow()) { exit 1 }"]);
    const [code] = await exited;
    assert.equal(code,0,"App failed to exit normally");
    return value;
  } finally { socket?.close(); if (child.exitCode === null) child.kill(); }
}
try {
  const id = await session(`(async () => {
    if (!window.shifang.app.isWindows) throw Error("Windows preload missing");
    await window.shifang.reference.readingShelf();
    const work=await window.shifang.works.create({genre:"wujue",title:"测试诗稿"});
    await window.shifang.works.update({id:work.id,body:"山空月自明"});
    return work.id;
  })()`);
  assert.match(id,/^[0-9a-f-]{36}$/i);
  const work = await session("window.shifang.works.get({id:"+JSON.stringify(id)+"})");
  assert.equal(work.title,"测试诗稿");
  assert.equal(work.body,"山空月自明");
  console.log("Installed Windows app opened its reading library and restored the saved poem after relaunch.");
} finally { await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:250}); }
