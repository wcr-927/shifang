import {readingNotesQuerySchema,type ReadingNotesPage,type ReadingNotesOverview,readingNoteSchema,createReadingNoteSchema,type ReadingNote} from "../../../src/shared/reading.js";
import type {z} from "zod";
import {collectionNameSchema,type LibraryOverview} from "../../../src/shared/collections.js";
import { pruneAutomaticHistory } from "../historyRetention.js";
import { workAssistanceStateSchema, emptyAssistance, type WorkAssistanceState } from "../../../src/shared/assistanceState.js";
import { queryWorksRequestSchema, type QueryWorksRequest, type QueryWorksResponse, type WorkSummary } from "../../../src/shared/workSummary.js";
import metadata from "../../../src/ci/metadata.json";
const ciForm = (id: string) => metadata.forms.find(form => form.id === id);
import type { CiState } from "../../../src/ci/schema.js";
import type { SaveCiWorkRequest } from "../../../src/shared/ipc.js";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { DocumentGenre, WorkRoom, FreeCategory, WorkGenre, WorkStatus, CollectionRecord, WorkRecord, WorkAnalysisState } from "../../../src/shared/work.js";

import { assertWorkProfile, roomOf, categoryOf } from "../../../src/shared/work.js";
import type { SaveFreeWorkRequest } from "../../../src/shared/ipc.js";

import { snapshotSchema, versionSchema, validateBackup, type CompleteBackup, type WorkVersion, type WorkSnapshot } from "../../../src/shared/recovery.js";

