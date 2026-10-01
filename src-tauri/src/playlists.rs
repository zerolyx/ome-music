//! 播放列表（ECHO Next 曲库管理能力补齐）：复用 001 迁移已有的
//! playlists（source 区分 local/imported/ai）+ playlist_tracks 两表，
//! 纯逻辑（CRUD/去重/排序）与 Tauri 命令分离，便于单测。

use crate::library::{row_to_track, TrackDto, TRACK_SELECT};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, State};

const MAX_M3U_BYTES: u64 = 2 * 1024 * 1024;
const MAX_M3U_LINE_BYTES: usize = 8192;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub track_count: i64,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistImportResult {
    pub playlist: Option<PlaylistDto>,
    pub imported: i64,
    pub skipped: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistExportResult {
    pub exported: i64,
    pub skipped: i64,
}

fn new_id(seed: &str) -> String {
    format!(
        "{:x}",
        md5::compute(format!("{seed}{:?}", std::time::SystemTime::now()))
    )
}

// ---------- 纯逻辑 ----------

pub fn list_playlists(conn: &Connection) -> Result<Vec<PlaylistDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.created_at, COUNT(t.id) AS track_count
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         LEFT JOIN tracks t ON t.id = pt.track_id AND t.ignored_by_rules = 0
         GROUP BY p.id
         ORDER BY p.updated_at DESC, p.created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PlaylistDto {
            id: row.get("id")?,
            name: row.get("name")?,
            created_at: row.get("created_at")?,
            track_count: row.get("track_count")?,
        })
    })?;
    rows.collect()
}

pub fn create_playlist(conn: &Connection, name: &str) -> Result<PlaylistDto, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("歌单名不能为空".into());
    }
    let id = new_id(name);
    conn.execute(
        "INSERT INTO playlists (id, name, source) VALUES (?1, ?2, 'local')",
        params![id, name],
    )
    .map_err(|error| error.to_string())?;
    Ok(PlaylistDto {
        id,
        name: name.to_string(),
        track_count: 0,
        created_at: String::new(), // 前端不展示创建时间，省去回查
    })
}

pub fn rename_playlist(conn: &Connection, id: &str, name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("歌单名不能为空".into());
    }
    let changed = conn
        .execute(
            "UPDATE playlists SET name = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, name],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("歌单不存在".into());
    }
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: &str) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM playlists WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("歌单不存在".into());
    }
    Ok(())
}

/// 歌单内曲目：按加入顺序（position 升序，同位置按加入时间）
pub fn playlist_tracks(
    conn: &Connection,
    playlist_id: &str,
) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        &(TRACK_SELECT.to_string()
            + " JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ?1 AND t.ignored_by_rules = 0
         ORDER BY pt.position, pt.added_at"),
    )?;
    let rows = stmt.query_map(params![playlist_id], row_to_track)?;
    rows.collect()
}

/// 追加曲目：已存在的跳过（主键去重），position 接在末尾；返回实际新增条数
pub fn playlist_add_tracks(
    conn: &Connection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<i64, String> {
    conn.execute(
        "UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![playlist_id],
    )
    .map_err(|error| error.to_string())?;
    let max_position: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let mut added = 0i64;
    for (index, track_id) in track_ids.iter().enumerate() {
        let changed = conn
            .execute(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, track_id, max_position + 1 + index as i64],
            )
            .map_err(|error| error.to_string())?;
        added += changed as i64;
    }
    Ok(added)
}

