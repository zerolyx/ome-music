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
    pub skipped: i64,
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

/// 曲目行查询共用 SELECT（列序与 row_to_track 对应）；调用方拼自己的 FROM 后续
pub(crate) const TRACK_SELECT: &str =
    "SELECT t.id, t.title, ar.name AS artist, a.title AS album, t.duration_seconds, t.file_path,
                t.source, t.source_id, t.unavailable_reason, t.cover_path, t.liked, t.play_count
         FROM tracks t
         LEFT JOIN artists ar ON t.artist_id = ar.id
         LEFT JOIN albums a ON t.album_id = a.id";

pub(crate) fn row_to_track(row: &rusqlite::Row<'_>) -> Result<TrackDto, rusqlite::Error> {
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
    let mut stmt =
        conn.prepare(&(TRACK_SELECT.to_string() + " ORDER BY t.title COLLATE NOCASE"))?;
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

/// 最近播放历史：按曲目聚合播放事件，按最近一次播放倒序。
pub fn playback_history(conn: &Connection, limit: i64) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        &(TRACK_SELECT.to_string()
            + " JOIN playback_events e ON t.id = e.track_id
         WHERE e.event_type IN ('play', 'completed', 'replayed')
         GROUP BY t.id
         ORDER BY MAX(e.played_at) DESC
         LIMIT ?1"),
    )?;
    let rows = stmt.query_map(params![limit], row_to_track)?;
    rows.collect()
}

