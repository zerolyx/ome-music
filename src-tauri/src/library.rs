use crate::AppState;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "ogg", "opus", "aac"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub source: String,
    pub source_id: Option<String>,
    pub unavailable_reason: Option<String>,
    pub cover_path: Option<String>,
    pub liked: bool,
    pub play_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDto {
    pub added: i64,
    pub updated: i64,
    pub total: i64,
}

pub struct NewTrack {
    pub title: String,
    pub artist: String,
    /// 专辑归并（album_id 解析）留待后续任务，先保留读取到的专辑名
    #[allow(dead_code)]
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub cover_path: Option<String>,
}

fn track_id_for_path(path: &str) -> String {
    format!("{:x}", md5::compute(path.as_bytes()))
}

pub fn insert_track(conn: &Connection, track: &NewTrack) -> Result<(), rusqlite::Error> {
    let id = track_id_for_path(&track.file_path);
    // tracks 表没有 artist 列，只有 artist_id 外键 → 先 upsert artists，再关联
    let artist_id: Option<String> = if track.artist.trim().is_empty() {
        None
    } else {
        let artist_id = track_id_for_path(&track.artist);
        conn.execute(
            "INSERT INTO artists (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
            params![artist_id, track.artist],
        )?;
        Some(artist_id)
    };
    conn.execute(
        "INSERT INTO tracks (id, title, artist_id, album_id, duration_seconds, file_path, source, cover_path)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'local', ?6)
         ON CONFLICT(file_path) DO UPDATE SET
            title = excluded.title,
            artist_id = excluded.artist_id,
            duration_seconds = excluded.duration_seconds,
            cover_path = excluded.cover_path,
            updated_at = CURRENT_TIMESTAMP",
        params![id, track.title, artist_id, track.duration_seconds, track.file_path, track.cover_path],
    )?;
    Ok(())
}

fn row_to_track(row: &rusqlite::Row<'_>) -> Result<TrackDto, rusqlite::Error> {
    Ok(TrackDto {
        id: row.get("id")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get::<_, Option<String>>("album")?.unwrap_or_default(),
        duration_seconds: row.get("duration_seconds")?,
        file_path: row.get("file_path")?,
        source: row.get("source")?,
        source_id: row.get("source_id")?,
        unavailable_reason: row.get("unavailable_reason")?,
        cover_path: row.get("cover_path")?,
        liked: row.get::<_, i64>("liked")? != 0,
        play_count: row.get("play_count")?,
    })
}

pub fn load_tracks(conn: &Connection) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, ar.name AS artist, a.title AS album, t.duration_seconds, t.file_path,
                t.source, t.source_id, t.unavailable_reason, t.cover_path, t.liked, t.play_count
         FROM tracks t
         LEFT JOIN artists ar ON t.artist_id = ar.id
         LEFT JOIN albums a ON t.album_id = a.id
         ORDER BY t.title COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], row_to_track)?;
    rows.collect()
}

pub fn set_track_liked(conn: &Connection, id: &str, liked: bool) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE tracks SET liked = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, liked as i64],
    )?;
    Ok(())
}

pub fn record_playback_event(
    conn: &Connection,
    track_id: &str,
    event_type: &str,
    position_seconds: i64,
) -> Result<(), String> {
    const ALLOWED: &[&str] = &["play", "pause", "skip", "completed", "liked", "unliked", "replayed"];
    if !ALLOWED.contains(&event_type) {
        return Err(format!("Unknown playback event type: {event_type}"));
    }
    let now = std::time::SystemTime::now();
    conn.execute(
        "INSERT INTO playback_events (id, track_id, event_type, position_seconds) VALUES (?1, ?2, ?3, ?4)",
        params![format!("{:x}", md5::compute(format!("{track_id}{event_type}{now:?}"))), track_id, event_type, position_seconds],
    )
    .map_err(|error| error.to_string())?;
    if event_type == "play" {
        let _ = conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            params![track_id],
        );
    }
    Ok(())
}

fn read_track_metadata(path: &Path) -> Option<NewTrack> {
    let file_path = path.to_string_lossy().to_string();
    let tagged = lofty::read_from_path(path).ok();
    let properties = tagged.as_ref().map(|tagged| tagged.properties());
    let duration_seconds = properties
        .map(|properties| properties.duration().as_secs() as i64)
        .unwrap_or(0);
    let tag = tagged.as_ref().and_then(|tagged| tagged.primary_tag()).or_else(|| tagged.as_ref().and_then(|tagged| tagged.first_tag()));
    let fallback_title = path.file_stem()?.to_string_lossy().to_string();
    Some(NewTrack {
        title: tag
            .and_then(|tag| tag.title().map(|value| value.to_string()))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(fallback_title),
        artist: tag
            .and_then(|tag| tag.artist().map(|value| value.to_string()))
            .unwrap_or_else(|| "未知艺人".into()),
        album: tag
            .and_then(|tag| tag.album().map(|value| value.to_string()))
            .unwrap_or_default(),
        duration_seconds,
        file_path,
        cover_path: None,
    })
}

