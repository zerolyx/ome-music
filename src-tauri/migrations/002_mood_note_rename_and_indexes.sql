-- 002: Add the hot-path indexes for tracks, playlists, playback events, mood
-- entries and the lyrics cache. This file only adds indexes; every statement
-- uses IF NOT EXISTS, so it is idempotent and safe to re-run on every startup
-- just like 001.

CREATE INDEX IF NOT EXISTS idx_tracks_liked ON tracks(liked);
CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_analyses_playlist_id ON playlist_analyses(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playback_events_event_type ON playback_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mood_entries_updated_at ON mood_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_lyrics_cache_source_id ON lyrics_cache(source_id);
