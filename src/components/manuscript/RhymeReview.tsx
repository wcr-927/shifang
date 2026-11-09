export interface RhymeReviewGroup {id:string;name:string;feet:Array<{line:number;offset?:number;character:string}>}
/** Neutral grouping: no rhyme family is chosen as the correct one here. */
export function RhymeReview({groups,onLocate,title='押韵不一致',segment,pending=false}:{groups:RhymeReviewGroup[];onLocate:(line:number,offset?:number)=>void;title?:string;segment?:string;pending?:boolean}){
 return <article className="review-issue review-rhyme-summary" aria-label={segment?`${segment}：${title}`:title}>
 <div className="review-issue-head"><span className={pending?'review-kind-pending':'review-kind-conflict'}>{title}</span>{segment?<span>{segment}</span>:null}</div>
 <div className="review-rhyme-groups">{groups.map(group=><div className="review-rhyme-group" key={group.id}><span>{group.name}</span><div>{group.feet.map(foot=><button type="button" key={foot.line} aria-label={`定位第${foot.line+1}句韵脚：${foot.character}`} title={`第${foot.line+1}句`} onClick={()=>onLocate(foot.line,foot.offset)}>{foot.character}</button>)}</div></div>)}</div>
 </article>;
}
