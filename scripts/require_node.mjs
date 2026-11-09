import { readFileSync } from "node:fs";

const expected = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
if (process.versions.node !== expected) {
  throw new Error(`诗房开发与验收需要 Node ${expected}；当前为 ${process.versions.node}。请先切换运行时（见 README.md）。`);
}
