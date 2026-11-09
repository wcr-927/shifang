import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  throw new Error("Local macOS signing requires macOS and /usr/bin/codesign.");
}

const appPath = resolve(process.argv[2] ?? "release/mac-arm64/采章.app");
if (!existsSync(appPath)) throw new Error(`Application bundle not found: ${appPath}`);

function codesign(args) {
  const result = spawnSync("/usr/bin/codesign", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// electron-builder deliberately skips Developer ID signing for this local build.
// Re-sign the modified Electron bundle ad hoc so Finder sees a coherent bundle
// instead of the invalid signature inherited from the Electron distribution.
codesign(["--force", "--deep", "--sign", "-", "--timestamp=none", appPath]);
codesign(["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(`LOCAL_MAC_SIGNED ${appPath}`);
