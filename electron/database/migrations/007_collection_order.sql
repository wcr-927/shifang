ALTER TABLE works ADD COLUMN collection_position INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY updated_at DESC,id DESC) AS position FROM works WHERE collection_id IS NOT NULL)
UPDATE works SET collection_position=(SELECT position FROM ranked WHERE ranked.id=works.id) WHERE collection_id IS NOT NULL;
CREATE INDEX idx_works_collection_order ON works(collection_id,collection_position,id);
