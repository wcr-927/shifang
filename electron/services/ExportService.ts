import type { BrowserWindow } from "electron";
import type { ExportWorkRequest } from "../../src/shared/ipc.ts";
import { formatMarkdown, formatPlainText, sanitizeExportFilename } from "../../src/features/export/exportFormat.ts";

export interface SaveDialogResult { canceled: boolean; filePath?: string }
export type ShowSaveDialog = (window: BrowserWindow | undefined, options: { title: string; defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }) => Promise<SaveDialogResult>;
export type WriteUtf8File = (path: string, content: string) => Promise<void>;

export class ExportService {
  private readonly showSaveDialog: ShowSaveDialog;
  private readonly writeUtf8File: WriteUtf8File;

  constructor(showSaveDialog: ShowSaveDialog, writeUtf8File: WriteUtf8File) {
    this.showSaveDialog = showSaveDialog;
    this.writeUtf8File = writeUtf8File;
  }

  async exportReading(window: BrowserWindow | undefined, title: string, content: string): Promise<{ status: "exported" | "cancelled"; path?: string }> {
    const result = await this.showSaveDialog(window, { title: "导出读稿", defaultPath: `${sanitizeExportFilename(title)}-读稿.txt`, filters: [{ name: "纯文本", extensions: ["txt"] }] });
    if (result.canceled || !result.filePath) return { status: "cancelled" };
    await this.writeUtf8File(result.filePath, content);
    return { status: "exported", path: result.filePath };
  }

  async export(window: BrowserWindow | undefined, request: ExportWorkRequest): Promise<{ status: "exported" | "cancelled"; path?: string }> {
    const extension = request.format === "markdown" ? "md" : "txt";
    const result = await this.showSaveDialog(window, {
      title: "导出诗稿",
      defaultPath: `${sanitizeExportFilename(request.title)}.${extension}`,
      filters: request.format === "markdown"
        ? [{ name: "Markdown", extensions: ["md"] }]
        : [{ name: "纯文本", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return { status: "cancelled" };
    const content = request.format === "markdown" ? formatMarkdown(request) : formatPlainText(request);
    await this.writeUtf8File(result.filePath, content);
    return { status: "exported", path: result.filePath };
  }
}
