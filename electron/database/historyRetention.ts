import type Database from "better-sqlite3";
/** Only unpinned autosaves participate. Invalid legacy dates are conservatively kept. */
export function pruneAutomaticHistory(db: Database.Database, workId: string): void {
  db.prepare(`DELETE FROM work_versions WHERE id IN (
    WITH ranked AS (
      SELECT id, created_at,
        ROW_NUMBER() OVER (PARTITION BY date(created_at, 'localtime') ORDER BY julianday(created_at) DESC, id DESC) AS daily
      FROM work_versions WHERE work_id=? AND reason='autosave' AND pinned=0 AND julianday(created_at) IS NOT NULL
    ), eligible AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY julianday(created_at) DESC, id DESC) AS position
      FROM ranked WHERE julianday(created_at)>=julianday('now','-30 days') OR daily=1
    )
    SELECT id FROM ranked WHERE id NOT IN (SELECT id FROM eligible WHERE position<=100)
  )`).run(workId);
}
