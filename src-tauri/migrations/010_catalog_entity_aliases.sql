-- 010: Preserve old album labels when a library entity is renamed.
ALTER TABLE albums ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]';
