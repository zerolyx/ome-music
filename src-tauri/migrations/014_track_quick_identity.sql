-- A bounded local fingerprint helps identify the same audio after it moves.
-- It is an index hint, not a cryptographic integrity or security hash.
ALTER TABLE tracks ADD COLUMN quick_hash TEXT;
ALTER TABLE tracks ADD COLUMN quick_hash_version INTEGER;

CREATE INDEX IF NOT EXISTS idx_tracks_quick_identity
  ON tracks(source, ignored_by_rules, quick_hash_version, quick_hash);
