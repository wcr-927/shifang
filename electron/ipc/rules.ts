import { handleTrusted } from "../security.js";
import { readingCandidatesRequestSchema } from "../../src/shared/ipc.js";
import type { RuleService } from "../services/RuleService.js";

export function registerRuleHandlers(ruleService: RuleService): void {
  handleTrusted("rules:list-templates", () => {
    const rules = ruleService.load();
    return {
      datasetVersion: rules.datasetVersions.metre,
      templates: rules.metre.templates.map((template) => ({
        id: template.id,
        name: template.name,
        shortName: template.shortName,
        lineCount: template.lineCount,
        lineLength: template.lineLength,
        recommendedVariantId: template.recommendedVariantId,
        variants: template.variants.map((variant) => ({ id: variant.id, name: variant.name, style: variant.style })),
      })),
    };
  });

  handleTrusted("rules:get-reading-candidates", (_event, rawRequest: unknown) => {
    const request = readingCandidatesRequestSchema.parse(rawRequest);
    const entry = ruleService.load().pingze.characters[request.character];
    return { character: request.character, candidates: entry?.candidates ?? [] };
  });
}
