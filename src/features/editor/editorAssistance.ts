import { readingOverrideSchema, listTemplatesResponseSchema } from "../../shared/ipc";
import { genreLabels, type WorkGenre } from "../../shared/work";
import type { PoemReadingOverride } from "../../poetry/analysis/poemAnalyzer";
import { matchesEditorAnchor } from "../../poetry/analysis/editorCoordinates";
import { genreLineCounts } from "./editorModel";
import type { TemplateSummary } from "./useEditorController";

export const assistanceUnavailable = "格律数据暂不可用，正文编辑不受影响。";
export const assistanceStateUnreadable = "已保存的格律状态读取或解析失败，本次暂用自动格式；请重新打开诗稿重试。正文编辑不受影响。";
export const assistanceStateInvalid = "已保存的格律状态内容格式无效，本次暂用自动格式；原有读音选择需重新确认。正文编辑不受影响。";
export const assistanceStateMismatch = "已保存的格律状态与当前诗稿或诗体不一致，本次未套用旧格式和读音选择。正文编辑不受影响。";
export const assistanceVariantIgnored = "已保存的格律格式不在当前规则中，已改用自动判断；有效读音选择仍保留。正文编辑不受影响。";
export const assistanceCandidateIgnored = "部分已保存的读音候选已不适用于当前规则或正文，已忽略这些选择，请重新确认。正文编辑不受影响。";
export interface RestoreReasons { legacy: number; invalid: number; stale: number; duplicate: number; excess: number }
export function describeRestoreReasons(reasons: RestoreReasons): string {
  const parts = [
    reasons.legacy ? `${reasons.legacy} 处旧版读音选择缺少原文定位信息` : "",
    reasons.invalid ? `${reasons.invalid} 处读音选择的内容格式无效` : "",
    reasons.stale ? `${reasons.stale} 处读音选择与当前原文不一致` : "",
    reasons.duplicate ? `${reasons.duplicate} 处读音选择的字位重复` : "",
    reasons.excess ? `${reasons.excess} 处读音选择超过数量上限` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join("；")}，已忽略这些选择，请重新确认。正文编辑不受影响。` : "";
}

// Editing needs only the four known genres, not a functioning rule service.
export const fallbackTemplates: TemplateSummary[] = (Object.keys(genreLabels) as WorkGenre[]).map((id) => ({
  id, name: genreLabels[id], shortName: genreLabels[id], lineCount: genreLineCounts[id],
  lineLength: id.startsWith("wu") ? 5 : 7, recommendedVariantId: "", variants: [],
}));

export function readTemplates(value: unknown): TemplateSummary[] {
  const parsed = listTemplatesResponseSchema.parse(value);
  return fallbackTemplates.map((fallback) => {
    const item = parsed.templates.find((template) => template.id === fallback.id);
    if (!item || item.lineCount !== fallback.lineCount || item.lineLength !== fallback.lineLength) throw new Error("invalid templates");
    return { ...item, id: fallback.id };
  });
}

export function restoreOverrides(values: unknown[], lines: string[]): { overrides: PoemReadingOverride[]; ignored: boolean; reasons: RestoreReasons } {
  const reasons: RestoreReasons = { legacy: 0, invalid: 0, stale: 0, duplicate: 0, excess: Math.max(0, values.length - 1000) };
  const overrides: PoemReadingOverride[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values.slice(0, 1000)) {
    const parsed = readingOverrideSchema.safeParse(value);
    if (!parsed.success) { reasons.invalid += 1; continue; }
    if (parsed.data.sourceText === undefined || parsed.data.sourceOffset === undefined) { reasons.legacy += 1; continue; }
    if (!matchesEditorAnchor(lines, parsed.data)) { reasons.stale += 1; continue; }
    const key = `${parsed.data.lineIndex}:${parsed.data.characterIndex}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    overrides.push(parsed.data);
  }
  const unique = overrides.filter((item) => !duplicates.has(`${item.lineIndex}:${item.characterIndex}`));
  reasons.duplicate = overrides.length - unique.length;
  return { overrides: unique, ignored: unique.length !== values.length, reasons };
}
