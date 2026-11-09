import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { electronBuildOptions } from "./electron_build_options.mjs";

rmSync("dist-electron", { recursive: true, force: true });
mkdirSync("dist-electron", { recursive: true });

await Promise.all(electronBuildOptions.map(options => build(options)));
