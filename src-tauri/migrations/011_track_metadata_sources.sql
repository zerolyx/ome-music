-- 011: Keep the origin of each local display metadata field with its override.
ALTER TABLE track_metadata_overrides
  ADD COLUMN title_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (title_source IN ('fileTags', 'netease', 'qq', 'kugou', 'manual', 'unknown'));
ALTER TABLE track_metadata_overrides
  ADD COLUMN artist_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (artist_source IN ('fileTags', 'netease', 'qq', 'kugou', 'manual', 'unknown'));
ALTER TABLE track_metadata_overrides
  ADD COLUMN album_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (album_source IN ('fileTags', 'netease', 'qq', 'kugou', 'manual', 'unknown'));
