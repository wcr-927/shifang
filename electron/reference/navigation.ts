import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseEpub } from './epub';
import type { TaskHooks } from './library';
import type { ParsedDocument } from './types';

import { REFERENCE_NAVIGATION_VERSION } from '../../src/shared/reference';
export const NAVIGATION_VERSION = REFERENCE_NAVIGATION_VERSION;
export const navigationSchema = `
CREATE TABLE IF NOT EXISTS navigation_versions(source_id TEXT PRIMARY KEY,version TEXT NOT NULL,generation TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS navigation_nodes(source_id TEXT NOT NULL,generation TEXT NOT NULL,id TEXT NOT NULL,parent_id TEXT,ordinal INTEGER NOT NULL,label TEXT NOT NULL,original_label TEXT NOT NULL,document_id TEXT NOT NULL,anchor TEXT NOT NULL,block_id TEXT NOT NULL,kind TEXT NOT NULL,first_line TEXT NOT NULL,path TEXT NOT NULL,start_order INTEGER NOT NULL,end_order INTEGER NOT NULL,pending INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(source_id,generation,id));
CREATE INDEX IF NOT EXISTS navigation_parent ON navigation_nodes(source_id,generation,parent_id,ordinal);
CREATE INDEX IF NOT EXISTS navigation_position ON navigation_nodes(source_id,generation,start_order,end_order);
`;
type Row = Record<string, any>;
const normalize = (text: string) => text.replace(/\s+/gu, '');
const order = (document: number, block: number) => document * 1_000_000 + block;
// Only this edition's explicitly verified note marker is simplified. Numeric brackets
// elsewhere may be part of a real title and must not be stripped by a generic rule.
const cleanTitle = (text: string) => text.trim() === '早发白帝城[1]' ? '早发白帝城' : text.trim();

