//! 播放列表（ECHO Next 曲库管理能力补齐）：复用 001 迁移已有的
//! playlists（source 区分 local/imported/ai）+ playlist_tracks 两表，
//! 纯逻辑（CRUD/去重/排序）与 Tauri 命令分离，便于单测。

use crate::library::{row_to_track, TrackDto, TRACK_SELECT};
use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub track_count: i64,
    pub created_at: String,
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
        "SELECT p.id, p.name, p.created_at, COUNT(pt.track_id) AS track_count
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
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
         WHERE pt.playlist_id = ?1
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;
    use crate::library::{insert_track, NewTrack};

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
}
