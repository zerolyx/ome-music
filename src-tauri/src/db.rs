use rusqlite::Connection;
use std::path::Path;

pub(crate) const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_initial_schema.sql"),
    include_str!("../migrations/002_mood_note_rename_and_indexes.sql"),
    include_str!("../migrations/003_authorized_music_directories.sql"),
    include_str!("../migrations/004_dj.sql"),
    include_str!("../migrations/005_track_metadata_override.sql"),
    include_str!("../migrations/006_track_rule_exclusions.sql"),
    include_str!("../migrations/007_library_scan_summary.sql"),
    include_str!("../migrations/008_explicit_local_file_access.sql"),
    include_str!("../migrations/009_track_metadata_original_snapshot.sql"),
    include_str!("../migrations/010_catalog_entity_aliases.sql"),
    include_str!("../migrations/011_track_metadata_sources.sql"),
    include_str!("../migrations/012_saved_track_lyrics.sql"),
    include_str!("../migrations/013_lyrics_backfill.sql"),
    include_str!("../migrations/014_track_quick_identity.sql"),
    include_str!("../migrations/015_track_replay_gain.sql"),
    include_str!("../migrations/016_dj_memory_source.sql"),
    include_str!("../migrations/017_dj_message_summarized.sql"),
];

pub fn open_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // 扫描线程持有第二条连接，写竞争时等待而非立即 SQLITE_BUSY
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
             version INTEGER PRIMARY KEY,
             applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )?;
    let current: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    for (index, script) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        if version > current {
            conn.execute_batch(script)?;
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [version],
            )?;
        }
    }
    Ok(())
}
