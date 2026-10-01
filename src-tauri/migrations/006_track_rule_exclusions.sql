ALTER TABLE tracks
ADD COLUMN ignored_by_rules INTEGER NOT NULL DEFAULT 0
CHECK (ignored_by_rules IN (0, 1));

CREATE INDEX idx_tracks_ignored_by_rules
ON tracks(ignored_by_rules, source);
