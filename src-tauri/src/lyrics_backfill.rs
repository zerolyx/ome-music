//! Persistent, user-started missing-lyrics queue.
//!
//! The renderer performs bounded searches using the existing fixed-origin lyric
//! providers. This module owns durable progress and keeps automatic matches
//! separate from lyrics the user explicitly selected.

use crate::library::{
    has_local_main_lyrics_for_backfill, lyrics_backfill_track_candidate,
    validate_saved_track_lyrics_request, LyricsBackfillTrackDto, SaveTrackLyricsRequestDto,
    SavedTrackLyricsDto,
};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const MAX_BACKFILL_TRACKS: usize = 20_000;
static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBackfillJobDto {
    pub id: String,
    pub mode: String,
    pub threshold: u8,
    pub status: String,
    pub total: u32,
    pub processed: u32,
    pub matched: u32,
    pub no_match: u32,
    pub skipped: u32,
    pub failed: u32,
    pub current_track_title: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackfillLyricsRequestDto {
    pub provider: String,
    pub provider_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub raw_lyrics_json: String,
    pub score: u8,
}

fn new_job_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!(
        "lyric-backfill-{timestamp}-{}",
        JOB_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

fn job_status(conn: &Connection, job_id: &str) -> Result<Option<LyricsBackfillJobDto>, String> {
    conn.query_row(
        "SELECT j.id, j.mode, j.threshold, j.status, j.total_count,
                COALESCE(SUM(CASE WHEN i.status IN ('matched', 'no_match', 'skipped', 'failed') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN i.status = 'matched' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN i.status = 'no_match' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN i.status = 'skipped' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN i.status = 'failed' THEN 1 ELSE 0 END), 0),
                j.current_track_title, j.note, j.created_at, j.updated_at
         FROM lyrics_backfill_jobs j
         LEFT JOIN lyrics_backfill_items i ON i.job_id = j.id
         WHERE j.id = ?1
         GROUP BY j.id",
        params![job_id],
        |row| {
            Ok(LyricsBackfillJobDto {
                id: row.get(0)?,
                mode: row.get(1)?,
                threshold: row.get(2)?,
                status: row.get(3)?,
                total: row.get(4)?,
                processed: row.get(5)?,
                matched: row.get(6)?,
                no_match: row.get(7)?,
                skipped: row.get(8)?,
                failed: row.get(9)?,
                current_track_title: row.get(10)?,
                note: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn finish_if_idle(conn: &Connection, job_id: &str) -> Result<(), String> {
    let unfinished: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lyrics_backfill_items
             WHERE job_id = ?1 AND status IN ('pending', 'processing')",
            params![job_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if unfinished == 0 {
        conn.execute(
            "UPDATE lyrics_backfill_jobs
             SET status = 'completed', current_track_title = NULL, note = NULL,
                 updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND status = 'running'",
            params![job_id],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn start_lyrics_backfill_command(
    state: State<'_, AppState>,
    mode: String,
    threshold: u8,
) -> Result<LyricsBackfillJobDto, String> {
    if !matches!(mode.as_str(), "quick" | "complete") {
        return Err("歌词回填模式无效".into());
    }
    if !(82..=95).contains(&threshold) {
        return Err("自动匹配阈值需在 82% 到 95% 之间".into());
    }

    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    let active: Option<(String,)> = conn
        .query_row(
            "SELECT id FROM lyrics_backfill_jobs WHERE status IN ('running', 'paused')
             ORDER BY created_at DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?,)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if active.is_some() {
        return Err("已有歌词回填任务；请先继续或停止它".into());
    }

    let track_ids = {
        let mut statement = conn
            .prepare(
                "SELECT t.id FROM tracks t
                 WHERE t.source = 'local' AND t.ignored_by_rules = 0
                   AND NOT EXISTS (SELECT 1 FROM saved_track_lyrics s WHERE s.track_id = t.id)
                   AND NOT EXISTS (SELECT 1 FROM backfilled_track_lyrics b WHERE b.track_id = t.id)
                 ORDER BY t.title COLLATE NOCASE, t.id
                 LIMIT ?1",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![MAX_BACKFILL_TRACKS as i64], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    let mut eligible_ids = Vec::with_capacity(track_ids.len());
    for track_id in track_ids {
        if lyrics_backfill_track_candidate(&conn, &track_id)
            .ok()
            .flatten()
            .is_some()
        {
            eligible_ids.push(track_id);
        }
    }

    let job_id = new_job_id();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO lyrics_backfill_jobs (id, mode, threshold, status, total_count)
         VALUES (?1, ?2, ?3, 'running', ?4)",
        params![job_id, mode, threshold, eligible_ids.len() as u32],
    )
    .map_err(|error| error.to_string())?;
    {
        let mut statement = tx
            .prepare(
                "INSERT INTO lyrics_backfill_items (job_id, track_id, status)
                 VALUES (?1, ?2, 'pending')",
            )
            .map_err(|error| error.to_string())?;
        for track_id in eligible_ids {
            statement
                .execute(params![job_id, track_id])
                .map_err(|error| error.to_string())?;
        }
    }
    finish_if_idle(&tx, &job_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    job_status(&conn, &job_id)?.ok_or_else(|| "无法读取新建的歌词回填任务".into())
}

#[tauri::command]
pub fn get_current_lyrics_backfill_command(
    state: State<'_, AppState>,
) -> Result<Option<LyricsBackfillJobDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let job_id: Option<String> = conn
        .query_row(
            "SELECT id FROM lyrics_backfill_jobs ORDER BY created_at DESC, rowid DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match job_id {
        Some(id) => job_status(&conn, &id),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn resume_lyrics_backfill_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<LyricsBackfillJobDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let changed = conn
        .execute(
            "UPDATE lyrics_backfill_items SET status = 'pending', updated_at = CURRENT_TIMESTAMP
             WHERE job_id = ?1 AND status = 'processing'",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    let _ = changed;
    let updated = conn
        .execute(
            "UPDATE lyrics_backfill_jobs SET status = 'running', current_track_title = NULL,
                note = NULL, updated_at = CURRENT_TIMESTAMP, finished_at = NULL
             WHERE id = ?1 AND status IN ('paused', 'running')",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Err("没有可继续的歌词回填任务".into());
    }
    job_status(&conn, &id)?.ok_or_else(|| "歌词回填任务不存在".into())
}

#[tauri::command]
pub fn next_lyrics_backfill_track_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<LyricsBackfillTrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM lyrics_backfill_jobs WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if status.as_deref() != Some("running") {
        return Ok(None);
    }

    loop {
        let track_id: Option<String> = conn
            .query_row(
                "SELECT track_id FROM lyrics_backfill_items
                 WHERE job_id = ?1 AND status = 'pending' ORDER BY rowid LIMIT 1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let Some(track_id) = track_id else {
            finish_if_idle(&conn, &id)?;
            return Ok(None);
        };
        let changed = conn
            .execute(
                "UPDATE lyrics_backfill_items SET status = 'processing', updated_at = CURRENT_TIMESTAMP
                 WHERE job_id = ?1 AND track_id = ?2 AND status = 'pending'",
                params![id, track_id],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            continue;
        }
        match lyrics_backfill_track_candidate(&conn, &track_id) {
            Ok(Some(track)) => {
                conn.execute(
                    "UPDATE lyrics_backfill_jobs SET current_track_title = ?2, note = NULL,
                        updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, track.title],
                )
                .map_err(|error| error.to_string())?;
                return Ok(Some(track));
            }
            Ok(None) | Err(_) => {
                conn.execute(
                    "UPDATE lyrics_backfill_items SET status = 'skipped',
                        message = '曲目已移除或不在当前有效授权范围内', updated_at = CURRENT_TIMESTAMP
                     WHERE job_id = ?1 AND track_id = ?2",
                    params![id, track_id],
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }
}

fn store_item_result(
    conn: &Connection,
    job_id: &str,
    track_id: &str,
    result: &str,
    provider: Option<&str>,
    score: Option<u8>,
    message: Option<&str>,
) -> Result<LyricsBackfillJobDto, String> {
    if !matches!(result, "no_match" | "skipped" | "failed") {
        return Err("歌词回填结果无效".into());
    }
    let job_state: Option<String> = conn
        .query_row(
            "SELECT status FROM lyrics_backfill_jobs WHERE id = ?1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if job_state.as_deref() != Some("running") {
        return Err("歌词回填任务已停止".into());
    }
    let safe_message = message
        .map(|value| {
            value
                .chars()
                .filter(|character| !character.is_control())
                .take(240)
                .collect::<String>()
        })
        .filter(|value| !value.trim().is_empty());
    let changed = conn
        .execute(
            "UPDATE lyrics_backfill_items SET status = ?3, provider = ?4, score = ?5,
                message = ?6, updated_at = CURRENT_TIMESTAMP
             WHERE job_id = ?1 AND track_id = ?2 AND status = 'processing'",
            params![job_id, track_id, result, provider, score, safe_message],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("该曲目不属于当前歌词回填步骤".into());
    }
    conn.execute(
        "UPDATE lyrics_backfill_jobs SET current_track_title = NULL,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![job_id],
    )
    .map_err(|error| error.to_string())?;
    finish_if_idle(conn, job_id)?;
    job_status(conn, job_id)?.ok_or_else(|| "歌词回填任务不存在".into())
}

#[tauri::command]
pub fn complete_lyrics_backfill_track_command(
    state: State<'_, AppState>,
    job_id: String,
    track_id: String,
    result: String,
    provider: Option<String>,
    score: Option<u8>,
    message: Option<String>,
) -> Result<LyricsBackfillJobDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    store_item_result(
        &conn,
        &job_id,
        &track_id,
        &result,
        provider.as_deref(),
        score,
        message.as_deref(),
    )
}

#[tauri::command]
pub fn save_auto_backfilled_track_lyrics_command(
    state: State<'_, AppState>,
    job_id: String,
    track_id: String,
    request: AutoBackfillLyricsRequestDto,
) -> Result<LyricsBackfillJobDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let threshold: Option<u8> = tx
        .query_row(
            "SELECT threshold FROM lyrics_backfill_jobs WHERE id = ?1 AND status = 'running'",
            params![job_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(threshold) = threshold else {
        return Err("歌词回填任务已停止".into());
    };
    if request.score < threshold {
        return Err("候选匹配分数低于自动保存阈值".into());
    }
    if lyrics_backfill_track_candidate(&tx, &track_id)?.is_none() {
        return Err("曲目已移除或不在当前有效授权范围内".into());
    }
    if has_local_main_lyrics_for_backfill(&tx, &track_id)? {
        return Err("曲目已有本地歌词，未覆盖".into());
    }
    let raw_lyrics = validate_saved_track_lyrics_request(&SaveTrackLyricsRequestDto {
        provider: request.provider.clone(),
        provider_id: request.provider_id.clone(),
        title: request.title.clone(),
        artist: request.artist.clone(),
        album: request.album.clone(),
        raw_lyrics_json: request.raw_lyrics_json.clone(),
    })?;
    let manual_lyrics_exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM saved_track_lyrics WHERE track_id = ?1)",
            params![track_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if manual_lyrics_exists {
        return Err("曲目已有用户保存的歌词，未覆盖".into());
    }
    let raw_json = serde_json::to_string(&raw_lyrics).map_err(|error| error.to_string())?;
    let inserted = tx
        .execute(
            "INSERT INTO backfilled_track_lyrics (
                track_id, provider, provider_id, title, artist, album, raw_lyrics_json, score
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(track_id) DO NOTHING",
            params![
                track_id,
                request.provider,
                request.provider_id,
                request.title.trim(),
                request.artist.trim(),
                request
                    .album
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                raw_json,
                request.score,
            ],
        )
        .map_err(|error| error.to_string())?;
    if inserted == 0 {
        return Err("这首曲目已经有自动回填歌词".into());
    }
    let changed = tx
        .execute(
            "UPDATE lyrics_backfill_items SET status = 'matched', provider = ?3,
                score = ?4, message = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE job_id = ?1 AND track_id = ?2 AND status = 'processing'",
            params![job_id, track_id, request.provider, request.score],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("该曲目不属于当前歌词回填步骤".into());
    }
    tx.execute(
        "UPDATE lyrics_backfill_jobs SET current_track_title = NULL, note = NULL,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![job_id],
    )
    .map_err(|error| error.to_string())?;
    finish_if_idle(&tx, &job_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    job_status(&conn, &job_id)?.ok_or_else(|| "歌词回填任务不存在".into())
}

#[tauri::command]
pub fn pause_lyrics_backfill_command(
    state: State<'_, AppState>,
    id: String,
    note: Option<String>,
) -> Result<LyricsBackfillJobDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    conn.execute(
        "UPDATE lyrics_backfill_items SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE job_id = ?1 AND status = 'processing'",
        params![id],
    )
    .map_err(|error| error.to_string())?;
    let safe_note = note
        .map(|value| {
            value
                .chars()
                .filter(|character| !character.is_control())
                .take(240)
                .collect::<String>()
        })
        .filter(|value| !value.trim().is_empty());
    conn.execute(
        "UPDATE lyrics_backfill_jobs SET status = 'paused', current_track_title = NULL,
            note = ?2, updated_at = CURRENT_TIMESTAMP, finished_at = NULL
         WHERE id = ?1 AND status = 'running'",
        params![id, safe_note],
    )
    .map_err(|error| error.to_string())?;
    job_status(&conn, &id)?.ok_or_else(|| "歌词回填任务不存在".into())
}

#[tauri::command]
pub fn cancel_lyrics_backfill_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<LyricsBackfillJobDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    conn.execute(
        "UPDATE lyrics_backfill_items SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE job_id = ?1 AND status = 'processing'",
        params![id],
    )
    .map_err(|error| error.to_string())?;
    let changed = conn
        .execute(
            "UPDATE lyrics_backfill_jobs SET status = 'cancelled', current_track_title = NULL,
                note = NULL, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND status IN ('running', 'paused')",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("歌词回填任务已经结束".into());
    }
    job_status(&conn, &id)?.ok_or_else(|| "歌词回填任务不存在".into())
}

#[tauri::command]
pub fn get_auto_backfilled_track_lyrics_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<SavedTrackLyricsDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    conn.query_row(
        "SELECT track_id, provider, provider_id, title, artist, album, raw_lyrics_json, saved_at
         FROM backfilled_track_lyrics WHERE track_id = ?1",
        params![id],
        |row| {
            let raw_json: String = row.get(6)?;
            let raw_lyrics = serde_json::from_str(&raw_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    raw_json.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(SavedTrackLyricsDto {
                track_id: row.get(0)?,
                provider: row.get(1)?,
                provider_id: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                raw_lyrics,
                saved_at: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    #[test]
    fn backfill_migration_separates_automatic_lyrics_and_creates_resumable_jobs() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
                 AND name IN ('backfilled_track_lyrics', 'lyrics_backfill_jobs', 'lyrics_backfill_items')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 3);
    }

    #[test]
    fn backfill_track_dto_does_not_expose_local_paths() {
        let dto = LyricsBackfillTrackDto {
            track_id: "track-id".into(),
            title: "Title".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            duration_seconds: 180,
        };
        let serialized = serde_json::to_value(dto).unwrap();
        assert!(serialized.get("filePath").is_none());
        assert!(serialized.get("file_path").is_none());
    }
}
