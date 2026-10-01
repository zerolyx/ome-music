-- 012: Persist the lyric candidate explicitly selected for a local track.
CREATE TABLE IF NOT EXISTS saved_track_lyrics (
  track_id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'amll', 'lrclib', 'qqmusic', 'kugou', 'kuwo')),
  provider_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  raw_lyrics_json TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