/** Build a private generation. Publishing changes one pointer; no text/position tables are rewritten. */
export async function rebuildNavigation(db: Database.Database, sourceId: string, original: string, hooks: TaskHooks): Promise<void> {
  const source = db.prepare('SELECT * FROM sources WHERE id=?').get(sourceId) as Row | undefined;
  if (!source) throw new Error('资料不存在');
  if ((db.prepare('SELECT version FROM navigation_versions WHERE source_id=?').get(sourceId) as Row | undefined)?.version === NAVIGATION_VERSION) return;
  const generation = randomUUID();
  const docs = db.prepare('SELECT id,ordinal FROM documents WHERE source_id=? ORDER BY ordinal').all(sourceId) as Row[];
  const docOrders = new Map(docs.map(doc => [doc.id, doc.ordinal]));
  const originals = db.prepare('SELECT * FROM toc WHERE source_id=? ORDER BY ordinal').all(sourceId) as Row[];
  const rawById = new Map(originals.map(node => [node.id, node]));
  const target = (documentId: string, anchor: string) => (anchor ? db.prepare('SELECT block_id AS id,ordinal FROM anchors WHERE source_id=? AND document_id=? AND anchor=?').get(sourceId, documentId, anchor) : undefined) as Row | undefined;
  const first = db.prepare('SELECT id,ordinal FROM blocks WHERE source_id=? AND document_id=? ORDER BY ordinal LIMIT 1');
  const nodes: Row[] = originals.map(raw => {
    const block = target(raw.document_id, raw.anchor) ?? first.get(sourceId, raw.document_id) as Row | undefined;
    const path: string[] = []; let current: Row | undefined = raw;
    while (current) { path.unshift(current.label); current = rawById.get(current.parent_id); }
    return { ...raw, original_label: raw.label, label: raw.label, block_id: block?.id ?? '', kind: 'section', first_line: '', path: path.join(' / '), start_order: order(docOrders.get(raw.document_id) ?? 0, block?.ordinal ?? 0), end_order: Number.MAX_SAFE_INTEGER, pending: 0 };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, Row[]>(); for (const node of nodes) { const list = children.get(node.parent_id) ?? []; list.push(node); children.set(node.parent_id, list); }
  const evidence = new Map<string, { text: string; role?: string; author?:string; title?:string; kind: string; ordinal: number }[]>();
  // This profile is deliberately limited to the confirmed literary dictionary structure.
  const literary = /鉴赏辞典/u.test(`${source.title} ${source.creator}`);
  let published = false;
  try {
    if (literary) await parseEpub(original, { check: hooks.check, yield: () => new Promise(resolve => setImmediate(resolve)), skipImages: true, progress: (_phase, done, total) => hooks.progress?.('核对原书结构', done, total), document: (document: ParsedDocument) => {
      hooks.check();
      if (!docOrders.has(document.id)) throw new Error('原书与已存正文文件不一致，保留旧目录');
      const proof: {text:string;role?:string;author?:string;title?:string;kind:string;ordinal:number}[] = [];
      // Only structural evidence is retained, not the full parsed documents or images.
      for (const block of document.blocks) {
        const role = block.nodes[0]?.role;
        if (role || /^h[12]$/u.test(block.kind) || /【作者小传】/u.test(block.text)) proof.push({text:block.text,role,author:block.author,title:block.title,kind:block.kind,ordinal:block.index});
      }
      evidence.set(document.id, proof);
    } });
    const authors = literary ? nodes.filter(node => {
      const name = normalize(node.label);
      if (!node.parent_id || !/^[\p{Script=Han}·]{2,8}$/u.test(name)) return false;
      // Era/volume nodes can contain a generic biography marker too. Authors sit
      // immediately above works, not above another populated author hierarchy.
      const signedDescendant=nodes.some(child=>isDescendant(child,node.id)&&(evidence.get(child.document_id)??[]).some(b=>b.role==='signature'&&normalize(b.text)===name||b.author&&normalize(b.author)===name));
      if (!signedDescendant&&(children.get(node.id) ?? []).some(child => (children.get(child.id)?.length ?? 0) > 0)) return false;
      const heading = evidence.get(node.document_id)?.find(block => /^h[12]$/u.test(block.kind) && normalize(block.text) === name);
      if (!heading || /(?:鉴赏|目录|序|册|时代|朝代)/u.test(name)) return false;
      const next = db.prepare('SELECT text FROM blocks WHERE source_id=? AND document_id=? AND ordinal>? ORDER BY ordinal LIMIT 1').get(sourceId,node.document_id,heading.ordinal) as Row | undefined;
      if (!next || !signedDescendant&&!/^(?:【作者小传】|[（(]?(?:\d{3,4}|生卒))/u.test(next.text.trim())) return false;
      node.kind = 'author'; node.start_order = order(docOrders.get(node.document_id)!, heading.ordinal); return true;
    }).sort((a,b) => a.start_order - b.start_order) : [];
    for (let index = 0; index < authors.length; index++) {
      hooks.check(); const author = authors[index];
      const ancestorIds = new Set<string>(); let ancestor = rawById.get(author.parent_id); while (ancestor) { ancestorIds.add(ancestor.id); ancestor = rawById.get(ancestor.parent_id); }
      const nextBoundary = nodes.filter(node => node.start_order > author.start_order && node.kind !== 'work' && !ancestorIds.has(node.id) && !isDescendant(node, author.id)).reduce((minimum, node) => Math.min(minimum, node.start_order), Number.MAX_SAFE_INTEGER);
      author.end_order = Math.min(authors[index + 1]?.start_order ?? Number.MAX_SAFE_INTEGER, nextBoundary);
      const existing = children.get(author.id) ?? [];
      for (const work of existing) { work.kind = 'work'; work.end_order = author.end_order; }
      if (!existing.length) {
        let generated = 0;
        for (const doc of docs) {
          if (order(doc.ordinal + 1, 0) <= author.start_order || order(doc.ordinal, 0) >= author.end_order) continue;
          const blocks = evidence.get(doc.id) ?? [];
          for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i], position = order(doc.ordinal, block.ordinal);
            if (position < author.start_order || position >= author.end_order || block.role !== 'work-title') continue;
            const signature = blocks.slice(i + 1, i + 4).find(item => item.role === 'signature');
            if (!signature || normalize(signature.text) !== normalize(author.label)) continue;
            const stored = db.prepare('SELECT id,text FROM blocks WHERE source_id=? AND document_id=? AND ordinal=?').get(sourceId, doc.id, block.ordinal) as Row | undefined;
            if (!stored || stored.text !== block.text) throw new Error('诗题与既有正文块不一致，保留旧目录');
            const work = { source_id:sourceId, id:`${author.id}:work:${doc.id}:${block.ordinal}`, parent_id:author.id, ordinal:author.ordinal + (++generated)/100000, label:cleanTitle(block.text), original_label:block.text, document_id:doc.id, anchor:'', block_id:stored.id, kind:'work', first_line:'', path:`${author.path} / ${cleanTitle(block.text)}`, start_order:position, end_order:author.end_order, pending:0 };
            nodes.push(work); byId.set(work.id,work); existing.push(work);
          }
        }
        author.pending = existing.length ? 0 : 1;
      }
      existing.sort((a,b) => a.start_order - b.start_order);
      const titleCounts = new Map<string, number>(); for (const work of existing) titleCounts.set(work.label, (titleCounts.get(work.label) ?? 0) + 1);
      for (let i=0; i<existing.length; i++) {
        const work=existing[i]; work.end_order=Math.min(existing[i+1]?.start_order??author.end_order,author.end_order);
        const own=(evidence.get(work.document_id)??[]).filter(block=>order(docOrders.get(work.document_id)!,block.ordinal)>work.start_order && order(docOrders.get(work.document_id)!,block.ordinal)<work.end_order);
        const commentary=own.findIndex(block=>block.role==='commentary');
        const opening=commentary<0?own:own.slice(0,commentary);
        const verse=opening.find(block=>block.role==='verse') ?? opening.filter(block=>block.role==='verse-candidate').at(-1);
        if(verse) work.first_line=verse.text.trim().slice(0,40);
        if((titleCounts.get(work.label)??0)>1 && work.first_line)work.label=`${work.label} · ${work.first_line.slice(0,18)}`;
      }
      const firstWork = existing[0]?.start_order ?? author.end_order;
      let biography = evidence.get(author.document_id)?.find(block => /【作者小传】/u.test(block.text) && order(docOrders.get(author.document_id)!,block.ordinal)>author.start_order && order(docOrders.get(author.document_id)!,block.ordinal)<firstWork);
      if (!biography) {
        const next = db.prepare('SELECT ordinal,text FROM blocks WHERE source_id=? AND document_id=? AND ordinal>? ORDER BY ordinal LIMIT 1').get(sourceId,author.document_id,author.start_order-docOrders.get(author.document_id)!*1000000) as Row|undefined;
        if(next && /^(?:[（(]?(?:\d{3,4}|生卒))/u.test(next.text.trim()))biography={ordinal:next.ordinal,text:next.text,kind:'p'};
      }
      const biographyContent=biography?db.prepare('SELECT text,kind FROM blocks WHERE source_id=? AND document_id=? AND ordinal>=? ORDER BY ordinal LIMIT 1').get(sourceId,author.document_id,biography.ordinal+(/【作者小传】/u.test(biography.text)?1:0)) as Row|undefined:undefined;
      if (biography && biographyContent && biographyContent.kind==='p' && biographyContent.text.trim().length>0 && order(docOrders.get(author.document_id)!,biography.ordinal)<firstWork) {
        const block=db.prepare('SELECT id FROM blocks WHERE source_id=? AND document_id=? AND ordinal=?').get(sourceId,author.document_id,biography.ordinal) as Row;
        nodes.push({...author,id:`${author.id}:intro`,parent_id:author.id,ordinal:author.ordinal-.01,label:'作者介绍',original_label:'作者介绍',block_id:block.id,anchor:'',kind:'intro',start_order:order(docOrders.get(author.document_id)!,biography.ordinal),end_order:firstWork,pending:0});
      }
      hooks.progress?.('补齐诗人与篇目',index+1,authors.length); await new Promise<void>(resolve=>setImmediate(resolve));
    }
    const insert=db.prepare('INSERT INTO navigation_nodes(source_id,generation,id,parent_id,ordinal,label,original_label,document_id,anchor,block_id,kind,first_line,path,start_order,end_order,pending) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<nodes.length;i+=128){ hooks.check(); db.transaction(()=>{for(const node of nodes.slice(i,i+128))insert.run(sourceId,generation,node.id,node.parent_id,node.ordinal,node.label,node.original_label,node.document_id,node.anchor,node.block_id,node.kind,node.first_line,node.path,node.start_order,node.end_order,node.pending);})(); await new Promise<void>(resolve=>setImmediate(resolve)); }
    hooks.check();
    const invalid=db.prepare(`SELECT count(*) AS count FROM navigation_nodes n LEFT JOIN documents d ON d.source_id=n.source_id AND d.id=n.document_id LEFT JOIN blocks b ON b.source_id=n.source_id AND b.document_id=n.document_id AND b.id=n.block_id WHERE n.source_id=? AND n.generation=? AND (d.id IS NULL OR (n.block_id<>'' AND b.id IS NULL) OR (n.block_id='' AND n.kind<>'section'))`).get(sourceId,generation) as Row;
    if(invalid.count || nodes.length<originals.length)throw new Error('阅读目录目标校验失败，保留旧目录');
    // The source tree is a subset with unchanged IDs, including every duplicate native entry.
    for(const raw of originals)if(!byId.has(raw.id))throw new Error('原目录节点缺失');
    db.transaction(()=>{hooks.check();db.prepare('INSERT INTO navigation_versions VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET version=excluded.version,generation=excluded.generation').run(sourceId,NAVIGATION_VERSION,generation);})();published=true;
    db.prepare('DELETE FROM navigation_nodes WHERE source_id=? AND generation<>?').run(sourceId,generation);
  } finally { if(!published)db.prepare('DELETE FROM navigation_nodes WHERE source_id=? AND generation=?').run(sourceId,generation); }
  function isDescendant(node:Row,id:string):boolean { let current=byId.get(node.parent_id);while(current){if(current.id===id)return true;current=byId.get(current.parent_id);}return false; }
}
