-- Keep automatically accepted lyric matches separate from user-selected lyrics.
CREATE TABLE IF NOT EXISTS backfilled_track_lyrics (
  track_id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'amll', 'lrclib', 'qqmusic', 'kugou', 'kuwo')),
  provider_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  raw_lyrics_json TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lyrics_backfill_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'complete')),
  threshold INTEGER NOT NULL CHECK (threshold BETWEEN 82 AND 95),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'cancelled', 'completed')),
  total_count INTEGER NOT NULL DEFAULT 0,
  current_track_title TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS lyrics_backfill_items (
  job_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'matched', 'no_match', 'skipped', 'failed')),
  provider TEXT,
  score INTEGER,
  message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, track_id),
  FOREIGN KEY (job_id) REFERENCES lyrics_backfill_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lyrics_backfill_items_pending
  ON lyrics_backfill_items(job_id, status);
