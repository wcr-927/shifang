import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm, stat, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { z } from 'zod';
import type { ReferenceBook, ReferenceChapterPage, ReferenceNode, ReferencePosition, ReferenceSearchPage, ReferenceTocPage, referenceChapterSchema, referenceSearchSchema, referenceTocSchema } from '../../src/shared/reference';
import { navigationSchema, rebuildNavigation } from './navigation';
import type { ReferenceTocNode, ReferenceTocPath, ReferenceTocSearchPage, referenceTocPathSchema, referenceTocSearchSchema } from '../../src/shared/reference';
import { parseEpub } from './epub';
import type { ParsedDocument, SafeNode } from './types';

export const IMPORTER_VERSION = 'epub-safe-1';
export { ReferenceCancelledError } from './task';
export const yieldTask = () => new Promise<void>(resolve => setImmediate(resolve));
export interface TaskHooks { check(): void; progress?(phase:string,completed:number,total:number): void; }
const schema = `
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, title TEXT NOT NULL, creator TEXT NOT NULL, publisher TEXT NOT NULL, description TEXT NOT NULL, imported_at TEXT NOT NULL, chapter_count INTEGER NOT NULL, toc_count INTEGER NOT NULL, warnings TEXT NOT NULL, importer TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents(source_id TEXT NOT NULL, id TEXT NOT NULL, ordinal INTEGER NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL, context TEXT NOT NULL, PRIMARY KEY(source_id,id));
CREATE TABLE IF NOT EXISTS blocks(row_id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, document_id TEXT NOT NULL, id TEXT NOT NULL, ordinal INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, nodes TEXT NOT NULL, anchors TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS blocks_id ON blocks(source_id,id);
CREATE INDEX IF NOT EXISTS blocks_source_row ON blocks(source_id,row_id);
CREATE INDEX IF NOT EXISTS blocks_document ON blocks(source_id,document_id,ordinal);
CREATE TABLE IF NOT EXISTS anchors(source_id TEXT NOT NULL, document_id TEXT NOT NULL, anchor TEXT NOT NULL, block_id TEXT NOT NULL, ordinal INTEGER NOT NULL, PRIMARY KEY(source_id,document_id,anchor));
CREATE TABLE IF NOT EXISTS toc(source_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, ordinal INTEGER NOT NULL, label TEXT NOT NULL, document_id TEXT NOT NULL, anchor TEXT NOT NULL, PRIMARY KEY(source_id,id));
CREATE INDEX IF NOT EXISTS toc_parent ON toc(source_id,parent_id,ordinal);
CREATE TABLE IF NOT EXISTS images(source_id TEXT NOT NULL,id TEXT NOT NULL,mime TEXT NOT NULL,PRIMARY KEY(source_id,id));
CREATE TABLE IF NOT EXISTS positions(source_id TEXT PRIMARY KEY,document_id TEXT NOT NULL,block_id TEXT NOT NULL,scroll_top REAL NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS block_fts USING fts5(text, tokenize='trigram');
PRAGMA user_version=1;
`;
type Row = Record<string, any>;
const asBook = (row: Row): ReferenceBook => ({ id: row.id, hash: row.hash, title: row.title, creator: row.creator, publisher: row.publisher, chapterCount: row.chapter_count, tocCount: row.toc_count, importedAt: row.imported_at, warnings: JSON.parse(row.warnings), navigationVersion: row.navigation_version });
const safeTypes = new Set(['p','h1','h2','h3','h4','h5','h6','strong','em','sup','sub','br','ul','ol','li','table','tr','td','th','blockquote','pre','code','a','span','thead','tbody','tfoot','caption','dl','dt','dd','figure','figcaption']);
export function publicNode(node: SafeNode): ReferenceNode {
  if (node.type === 'text') return { type: 'text', text: node.text ?? '' };
  if (node.type === 'image') return { type: 'img', imageId: node.imageId, alt: node.alt };
  const aliases: Record<string,string> = { b:'strong',i:'em',div:'p',section:'p',hr:'br' };
  const tag = aliases[node.tag ?? ''] ?? node.tag ?? 'span';
  const result: ReferenceNode = { type: (safeTypes.has(tag) ? tag : 'span') as ReferenceNode['type'], children: (node.children ?? []).map(publicNode) };
  if (node.target) result.target = { documentId: node.target.documentId, anchor: node.target.anchor ?? '' };
  return result;
}
export class ReferenceLibrary {
  readonly db: Database.Database;
  constructor(readonly directory: string) {
    this.db = new Database(join(directory, 'reference.sqlite')); this.db.pragma('journal_mode = WAL'); this.db.pragma('busy_timeout = 5000'); this.db.exec(schema); this.db.exec(navigationSchema);
  }
  close(): void { this.db.close(); }
  listSources(): ReferenceBook[] { return (this.db.prepare('SELECT s.*,n.version AS navigation_version FROM sources s LEFT JOIN navigation_versions n ON n.source_id=s.id ORDER BY s.imported_at,s.id').all() as Row[]).map(asBook); }
  async importFile(path: string, hooks: TaskHooks): Promise<{book:ReferenceBook;duplicate:boolean}> {
    hooks.check(); const file = await stat(path); if (!file.isFile() || file.size > 128*1024*1024) throw new Error('请选择体积不超过128MB的EPUB文件');
    const staging = join(this.directory, `.import-${randomUUID()}`); await mkdir(staging, { recursive:true }); const epubPath = join(staging,'original.epub'); let temporary: Database.Database | undefined; let destination: string | undefined; let published = false;
    try {
      await copyFile(path,epubPath); hooks.check(); const handle = await open(epubPath,'r'); const hash = createHash('sha256');
      try { const buffer = Buffer.alloc(1024*1024); for (;;) { const read = await handle.read(buffer,0,buffer.length,null); if (!read.bytesRead) break; hash.update(buffer.subarray(0,read.bytesRead)); hooks.check(); await yieldTask(); } } finally { await handle.close(); }
      const fingerprint = hash.digest('hex'); const existing = this.db.prepare('SELECT * FROM sources WHERE hash=?').get(fingerprint) as Row|undefined; if (existing) return {book:asBook(existing),duplicate:true};
      const sourceId = fingerprint; temporary = new Database(join(staging,'staged.sqlite')); temporary.exec(schema);
      const insertDoc = temporary.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)'); const insertBlock = temporary.prepare('INSERT INTO blocks(source_id,document_id,id,ordinal,kind,text,nodes,anchors) VALUES(?,?,?,?,?,?,?,?)'); const insertAnchor = temporary.prepare('INSERT OR IGNORE INTO anchors VALUES(?,?,?,?,?)'); const insertFts = temporary.prepare('INSERT INTO block_fts(rowid,text) VALUES(?,?)');
      let chapterCount = 0;
      const insertDocument = temporary.transaction((document:ParsedDocument) => {
        insertDoc.run(sourceId,document.id,document.order,document.title,document.author,document.context);
        for (const block of document.blocks) {
          const nodes = block.nodes.length === 1 ? publicNode(block.nodes[0]) : {type:'p',children:block.nodes.map(publicNode)};
          const row = insertBlock.run(sourceId,document.id,block.id,block.index,block.kind,block.text,JSON.stringify(nodes),JSON.stringify(block.anchors)); insertFts.run(row.lastInsertRowid,block.text);
          for (const anchor of block.anchors) insertAnchor.run(sourceId,document.id,anchor,block.id,block.index);
        }
        chapterCount++;
      });
      const book = await parseEpub(epubPath,{ check:hooks.check, yield:yieldTask, progress:hooks.progress, document:insertDocument });
      const insertToc = temporary.prepare('INSERT INTO toc VALUES(?,?,?,?,?,?,?)'); temporary.transaction(() => { for (const node of book.toc) insertToc.run(sourceId,node.id,node.parentId,node.order,node.label,node.documentId,node.anchor ?? ''); })();
      await mkdir(join(staging,'images')); const insertImage = temporary.prepare('INSERT INTO images VALUES(?,?,?)');
      for (const image of book.images) { hooks.check(); await writeFile(join(staging,'images',image.id),image.bytes); insertImage.run(sourceId,image.id,image.mediaType); }
      const warnings = ['电子载本；目录及正文位置不等于核实的纸本页码。']; if (book.skippedFonts) warnings.push(`跳过${book.skippedFonts}个受保护字体资源，沿用应用字体。`);
      if (book.title.includes('诗词格律') && book.creator.includes('王力')) warnings.push('载本包含增补附录；附表与网络转录不均属于王力原著。');
      temporary.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(sourceId,fingerprint,book.title,book.creator,book.publisher,book.description,new Date().toISOString(),chapterCount,book.toc.length,JSON.stringify(warnings),IMPORTER_VERSION);
      if ((temporary.pragma('integrity_check',{simple:true})) !== 'ok') throw new Error('资料索引校验失败');
      hooks.check(); hooks.progress?.('发布索引',chapterCount,chapterCount); temporary.close(); temporary = undefined;
      // Assets are private until the database transaction registers their source. Failure removes them.
      await mkdir(join(this.directory,'sources'),{recursive:true}); destination = join(this.directory,'sources',sourceId);
      await rm(destination,{recursive:true,force:true}); await rename(staging,destination); hooks.check();
      this.db.prepare('ATTACH DATABASE ? AS staged').run(join(destination,'staged.sqlite'));
      try {
        this.db.transaction(() => {
          hooks.check(); this.db.exec('INSERT INTO sources SELECT * FROM staged.sources; INSERT INTO documents SELECT * FROM staged.documents; INSERT INTO toc SELECT * FROM staged.toc; INSERT INTO anchors SELECT * FROM staged.anchors; INSERT INTO images SELECT * FROM staged.images;');
          this.db.exec('INSERT INTO blocks(source_id,document_id,id,ordinal,kind,text,nodes,anchors) SELECT source_id,document_id,id,ordinal,kind,text,nodes,anchors FROM staged.blocks ORDER BY row_id;');
          this.db.prepare('INSERT INTO block_fts(rowid,text) SELECT row_id,text FROM blocks WHERE source_id=?').run(sourceId);
        })(); published = true;
      } finally { this.db.exec('DETACH DATABASE staged'); }
      await rm(join(destination,'staged.sqlite'),{force:true}); return {book:asBook(this.db.prepare('SELECT * FROM sources WHERE id=?').get(sourceId) as Row),duplicate:false};
    } finally { temporary?.close(); if (!published) { await rm(staging,{recursive:true,force:true}); if (destination) await rm(destination,{recursive:true,force:true}); } }
  }
  async rebuildNavigation(sourceId:string,hooks:TaskHooks):Promise<void> { await rebuildNavigation(this.db,sourceId,join(this.directory,'sources',sourceId,'original.epub'),hooks); }
  private navigation(sourceId:string,mode?:string):{table:string;args:unknown[];predicate:string} {
    const current=mode!=='original' ? this.db.prepare('SELECT generation FROM navigation_versions WHERE source_id=?').get(sourceId) as Row|undefined : undefined;
    return current?{table:'navigation_nodes',args:[sourceId,current.generation],predicate:'source_id=? AND generation=?'}:{table:'toc',args:[sourceId],predicate:'source_id=?'};
  }
  private tocNode(row:Row, hasChildren:boolean):ReferenceTocNode {
    return {id:row.id,parentId:row.parent_id,label:row.label,documentId:row.document_id,anchor:row.anchor,hasChildren,order:row.ordinal, ...(row.block_id?{blockId:row.block_id}:{}), ...(row.kind?{kind:row.kind,firstLine:row.first_line,originalLabel:row.original_label,path:row.path,pending:!!row.pending}:{})};
  }
  getToc(request:z.output<typeof referenceTocSchema>):ReferenceTocPage {
    // Pointer, nodes and ancestor pages must come from one SQLite snapshot.
    return this.db.transaction(() => this.readTocSnapshot(request)).deferred();
  }
  private readTocSnapshot(request:z.output<typeof referenceTocSchema>):ReferenceTocPage {
    const selection=this.navigation(request.sourceId,request.mode),{table,args,predicate}=selection;
    let parent=request.parentId??null;
    if(!parent && request.mode!=='original') {
      const roots=this.db.prepare(`SELECT * FROM ${table} WHERE ${predicate} AND parent_id IS NULL ORDER BY ordinal LIMIT 2`).all(...args) as Row[];
      const title=(this.db.prepare('SELECT title FROM sources WHERE id=?').get(request.sourceId) as Row|undefined)?.title??'';
      if(roots.length===1 && (roots[0].label===title || /文学鉴赏辞典/u.test(roots[0].label)) && this.db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} AND parent_id=? LIMIT 1`).get(...args,roots[0].id))parent=roots[0].id;
    }
    const rows=this.db.prepare(`SELECT * FROM ${table} WHERE ${predicate} AND parent_id IS ? ORDER BY ordinal LIMIT ? OFFSET ?`).all(...args,parent,request.limit+1,request.offset) as Row[];
    return {nodes:rows.slice(0,request.limit).map(row=>this.tocNode(row,!!this.db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} AND parent_id=? LIMIT 1`).get(...args,row.id))),nextOffset:rows.length>request.limit?request.offset+request.limit:null};
  }
  getTocPath(request:z.output<typeof referenceTocPathSchema>):ReferenceTocPath {
    // Pointer, nodes and ancestor pages must come from one SQLite snapshot.
    return this.db.transaction(() => this.readTocPathSnapshot(request)).deferred();
  }
  private readTocPathSnapshot(request:z.output<typeof referenceTocPathSchema>):ReferenceTocPath {
    const {table,args,predicate}=this.navigation(request.sourceId,request.mode);
    const doc=this.db.prepare('SELECT ordinal FROM documents WHERE source_id=? AND id=?').get(request.sourceId,request.documentId) as Row|undefined;
    if(!doc)return {nodes:[],currentId:null};
    const block=request.blockId?this.db.prepare('SELECT ordinal FROM blocks WHERE source_id=? AND document_id=? AND id=?').get(request.sourceId,request.documentId,request.blockId) as Row|undefined:undefined;
    const point=doc.ordinal*1000000+(block?.ordinal??0);
    let row:Row|undefined;
    if(table==='navigation_nodes')row=this.db.prepare(`SELECT * FROM ${table} WHERE ${predicate} AND start_order<=? AND end_order>? AND kind IN ('work','intro','author') ORDER BY start_order DESC,CASE kind WHEN 'work' THEN 0 WHEN 'intro' THEN 1 ELSE 2 END LIMIT 1`).get(...args,point,point) as Row|undefined;
    if(table==='navigation_nodes'&&!row)row=this.db.prepare(`SELECT * FROM navigation_nodes WHERE ${predicate} AND start_order<=? ORDER BY start_order DESC,ordinal DESC LIMIT 1`).get(...args,point) as Row|undefined;
    if(table==='toc')row=(this.db.prepare(`SELECT t.*,d.ordinal AS doc_ordinal,COALESCE(a.ordinal,0) AS block_ordinal FROM toc t JOIN documents d ON d.source_id=t.source_id AND d.id=t.document_id LEFT JOIN anchors a ON a.source_id=t.source_id AND a.document_id=t.document_id AND a.anchor=t.anchor WHERE t.source_id=? AND d.ordinal*1000000+COALESCE(a.ordinal,0)<=? ORDER BY d.ordinal DESC,COALESCE(a.ordinal,0) DESC,t.ordinal DESC LIMIT 1`).get(request.sourceId,point) as Row|undefined);
    const currentId=row?.id??null,nodes:ReferenceTocNode[]=[];
    while(row){ const node=this.tocNode(row,!!this.db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} AND parent_id=? LIMIT 1`).get(...args,row.id));
      const siblings=this.db.prepare(`SELECT id FROM ${table} WHERE ${predicate} AND parent_id IS ? ORDER BY ordinal`).all(...args,row.parent_id) as Row[];
      node.pageOffset=Math.floor(siblings.findIndex(item=>item.id===row!.id)/128)*128;nodes.unshift(node);
      row=row.parent_id?this.db.prepare(`SELECT * FROM ${table} WHERE ${predicate} AND id=?`).get(...args,row.parent_id) as Row|undefined:undefined;
    }
    return {nodes,currentId};
  }
  getTocSearch(request:z.output<typeof referenceTocSearchSchema>):ReferenceTocSearchPage {
    // Pointer, nodes and ancestor pages must come from one SQLite snapshot.
    return this.db.transaction(() => this.readTocSearchSnapshot(request)).deferred();
  }
  private readTocSearchSnapshot(request:z.output<typeof referenceTocSearchSchema>):ReferenceTocSearchPage {
    const {table,args,predicate}=this.navigation(request.sourceId,request.mode);
    if(!request.query.trim())return {nodes:[],nextOffset:null};
    const literary=table==='navigation_nodes' && !!this.db.prepare(`SELECT 1 FROM navigation_nodes WHERE ${predicate} AND kind IN ('author','work') LIMIT 1`).get(...args);
    const filter=literary?"kind IN ('author','work') AND (instr(original_label,?)>0 OR instr(path,?)>0)":table==='navigation_nodes'?"instr(original_label,?)>0":"instr(label,?)>0";
    const rows=this.db.prepare(`SELECT * FROM ${table} WHERE ${predicate} AND ${filter} ORDER BY ordinal LIMIT ? OFFSET ?`).all(...args,request.query,...(literary?[request.query]:[]),request.limit+1,request.offset) as Row[];
    return {nodes:rows.slice(0,request.limit).map(row=>this.tocNode(row,!!this.db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} AND parent_id=? LIMIT 1`).get(...args,row.id))),nextOffset:rows.length>request.limit?request.offset+request.limit:null};
  }
  getChapter(request:z.output<typeof referenceChapterSchema>):ReferenceChapterPage {
    const doc = this.db.prepare('SELECT * FROM documents WHERE source_id=? AND id=?').get(request.sourceId,request.documentId) as Row|undefined; if (!doc) throw new Error('资料章节不存在');
    const target = request.anchor ? this.db.prepare('SELECT block_id,ordinal FROM anchors WHERE source_id=? AND document_id=? AND anchor=?').get(request.sourceId,request.documentId,request.anchor) as Row|undefined : request.blockId ? this.db.prepare('SELECT id AS block_id,ordinal FROM blocks WHERE source_id=? AND document_id=? AND id=?').get(request.sourceId,request.documentId,request.blockId) as Row|undefined : undefined;
    const offset = target ? Math.floor(target.ordinal/request.limit)*request.limit : request.offset;
    const total = (this.db.prepare('SELECT count(*) AS count FROM blocks WHERE source_id=? AND document_id=?').get(request.sourceId,request.documentId) as Row).count;
    const rows = this.db.prepare('SELECT * FROM blocks WHERE source_id=? AND document_id=? ORDER BY ordinal LIMIT ? OFFSET ?').all(request.sourceId,request.documentId,request.limit,offset) as Row[];
    const previous = this.db.prepare('SELECT id FROM documents WHERE source_id=? AND ordinal<? ORDER BY ordinal DESC LIMIT 1').get(request.sourceId,doc.ordinal) as Row|undefined;
    const next = this.db.prepare('SELECT id FROM documents WHERE source_id=? AND ordinal>? ORDER BY ordinal LIMIT 1').get(request.sourceId,doc.ordinal) as Row|undefined;
    return {sourceId:request.sourceId,documentId:doc.id,title:doc.title,offset,totalBlocks:total,nextOffset:offset+rows.length<total?offset+rows.length:null,previousId:previous?.id??null,nextId:next?.id??null,blocks:rows.map(row=>({id:row.id,anchors:JSON.parse(row.anchors),text:row.text,node:JSON.parse(row.nodes)})),...(target?{targetBlockId:target.block_id}:{})};
  }
  async search(request:z.output<typeof referenceSearchSchema>, hooks:TaskHooks):Promise<ReferenceSearchPage> {
    const query = request.query; hooks.check(); if (!query.trim()) return {requestId:request.requestId,items:[],nextOffset:null};
    const items: ReferenceSearchPage['items'] = []; const targets=new Set<string>(); let seen = 0; const limit = request.limit;
    const add = (row:Row, text:string, blockId:string, id:string) => {
      const key=`${row.source_id}:${row.document_id}:${blockId}`;if(targets.has(key))return;targets.add(key);
      if (seen++ < request.offset) return;
      const start = text.indexOf(query); const left = Math.max(0,start-42); const preview = text.slice(left,left+180);
      items.push({id,sourceId:row.source_id,documentId:row.document_id,blockId,title:row.title??row.label??'',context:row.context??'',preview,previewStart:left,matchStart:Math.max(0,start),matchEnd:start<0?0:start+query.length});
    };
    const sourceFilter = request.sourceId ? ' AND source_id=?' : ''; const sourceArgs = request.sourceId ? [request.sourceId] : [];
    if (request.scope !== 'text') {
      const catalogue = this.db.prepare(`SELECT * FROM toc WHERE instr(label,?)>0${sourceFilter} ORDER BY source_id,ordinal`).iterate(query,...sourceArgs) as Iterable<Row>;
      let count = 0;
      for (const row of catalogue) {
        hooks.check(); const target = row.anchor ? this.db.prepare('SELECT block_id FROM anchors WHERE source_id=? AND document_id=? AND anchor=?').get(row.source_id,row.document_id,row.anchor) as Row|undefined : undefined;
        const first = this.db.prepare('SELECT id FROM blocks WHERE source_id=? AND document_id=? ORDER BY ordinal LIMIT 1').get(row.source_id,row.document_id) as Row|undefined;
        const blockId=target?.block_id??first?.id??''; const block=this.db.prepare('SELECT text FROM blocks WHERE source_id=? AND id=?').get(row.source_id,blockId) as Row|undefined; add(row,block?.text.includes(query)?block.text:row.label,blockId,`${row.source_id}:${row.id}`); if(!block?.text.includes(query) && items.length) { const hit=items.at(-1)!; if(hit.id===`${row.source_id}:${row.id}`){hit.matchStart=0;hit.matchEnd=0;} } if (items.length>limit) break; if (++count%128===0) await yieldTask();
      }
      if (items.length<=limit) {
        const headings = this.db.prepare(`SELECT b.row_id,b.source_id,b.document_id,b.id,b.ordinal,b.text,d.title,d.context FROM blocks b JOIN documents d ON d.source_id=b.source_id AND d.id=b.document_id WHERE b.kind IN ('h1','h2','h3','h4','h5','h6') AND instr(b.text,?)>0${request.sourceId?' AND b.source_id=?':''} ORDER BY b.source_id,d.ordinal,b.ordinal`).iterate(query,...sourceArgs) as Iterable<Row>;
        for (const row of headings) { hooks.check(); add(row,row.text,row.id,`${row.source_id}:${row.id}:heading`); if (items.length>limit) break; if (++count%128===0) await yieldTask(); }
      }
    }
    if (items.length<=limit && request.scope !== 'catalogue') {
      const long = Array.from(query).length>=3;
      const phrase = `"${query.replaceAll('"','""')}"`;
      // MATCH never interprets user syntax: a quoted phrase is narrowed again with instr.
      const sql = long ? `SELECT b.row_id,b.source_id,b.document_id,b.id,b.ordinal,b.text,d.title,d.context FROM block_fts f JOIN blocks b ON b.row_id=f.rowid JOIN documents d ON d.source_id=b.source_id AND d.id=b.document_id WHERE block_fts MATCH ? AND instr(b.text,?)>0${request.sourceId?' AND b.source_id=?':''} ORDER BY b.source_id,d.ordinal,b.ordinal` : `SELECT b.row_id,b.source_id,b.document_id,b.id,b.ordinal,b.text,d.title,d.context FROM blocks b ${request.sourceId?'INDEXED BY blocks_source_row':'NOT INDEXED'} JOIN documents d ON d.source_id=b.source_id AND d.id=b.document_id WHERE b.row_id>?${request.sourceId?' AND b.source_id=?':''} ORDER BY b.row_id LIMIT 512`;
      if (long) {
        const rows = this.db.prepare(sql).iterate(phrase,query,...sourceArgs) as Iterable<Row>; let count=0;
        for (const row of rows) { hooks.check(); add(row,row.text,row.id,`${row.source_id}:${row.id}`); if (items.length>limit) break; if (++count%128===0) await yieldTask(); }
      } else {
        const statement = this.db.prepare(sql); let cursor=0; const total = (this.db.prepare('SELECT max(row_id) AS count FROM blocks').get() as Row).count??0;
        for (;;) {
          hooks.check(); const rows=statement.all(cursor,...sourceArgs) as Row[]; if (!rows.length) break;
          for (const row of rows) { cursor=row.row_id; if (row.text.includes(query)) add(row,row.text,row.id,`${row.source_id}:${row.id}`); if (items.length>limit) break; }
          if (items.length>limit) break; hooks.progress?.('检索',cursor,total); await yieldTask();
        }
      }
    }
    hooks.check(); return {requestId:request.requestId,items:items.slice(0,limit),nextOffset:items.length>limit?request.offset+limit:null};
  }
  async getImage(sourceId:string,imageId:string):Promise<{dataUrl:string}> {
    const row=this.db.prepare('SELECT mime FROM images WHERE source_id=? AND id=?').get(sourceId,imageId) as Row|undefined; if (!row || !/^[a-f\d]{64}$/u.test(sourceId) || !/^[a-f\d]{64}$/u.test(imageId)) throw new Error('资料图片不存在');
    const handle=await open(join(this.directory,'sources',sourceId,'images',imageId),'r'); try { const data=await handle.readFile(); return {dataUrl:`data:${row.mime};base64,${data.toString('base64')}`}; } finally { await handle.close(); }
  }
  resolve(request:{sourceId:string;internalPath:string}):{documentId:string;anchor:string}|null {
    const [path,rawAnchor]=request.internalPath.split('#',2); const anchor=rawAnchor?decodeURIComponent(rawAnchor):'';
    const rows=this.db.prepare('SELECT id FROM documents WHERE source_id=?').all(request.sourceId) as Row[]; const match=rows.find(row=>row.id===path)??rows.find(row=>row.id.endsWith('/'+path));
    return match?{documentId:match.id,anchor}:null;
  }
  getPosition(sourceId:string):ReferencePosition|null { const row=this.db.prepare('SELECT * FROM positions WHERE source_id=?').get(sourceId) as Row|undefined; return row?{sourceId:row.source_id,documentId:row.document_id,blockId:row.block_id,scrollTop:row.scroll_top}:null; }
  savePosition(position:ReferencePosition):void {
    if (!this.db.prepare('SELECT 1 FROM documents WHERE source_id=? AND id=?').get(position.sourceId,position.documentId)) throw new Error('资料位置无效');
    if (position.blockId && !this.db.prepare('SELECT 1 FROM blocks WHERE source_id=? AND document_id=? AND id=?').get(position.sourceId,position.documentId,position.blockId)) throw new Error('资料块位置无效');
    this.db.prepare('INSERT INTO positions VALUES(?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET document_id=excluded.document_id,block_id=excluded.block_id,scroll_top=excluded.scroll_top').run(position.sourceId,position.documentId,position.blockId,position.scrollTop);
  }
}
