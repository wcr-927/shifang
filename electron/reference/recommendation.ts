import type Database from 'better-sqlite3';
import { homePoems } from '../../src/shared/homePoems';
import { readingShelf } from './reading';
type Entry = {id:string; label:string; first_line:string|null};
const letters=(s:string)=>s.replace(/\[[^\]]*\]|[^\p{Script=Han}]/gu,'').replace(/[馀餘]/gu,'余').replace(/鴈/gu,'雁').replace(/谿/gu,'溪').replace(/沈/gu,'沉');

export function recommendationTarget(db:Database.Database, id:string) {
  const poem=homePoems.find(p=>p.id===id);
  if(!poem)return null;
  const opening=letters(poem.lines.join(''));
  const title=letters(poem.title.split('·')[0]);
  const books=readingShelf(db).filter(b=>/鉴赏[辞词]典/u.test(b.title));
  for(const source of new Set(books.map(b=>b.sourceId))){
    const rows=db.prepare(`SELECT w.id,w.label,w.first_line FROM navigation_versions v
      JOIN navigation_nodes a ON a.source_id=v.source_id AND a.generation=v.generation
      JOIN navigation_nodes w INDEXED BY navigation_parent ON w.source_id=a.source_id AND w.generation=a.generation AND w.parent_id=a.id
      WHERE v.source_id=? AND a.kind='author' AND w.kind='work'
      AND replace(replace(a.label,'馀','余'),'餘','余')=?`).all(source,letters(poem.author)) as Entry[];
    // Titles and tune names recur. Require agreement with the verse, allowing minor edition variants.
    const matches=rows.map(row=>{
      const first=letters(row.first_line??'').slice(0,14);
      if(first.length<5)return {row,score:0};
      const same=Array.from(first).filter((c,i)=>opening[i]===c).length;
      const exact=opening.startsWith(first);
      const sameTitle=letters(row.label.split('·')[0])===title;
      const sameCoupletStart=first.length>=12 && first.slice(0,7)===opening.slice(0,7) && same>=10;
      const score=exact || sameCoupletStart || (first.length>=9 && same>=first.length-2) || (sameTitle && same>=5 && same>=first.length-3) ? same+(sameTitle?1:0) : 0;
      return {row,score};
    }).filter(m=>m.score>0).sort((a,b)=>b.score-a.score);
    if(matches.length && matches[0].score!==matches[1]?.score){
      const id=matches[0].row.id;
      const ancestors=db.prepare(`WITH RECURSIVE chain(id,parent_id,generation) AS (
        SELECT n.id,n.parent_id,n.generation FROM navigation_nodes n JOIN navigation_versions v USING(source_id,generation)
        WHERE n.source_id=? AND n.id=? UNION ALL
        SELECT n.id,n.parent_id,n.generation FROM navigation_nodes n JOIN chain c ON n.id=c.parent_id AND n.generation=c.generation
        WHERE n.source_id=?) SELECT id FROM chain`).all(source,id,source) as {id:string}[];
      const book=books.find(b=>b.sourceId===source && (!b.rootId||ancestors.some(n=>n.id===b.rootId)));
      if(book)return {bookId:book.id,sourceId:source,nodeId:id,title:poem.title};
    }
  }
  return null;
}
