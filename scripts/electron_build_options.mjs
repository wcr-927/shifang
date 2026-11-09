// Production and watch mode share entry points, output formats and externals.
export const electronBuildOptions = [
 {entryPoints:["electron/publicationPreload.cts"],bundle:true,platform:"node",format:"cjs",outfile:"dist-electron/publicationPreload.cjs",external:["electron"]},
  {
    entryPoints: ["electron/reference/libraryWorker.ts"], bundle: true, platform: "node", format: "esm",
    outfile: "dist-electron/reference/libraryWorker.js", external: ["better-sqlite3", "yauzl", "parse5", "saxes"], sourcemap: true,
  },
  {
    entryPoints: ["electron/main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: "dist-electron",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    external: ["electron", "better-sqlite3"],
    sourcemap: true,
  },
  {
    entryPoints: ["electron/preload.cts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: "dist-electron/preload.cjs",
    external: ["electron"],
    sourcemap: true,
  },
];
