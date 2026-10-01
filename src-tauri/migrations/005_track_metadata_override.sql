-- 005: Keep local metadata corrections made inside Ome across folder rescans.
CREATE TABLE IF NOT EXISTS track_metadata_overrides (
  track_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
