import { defineConfig } from "vite";
import { developmentCsp } from "./electron/securityPolicy";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(),{
    name:"development-csp",
    apply:"serve",
    transformIndexHtml(html){return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(" \/>)/,`$1${developmentCsp}$2`);},
  }],
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions:{input:{main:"index.html",publication:"publication.html"}},
    emptyOutDir: true,
  },
});
