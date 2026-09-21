PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  genres_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT,
  year INTEGER,
  cover_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT,
  album_id TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL UNIQUE,
  file_extension TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'local',
  source_id TEXT,
  unavailable_reason TEXT,
  file_hash TEXT,
  cover_path TEXT,
  cover_url TEXT,
  genres_json TEXT NOT NULL DEFAULT '[]',
  moods_json TEXT NOT NULL DEFAULT '[]',
  language TEXT NOT NULL DEFAULT 'unknown',
  year INTEGER,
  liked INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  replay_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('local', 'imported', 'ai')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_events (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('play', 'pause', 'skip', 'completed', 'liked', 'unliked', 'replayed')),
  position_seconds INTEGER NOT NULL DEFAULT 0,
  played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listening_events (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('play', 'pause', 'skip', 'completed', 'liked', 'unliked', 'replayed')),
  position_seconds INTEGER NOT NULL DEFAULT 0,
  hour_of_day INTEGER NOT NULL DEFAULT 0,
  event_weight REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS song_features (
  track_id TEXT PRIMARY KEY,
  artist_name TEXT NOT NULL DEFAULT 'Unknown Artist',
  album_title TEXT NOT NULL DEFAULT 'Unknown Album',
  genres_json TEXT NOT NULL DEFAULT '[]',
  moods_json TEXT NOT NULL DEFAULT '[]',
  calm_score REAL NOT NULL DEFAULT 0,
  energetic_score REAL NOT NULL DEFAULT 0,
  exploration_seed REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY CHECK (id = 'local'),
  event_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  favorite_artists_json TEXT NOT NULL DEFAULT '[]',
  favorite_albums_json TEXT NOT NULL DEFAULT '[]',
  favorite_genres_json TEXT NOT NULL DEFAULT '[]',
  favorite_moods_json TEXT NOT NULL DEFAULT '[]',
  preferred_listening_hours_json TEXT NOT NULL DEFAULT '[]',
  night_listening_preference_json TEXT NOT NULL DEFAULT '{}',
  skip_patterns_json TEXT NOT NULL DEFAULT '[]',
  repeat_patterns_json TEXT NOT NULL DEFAULT '[]',
  liked_song_patterns_json TEXT NOT NULL DEFAULT '[]',
  exploration_score_json TEXT NOT NULL DEFAULT '{}',
  calm_music_preference_json TEXT NOT NULL DEFAULT '{}',
  energetic_music_preference_json TEXT NOT NULL DEFAULT '{}',
  is_learning INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profile_snapshots (
  id TEXT PRIMARY KEY,
  favorite_artists_json TEXT NOT NULL DEFAULT '[]',
  favorite_genres_json TEXT NOT NULL DEFAULT '[]',
  listening_windows_json TEXT NOT NULL DEFAULT '[]',
  common_moods_json TEXT NOT NULL DEFAULT '[]',
  skip_rate REAL NOT NULL DEFAULT 0,
  completion_rate REAL NOT NULL DEFAULT 0,
  liked_track_ids_json TEXT NOT NULL DEFAULT '[]',
  repeated_track_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_analyses (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  scale TEXT NOT NULL CHECK (scale IN ('small', 'large')),
  clusters_json TEXT NOT NULL DEFAULT '[]',
  profile_summary TEXT NOT NULL DEFAULT '',
  ai_provider TEXT NOT NULL DEFAULT 'local-rules',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlist_analysis_runs (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  playlist_name TEXT NOT NULL,
  track_count INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'layered')),
  provider TEXT NOT NULL DEFAULT 'local',
  chunk_results_json TEXT NOT NULL DEFAULT '[]',
  final_result_json TEXT NOT NULL DEFAULT '{}',
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS taste_notes (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  track_count INTEGER NOT NULL DEFAULT 0,
  playlist_count INTEGER NOT NULL DEFAULT 0,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mood_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL UNIQUE,
  mood TEXT NOT NULL,
  note_text TEXT,
  private_tags_json TEXT NOT NULL DEFAULT '[]',
  recommended_track_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('playlist_analysis', 'mood_recommendation', 'scene_recommendation')),
  metadata_sent_json TEXT NOT NULL DEFAULT '{}',
  response_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_provider_settings (
  id TEXT PRIMARY KEY CHECK (id = 'local'),
  provider_name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  key_ref TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_source_settings (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  base_url TEXT NOT NULL DEFAULT '',
  token_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lyrics_cache (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  lyric_type TEXT NOT NULL DEFAULT 'lrc',
  lyrics TEXT NOT NULL DEFAULT '',
  translated_lyrics TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1,
  warning TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lyric_offsets (
  cache_key TEXT PRIMARY KEY,
  offset_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_playback_events_track_id ON playback_events(track_id);
CREATE INDEX IF NOT EXISTS idx_playback_events_played_at ON playback_events(played_at);
CREATE INDEX IF NOT EXISTS idx_listening_events_track_id ON listening_events(track_id);
CREATE INDEX IF NOT EXISTS idx_listening_events_created_at ON listening_events(created_at);
CREATE INDEX IF NOT EXISTS idx_listening_events_event_type ON listening_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mood_entries_entry_date ON mood_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_playlist_analysis_runs_playlist_id ON playlist_analysis_runs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_analysis_runs_created_at ON playlist_analysis_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_taste_notes_source ON taste_notes(source);