export const AUTOSAVE_VERSION_INTERVAL = 5 * 60 * 1000;
export type VersionReason = "manual_save" | "autosave" | "status_change";
// Match String.trim's WhiteSpace/LineTerminator set inside SQLite, before the
// bounded substring. This is display-only: the stored source is never trimmed.
const PREVIEW_LEADING_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export interface CreateWorkInput {
  assistance?: WorkAssistanceState;
  ci?: CiState;
  room?: WorkRoom;
  category?: FreeCategory;
  title?: string;
  body?: string;
  genre: DocumentGenre;
  collectionId?: string | null;
  location?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateWorkInput {
  assistance?: WorkAssistanceState;
  ci?: CiState;
  room?: WorkRoom;
  category?: FreeCategory;
  title?: string;
  body?: string;
  genre?: DocumentGenre;
  status?: WorkStatus;
  collectionId?: string | null;
  location?: string;
  notes?: string;
  tags?: string[];
  rhymeGroupId?: string | null;
}

export interface SaveEditorStateInput {
  assistance?: WorkAssistanceState;
  workId: string;
  title: string;
  body: string;
  genre: WorkGenre;
  status: WorkStatus;
  collectionId: string | null;
  location: string;
  notes: string;
  rhymeGroupId: string | null;
  tags: string[];
  templateId: WorkGenre;
  variantId: string | null;
  readingOverrides: unknown[];
  ruleDatasetVersions: Record<string, string>;
}

function now(): string {
  return new Date().toISOString();
}

function mapWork(row: Record<string, unknown>, tags: string[]): WorkRecord {
  return {
    id: String(row.id),
    collectionPosition:Number(row.collection_position??0),
    collectionId: row.collection_id ? String(row.collection_id) : null,
    title: String(row.title),
    body: String(row.body),
    genre: row.genre as DocumentGenre,
    ...(row.ci_json ? {ci:JSON.parse(String(row.ci_json))} : {}),
    room: (row.room ?? "poetry") as WorkRoom,
    category: (row.category ?? "unclassified") as FreeCategory,
    status: row.status as WorkStatus,
    location: String(row.location),
    notes: String(row.notes),
    rhymeGroupId: row.rhyme_group_id ? String(row.rhyme_group_id) : null,
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  } as WorkRecord;
}

export class WorkRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private getAssistance(id: string): WorkAssistanceState {
    const row = this.db.prepare("SELECT state_json FROM work_assistance_state WHERE work_id=?").get(id) as {state_json:string} | undefined;
    return row ? workAssistanceStateSchema.parse(JSON.parse(row.state_json)) : emptyAssistance();
  }

  private writeAssistance(id: string, state: WorkAssistanceState | undefined): void {
    if (state === undefined) return;
    const valid = workAssistanceStateSchema.parse(state);
    this.db.prepare("INSERT INTO work_assistance_state(work_id,state_json,updated_at) VALUES (?,?,?) ON CONFLICT(work_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
      .run(id, JSON.stringify(valid), now());
  }

  createCollection(name: string, description = ""): CollectionRecord {
    name=collectionNameSchema.parse(name);
    if(this.db.prepare("SELECT 1 FROM collections WHERE name=?").get(name))throw new Error("已有同名文集");
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare("INSERT INTO collections(id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, name, description, timestamp, timestamp);
    return { id, name, description, createdAt: timestamp, updatedAt: timestamp };
  }

  libraryOverview():LibraryOverview {
    return this.db.transaction(()=>({collections:(this.db.prepare("SELECT c.*,COUNT(w.id) AS count FROM collections c LEFT JOIN works w ON w.collection_id=c.id AND w.status!='archived' GROUP BY c.id ORDER BY c.created_at,c.id").all() as Record<string,unknown>[]).map(r=>({id:String(r.id),name:String(r.name),description:String(r.description),createdAt:String(r.created_at),updatedAt:String(r.updated_at),count:Number(r.count)})),...(this.db.prepare("SELECT COUNT(CASE WHEN status!='archived' THEN 1 END) AS 'all',COUNT(CASE WHEN status!='archived' AND collection_id IS NULL THEN 1 END) AS uncollected,COUNT(CASE WHEN status='archived' THEN 1 END) AS archived FROM works").get() as {all:number;uncollected:number;archived:number})}))();
  }
  renameCollection(id:string,name:string):void {
    name=collectionNameSchema.parse(name);
    if(this.db.prepare("SELECT 1 FROM collections WHERE name=? AND id!=?").get(name,id))throw new Error("已有同名文集");
    if(!this.db.prepare("UPDATE collections SET name=?,updated_at=? WHERE id=?").run(name,now(),id).changes)throw new Error("未找到文集");
  }
  removeCollection(id:string):void {
    this.db.transaction(()=>{
      if(!this.db.prepare("SELECT 1 FROM collections WHERE id=?").get(id))throw new Error("未找到文集");
      this.db.prepare("UPDATE works SET collection_id=NULL,collection_position=0 WHERE collection_id=?").run(id);
      this.db.prepare("UPDATE work_versions SET snapshot_json=json_set(snapshot_json,'$.work.collectionId',NULL,'$.work.collectionPosition',0) WHERE json_extract(snapshot_json,'$.work.collectionId')=?").run(id);
      this.db.prepare("DELETE FROM collections WHERE id=?").run(id);
    })();
  }
  moveToCollection(id:string,collectionId:string|null):void {
    this.db.transaction(()=>{if(collectionId&&!this.db.prepare("SELECT 1 FROM collections WHERE id=?").get(collectionId))throw new Error("未找到文集");this.updateWork(id,{collectionId});this.saveVersion(id,"manual_save");})();
  }
  reorderCollectionWork(id:string,direction:'up'|'down'):void {
    this.db.transaction(()=>{
      const work=this.getWork(id);if(!work?.collectionId)throw new Error("作品尚未归入文集");
      const rows=this.db.prepare("SELECT id FROM works WHERE collection_id=? AND status!='archived' ORDER BY collection_position,id").all(work.collectionId) as {id:string}[];
      const i=rows.findIndex(w=>w.id===id),j=i+(direction==='up'?-1:1);if(i<0||j<0||j>=rows.length)return;
      [rows[i],rows[j]]=[rows[j],rows[i]];
      const update=this.db.prepare("UPDATE works SET collection_position=? WHERE id=?");rows.forEach((r,n)=>update.run(n+1,r.id));
    })();
  }
  unarchiveWork(id:string):WorkRecord {
    const work=this.getWork(id);if(!work)throw new Error("未找到作品");if(work.status!=='archived')return work;
    const old=this.db.prepare("SELECT status FROM work_versions WHERE work_id=? AND status!='archived' ORDER BY julianday(created_at) DESC,id DESC LIMIT 1").get(id) as {status:'draft'|'completed'}|undefined;
    return this.updateWork(id,{status:old?.status??'draft'});
  }

  createWork(input: CreateWorkInput): WorkRecord {
    const room = input.room ?? "poetry";
    const category = input.category ?? (room === "song" ? "modern" : "unclassified");
    assertWorkProfile({ genre: input.genre, room, category });
    if(input.genre!=="ci" && input.ci)throw new Error("非词稿不能保存词谱状态");
    if(input.genre === "ci" && (!input.ci || !ciForm(input.ci.formId)))throw new Error("请选择可用词谱");
    const id = randomUUID();
    const timestamp = now();
    const tags = [...new Set(input.tags ?? [])].filter(Boolean);
    const transaction = this.db.transaction(() => {
      this.db.prepare(
        "INSERT INTO works(id, collection_id, title, body, genre, status, location, notes, created_at, updated_at, room, category,ci_json) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.collectionId ?? null, input.title ?? "", input.body ?? "", input.genre, input.location ?? "", input.notes ?? "", timestamp, timestamp, room, category,input.ci?JSON.stringify(input.ci):null);
      const insertTag = this.db.prepare("INSERT INTO work_tags(work_id, tag) VALUES (?, ?)");
      for (const tag of tags) insertTag.run(id, tag);
      if(input.collectionId)this.db.prepare("UPDATE works SET collection_position=(SELECT COALESCE(MAX(collection_position),0)+1 FROM works WHERE collection_id=? AND id!=?) WHERE id=?").run(input.collectionId,id,id);
      this.writeAssistance(id, input.assistance);
      this.saveVersion(id, "manual_save");
    });
    transaction();
    return this.getWork(id)!;
  }

  getWork(id: string): WorkRecord | null {
    const row = this.db.prepare("SELECT * FROM works WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const tags = this.db.prepare("SELECT tag FROM work_tags WHERE work_id = ? ORDER BY tag").all(id).map((tag) => String((tag as { tag: string }).tag));
    return { ...mapWork(row, tags), assistance: this.getAssistance(id) } as WorkRecord;
  }

  /** Select only bounded preview and list fields; body, notes and editor state never cross this boundary. */
  queryWorks(raw: QueryWorksRequest = {}): QueryWorksResponse {
    const request = queryWorksRequestSchema.parse(raw);
    const where: string[] = [], values: (string | number)[] = [];
    if (!request.includeArchived) where.push("w.status != 'archived'");
    for (const [key, column] of [["room", "room"], ["status", "status"], ["genre", "genre"], ["category", "category"]] as const) {
      if (request[key]) { where.push(`w.${column} = ?`); values.push(request[key]!); }
    }
    if(request.collectionId===null)where.push("w.collection_id IS NULL");
    else if(request.collectionId){where.push("w.collection_id=?");values.push(request.collectionId);}
    const categoryPredicates={regulated:"w.genre IN ('wujue','qijue','wulv','qilv')",ci:"w.genre='ci'",ancient:"w.genre='free' AND w.category='ancient'",modern:"w.genre='free' AND w.category='modern'",prose:"w.genre='free' AND w.category IN ('prose','fu')"};
    if(request.categoryGroup)where.push(categoryPredicates[request.categoryGroup]);
    const ordered=Boolean(request.collectionId);
    if (request.tag) { where.push("EXISTS (SELECT 1 FROM work_tags t WHERE t.work_id=w.id AND t.tag=?)"); values.push(request.tag); }
    if (request.query) { where.push("instr(w.title, ?) > 0"); values.push(request.query); }
    const predicate = where.length ? `WHERE ${where.join(" AND ")}` : "";
    // Count, facet labels and page are a single read snapshot.
    return this.db.transaction(() => {
      const total = (this.db.prepare(`SELECT count(*) AS total FROM works w ${predicate}`).get(...values) as {total:number}).total;
      const tags = request.includeTagOptions ? (this.db.prepare(`SELECT DISTINCT t.tag FROM work_tags t JOIN works w ON w.id=t.work_id ${request.includeArchived ? "" : "WHERE w.status != 'archived'"} ORDER BY t.tag`).all() as {tag:string}[]).map(t=>t.tag) : [];
      const pageWhere = [...where], pageValues = [...values];
      if (request.cursor) {
        if(ordered){if(request.cursor.position===undefined)throw new Error("文集分页位置缺失，请重新加载");pageWhere.push("(w.collection_position > ? OR (w.collection_position = ? AND w.id > ?))");pageValues.push(request.cursor.position,request.cursor.position,request.cursor.id);}
        else{pageWhere.push("(w.updated_at < ? OR (w.updated_at = ? AND w.id < ?))");pageValues.push(request.cursor.updatedAt, request.cursor.updatedAt, request.cursor.id);}
      }
      const rows = this.db.prepare(`SELECT w.id, w.collection_id, w.collection_position, w.title, substr(ltrim(w.body,?),1,160) AS preview, w.genre, w.room, w.category, w.status, w.created_at, w.updated_at FROM works w ${pageWhere.length ? `WHERE ${pageWhere.join(" AND ")}` : ""} ORDER BY ${ordered?"w.collection_position ASC,w.id ASC":"w.updated_at DESC,w.id DESC"} LIMIT ?`).all(PREVIEW_LEADING_WHITESPACE, ...pageValues, request.limit + 1) as Record<string,unknown>[];
      const hasMore = rows.length > request.limit;
      const page = rows.slice(0,request.limit);
      const tagsById = new Map<string,string[]>();
      if (page.length) {
        const labels = this.db.prepare(`SELECT work_id, tag FROM work_tags WHERE work_id IN (${page.map(()=>"?").join(",")}) ORDER BY tag`).all(...page.map(r=>String(r.id))) as {work_id:string;tag:string}[];
        for (const t of labels) tagsById.set(t.work_id,[...(tagsById.get(t.work_id) ?? []),t.tag]);
      }
      const items: WorkSummary[] = page.map(r=>({collectionId:r.collection_id?String(r.collection_id):null,collectionPosition:Number(r.collection_position),id:String(r.id),title:String(r.title),preview:String(r.preview).trim().split(/\r?\n/u)[0] ?? "", genre:r.genre as DocumentGenre,room:r.room as WorkRoom,category:r.category as FreeCategory,status:r.status as WorkStatus,tags:tagsById.get(String(r.id)) ?? [],createdAt:String(r.created_at),updatedAt:String(r.updated_at)}));
      const last = items.at(-1);
      return {items,total,tags,nextCursor:hasMore && last ? {updatedAt:last.updatedAt,id:last.id,...(ordered?{position:last.collectionPosition}: {})} : null};
    })();
  }

  listWorks(includeArchived = false): WorkRecord[] {
    const rows = this.db
      .prepare(includeArchived ? "SELECT * FROM works ORDER BY updated_at DESC" : "SELECT * FROM works WHERE status != 'archived' ORDER BY updated_at DESC")
      .all() as Record<string, unknown>[];
    const tags = this.db.prepare("SELECT work_id, tag FROM work_tags ORDER BY tag").all() as { work_id: string; tag: string }[];
    const tagsByWork = new Map<string, string[]>();
    for (const tag of tags) tagsByWork.set(tag.work_id, [...(tagsByWork.get(tag.work_id) ?? []), tag.tag]);
    return rows.map((row) => ({ ...mapWork(row, tagsByWork.get(String(row.id)) ?? []), assistance: this.getAssistance(String(row.id)) } as WorkRecord));
  }

  updateWork(id: string, input: UpdateWorkInput, allowCiFormChange = false): WorkRecord {
    const existing = this.getWork(id);
    if (!existing) throw new Error(`work not found: ${id}`);
    const next = { ...existing, ...input, tags: input.tags ? [...new Set(input.tags)].filter(Boolean) : existing.tags, updatedAt: now() };
    assertWorkProfile(next);
    if(next.genre!==existing.genre && (next.genre==="ci" || existing.genre==="ci"))throw new Error("不支持跨编辑方式转换");
    if(input.ci && (existing.genre!=="ci" || (!allowCiFormChange && existing.ci?.formId!==input.ci.formId)))throw new Error("本版不支持有稿更换谱式，请另建新稿");
    if (roomOf(next) !== roomOf(existing) || (next.genre === "free") !== (existing.genre === "free")) throw new Error("本轮不支持跨房间或跨编辑方式转换");
    const transaction = this.db.transaction(() => {
      this.db.prepare(
        "UPDATE works SET collection_id = ?, title = ?, body = ?, genre = ?, status = ?, location = ?, notes = ?, rhyme_group_id = ?, updated_at = ?, category = ?,ci_json = ? WHERE id = ?",
      ).run(next.collectionId, next.title, next.body, next.genre, next.status, next.location, next.notes, next.rhymeGroupId, next.updatedAt, categoryOf(next),next.ci?JSON.stringify(next.ci):null, id);
      if (input.tags) {
        this.db.prepare("DELETE FROM work_tags WHERE work_id = ?").run(id);
        const insertTag = this.db.prepare("INSERT INTO work_tags(work_id, tag) VALUES (?, ?)");
        for (const tag of next.tags) insertTag.run(id, tag);
      }
      if(input.collectionId!==undefined&&input.collectionId!==existing.collectionId)this.db.prepare("UPDATE works SET collection_position=(SELECT COALESCE(MAX(collection_position),0)+1 FROM works WHERE collection_id=? AND id!=?) WHERE id=?").run(input.collectionId,id,id);
      this.writeAssistance(id, input.assistance);
      this.saveVersion(id, existing.status !== next.status ? "status_change" : "autosave");
    });
    transaction();
    return this.getWork(id)!;
  }

  archiveWork(id: string): WorkRecord {
    return this.db.transaction(()=>{this.saveVersion(id,"manual_save");return this.updateWork(id, { status: "archived" });})();
  }

  private snapshot(id: string): WorkSnapshot {
    const work=this.getWork(id); if(!work)throw new Error(`work not found: ${id}`);
    return snapshotSchema.parse({ work, analysisState: this.getAnalysisState(id) });
  }

  private snapshotKey(snapshot: WorkSnapshot): string {
    const {updatedAt, createdAt, ...work}=snapshot.work;
    const analysis=snapshot.analysisState;
    return JSON.stringify({work,analysisState:analysis ? {templateId:analysis.templateId,variantId:analysis.variantId,readingOverrides:analysis.readingOverrides,ruleDatasetVersions:Object.fromEntries(Object.entries(analysis.ruleDatasetVersions).sort(([a],[b])=>a.localeCompare(b)))} : null});
  }

  saveVersion(id: string, reason: VersionReason, force = false): boolean {
    return this.db.transaction(() => {
    const snapshot=this.snapshot(id), work=snapshot.work;
    const latest=this.readVersions(id,1)[0];
    if(!force && latest?.snapshot && this.snapshotKey(latest.snapshot)===this.snapshotKey(snapshot))return false;
    if(!force && reason==="autosave" && Boolean(this.db.prepare("SELECT 1 FROM work_versions WHERE work_id=? AND reason='autosave' LIMIT 1").get(id)) && latest && Date.now()-Date.parse(latest.createdAt)<AUTOSAVE_VERSION_INTERVAL)return false;
    this.db.prepare("INSERT INTO work_versions(id, work_id, title, body, genre, status, location, notes, reason, created_at, room, category, ci_json, snapshot_json, completeness) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')")
      .run(randomUUID(),id,work.title,work.body,work.genre,work.status,work.location,work.notes,reason,new Date(Math.max(Date.now(),(Date.parse(latest?.createdAt??"")||0)+1)).toISOString(),roomOf(work),categoryOf(work),work.ci?JSON.stringify(work.ci):null,JSON.stringify(snapshot));
    pruneAutomaticHistory(this.db, id);
    return true;
    })();
  }

  setVersionPinned(workId: string, versionId: string, pinned: boolean): void {
    const result=this.db.prepare("UPDATE work_versions SET pinned=? WHERE work_id=? AND id=?").run(pinned?1:0,workId,versionId);
    if(!result.changes)throw new Error("未找到历史版本");
  }

  listVersions(workId: string): WorkVersion[] { return this.readVersions(workId); }
  private readVersions(workId: string, limit = -1): WorkVersion[] {
    return (this.db.prepare("SELECT * FROM work_versions WHERE work_id = ? ORDER BY COALESCE(julianday(created_at), 0) DESC, id DESC LIMIT ?").all(workId,limit) as Record<string,unknown>[]).map(r=>({
      pinned:Boolean(r.pinned),id:String(r.id),workId:String(r.work_id),title:String(r.title),body:String(r.body),genre:r.genre as WorkVersion["genre"],status:r.status as WorkVersion["status"],location:String(r.location),notes:String(r.notes),reason:r.reason as VersionReason,createdAt:String(r.created_at),room:r.room as WorkVersion["room"],category:r.category as WorkVersion["category"],ci:r.ci_json?JSON.parse(String(r.ci_json)):null,completeness:r.completeness as WorkVersion["completeness"],snapshot:r.snapshot_json?JSON.parse(String(r.snapshot_json)):null,
    }));
  }

  restoreVersion(workId: string, versionId: string): WorkRecord {
    const version=this.listVersions(workId).find(v=>v.id===versionId), current=this.getWork(workId);
    if(!version || !current)throw new Error("未找到历史版本");
    versionSchema.parse(version);
    if(version.room!==roomOf(current) || (version.genre==="free")!==(current.genre==="free") || (version.genre==="ci")!==(current.genre==="ci"))throw new Error("历史与当前作品的编辑方式不一致");
    const old=version.snapshot?.work;
    const next=(old ? {...old,assistance:old.assistance ?? current.assistance,createdAt:current.createdAt,updatedAt:now()} : {...current,title:version.title,body:version.body,genre:version.genre,status:version.status,location:version.location,notes:version.notes,room:version.room,category:version.category,...(version.ci?{ci:version.ci}:{}),updatedAt:now()}) as WorkRecord;
    assertWorkProfile(next);
    this.db.transaction(()=>{
      // Preserve the latest current state even if the interval snapshot was skipped.
      this.saveVersion(workId,"manual_save");
      this.writeWork(next);
      this.db.prepare("DELETE FROM work_analysis_state WHERE work_id = ?").run(workId);
      if(version.snapshot?.analysisState)this.saveAnalysisState({...version.snapshot.analysisState,workId});
      this.saveVersion(workId,"manual_save",true);
    })();
    return this.getWork(workId)!;
  }

  private writeWork(w: WorkRecord): void {
    this.db.prepare("INSERT INTO works(id,collection_id,title,body,genre,status,location,notes,rhyme_group_id,created_at,updated_at,room,category,ci_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET collection_id=excluded.collection_id,title=excluded.title,body=excluded.body,genre=excluded.genre,status=excluded.status,location=excluded.location,notes=excluded.notes,rhyme_group_id=excluded.rhyme_group_id,updated_at=excluded.updated_at,room=excluded.room,category=excluded.category,ci_json=excluded.ci_json")
      .run(w.id,w.collectionId,w.title,w.body,w.genre,w.status,w.location,w.notes,w.rhymeGroupId,w.createdAt,w.updatedAt,roomOf(w),categoryOf(w),w.ci?JSON.stringify(w.ci):null);
    this.db.prepare("UPDATE works SET collection_position=? WHERE id=?").run(w.collectionPosition??0,w.id);
    this.writeAssistance(w.id, w.assistance);
    this.db.prepare("DELETE FROM work_tags WHERE work_id=?").run(w.id);
    for(const tag of w.tags)this.db.prepare("INSERT INTO work_tags(work_id,tag) VALUES (?,?)").run(w.id,tag);
  }

  readingNotesOverview():ReadingNotesOverview{
    return this.db.transaction(()=>({total:(this.db.prepare('SELECT COUNT(*) n FROM reading_notes').get() as {n:number}).n,
    authors:this.db.prepare("SELECT json_extract(data,'$.author') name,COUNT(*) count FROM reading_notes WHERE json_extract(data,'$.author')!='' GROUP BY name ORDER BY name COLLATE NOCASE").all() as ReadingNotesOverview['authors'],
    books:this.db.prepare("SELECT source_id sourceId,json_extract(data,'$.bookTitle') title,COUNT(*) count FROM reading_notes GROUP BY source_id,title ORDER BY title,source_id").all() as ReadingNotesOverview['books']}))();
  }
  queryReadingNotes(raw:z.input<typeof readingNotesQuerySchema>):ReadingNotesPage{
    const r=readingNotesQuerySchema.parse(raw),terms:string[]=[],args:string[]=[];
    if(r.author!==undefined){terms.push("json_extract(data,'$.author')=?");args.push(r.author);}
    if(r.book){terms.push("source_id=? AND json_extract(data,'$.bookTitle')=?");args.push(r.book.sourceId,r.book.title);}
    if(r.query.trim()){terms.push("instr(lower(json_extract(data,'$.quote')||char(10)||json_extract(data,'$.note')||char(10)||json_extract(data,'$.title')||char(10)||json_extract(data,'$.author')||char(10)||json_extract(data,'$.bookTitle')),lower(?))>0");args.push(r.query.trim());}
    const where=terms.length?' WHERE '+terms.join(' AND '):'';
    return this.db.transaction(()=>{const total=(this.db.prepare('SELECT COUNT(*) n FROM reading_notes'+where).get(...args) as {n:number}).n;
    const rows=this.db.prepare("SELECT data FROM reading_notes"+where+" ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT ? OFFSET ?").all(...args,r.limit+1,r.offset) as {data:string}[];
    return{items:rows.slice(0,r.limit).map(row=>readingNoteSchema.parse(JSON.parse(row.data))),total,nextOffset:rows.length>r.limit?r.offset+r.limit:null};})();
  }
  readingNotes(sourceId?:string,nodeId?:string):ReadingNote[]{
    const rows=(sourceId?this.db.prepare("SELECT data FROM reading_notes WHERE source_id=? AND node_id=? ORDER BY rowid DESC").all(sourceId,nodeId):this.db.prepare("SELECT data FROM reading_notes ORDER BY id").all()) as {data:string}[];
    return rows.map(r=>readingNoteSchema.parse(JSON.parse(r.data)));
  }
  createReadingNote(raw:z.input<typeof createReadingNoteSchema>):ReadingNote{
    const value=createReadingNoteSchema.parse(raw),existing=this.db.prepare("SELECT data FROM reading_notes WHERE source_id=? AND node_id=? AND quote=?").get(value.sourceId,value.nodeId,value.quote) as {data:string}|undefined;
    if(existing)return readingNoteSchema.parse(JSON.parse(existing.data));
    const stamp=now(),note={...value,id:randomUUID(),note:'',createdAt:stamp,updatedAt:stamp};this.writeReadingNote(note);return note;
  }
  private writeReadingNote(note:ReadingNote){this.db.prepare("INSERT INTO reading_notes(id,source_id,node_id,quote,data) VALUES (?,?,?,?,?)").run(note.id,note.sourceId,note.nodeId,note.quote,JSON.stringify(note));}
  updateReadingNote(id:string,text:string){const row=this.db.prepare("SELECT data FROM reading_notes WHERE id=?").get(id) as {data:string}|undefined;if(!row)throw new Error('摘记不存在');const note=readingNoteSchema.parse({...JSON.parse(row.data),note:text,updatedAt:now()});this.db.prepare("UPDATE reading_notes SET data=? WHERE id=?").run(JSON.stringify(note),id);}
  removeReadingNote(id:string){this.db.prepare("DELETE FROM reading_notes WHERE id=?").run(id);}
  exportBackup(): CompleteBackup {
    return this.db.transaction(()=>validateBackup({format:"shifang-complete-backup",formatVersion:5,schemaVersion:8,readingNotes:this.readingNotes(),createdAt:now(),collections:(this.db.prepare("SELECT * FROM collections ORDER BY id").all() as Record<string,unknown>[]).map(r=>({id:r.id,name:r.name,description:r.description,createdAt:r.created_at,updatedAt:r.updated_at})),works:this.listWorks(true).sort((a,b)=>a.id.localeCompare(b.id)),analysisStates:this.listWorks(true).sort((a,b)=>a.id.localeCompare(b.id)).flatMap(w=>{const a=this.getAnalysisState(w.id);return a?[a]:[];}),versions:this.listWorks(true).sort((a,b)=>a.id.localeCompare(b.id)).flatMap(w=>this.listVersions(w.id))}))();
  }

  restoreBackup(raw: unknown, backupBeforeRestore: (backup: CompleteBackup)=>void): void {
    const backup=validateBackup(raw);
    // Backup must succeed before any database write; the callback is synchronous.
    const safetyResult=(backupBeforeRestore as (backup:CompleteBackup)=>unknown)(this.exportBackup());
    if(safetyResult && typeof (safetyResult as {then?:unknown}).then==="function"){
      void Promise.resolve(safetyResult).catch(()=>undefined);
      throw new Error("恢复前备份必须同步完成，未开始恢复");
    }
    const previousAssistance = new Map(this.listWorks(true).map(w=>[w.id,w.assistance]));
    this.db.transaction(()=>{
      if(backup.readingNotes!==undefined){this.db.prepare("DELETE FROM reading_notes").run();for(const note of backup.readingNotes)this.writeReadingNote(note);}
      this.db.prepare("DELETE FROM works").run();
      this.db.prepare("DELETE FROM collections").run();
      for(const c of backup.collections)this.db.prepare("INSERT INTO collections(id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)").run(c.id,c.name,c.description,c.createdAt,c.updatedAt);
      for(const w of backup.works)this.writeWork({...w,assistance:backup.formatVersion===1 ? previousAssistance.get(w.id) : w.assistance});
      for(const a of backup.analysisStates){this.saveAnalysisState(a);this.db.prepare("UPDATE work_analysis_state SET updated_at=? WHERE work_id=?").run(a.updatedAt,a.workId);}
      for(const v of backup.versions)this.db.prepare("INSERT INTO work_versions(id,work_id,title,body,genre,status,location,notes,reason,created_at,room,category,ci_json,snapshot_json,completeness,pinned) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(v.id,v.workId,v.title,v.body,v.genre,v.status,v.location,v.notes,v.reason,v.createdAt,v.room,v.category,v.ci?JSON.stringify(v.ci):null,v.snapshot?JSON.stringify(v.snapshot):null,v.completeness,v.pinned?1:0);
      const violations=this.db.pragma("foreign_key_check");if(!Array.isArray(violations)||violations.length)throw new Error("恢复关联检查失败");
    })();
  }

  saveAnalysisState(state: Omit<WorkAnalysisState, "updatedAt">): WorkAnalysisState {
    if (this.getWork(state.workId)?.genre === "free" || this.getWork(state.workId)?.genre === "ci") throw new Error("自由创作不保存格律状态");
    if (!this.getWork(state.workId)) throw new Error(`work not found: ${state.workId}`);
    const updatedAt = now();
    this.db.prepare(
      "INSERT INTO work_analysis_state(work_id, template_id, variant_id, reading_overrides_json, rule_dataset_versions_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(work_id) DO UPDATE SET template_id = excluded.template_id, variant_id = excluded.variant_id, reading_overrides_json = excluded.reading_overrides_json, rule_dataset_versions_json = excluded.rule_dataset_versions_json, updated_at = excluded.updated_at",
    ).run(state.workId, state.templateId, state.variantId, JSON.stringify(state.readingOverrides), JSON.stringify(state.ruleDatasetVersions), updatedAt);
    return { ...state, updatedAt };
  }

  getAnalysisState(workId: string): WorkAnalysisState | null {
    const row = this.db.prepare("SELECT * FROM work_analysis_state WHERE work_id = ?").get(workId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      workId: String(row.work_id),
      templateId: row.template_id as WorkGenre,
      variantId: row.variant_id ? String(row.variant_id) : null,
      readingOverrides: JSON.parse(String(row.reading_overrides_json)),
      ruleDatasetVersions: JSON.parse(String(row.rule_dataset_versions_json)),
      updatedAt: String(row.updated_at),
    };
  }

  saveEditorState(input: SaveEditorStateInput): { work: WorkRecord; analysisState: WorkAnalysisState } {
    const existing = this.getWork(input.workId);
    if (!existing) throw new Error(`work not found: ${input.workId}`);
    if (existing.genre === "free" || existing.genre === "ci") throw new Error("自由创作须使用自由保存接口");
    const updatedAt = now();
    const tags = [...new Set(input.tags)].filter(Boolean);
    const analysisState: WorkAnalysisState = {
      workId: input.workId,
      templateId: input.templateId,
      variantId: input.variantId,
      readingOverrides: input.readingOverrides,
      ruleDatasetVersions: input.ruleDatasetVersions,
      updatedAt,
    };
    const transaction = this.db.transaction(() => {
      this.db.prepare(
        "UPDATE works SET collection_id = ?, title = ?, body = ?, genre = ?, status = ?, location = ?, notes = ?, rhyme_group_id = ?, updated_at = ? WHERE id = ?",
      ).run(input.collectionId, input.title, input.body, input.genre, input.status, input.location, input.notes, input.rhymeGroupId, updatedAt, input.workId);
      this.db.prepare("DELETE FROM work_tags WHERE work_id = ?").run(input.workId);
      const insertTag = this.db.prepare("INSERT INTO work_tags(work_id, tag) VALUES (?, ?)");
      for (const tag of tags) insertTag.run(input.workId, tag);
      this.db.prepare(
        "INSERT INTO work_analysis_state(work_id, template_id, variant_id, reading_overrides_json, rule_dataset_versions_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(work_id) DO UPDATE SET template_id = excluded.template_id, variant_id = excluded.variant_id, reading_overrides_json = excluded.reading_overrides_json, rule_dataset_versions_json = excluded.rule_dataset_versions_json, updated_at = excluded.updated_at",
      ).run(input.workId, input.templateId, input.variantId, JSON.stringify(input.readingOverrides), JSON.stringify(input.ruleDatasetVersions), updatedAt);
      this.writeAssistance(input.workId, input.assistance);
      this.saveVersion(input.workId, existing.status !== input.status ? "status_change" : "autosave");
    });
    transaction();
    return { work: this.getWork(input.workId)!, analysisState };
  }
  saveCiWork(input:SaveCiWorkRequest):WorkRecord {
    const existing=this.getWork(input.workId);
    if(existing?.genre!=="ci")throw new Error("此作品不是词");
    const changed=existing.ci.formId!==input.ci.formId;
    if(changed && (existing.body.trim() || input.body.trim()))throw new Error("已有正文的词稿不能更换词牌");
    if(changed){const form=ciForm(input.ci.formId);if(!form||form.version!==input.ci.version||input.ci.rhymeVersion!==metadata.rhymeVersion)throw new Error("请选择当前可用词谱");}
    return this.db.transaction(()=>{
      if(changed)this.saveVersion(input.workId,"manual_save");
      const saved=this.updateWork(input.workId,{title:input.title,body:input.body,notes:input.notes,status:input.status,ci:input.ci,assistance:input.assistance},changed);
      if(changed)this.saveVersion(input.workId,"manual_save");
      return saved;
    })();
  }
  saveFreeWork(input: SaveFreeWorkRequest): WorkRecord {
    const existing = this.getWork(input.workId);
    if (!existing || existing.genre !== "free") throw new Error("此作品不是自由创作");
    return this.updateWork(input.workId, { title: input.title, body: input.body, notes: input.notes, status: input.status, category: input.category, assistance: input.assistance });
  }

}
