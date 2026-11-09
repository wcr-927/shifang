import {homePoems,HOME_POEM_SOURCE} from "../../src/shared/homePoems";
import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {EpubArchive,parseChapter} from './epub';
import {publicNode} from './library';
import type {ParsedBlock} from './types';
import type {ReadingShelfItem,ReadingIndexPage,ReadingPiece,ReadingPieceBlock,readingIndexRequest,readingPieceRequest} from '../../src/shared/reading';
import type {ReferenceTocNode} from '../../src/shared/reference';
import type {z} from 'zod';
type Row=Record<string,any>;
const node=(r:Row):ReferenceTocNode=>({id:r.id,parentId:r.parent_id,label:r.label,documentId:r.document_id,anchor:r.anchor??'',blockId:r.block_id,hasChildren:false,kind:r.kind,firstLine:r.first_line,originalLabel:r.original_label,path:r.path});
function generation(db:Database.Database,sourceId:string){return (db.prepare('SELECT generation FROM navigation_versions WHERE source_id=?').get(sourceId) as Row|undefined)?.generation as string|undefined;}
function scopeSql(rootId?:string|null){return rootId?' AND id IN (WITH RECURSIVE branch(id) AS (SELECT id FROM navigation_nodes WHERE source_id=? AND generation=? AND id=? UNION ALL SELECT n.id FROM branch b CROSS JOIN navigation_nodes n INDEXED BY navigation_parent ON n.parent_id=b.id WHERE n.source_id=? AND n.generation=?) SELECT id FROM branch)':'';}
function scopeArgs(sourceId:string,gen:string,rootId?:string|null){return rootId?[sourceId,gen,rootId,sourceId,gen]:[];}
export function readingShelf(db:Database.Database):ReadingShelfItem[]{
 const books=db.prepare('SELECT s.*,v.version,v.generation FROM sources s LEFT JOIN navigation_versions v ON v.source_id=s.id ORDER BY s.imported_at,s.id').all() as Row[];
 return books.flatMap(book=>{const roots=book.generation?db.prepare('SELECT * FROM navigation_nodes WHERE source_id=? AND generation=? AND parent_id IS NULL ORDER BY ordinal').all(book.id,book.generation) as Row[]:[];const parts=roots.filter(r=>/^(唐诗|宋词|元曲|古文)鉴赏辞典/u.test(r.label));return parts.length>=2?parts.map(p=>({id:`${book.id}:${p.id}`,sourceId:book.id,rootId:p.id,title:p.label.replace(/[（(].*$/u,''),creator:book.creator,navigationVersion:book.version})):[{id:book.id,sourceId:book.id,rootId:null,title:book.title,creator:book.creator,navigationVersion:book.version}];});
}
export function readingIndex(db:Database.Database,r:z.output<typeof readingIndexRequest>):ReadingIndexPage{
 const gen=generation(db,r.sourceId);if(!gen)return{nodes:[],nextOffset:null,total:0};
 const predicate=r.authorId?" AND parent_id=? AND kind IN ('work','intro')":" AND kind='author'";
 const args=[r.sourceId,gen,...(r.authorId?[r.authorId]:[]),...scopeArgs(r.sourceId,gen,r.rootId)];
 const where='source_id=? AND generation=?'+predicate+scopeSql(r.rootId);
 const total=(db.prepare(`SELECT COUNT(*) n FROM navigation_nodes WHERE ${where}`).get(...args) as Row).n;
 const rows=db.prepare(`SELECT * FROM navigation_nodes WHERE ${where} ORDER BY ordinal,id LIMIT ? OFFSET ?`).all(...args,r.limit+1,r.offset) as Row[];
 return{nodes:rows.slice(0,r.limit).map(node),total,nextOffset:rows.length>r.limit?r.offset+r.limit:null};
}
export class ReadingPieces{
 private roles=new Map<string,Map<string,ParsedBlock & {role?:string} >>();
 constructor(private db:Database.Database,private directory:string){}
 private async rolesFor(sourceId:string,doc:string){
  const key=sourceId+':'+doc,old=this.roles.get(key);if(old)return old;
  const archive=await EpubArchive.open(join(this.directory,'sources',sourceId,'original.epub'));
  try{const documents=new Set((this.db.prepare('SELECT id FROM documents WHERE source_id=?').all(sourceId) as Row[]).map(d=>String(d.id)));const knownImages=new Set((this.db.prepare('SELECT id FROM images WHERE source_id=?').all(sourceId) as Row[]).map(i=>i.id));const images=new Map<string,string>();for(const path of archive.entries.keys()){const id=createHash('sha256').update(path).digest('hex');if(knownImages.has(id))images.set(path,id);}
   const parsed=parseChapter(await archive.text(doc),doc,documents,images),result=new Map(parsed.blocks.map(b=>[b.id,{...b,role:b.nodes[0]?.role}]));this.roles.set(key,result);while(this.roles.size>6)this.roles.delete(this.roles.keys().next().value!);return result;
  }finally{archive.close();}
 }
 async get(r:z.output<typeof readingPieceRequest>):Promise<ReadingPiece>{
  if(r.sourceId===HOME_POEM_SOURCE){const p=homePoems.find(p=>p.id===r.nodeId);if(!p)throw new Error('未找到篇目');const texts=[p.title,...(p.preface?[p.preface]:[]),...p.lines];const blocks:ReadingPieceBlock[]=texts.map((text,i)=>({id:p.id+':'+i,documentId:p.id,section:i===0?'title':p.preface&&i===1?'notes':'poem',text,anchors:[],node:{type:'p',children:[{type:'text',text}]}}));return{sourceId:r.sourceId,node:{id:p.id,parentId:null,label:p.title,documentId:p.id,anchor:'',hasChildren:false,kind:'work'},author:p.author,blocks:blocks.slice(r.offset,r.offset+r.limit),offset:r.offset,nextOffset:blocks.length>r.offset+r.limit?r.offset+r.limit:null,previousId:null,nextId:null};}
  const gen=generation(this.db,r.sourceId);if(!gen)throw new Error('请先整理这本书的阅读目录');
  const own=this.db.prepare(`SELECT * FROM navigation_nodes WHERE source_id=? AND generation=? AND id=?${scopeSql(r.rootId)}`).get(r.sourceId,gen,r.nodeId,...scopeArgs(r.sourceId,gen,r.rootId)) as Row|undefined;
  if(!own)throw new Error('未找到篇目');if(!['work','intro'].includes(own.kind))throw new Error('此目录项请使用原书章节阅读');
  const parent=this.db.prepare('SELECT * FROM navigation_nodes WHERE source_id=? AND generation=? AND id=?').get(r.sourceId,gen,own.parent_id) as Row|undefined;
  const all=this.db.prepare('SELECT b.*,d.ordinal AS document_order FROM blocks b JOIN documents d ON d.source_id=b.source_id AND d.id=b.document_id WHERE b.source_id=? AND d.ordinal*1000000+b.ordinal>=? AND d.ordinal*1000000+b.ordinal<? ORDER BY d.ordinal,b.ordinal LIMIT ?').all(r.sourceId,own.start_order,own.end_order,r.offset+r.limit+1) as Row[];
  // Bound cumulative scans to a chapter-sized request; callers cannot request unbounded offsets.
  const roles=new Map<string,Map<string,ParsedBlock & {role?:string} >>();for(const doc of new Set(all.map(b=>String(b.document_id)))){try{roles.set(doc,await this.rolesFor(r.sourceId,doc));}catch{roles.set(doc,new Map());}}
  let originalEnded=own.kind==='intro';let displayAuthor=parent?.kind==='author'?parent.label:'';
  const blocks:ReadingPieceBlock[]=all.slice(0,r.offset+r.limit).map(b=>{
   const proof=roles.get(b.document_id)?.get(b.id),role=proof&&proof.text===b.text?proof.role:undefined;
   let section:ReadingPieceBlock['section']='body';
   if(b.document_order*1000000+b.ordinal===own.start_order){section='title';if(proof?.author)displayAuthor=proof.author.replace(/\s+/gu,'');}
   else if(role==='signature'&&!originalEnded){section='signature';displayAuthor=b.text.replace(/\s+/gu,'');}
   else if(role==='notes'||JSON.parse(b.anchors).some((a:string)=>/^(?:FT|note_\d)/u.test(a))||/^(?:〔注〕|【注释】|\[注\]|注释[：:]|［注］)/u.test(b.text.trim())){section='notes';originalEnded=true;}
   else if(role==='verse'||role==='work-title'||!originalEnded&&role==='verse-candidate')section='poem';
   else {if(section==='body'&&b.text.trim())originalEnded=true;}
   return{id:b.id,documentId:b.document_id,text:section==='title'&&proof?.title?proof.title:b.text,anchors:JSON.parse(b.anchors),node:proof&&proof.text===b.text&&proof.nodes[0]?publicNode(proof.nodes[0]):JSON.parse(b.nodes),section};
  });
  const neighbor=(direction:'previous'|'next')=>{const before=direction==='previous';return (this.db.prepare(`SELECT id FROM navigation_nodes WHERE source_id=? AND generation=? AND kind='work' AND start_order ${before?'<':'>'} ?${scopeSql(r.rootId)} ORDER BY start_order ${before?'DESC':'ASC'},id LIMIT 1`).get(r.sourceId,gen,own.start_order,...scopeArgs(r.sourceId,gen,r.rootId)) as Row|undefined)?.id??null;};
  return{sourceId:r.sourceId,node:node(own),author:displayAuthor,blocks:blocks.slice(r.offset),offset:r.offset,nextOffset:all.length>r.offset+r.limit?r.offset+r.limit:null,previousId:neighbor('previous'),nextId:neighbor('next')};
 }
}
