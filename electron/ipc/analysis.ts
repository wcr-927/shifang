import { handleTrusted } from "../security.js";
import { analyzePoemRequestSchema } from "../../src/shared/ipc.js";
import type { AnalysisService } from "../services/AnalysisService.js";

export function registerAnalysisHandlers(analysisService: AnalysisService): void {
  handleTrusted("analysis:analyze-poem", (_event, rawRequest: unknown) => {
    const request = analyzePoemRequestSchema.parse(rawRequest);
    return analysisService.analyze(request);
  });
}