pub fn playlist_remove_track(
    conn: &Connection,
    playlist_id: &str,
    track_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
        params![playlist_id, track_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn normalized_path_key(path: &Path) -> String {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push(component.as_os_str());
                }
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase()
}

fn m3u_candidate_path(raw: &str, playlist_dir: &Path) -> Option<PathBuf> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > MAX_M3U_LINE_BYTES {
        return None;
    }

    let mut candidate = if raw
        .get(..7)
        .map(|prefix| prefix.eq_ignore_ascii_case("file://"))
        == Some(true)
    {
        let decoded = urlencoding::decode(&raw[7..]).ok()?.into_owned();
        let decoded = if decoded
            .get(..10)
            .map(|prefix| prefix.eq_ignore_ascii_case("localhost/"))
            == Some(true)
        {
            format!("/{}", &decoded[10..])
        } else {
            decoded
        };
        #[cfg(windows)]
        let decoded = {
            let bytes = decoded.as_bytes();
            if decoded.starts_with('/')
                && bytes.len() >= 3
                && bytes[1].is_ascii_alphabetic()
                && bytes[2] == b':'
            {
                decoded[1..].to_string()
            } else {
                decoded
            }
        };
        PathBuf::from(decoded)
    } else {
        if raw.contains("://")
            || raw
                .get(..5)
                .map(|prefix| prefix.eq_ignore_ascii_case("file:"))
                == Some(true)
        {
            return None;
        }
        let path = PathBuf::from(raw);
        if raw.as_bytes().get(1) == Some(&b':') && !path.is_absolute() {
            // Drive-relative paths (C:folder) depend on process state and cannot be
            // resolved safely from an imported playlist.
            return None;
        }
        path
    };

    if !candidate.is_absolute() {
        candidate = playlist_dir.join(candidate);
    }
    Some(candidate)
}

fn import_m3u_contents(
    conn: &mut Connection,
    playlist_file: &Path,
    contents: &str,
) -> Result<PlaylistImportResult, String> {
    let playlist_dir = playlist_file.parent().unwrap_or_else(|| Path::new("."));
    let mut entry_count = 0i64;
    let mut ordered_ids = Vec::new();
    let mut seen_ids = HashSet::new();

    let mut tracks_by_path = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, file_path FROM tracks
                 WHERE source = 'local' AND ignored_by_rules = 0",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let (id, path) = row.map_err(|error| error.to_string())?;
            tracks_by_path.insert(normalized_path_key(Path::new(&path)), id);
        }
    }

    for line in contents.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        entry_count += 1;
        if let Some(path) = m3u_candidate_path(line, playlist_dir) {
            if let Some(id) = tracks_by_path.get(&normalized_path_key(&path)) {
                if seen_ids.insert(id.clone()) {
                    ordered_ids.push(id.clone());
                }
            }
        }
    }

    let skipped = entry_count - ordered_ids.len() as i64;
    if ordered_ids.is_empty() {
        return Ok(PlaylistImportResult {
            playlist: None,
            imported: 0,
            skipped,
        });
    }

    let raw_name = playlist_file
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("导入歌单");
    let name = raw_name.chars().take(120).collect::<String>();
    let playlist_id = new_id(&name);
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO playlists (id, name, source) VALUES (?1, ?2, 'local')",
        params![playlist_id, name],
    )
    .map_err(|error| error.to_string())?;
    for (position, track_id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, position as i64],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;

    Ok(PlaylistImportResult {
        playlist: Some(PlaylistDto {
            id: playlist_id,
            name,
            track_count: ordered_ids.len() as i64,
            created_at: String::new(),
        }),
        imported: ordered_ids.len() as i64,
        skipped,
    })
}

fn safe_m3u_metadata(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn relative_playlist_path(base: &Path, target: &Path) -> Option<PathBuf> {
    let base_parts = base.components().collect::<Vec<_>>();
    let target_parts = target.components().collect::<Vec<_>>();
    let mut common = 0;
    while common < base_parts.len()
        && common < target_parts.len()
        && base_parts[common]
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&target_parts[common].as_os_str().to_string_lossy())
    {
        common += 1;
    }

    // A different drive/share cannot be represented as a relative M3U path.
    if common == 0 {
        return None;
    }
    let mut relative = PathBuf::new();
    for _ in common..base_parts.len() {
        relative.push("..");
    }
    for component in target_parts.iter().skip(common) {
        relative.push(component.as_os_str());
    }
    Some(relative)
}

