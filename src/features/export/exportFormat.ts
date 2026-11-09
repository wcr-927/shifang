import type { CiState } from "../../ci/schema";
import metadata from "../../ci/metadata.json";
const ciForm = (id: string) => metadata.forms.find(form => form.id === id);
import { workTypeLabel, statusLabels, type DocumentGenre, type WorkRoom, type FreeCategory, type WorkStatus } from "../../shared/work";

export interface ExportSnapshot {
  ci?:CiState;
  title: string;
  body: string;
  genre: DocumentGenre;
  room?: WorkRoom;
  category?: FreeCategory;
  status: WorkStatus;
  location: string;
  notes: string;
  tags: string[];
}

function displayTitle(title: string): string {
  return title.trim() || "未题";
}

export function formatMarkdown(snapshot: ExportSnapshot): string {
  const title = displayTitle(snapshot.title);
  const metadata = [`- 体裁：${workTypeLabel(snapshot)}`, `- 状态：${statusLabels[snapshot.status]}`];
  if(snapshot.ci){const form=ciForm(snapshot.ci.formId);metadata.push(`- 词牌：${form?.name ?? snapshot.ci.formId} · ${form?.author ?? ""}体`);}
  if (snapshot.location.trim()) metadata.push(`- 地点：${snapshot.location.trim()}`);
  if (snapshot.tags.length) metadata.push(`- 标签：${snapshot.tags.join("、")}`);
  return `# ${title}\n\n${metadata.join("\n")}\n\n${snapshot.body}`;
}

export function formatPlainText(snapshot: ExportSnapshot): string {
  const title = snapshot.title.trim();
  const form=snapshot.ci?ciForm(snapshot.ci.formId):undefined;
  const prefix=form?`${form.name} · ${form.author}体\n`:"";
  return `${prefix}${title ? `${title}\n\n` : ""}${snapshot.body}`;
}

export function sanitizeExportFilename(title: string): string {
  const clean = title.trim().replace(/[\\/:*?"<>|\u0000-\u001F]/gu, "-").replace(/\s+/gu, " ").replace(/[. ]+$/gu, "");
  return clean.slice(0, 120) || "未题";
}
