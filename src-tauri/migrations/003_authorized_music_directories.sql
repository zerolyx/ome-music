-- 003: Authorized music directory registry.
-- Tracks folders the user has explicitly selected through the system folder picker.
-- scan_music_directory validates against this table before scanning arbitrary paths.
-- All statements are idempotent so this file can be re-run on every startup.

CREATE TABLE IF NOT EXISTS authorized_music_directories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  directory_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
