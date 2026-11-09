CREATE TABLE works_next (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL CHECK (genre IN ('wujue','qijue','wulv','qilv','free','ci')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed','archived')),
  location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', rhyme_group_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT 'poetry' CHECK (room IN ('poetry','song','ci')),
  category TEXT NOT NULL DEFAULT 'unclassified' CHECK (category IN ('unclassified','ancient','prose','fu','modern')),
  ci_json TEXT,
  CHECK ((room='ci' AND genre='ci' AND category='unclassified' AND ci_json IS NOT NULL) OR (room='poetry' AND ((genre='free' AND category IN ('unclassified','ancient','prose','fu')) OR (genre NOT IN ('free','ci') AND category='unclassified'))) OR (room='song' AND genre='free' AND category='modern'))
);
INSERT INTO works_next(id,collection_id,title,body,genre,status,location,notes,rhyme_group_id,created_at,updated_at,room,category)
  SELECT id,collection_id,title,body,genre,status,location,notes,rhyme_group_id,created_at,updated_at,room,category FROM works;
DROP TABLE works;
ALTER TABLE works_next RENAME TO works;
CREATE INDEX idx_works_updated_at ON works(updated_at DESC);
CREATE INDEX idx_works_collection_updated ON works(collection_id,updated_at DESC);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_works_room ON works(room,updated_at DESC);
ALTER TABLE work_versions ADD COLUMN ci_json TEXT;
