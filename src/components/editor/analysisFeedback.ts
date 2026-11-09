import type { AnalysisIssue, LineAnalysis, PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";

/** Presentation categories only: keep every original issue, message and rule result intact. */
export function isUnfinishedLineIssue(issue: AnalysisIssue, line?: LineAnalysis): boolean {
  return issue.code === "LINE_LENGTH" && !!line && line.actualLength < line.expectedLength;
}
export function isUnfinishedFeedback(issue: AnalysisIssue, analysis: PoemAnalysis): boolean {
  const line = analysis.lines.find(item => item.lineIndex === issue.lineIndex);
  return isUnfinishedLineIssue(issue,line) ||
    (issue.code === "LINE_COUNT" && analysis.summary.actualLineCount < analysis.summary.expectedLineCount) ||
    (issue.code === "RHYME_UNRESOLVED" && issue.lineIndex !== undefined && analysis.rhyme.missingLineIndexes.includes(issue.lineIndex));
}
export function splitAnalysisFeedback(analysis: PoemAnalysis): { attention: AnalysisIssue[]; progress: AnalysisIssue[] } {
  const progress: AnalysisIssue[] = [], attention: AnalysisIssue[] = [];
  for (const issue of analysis.issues) (isUnfinishedFeedback(issue,analysis) ? progress : attention).push(issue);
  const priority = { error: 0, warning: 1, info: 2 };
  attention.sort((a,b) => priority[a.severity] - priority[b.severity]);
  return { attention, progress };
}
