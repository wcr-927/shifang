import { useState } from 'react';
import type { ReadingExplanation as Entry, ReadingSource } from '../../shared/readingExplanation';
/** Only human-readable locations belong in the visible citation. */
function readableLocation(value:string):string{
 return value.split(/\s+[\/／]\s+/).filter(part=>!/(?:OEBPS|\.x?html?(?:#|$)|file:\/\/|\\|^\/)/i.test(part)).join(' · ');
}
export function ReadingExplanation({entry,sources,compact=false}:{entry:Entry;sources:ReadingSource[];compact?:boolean}):JSX.Element{
 const [expanded,setExpanded]=useState(false);
 if(entry.status==='unavailable'||!entry.senses.length)return <p className="explanation-unavailable">暂无释义资料</p>;
 return <div className="reading-explanation">
  {entry.senses.map(sense=><div className="explanation-sense" key={sense.id}>
   <p>{sense.meaning}</p>{!compact&&sense.usage!==sense.meaning?<p className="explanation-usage">{sense.usage}</p>:null}
  </div>)}
  <div className="explanation-footer"><button type="button" className="inline-action" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>例句与出处</button>{!compact&&entry.status==='partial'?<span>资料待补全</span>:null}</div>
  {expanded?<div className="explanation-evidence">{compact&&entry.status==='partial'?<p>资料待补全</p>:null}{entry.senses.map(sense=><div key={sense.id}>
   {compact&&sense.usage!==sense.meaning?<p className="explanation-usage">{sense.usage}</p>:null}
   {sense.examples.map((example,i)=>{const source=sources.find(s=>s.id===example.sourceId);return <div key={i}><blockquote>{example.text}</blockquote><p>{source?.title??'来源资料缺失'}{readableLocation(example.locator)?' · '+readableLocation(example.locator):''}</p></div>})}
   {!sense.examples.length?sense.sourceIds.map(id=><p key={id}>{sources.find(s=>s.id===id)?.title??'来源资料缺失'}</p>):null}
  </div>)}</div>:null}
 </div>;
}
