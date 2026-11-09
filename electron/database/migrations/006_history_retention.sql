ALTER TABLE work_versions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1));
CREATE INDEX idx_versions_retention ON work_versions(work_id, reason, pinned, created_at);
