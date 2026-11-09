import { analyzePoem, type PoemAnalysis } from "../../src/poetry/analysis/poemAnalyzer.ts";
import type { AnalyzePoemRequest } from "../../src/shared/ipc.ts";
import type { RuleService } from "./RuleService.ts";

export class AnalysisService {
  private readonly ruleService: RuleService;

  constructor(ruleService: RuleService) {
    this.ruleService = ruleService;
  }

  analyze(request: AnalyzePoemRequest): PoemAnalysis & { requestId: string; datasetVersions: Record<string, string> } {
    const rules = this.ruleService.load();
    const result = analyzePoem(request.text, rules.metre, rules.pingze, rules.readingRules, {
      templateId: request.templateId,
      firstLineRhyme: request.firstLineRhyme ?? "strict",
      variantId: request.variantId,
      overrides: request.overrides,
      editorLines: request.editorLines,
    });
    return { ...result, requestId: request.requestId, datasetVersions: rules.datasetVersions };
  }
}