fn is_authorized(conn: &Connection, path: &Path) -> Result<bool, rusqlite::Error> {
    let path_text = path.to_string_lossy();
    let prefix: Option<String> = conn
        .query_row(
            "SELECT directory_path FROM authorized_music_directories WHERE ?1 LIKE directory_path || '%'
             ORDER BY LENGTH(directory_path) DESC LIMIT 1",
            params![path_text],
            |row| row.get(0),
        )
        .optional()?;
    Ok(prefix.is_some())
}

#[tauri::command]
pub async fn import_music_folder(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ImportResultDto, String> {
    let folder = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .add_filter("音频", AUDIO_EXTENSIONS)
        .blocking_pick_folder()
        .ok_or("未选择文件夹")?
        .into_path()
        .map_err(|error| error.to_string())?;

    let folder_text = folder.to_string_lossy().to_string();
    {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![folder_text],
        )
        .map_err(|error| error.to_string())?;
    }

    let app_cache = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    let covers_dir = app_cache.join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|error| error.to_string())?;

    // 阻塞扫描放到独立线程，避免卡 UI
    let state_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ome-music.db");
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<ImportResultDto, String> {
        let conn = crate::db::open_db(&state_path).map_err(|error| error.to_string())?;
        let mut added = 0i64;
        let mut updated = 0i64;
        for entry in WalkDir::new(&folder).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() { continue; }
            let ext_ok = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
                .unwrap_or(false);
            if !ext_ok { continue; }
            if !is_authorized(&conn, path).map_err(|error| error.to_string())? { continue; }
            let existed: i64 = conn
                .query_row("SELECT COUNT(*) FROM tracks WHERE file_path = ?1", params![path.to_string_lossy()], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            let mut track = read_track_metadata(path).ok_or_else(|| format!("无法读取: {}", path.display()))?;
            track.cover_path = extract_cover(&conn, &covers_dir, path, &track)?;
            insert_track(&conn, &track).map_err(|error| error.to_string())?;
            if existed > 0 { updated += 1; } else { added += 1; }
        }
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        Ok(ImportResultDto { added, updated, total })
    })
    .await
    .map_err(|error| error.to_string())??;

    Ok(result)
}

fn extract_cover(
    _conn: &Connection,
    covers_dir: &Path,
    path: &Path,
    track: &NewTrack,
) -> Result<Option<String>, String> {
    let tagged = match lofty::read_from_path(path) {
        Ok(tagged) => tagged,
        Err(_) => return Ok(None),
    };
    let picture = tagged
        .primary_tag()
        .and_then(|tag| tag.pictures().first())
        .or_else(|| tagged.first_tag().and_then(|tag| tag.pictures().first()));
    let picture = match picture {
        Some(picture) => picture,
        None => return Ok(None),
    };
    let extension = match picture.mime_type() {
        Some(lofty::picture::MimeType::Png) => "png",
        _ => "jpg",
    };
    let cover_path = covers_dir.join(format!("{}.{}", track_id_for_path(&track.file_path), extension));
    if !cover_path.exists() {
        std::fs::write(&cover_path, picture.data()).map_err(|error| error.to_string())?;
    }
    Ok(Some(cover_path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_tracks(state: State<'_, AppState>) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_tracks(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_track_liked_command(state: State<'_, AppState>, id: String, liked: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    set_track_liked(&conn, &id, liked).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_playback_event_command(
    state: State<'_, AppState>,
    track_id: String,
    event_type: String,
    position_seconds: i64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    record_playback_event(&conn, &track_id, &event_type, position_seconds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn insert_and_load_track_roundtrip() {
        let conn = memory_db();
        let track = NewTrack {
            title: "夜曲".into(),
            artist: "周杰伦".into(),
            album: "十一月的萧邦".into(),
            duration_seconds: 226,
            file_path: "C:\\music\\夜曲.flac".into(),
            cover_path: None,
        };
        insert_track(&conn, &track).unwrap();
        let tracks = load_tracks(&conn).unwrap();
        assert_eq!(tracks.len(), 1);
        let loaded = &tracks[0];
        assert_eq!(loaded.title, "夜曲");
        assert_eq!(loaded.artist, "周杰伦");
        assert_eq!(loaded.duration_seconds, 226);
        assert!(!loaded.liked);
        // 同路径再插入 → 更新不重复
        insert_track(&conn, &track).unwrap();
        assert_eq!(load_tracks(&conn).unwrap().len(), 1);
    }

    #[test]
    fn set_liked_persists() {
        let conn = memory_db();
        let track = NewTrack { title: "a".into(), artist: "b".into(), album: String::new(), duration_seconds: 1, file_path: "p".into(), cover_path: None };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        set_track_liked(&conn, &id, true).unwrap();
        assert!(load_tracks(&conn).unwrap()[0].liked);
    }

    #[test]
    fn playback_event_rejects_unknown_type() {
        let conn = memory_db();
        let track = NewTrack { title: "a".into(), artist: "b".into(), album: String::new(), duration_seconds: 1, file_path: "p".into(), cover_path: None };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        assert!(record_playback_event(&conn, &id, "play", 0).is_ok());
        assert!(record_playback_event(&conn, &id, "explode", 0).is_err());
    }
}
