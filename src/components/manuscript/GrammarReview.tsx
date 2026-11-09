import { RhymeReview } from "./RhymeReview";
import { metreRhymeReviewGroups } from "../../features/editor/rhymeReviewGroups";
import { reviewReason } from "./reviewReasons";
import type { PoemAnalysis } from "../../poetry/analysis/poemAnalyzer";
import { splitAnalysisFeedback } from "../editor/analysisFeedback";
import { poemReviewItem } from "../editor/reviewPresentation";

export function GrammarReview({analysis,loading,error,onLocate}:{analysis:PoemAnalysis|null;loading:boolean;error:string;onLocate:(line:number,index?:number)=>void}) {
 if(error)return <p role="alert">{error}</p>;
 if(loading||!analysis)return <p className="review-empty" role="status">{loading?"正在读取校对":"落笔后查看格律"}</p>;
 const {attention,progress}=splitAnalysisFeedback(analysis);
 const limits=attention.filter(issue=>poemReviewItem(issue,analysis).kind==="uncovered");
 const rhymeIssues=attention.filter(issue=>["RHYME_GROUP","RHYME_CANDIDATES_DISJOINT"].includes(issue.code));
 const items=attention.filter(issue=>!rhymeIssues.includes(issue)&&poemReviewItem(issue,analysis).kind!=="uncovered").sort((a,b)=>(a.lineIndex??-1)-(b.lineIndex??-1));
 const labels:Record<string,string>={FIRST_LINE_BORROW:"首句借韵待确认",RULE_PRECONDITION_UNRESOLVED:"变格条件待确认",TONE_MISMATCH:"平仄不符",READING_UNRESOLVED:"读音待确认",RHYME_GROUP:"押韵不一致",RHYME_CANDIDATES_DISJOINT:"押韵不一致",RHYME_TONE:"韵脚声调不符",RHYME_UNRESOLVED:"韵脚待确认",DUI_MISMATCH:"失对",NIAN_MISMATCH:"失粘",ISOLATED_PING:"孤平",POSSIBLE_ISOLATED_PING:"孤平待核对",TRIPLE_PING_TAIL:"三平尾",POSSIBLE_TRIPLE_PING_TAIL:"三平尾待核对",LINE_LENGTH:"句长不符",LINE_COUNT:"句数不符",RULE_SCOPE_UNMODELED:"规则未覆盖",UNSUPPORTED_INPUT:"内容未校对",UNCLOSED_ANNOTATION:"注释未闭合"};
 return <div className="grammar-review">
 <div className="review-format"><span>{analysis.templateName}</span><span>{analysis.variantName}</span></div>
 {rhymeIssues.length?<RhymeReview groups={metreRhymeReviewGroups(analysis)} pending={!rhymeIssues.some(i=>i.severity==="error")} title={rhymeIssues.some(i=>i.severity==="error")?"押韵不一致":"韵脚读音待核对"} onLocate={onLocate}/>:null}
 {[...new Set(items.map(issue=>issue.lineIndex))].map((lineIndex)=>{
 const group=items.filter(issue=>issue.lineIndex===lineIndex),line=analysis.lines.find(l=>l.lineIndex===lineIndex);
 const target=(issue:typeof group[number])=>issue.characterIndex??(issue.code.startsWith("RHYME")?line?.characters.at(-1)?.characterIndex:undefined);
 return <article className="review-issue" key={lineIndex??"whole"}>
 <div className="review-issue-head"><div className="review-issue-labels">{group.map((issue,i)=>{
 const kind=poemReviewItem(issue,analysis).kind,label=labels[issue.code]??"需要核对";
 return lineIndex!==undefined?<button key={i} type="button" className={`review-locate review-issue-label review-kind-${kind}`} aria-label={`定位第${lineIndex+1}句：${label}`} onClick={()=>onLocate(lineIndex,target(issue))}>{label}</button>:<span key={i} className={`review-kind-${kind}`}>{label}</span>;
 })}</div>{line?<span>第{line.lineIndex+1}句</span>:null}</div>
 {line?<button className="review-locate review-excerpt" type="button" onClick={()=>onLocate(line.lineIndex,target(group[0]))}>{line.text}</button>:null}
 <div className="review-reasons">{[...new Set(group.map(issue=>reviewReason(issue,analysis)))].map((reason,i)=><p key={i}>{reason}</p>)}</div>
 </article>;
 })}
 {!items.length&&!rhymeIssues.length?<p className="review-empty">{progress.length?"尚未写完":"已检查部分暂无需要处理的问题"}</p>:null}
 {limits.length?<section className="review-limits"><h3>尚未检查的部分</h3>{limits.map((issue,i)=><p key={i}>{reviewReason(issue,analysis)}</p>)}</section>:null}
 </div>;
}