fn build_m3u_playlist(
    conn: &Connection,
    playlist_id: &str,
    playlist_dir: &Path,
) -> Result<(String, PlaylistExportResult), String> {
    let playlist_exists: Option<String> = conn
        .query_row(
            "SELECT name FROM playlists WHERE id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if playlist_exists.is_none() {
        return Err("歌单不存在".into());
    }

    let tracks = playlist_tracks(conn, playlist_id).map_err(|error| error.to_string())?;
    let mut output = String::from("#EXTM3U\n");
    let mut exported = 0i64;
    let mut skipped = 0i64;
    for track in tracks {
        if track.source != "local" || track.file_path.trim().is_empty() {
            skipped += 1;
            continue;
        }
        let audio_path = Path::new(&track.file_path);
        let path = relative_playlist_path(playlist_dir, audio_path)
            .unwrap_or_else(|| audio_path.to_path_buf())
            .to_string_lossy()
            .replace('\\', "/");
        let title = safe_m3u_metadata(&track.title);
        let artist = safe_m3u_metadata(&track.artist);
        output.push_str(&format!(
            "#EXTINF:{},{} - {}\n{}\n",
            track.duration_seconds, artist, title, path
        ));
        exported += 1;
    }

    Ok((output, PlaylistExportResult { exported, skipped }))
}

fn export_m3u_playlist(
    conn: &Connection,
    playlist_id: &str,
    destination: &Path,
) -> Result<PlaylistExportResult, String> {
    let playlist_dir = destination.parent().unwrap_or_else(|| Path::new("."));
    let (contents, result) = build_m3u_playlist(conn, playlist_id, playlist_dir)?;
    std::fs::write(destination, contents).map_err(|error| error.to_string())?;
    Ok(result)
}

// ---------- Tauri 命令 ----------

#[tauri::command]
pub fn playlist_list(state: State<'_, AppState>) -> Result<Vec<PlaylistDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    list_playlists(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn playlist_create(state: State<'_, AppState>, name: String) -> Result<PlaylistDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    create_playlist(&conn, &name)
}

#[tauri::command]
pub fn playlist_rename(state: State<'_, AppState>, id: String, name: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    rename_playlist(&conn, &id, &name)
}

#[tauri::command]
pub fn playlist_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_playlist(&conn, &id)
}

