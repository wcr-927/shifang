import { RhymeReview } from "./RhymeReview";
import { ciRhymeReviewGroups } from "../../features/editor/rhymeReviewGroups";
import type { CiAnalysis } from "../../ci/analyze";
import type { CiForm } from "../../ci/catalogue";
export function CiReview({form,analysis,body,onLocate,onPattern}:{form:CiForm;analysis:CiAnalysis;body:string;onLocate:(line:number,offset?:number)=>void;onPattern:()=>void}){
 const rhymeIssues=analysis.issues.filter(i=>i.code==="rhyme-group"||i.code==="rhyme-pending");
 const keys=[...new Set(form.lines.flatMap(l=>l.rhyme?[l.rhyme]:[]))];
 const issues=analysis.issues.filter(i=>!rhymeIssues.includes(i)&&(i.kind==="conflict"||i.kind==="pending")),limits=analysis.issues.filter(i=>i.kind==="uncovered"),lines=body.split("\n");
 return <div className="grammar-review">
 <div className="review-format"><span>{form.name} · {form.author}体</span><button className="review-source-link" onClick={onPattern}>原谱</button></div>
 <p className="review-reasons">{form.summary}</p>
 {rhymeIssues.map(issue=><RhymeReview key={issue.segment} groups={ciRhymeReviewGroups(analysis,issue.segment!)} segment={keys.length>1?`韵${['一','二','三','四'][keys.indexOf(issue.segment!)]??keys.indexOf(issue.segment!)+1}`:undefined} pending={issue.kind==='pending'} title={issue.kind==='pending'?'韵脚读音待核对':'押韵不一致'} onLocate={onLocate}/>)}
 {[...new Set(issues.map(i=>i.line))].map(line=><article className="review-issue" key={line}>
 <div className="review-issue-head"><span>第{line+1}句</span></div>
 <button className="review-locate review-excerpt" onClick={()=>onLocate(line,issues.find(i=>i.line===line)?.offset)}>{lines[line]||"未填"}</button>
 <div className="review-reasons">{issues.filter(i=>i.line===line).map((issue,i)=><p key={i}><button className={`review-source-link review-kind-${issue.kind}`} onClick={()=>onLocate(line,issue.offset)}>{issue.message}</button></p>)}</div>
 </article>)}
 {!issues.length&&!rhymeIssues.length?<p className="review-empty">{analysis.issues.some(i=>i.kind==="incomplete")?"尚未写完":"已检查部分暂无需要处理的问题"}</p>:null}
 {limits.length?<section className="review-limits"><h3>尚未检查的部分</h3>{limits.map((i,n)=><p key={n}><button className="review-source-link" onClick={()=>onLocate(i.line,i.offset)}>{i.message}</button></p>)}</section>:null}
 </div>
}