pub fn record_playback_event(
    conn: &Connection,
    track_id: &str,
    event_type: &str,
    position_seconds: i64,
) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        "play",
        "pause",
        "skip",
        "completed",
        "liked",
        "unliked",
        "replayed",
    ];
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
    let tag = tagged
        .as_ref()
        .and_then(|tagged| tagged.primary_tag())
        .or_else(|| tagged.as_ref().and_then(|tagged| tagged.first_tag()));
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

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    let covers_dir = app_cache.join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|error| error.to_string())?;

    // 阻塞扫描放到独立线程，避免卡 UI
    let state_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ome-music.db");
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<ImportResultDto, String> {
            let conn = crate::db::open_db(&state_path).map_err(|error| error.to_string())?;
            let mut added = 0i64;
            let mut updated = 0i64;
            let mut skipped = 0i64;
            for entry in WalkDir::new(&folder).into_iter().filter_map(Result::ok) {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let ext_ok = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
                    .unwrap_or(false);
                if !ext_ok {
                    continue;
                }
                if !is_authorized(&conn, path).map_err(|error| error.to_string())? {
                    continue;
                }
                let existed: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM tracks WHERE file_path = ?1",
                        params![path.to_string_lossy()],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                // 单个文件损坏/解析失败只跳过计数，不中止整个导入
                let Some(mut track) = read_track_metadata(path) else {
                    skipped += 1;
                    continue;
                };
                match extract_cover(&conn, &covers_dir, path, &track) {
                    Ok(cover_path) => track.cover_path = cover_path,
                    Err(_) => {
                        skipped += 1;
                        continue;
                    }
                }
                insert_track(&conn, &track).map_err(|error| error.to_string())?;
                if existed > 0 {
                    updated += 1;
                } else {
                    added += 1;
                }
            }
            let total: i64 = conn
                .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            Ok(ImportResultDto {
                added,
                updated,
                total,
                skipped,
            })
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
    let cover_path = covers_dir.join(format!(
        "{}.{}",
        track_id_for_path(&track.file_path),
        extension
    ));
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
pub fn set_track_liked_command(
    state: State<'_, AppState>,
    id: String,
    liked: bool,
) -> Result<(), String> {
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

#[tauri::command]
pub fn playback_history_command(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let limit = limit.unwrap_or(50).clamp(1, 200);
    playback_history(&conn, limit).map_err(|error| error.to_string())
}

/// 本地曲目的同目录 .lrc 歌词（原样字节，base64 编码）。
///
/// 编码探测交给前端 TextDecoder（utf-8 fatal → gbk 回退）：Windows 下歌词
/// 大量是 GBK，Rust 侧不加编码依赖也能正确解码。
#[tauri::command]
pub fn local_lyric(state: State<'_, AppState>, id: String) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT file_path, source FROM tracks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((file_path, source)) = row else {
        return Err("曲目不存在".into());
    };
    if source != "local" {
        return Ok(None);
    }
    read_sidecar_lrc(Path::new(&file_path))
}

/// 同目录查找 `<音频主名>.lrc`（兼容大写 .LRC），命中返回 base64 字节
fn read_sidecar_lrc(audio_path: &Path) -> Result<Option<String>, String> {
    let Some(found) = find_sidecar_lrc(audio_path) else {
        return Ok(None);
    };
    let bytes = std::fs::read(&found).map_err(|error| error.to_string())?;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;
    Ok(Some(BASE64.encode(bytes)))
}

fn find_sidecar_lrc(audio_path: &Path) -> Option<std::path::PathBuf> {
    let stem = audio_path.file_stem()?.to_string_lossy();
    let dir = audio_path.parent()?;
    for name in [format!("{stem}.lrc"), format!("{stem}.LRC")] {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
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
        let track = NewTrack {
            title: "a".into(),
            artist: "b".into(),
            album: String::new(),
            duration_seconds: 1,
            file_path: "p".into(),
            cover_path: None,
        };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        set_track_liked(&conn, &id, true).unwrap();
        assert!(load_tracks(&conn).unwrap()[0].liked);
    }

    #[test]
    fn playback_event_rejects_unknown_type() {
        let conn = memory_db();
        let track = NewTrack {
            title: "a".into(),
            artist: "b".into(),
            album: String::new(),
            duration_seconds: 1,
            file_path: "p".into(),
            cover_path: None,
        };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        assert!(record_playback_event(&conn, &id, "play", 0).is_ok());
        assert!(record_playback_event(&conn, &id, "explode", 0).is_err());
    }

    #[test]
    fn playback_history_orders_by_latest_play() {
        let conn = memory_db();
        for (title, path) in [("先播", "p1"), ("后播", "p2")] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: "b".into(),
                    album: String::new(),
                    duration_seconds: 1,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        let first = load_tracks(&conn).unwrap()[0].id.clone();
        let second = load_tracks(&conn).unwrap()[1].id.clone();
        // played_at 秒级精度，直接注入显式时间戳保证顺序确定
        for (track, at) in [
            (&first, "2026-09-23 10:00:00"),
            (&second, "2026-09-23 11:00:00"),
        ] {
            conn.execute(
                "INSERT INTO playback_events (id, track_id, event_type, position_seconds, played_at)
                 VALUES (?1, ?2, 'play', 0, ?3)",
                params![format!("evt-{track}-{at}"), track, at],
            )
            .unwrap();
        }
        let history = playback_history(&conn, 50).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, second);
        assert_eq!(history[1].id, first);
    }

    // ---------- 同目录 .lrc ----------

    /// 临时目录造一个音频 + 歌词文件，返回音频路径
    fn make_sidecar_pair(lrc_name: &str, lrc_bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ome-lrc-test-{:x}",
            md5::compute(format!("{lrc_name:?}{lrc_bytes:?}"))
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("夜曲.flac");
        std::fs::write(&audio, b"fake-audio").unwrap();
        std::fs::write(dir.join(lrc_name), lrc_bytes).unwrap();
        audio
    }

    #[test]
    fn sidecar_lrc_found_same_dir_and_base64_roundtrip() {
        let audio = make_sidecar_pair("夜曲.lrc", "[00:01.00]你好".as_bytes());
        let encoded = read_sidecar_lrc(&audio)
            .unwrap()
            .expect("应命中同目录 .lrc");
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine as _;
        let bytes = BASE64.decode(encoded).unwrap();
        assert_eq!(bytes, "[00:01.00]你好".as_bytes());
    }

    #[test]
    fn sidecar_lrc_supports_uppercase_extension() {
        let audio = make_sidecar_pair("夜曲.LRC", b"[00:01.00]hi");
        assert!(read_sidecar_lrc(&audio).unwrap().is_some());
    }

    #[test]
    fn sidecar_lrc_returns_none_when_missing() {
        let dir = std::env::temp_dir().join("ome-lrc-test-missing");
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("无歌词.flac");
        std::fs::write(&audio, b"fake-audio").unwrap();
        assert!(read_sidecar_lrc(&audio).unwrap().is_none());
    }

    #[test]
    fn sidecar_lrc_requires_real_file() {
        // 同名目录而不是文件：不应命中
        let dir = std::env::temp_dir().join("ome-lrc-test-dir-trap");
        std::fs::create_dir_all(dir.join("陷阱.lrc")).unwrap();
        let audio = dir.join("陷阱.flac");
        std::fs::write(&audio, b"fake-audio").unwrap();
        assert!(read_sidecar_lrc(&audio).unwrap().is_none());
    }
}
