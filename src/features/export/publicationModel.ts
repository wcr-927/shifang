import type { PublicationDocument, PublicationOptions, PublicationWork } from '../../shared/publication';
export interface PublicationPage{kind:'cover'|'toc'|'body';height:number;title:string;workId?:string;verse?:boolean;text:string;rows:string[];fontSize:number;lineHeight:number;continued?:boolean;entries?:{title:string;page:number}[];number:number}
export function publicationSnapshot(title:string,collection:boolean,works:PublicationWork[]):PublicationDocument{
 if(!works.length)throw Error('没有可导出的作品。');
 if(works.length>100||works.reduce((n,w)=>n+w.body.length,0)>200000)throw Error('本次内容过多，请拆分文集后导出。');
 return{title:title.trim()||'未题',collection,works:works.map(w=>({id:w.id,title:w.title.trim()||'未题',body:w.body,genre:w.genre,category:w.category,sections:w.sections?[...w.sections]:undefined}))};
}
// Every row owns its exact source substring, including newlines. Pagination never rewrites a manuscript.
export function wrapPublicationText(text:string,width:number,measure:(s:string)=>number):string[]{
 const rows:string[]=[];let row='';
 const segments=new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text);
 for(const {segment:c} of segments){if(c==='\n'||c==='\r\n'){rows.push(row+c);row='';continue;}if(row&&measure(row+c)>width){rows.push(row);row=c;}else row+=c;}
 if(row||!rows.length)rows.push(row);return rows;
}
export function paginatePublication(doc:PublicationDocument,options:PublicationOptions,measure:(text:string,size:number,role?:"title"|"verse")=>number):PublicationPage[]{
 const height=doc.collection?764:doc.works[0].body.length<=60&&/^(?:wu|qi)(?:jue|lv)$/.test(doc.works[0].genre)?540:doc.works[0].body.length<=140?675:764;
 const pages:PublicationPage[]=[],starts:{title:string;page:number}[]=[];
 const bodyPages:PublicationPage[]=[];
 for(const work of doc.works){
  const size=doc.collection||work.body.length>140?18:work.genre==='free'?20:22,lineHeight=size*(doc.collection?1.85:2.05);
  const verse=work.genre!=='free'||work.category==='ancient'||work.category==='modern';
  const measureBody=(text:string)=>measure(text,size,verse?'verse':undefined);
  let rows=wrapPublicationText(work.body,392,measureBody);
  if(/^(?:wu|qi)(?:jue|lv)$/.test(work.genre)&&rows.length%2===0&&rows.every(r=>r.trim().length>0)){
   const pairs:string[]=[];let fits=true;for(let i=0;i<rows.length;i+=2){const pair=rows[i]+rows[i+1];if(measureBody(pair.replace(/\r?\n$/u,'').replace(/\r?\n/gu,'　'))>392){fits=false;break;}pairs.push(pair);}if(fits)rows=pairs;
  }
  if(work.genre==='ci'){
   const sourceLines=work.body.match(/[^\n]*\n|[^\n]+$/gu)??[''];
   const ends=new Set<number>();let total=0;for(const section of work.sections??[]){total+=section;ends.add(total);}
   const packed:string[]=[];let pending='';
   sourceLines.forEach((line,index)=>{const candidate=pending+line;const visible=candidate.replace(/\r?\n$/u,'').replace(/\r?\n/gu,'　');if(pending&&measureBody(visible)>392){packed.push(pending);pending='';}if(measureBody(line.trimEnd())>392){if(pending){packed.push(pending);pending='';}packed.push(...wrapPublicationText(line,392,measureBody));}else pending+=line;
    if(!line.trim()||ends.has(index+1)&&index+1<sourceLines.length){if(pending)packed.push(pending);packed.push('');pending='';}
   });if(pending)packed.push(pending);rows=packed;
  }
  const titleRows=options.showTitle?wrapPublicationText(work.title,400,t=>measure(t,26,"title")).length:0;
  const titleHeight=titleRows*42.9+(titleRows?44:0);
  if(titleHeight>height-152-58-lineHeight)throw Error('题名过长，请缩短题名后导出。');
  const capacity=Math.max(1,Math.floor((height-152-titleHeight-58)/lineHeight));
  starts.push({title:work.title,page:bodyPages.length});
  for(let i=0;i<rows.length;i+=capacity){const chunk=rows.slice(i,i+capacity);bodyPages.push({height,kind:'body',verse,title:work.title,workId:work.id,text:chunk.join(''),rows:chunk,fontSize:size,lineHeight,continued:i>0,number:0});}
 }
 if(doc.collection){
  pages.push({height,kind:'cover',title:doc.title,text:'',rows:[],fontSize:18,lineHeight:33,number:0});
  // Directory rows use measured title height; page offsets converge in one pass because page-number width is reserved.
  const groups:typeof starts[]=[];let group:typeof starts=[],usedHeight=0;
  for(const item of starts){const h=Math.max(1,wrapPublicationText(item.title,340,t=>measure(t,18,"title")).length)*29+20;if(h>470)throw Error('文集篇名过长，无法排入目录。');if(group.length&&usedHeight+h>470){groups.push(group);group=[];usedHeight=0;}group.push(item);usedHeight+=h;}if(group.length)groups.push(group);
  for(const entries of groups)pages.push({height,kind:'toc',title:'目录',text:'',rows:[],fontSize:18,lineHeight:29,entries:entries.map(e=>({title:e.title,page:1+groups.length+e.page+1})),number:0});
 }
 pages.push(...bodyPages);if(pages.length>200)throw Error('排版超过200页，请分批导出。');pages.forEach((p,i)=>p.number=i+1);return pages;
}
