CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL CHECK (genre IN ('wujue', 'qijue', 'wulv', 'qilv')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  rhyme_group_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_works_updated_at ON works(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_collection_updated ON works(collection_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);

CREATE TABLE IF NOT EXISTS work_tags (
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (work_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_work_tags_tag ON work_tags(tag);

CREATE TABLE IF NOT EXISTS work_versions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  genre TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('manual_save', 'autosave', 'status_change')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_versions_work_created ON work_versions(work_id, created_at DESC);

CREATE TABLE IF NOT EXISTS work_analysis_state (
  work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  variant_id TEXT,
  reading_overrides_json TEXT NOT NULL DEFAULT '[]',
  rule_dataset_versions_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
