ALTER TABLE work_versions ADD COLUMN snapshot_json TEXT;
ALTER TABLE work_versions ADD COLUMN completeness TEXT NOT NULL DEFAULT 'legacy' CHECK (completeness IN ('legacy', 'complete'));
