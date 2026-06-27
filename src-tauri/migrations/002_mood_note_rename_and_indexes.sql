-- 002: Rename the misleading note_encrypted column to note_text and add the
-- missing hot-path indexes. All statements are idempotent so this file can be
-- re-run on every startup just like 001.

-- The journal stores listener notes as plain text today; the legacy column name
-- `note_encrypted` implied encryption that never existed. SQLite 3.25+ supports
-- RENAME COLUMN; rusqlite 0.32 (bundled) ships a newer engine. The Rust loader
-- guards this with a pragma_table_info check so re-runs are no-ops.

CREATE INDEX IF NOT EXISTS idx_tracks_liked ON tracks(liked);
CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_analyses_playlist_id ON playlist_analyses(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playback_events_event_type ON playback_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mood_entries_updated_at ON mood_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_lyrics_cache_source_id ON lyrics_cache(source_id);