#[tauri::command]
pub fn playlist_tracks_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    playlist_tracks(&conn, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn playlist_add_command(
    state: State<'_, AppState>,
    id: String,
    track_ids: Vec<String>,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    playlist_add_tracks(&conn, &id, &track_ids)
}

#[tauri::command]
pub fn playlist_remove_command(
    state: State<'_, AppState>,
    id: String,
    track_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    playlist_remove_track(&conn, &id, &track_id)
}

#[tauri::command]
pub fn playlist_import_m3u(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Option<PlaylistImportResult>, String> {
    let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .add_filter("M3U 歌单", &["m3u", "m3u8"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_M3U_BYTES {
        return Err("歌单文件超过 2 MiB，暂不支持导入".into());
    }
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_M3U_BYTES {
        return Err("歌单文件超过 2 MiB，暂不支持导入".into());
    }
    let contents =
        String::from_utf8(bytes).map_err(|_| "歌单文件不是有效的 UTF-8 文本".to_string())?;
    let contents = contents.strip_prefix('\u{feff}').unwrap_or(&contents);
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    import_m3u_contents(&mut conn, &path, contents).map(Some)
}

#[tauri::command]
pub fn playlist_export_m3u(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<Option<PlaylistExportResult>, String> {
    let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .add_filter("M3U8 歌单", &["m3u8", "m3u"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = selected.into_path().map_err(|error| error.to_string())?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    export_m3u_playlist(&conn, &id, &destination).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;
    use crate::library::{insert_track, load_tracks, NewTrack};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn seed_track(conn: &Connection, title: &str, path: &str) {
        insert_track(
            conn,
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

    fn track_ids(conn: &Connection) -> Vec<String> {
        crate::library::load_tracks(conn)
            .unwrap()
            .into_iter()
            .map(|track| track.id)
            .collect()
    }

    #[test]
    fn create_list_rename_delete_roundtrip() {
        let conn = memory_db();
        let playlist = create_playlist(&conn, "深夜电台").unwrap();
        assert_eq!(playlist.name, "深夜电台");
        assert!(list_playlists(&conn)
            .unwrap()
            .iter()
            .any(|item| item.id == playlist.id));
        rename_playlist(&conn, &playlist.id, "清晨").unwrap();
        assert_eq!(list_playlists(&conn).unwrap()[0].name, "清晨");
        delete_playlist(&conn, &playlist.id).unwrap();
        assert!(list_playlists(&conn).unwrap().is_empty());
        assert!(create_playlist(&conn, "   ").is_err());
        assert!(rename_playlist(&conn, "ghost", "x").is_err());
    }

    #[test]
    fn add_tracks_dedupes_and_orders_then_remove() {
        let conn = memory_db();
        seed_track(&conn, "a", "p1");
        seed_track(&conn, "b", "p2");
        let ids = track_ids(&conn);
        let playlist = create_playlist(&conn, "mix").unwrap();
        assert_eq!(playlist_add_tracks(&conn, &playlist.id, &ids).unwrap(), 2);
        // 重复添加被去重
        assert_eq!(playlist_add_tracks(&conn, &playlist.id, &ids).unwrap(), 0);
        let tracks = playlist_tracks(&conn, &playlist.id).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].id, ids[0]);
        assert_eq!(tracks[1].id, ids[1]);
        playlist_remove_track(&conn, &playlist.id, &ids[0]).unwrap();
        let tracks = playlist_tracks(&conn, &playlist.id).unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, ids[1]);
    }

    #[test]
    fn deleting_playlist_removes_membership_rows() {
        let conn = memory_db();
        seed_track(&conn, "a", "p1");
        let ids = track_ids(&conn);
        let playlist = create_playlist(&conn, "temp").unwrap();
        playlist_add_tracks(&conn, &playlist.id, &ids).unwrap();
        delete_playlist(&conn, &playlist.id).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM playlist_tracks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn playlist_track_count_aggregates() {
        let conn = memory_db();
        seed_track(&conn, "a", "p1");
        seed_track(&conn, "b", "p2");
        let ids = track_ids(&conn);
        let playlist = create_playlist(&conn, "count").unwrap();
        playlist_add_tracks(&conn, &playlist.id, &ids).unwrap();
        let listed = list_playlists(&conn).unwrap();
        assert_eq!(listed[0].track_count, 2);
    }

    #[test]
    fn ignored_playlist_tracks_keep_membership_and_return_after_restore() {
        let conn = memory_db();
        seed_track(&conn, "kept", r"C:\music\kept.mp3");
        let id = track_ids(&conn)[0].clone();
        let playlist = create_playlist(&conn, "kept for later").unwrap();
        playlist_add_tracks(&conn, &playlist.id, std::slice::from_ref(&id)).unwrap();

        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 1 WHERE id = ?1",
            params![id],
        )
        .unwrap();
        assert_eq!(list_playlists(&conn).unwrap()[0].track_count, 0);
        assert!(playlist_tracks(&conn, &playlist.id).unwrap().is_empty());
        let membership_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
                params![playlist.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(membership_count, 1);

        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 0 WHERE id = ?1",
            params![id],
        )
        .unwrap();
        assert_eq!(list_playlists(&conn).unwrap()[0].track_count, 1);
        assert_eq!(playlist_tracks(&conn, &playlist.id).unwrap().len(), 1);
    }

    #[test]
    fn m3u_import_matches_only_indexed_local_paths_and_keeps_order() {
        let mut conn = memory_db();
        #[cfg(windows)]
        let (music_dir, playlist_file, missing_path) =
            (r"C:\music", r"C:\playlists\mix.m3u8", r"C:\missing.mp3");
        #[cfg(not(windows))]
        let (music_dir, playlist_file, missing_path) =
            ("/music", "/playlists/mix.m3u8", "/missing.mp3");
        let music_dir_path = Path::new(music_dir);
        seed_track(
            &conn,
            "first",
            &music_dir_path.join("first.mp3").to_string_lossy(),
        );
        seed_track(
            &conn,
            "second",
            &music_dir_path.join("second.mp3").to_string_lossy(),
        );
        let tracks = load_tracks(&conn).unwrap();
        let first_id = tracks
            .iter()
            .find(|track| track.title == "first")
            .unwrap()
            .id
            .clone();
        let second_id = tracks
            .iter()
            .find(|track| track.title == "second")
            .unwrap()
            .id
            .clone();
        let second_path = music_dir_path.join("second.mp3");
        let second_line = second_path.to_string_lossy();
        let contents = format!(
            "#EXTM3U\n#EXTINF:1,Second\n{second_line}\n../music/first.mp3\nhttps://example.com/remote.mp3\n{second_line}\n{missing_path}\n",
        );
        let result = import_m3u_contents(&mut conn, Path::new(playlist_file), &contents).unwrap();

        let playlist = result.playlist.unwrap();
        assert_eq!(result.imported, 2);
        assert_eq!(result.skipped, 3);
        let ordered = playlist_tracks(&conn, &playlist.id).unwrap();
        assert_eq!(
            ordered
                .iter()
                .map(|track| track.id.as_str())
                .collect::<Vec<_>>(),
            vec![second_id.as_str(), first_id.as_str(),]
        );
    }

    #[test]
    fn m3u_import_does_not_create_empty_playlist() {
        let mut conn = memory_db();
        let result = import_m3u_contents(
            &mut conn,
            Path::new(r"C:\playlists\empty.m3u"),
            "#EXTM3U\nhttps://example.com/track.mp3\n",
        )
        .unwrap();

        assert!(result.playlist.is_none());
        assert_eq!(result.imported, 0);
        assert_eq!(result.skipped, 1);
        assert!(list_playlists(&conn).unwrap().is_empty());
    }

    #[test]
    fn m3u_import_does_not_match_rule_excluded_tracks() {
        let mut conn = memory_db();
        seed_track(&conn, "hidden", r"C:\music\hidden.mp3");
        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 1 WHERE file_path = ?1",
            [r"C:\music\hidden.mp3"],
        )
        .unwrap();

        let result = import_m3u_contents(
            &mut conn,
            Path::new(r"C:\playlists\hidden.m3u8"),
            "#EXTM3U\nC:\\music\\hidden.mp3\n",
        )
        .unwrap();
        assert!(result.playlist.is_none());
        assert_eq!(result.imported, 0);
        assert_eq!(result.skipped, 1);
    }

    #[test]
    fn file_uri_paths_decode_spaces_and_metadata_cannot_inject_m3u_lines() {
        let base = Path::new(r"C:\playlists");
        let file_uri = m3u_candidate_path("file:///C:/my%20music/song.mp3", base).unwrap();
        // to_file_path 语义按平台不同：Windows 剥掉盘符前的斜杠，Unix 保留它。
        #[cfg(windows)]
        let expected = Path::new(r"C:\my music\song.mp3");
        #[cfg(not(windows))]
        let expected = Path::new("/C:/my music/song.mp3");
        assert_eq!(
            normalized_path_key(&file_uri),
            normalized_path_key(expected)
        );
        assert_eq!(
            safe_m3u_metadata("artist\r\n#EXTINF:0,Injected"),
            "artist #EXTINF:0,Injected"
        );
    }

    #[test]
    fn m3u_export_skips_online_tracks_and_sanitizes_metadata_lines() {
        let conn = memory_db();
        #[cfg(windows)]
        let (track_path, playlist_dir) = (r"C:\music\track.mp3", Path::new(r"C:\playlists"));
        #[cfg(not(windows))]
        let (track_path, playlist_dir) = ("/music/track.mp3", Path::new("/playlists"));
        insert_track(
            &conn,
            &NewTrack {
                title: "A\r\n#EXTINF:99,Injected".into(),
                artist: "艺人\nInjected".into(),
                album: String::new(),
                duration_seconds: 12,
                file_path: track_path.into(),
                cover_path: None,
            },
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source)
             VALUES ('remote-track', '远程曲目', (SELECT id FROM artists LIMIT 1),
                     1, 'https://example.invalid/track', 'netease')",
            [],
        )
        .unwrap();
        let ids = load_tracks(&conn)
            .unwrap()
            .into_iter()
            .map(|track| track.id)
            .collect::<Vec<_>>();
        let playlist = create_playlist(&conn, "mix").unwrap();
        playlist_add_tracks(&conn, &playlist.id, &ids).unwrap();

        let (contents, result) = build_m3u_playlist(&conn, &playlist.id, playlist_dir).unwrap();
        assert_eq!(result.exported, 1);
        assert_eq!(result.skipped, 1);
        assert_eq!(
            contents
                .lines()
                .filter(|line| line.starts_with("#EXTINF:"))
                .count(),
            1
        );
        assert!(contents.contains("#EXTINF:12,艺人 Injected - A #EXTINF:99,Injected\n"));
        assert!(contents.contains("../music/track.mp3"));
        assert!(!contents.contains("https://example.invalid"));
    }
}
