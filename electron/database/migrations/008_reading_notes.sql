CREATE TABLE reading_notes (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 node_id TEXT NOT NULL,
 quote TEXT NOT NULL,
 data TEXT NOT NULL,
 UNIQUE(source_id,node_id,quote)
);
CREATE INDEX reading_notes_piece ON reading_notes(source_id,node_id);
