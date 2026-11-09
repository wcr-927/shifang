import type { AnalysisIssue, PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";
import type { CiIssue } from "../../ci/analyze";
import { isUnfinishedFeedback } from "./analysisFeedback";

/** Shared display envelope only; the two rule engines retain their own conclusions. */
export type ReviewKind="conflict"|"pending"|"uncovered"|"incomplete";
export const reviewLabels:Record<ReviewKind,string>={conflict:"确定冲突",pending:"待确认",uncovered:"未覆盖",incomplete:"未完成"};
export interface ReviewItem {kind:ReviewKind;message:string;line?:number;offset?:number;coordinateSpace:"normalized-character"|"source-utf16";source:{system:"metre"|"ci";rule:string}}
export function poemReviewItem(issue:AnalysisIssue,analysis:PoemAnalysis):ReviewItem {
  const unfinished=isUnfinishedFeedback(issue,analysis);
  return {kind:unfinished?"incomplete":["RULE_SCOPE_UNMODELED","UNSUPPORTED_INPUT","UNCLOSED_ANNOTATION"].includes(issue.code)?"uncovered":issue.severity==="error"?"conflict":"pending",
    message:issue.message,line:issue.lineIndex,offset:issue.characterIndex,coordinateSpace:"normalized-character",source:{system:"metre",rule:issue.code}};
}
export function ciReviewItem(issue:CiIssue):ReviewItem {
  return {kind:issue.kind,message:issue.message,line:issue.line,offset:issue.offset,coordinateSpace:"source-utf16",source:{system:"ci",rule:issue.kind}};
}
