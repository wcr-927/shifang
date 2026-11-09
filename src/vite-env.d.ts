/// <reference types="vite/client" />

import type { ShifangWindowApi } from "./shared/ipc";

declare global {
  interface Window {
    shifang: ShifangWindowApi;
  }
}

export {};
