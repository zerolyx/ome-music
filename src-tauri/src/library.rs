use crate::AppState;
use base64::Engine as _;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::tag::{Accessor, ItemKey, Tag, TagType};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::atomic::{AtomicU8, Ordering};

static LIBRARY_DATABASE_ACTIVITY: AtomicU8 = AtomicU8::new(0);

pub(crate) struct LibraryDatabaseActivityGuard;

impl Drop for LibraryDatabaseActivityGuard {
    fn drop(&mut self) {
        LIBRARY_DATABASE_ACTIVITY.store(0, Ordering::Release);
    }
}

pub(crate) fn begin_library_database_maintenance() -> Result<LibraryDatabaseActivityGuard, String> {
    LIBRARY_DATABASE_ACTIVITY
        .compare_exchange(0, 2, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| LibraryDatabaseActivityGuard)
        .map_err(|_| "曲库正在扫描或维护，请稍后重试".to_string())
}

fn begin_library_scan() -> Result<LibraryDatabaseActivityGuard, String> {
    LIBRARY_DATABASE_ACTIVITY
        .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| LibraryDatabaseActivityGuard)
        .map_err(|_| "曲库正在扫描或维护，请稍后重试".to_string())
}
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

use crate::library_ignore::{child_scopes, is_ignored, IgnoreScope};

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "ogg", "opus", "aac"];
pub(crate) const MAX_AUDIO_COVER_BYTES: usize = 8 * 1024 * 1024;
const MAX_AUDIO_COVER_PIXELS: u64 = 40_000_000;
const LIBRARY_IMPORT_PROGRESS_EVENT: &str = "library-import-progress";
const QUICK_HASH_VERSION: i64 = 1;
const QUICK_HASH_SAMPLE_BYTES: u64 = 64 * 1024;
const MAX_QUICK_IDENTITY_BACKFILL_BATCH: i64 = 100;
const MAX_LIBRARY_REMOVAL_BATCH: usize = 10_000;

fn is_supported_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn emit_import_progress(app: &AppHandle, progress: &LibraryImportProgressDto) {
    // 进度消息只带数量和阶段，不发送本地路径或歌曲名。
    let _ = app.emit(LIBRARY_IMPORT_PROGRESS_EVENT, progress);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: String,
    pub artist_id: Option<String>,
    pub album_id: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub source: String,
    pub source_id: Option<String>,
    pub unavailable_reason: Option<String>,
    pub cover_path: Option<String>,
    pub genres: Vec<String>,
    pub liked: bool,
    pub play_count: i64,
    pub replay_gain_track_gain_db: Option<f64>,
    pub replay_gain_album_gain_db: Option<f64>,
    pub replay_gain_track_peak: Option<f64>,
    pub replay_gain_album_peak: Option<f64>,
    pub has_metadata_override: bool,
    pub metadata_snapshot_available: bool,
    pub metadata_sources: Option<TrackMetadataSourcesDto>,
}

pub(crate) struct LocalVideoTrackContext {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub audio_path: PathBuf,
    pub authorized_root: PathBuf,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadataSourcesDto {
    pub title: String,
    pub artist: String,
    pub album: String,
}

impl TrackMetadataSourcesDto {
    #[cfg(test)]
    fn manual() -> Self {
        Self {
            title: "manual".into(),
            artist: "manual".into(),
            album: "manual".into(),
        }
    }

    fn file_tags() -> Self {
        Self {
            title: "fileTags".into(),
            artist: "fileTags".into(),
            album: "fileTags".into(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadataRestoreDto {
    pub track: TrackDto,
    pub source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAudioTagBackupStatusDto {
    pub available: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCoverArtWriteDto {
    pub image_base64: String,
    pub mime_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTagWritePayloadDto {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub lyrics: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub year: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub track_number: Option<String>,
    #[serde(default)]
    pub disc_number: Option<String>,
    #[serde(default)]
    pub bpm: Option<String>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub cover: Option<AudioCoverArtWriteDto>,
    #[serde(default)]
    pub sync_library_album: Option<bool>,
    #[serde(default)]
    pub sync_library_metadata: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumAudioTagsDto {
    pub album: String,
    pub album_artist: String,
    pub year: Option<String>,
    pub genre: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAudioTagsDto {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<String>,
    pub genre: String,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub bpm: Option<String>,
    pub comment: String,
    pub comment_truncated: bool,
}

struct AlbumAudioTagValues {
    album: Option<String>,
    album_artist: Option<String>,
    year: Option<String>,
    genre: Option<String>,
}

#[derive(Clone)]
struct TrackAudioTagWriteValues {
    track_number: Option<Option<u32>>,
    track_total: Option<Option<u32>>,
    disc_number: Option<Option<u32>>,
    disc_total: Option<Option<u32>>,
    bpm: Option<Option<u16>>,
    comment: Option<String>,
}

impl TrackAudioTagWriteValues {
    fn has_updates(&self) -> bool {
        self.track_number.is_some()
            || self.disc_number.is_some()
            || self.bpm.is_some()
            || self.comment.is_some()
    }
}

struct AudioCoverImage {
    bytes: Vec<u8>,
    mime_type: MimeType,
    extension: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntityRenameDto {
    pub id: String,
    pub previous_name: String,
    pub name: String,
    pub tracks: Vec<TrackDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntitySplitDto {
    pub id: String,
    pub source_name: String,
    pub name: String,
    pub tracks: Vec<TrackDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAlbumMergePreviewDto {
    pub source_name: String,
    pub target_name: String,
    pub track_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntityMergePreviewDto {
    pub source_id: String,
    pub source_name: String,
    pub target_id: String,
    pub target_name: String,
    pub source_track_count: i64,
    pub target_track_count: i64,
    pub consolidated_albums: Vec<CatalogAlbumMergePreviewDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAlbumSplitPreviewDto {
    pub name: String,
    pub track_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntitySplitPreviewDto {
    pub source_id: String,
    pub source_name: String,
    pub new_name: String,
    pub selected_track_count: i64,
    pub remaining_track_count: i64,
    pub reparented_albums: Vec<CatalogAlbumSplitPreviewDto>,
    pub duplicated_albums: Vec<CatalogAlbumSplitPreviewDto>,
}

struct TrackMetadataRestoreSource {
    source: String,
    ignored: bool,
    file_path: String,
    explicitly_authorized: bool,
    has_override: bool,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDto {
    pub added: i64,
    pub updated: i64,
    pub total: i64,
    pub skipped: i64,
    pub scan_errors: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizedMusicDirectoryDto {
    pub id: i64,
    pub path: String,
    pub available: bool,
    pub track_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDiagnosticsDto {
    pub checked_at: String,
    pub total_indexed_track_count: i64,
    pub local_track_count: i64,
    pub other_source_track_count: i64,
    pub excluded_track_count: i64,
    pub quick_identity_pending_track_count: i64,
    pub accessible_track_count: i64,
    pub unavailable_track_count: i64,
    pub offline_directory_track_count: i64,
    pub outside_directory_track_count: i64,
    pub artist_count: i64,
    pub album_count: i64,
    pub playlist_count: i64,
    pub playback_event_count: i64,
    pub integrity_check: String,
    pub directories: Vec<LibraryDirectoryDiagnosticsDto>,
    pub database_path: String,
    pub database_size_bytes: Option<u64>,
    pub covers_path: String,
    pub covers_available: bool,
    pub covers_file_count: u64,
    pub covers_size_bytes: Option<u64>,
    pub last_scan: Option<LibraryScanSummaryDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickIdentityBackfillDto {
    pub examined_count: i64,
    pub updated_count: i64,
    pub skipped_count: i64,
    pub remaining_count: i64,
    pub next_cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDirectoryDiagnosticsDto {
    pub path: String,
    pub available: bool,
    pub indexed_track_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanSummaryDto {
    pub completed_at: String,
    pub added: i64,
    pub updated: i64,
    pub total: i64,
    pub skipped: i64,
    pub scan_errors: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryMoveCandidateDto {
    pub missing_track_id: String,
    pub candidate_track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub missing_path: String,
    pub candidate_path: String,
    pub duration_seconds: i64,
    pub candidate_duration_seconds: i64,
    pub reasons: Vec<String>,
    pub confidence: String,
    pub ambiguous: bool,
}

struct QuickIdentityTrack {
    track: TrackDto,
    quick_hash: String,
    version: i64,
    explicitly_authorized: bool,
}

struct LibraryDiagnosticsSnapshot {
    checked_at: String,
    total_indexed_track_count: i64,
    local_track_count: i64,
    other_source_track_count: i64,
    excluded_track_count: i64,
    quick_identity_pending_track_count: i64,
    artist_count: i64,
    album_count: i64,
    playlist_count: i64,
    playback_event_count: i64,
    integrity_check: String,
    directory_records: Vec<AuthorizedMusicDirectory>,
    local_track_paths: Vec<DiagnosticTrackPath>,
    last_scan: Option<LibraryScanSummaryDto>,
}

struct QuickIdentityBackfillTrack {
    id: String,
    file_path: String,
    explicitly_authorized: bool,
}

struct DiagnosticTrackPath {
    path: PathBuf,
    excluded_by_rules: bool,
    explicitly_authorized: bool,
}

#[derive(Clone)]
struct AuthorizedMusicDirectory {
    id: i64,
    path: PathBuf,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImportProgressDto {
    pub phase: String,
    pub examined_entries: i64,
    pub discovered_files: i64,
    pub processed_files: i64,
    pub total_files: Option<i64>,
    pub added: i64,
    pub updated: i64,
    pub skipped: i64,
    pub scan_errors: i64,
}

pub struct NewTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub cover_path: Option<String>,
}

const MAX_TRACK_GENRES: usize = 8;
const MAX_TRACK_GENRE_CHARS: usize = 64;

fn normalize_track_genres(genres: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for genre in genres {
        let genre = genre.trim();
        if genre.is_empty()
            || genre.chars().count() > MAX_TRACK_GENRE_CHARS
            || genre.chars().any(char::is_control)
            || !seen.insert(genre.to_lowercase())
        {
            continue;
        }
        normalized.push(genre.to_string());
        if normalized.len() == MAX_TRACK_GENRES {
            break;
        }
    }
    normalized
}

fn split_track_genres(value: &str) -> Vec<String> {
    normalize_track_genres(
        value
            .split(['/', ';', '|', '\0'])
            .map(str::trim)
            .filter(|genre| !genre.is_empty())
            .map(str::to_string),
    )
}

fn decode_track_genres(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value)
        .map(normalize_track_genres)
        .unwrap_or_default()
}

#[derive(Clone, Copy, Default)]
struct ReplayGainMetadata {
    track_gain_db: Option<f64>,
    album_gain_db: Option<f64>,
    track_peak: Option<f64>,
    album_peak: Option<f64>,
}

fn track_id_for_path(path: &str) -> String {
    format!("{:x}", md5::compute(path.as_bytes()))
}

fn ensure_artist(conn: &Connection, name: &str) -> Result<Option<String>, rusqlite::Error> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM artists
             WHERE name = ?1 OR EXISTS (
                 SELECT 1 FROM json_each(
                     CASE WHEN json_valid(artists.aliases_json) THEN artists.aliases_json ELSE '[]' END
                 ) AS alias WHERE alias.value = ?1
             )
             ORDER BY CASE WHEN name = ?1 THEN 0 ELSE 1 END
             LIMIT 1",
            [name],
            |row| row.get(0),
        )
        .optional()?
    {
        return Ok(Some(id));
    }

    let candidate_id = track_id_for_path(&format!("artist:{name}"));
    conn.execute(
        "INSERT INTO artists (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
        params![candidate_id, name],
    )?;
    conn.query_row("SELECT id FROM artists WHERE name = ?1", [name], |row| {
        row.get(0)
    })
    .map(Some)
}

fn ensure_album(
    conn: &Connection,
    artist_id: Option<&str>,
    title: &str,
) -> Result<Option<String>, rusqlite::Error> {
    let title = title.trim();
    if title.is_empty() {
        return Ok(None);
    }
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM albums
             WHERE artist_id IS ?2 AND (title = ?1 OR EXISTS (
                 SELECT 1 FROM json_each(
                     CASE WHEN json_valid(albums.aliases_json) THEN albums.aliases_json ELSE '[]' END
                 ) AS alias WHERE alias.value = ?1
             ))
             ORDER BY CASE WHEN title = ?1 THEN 0 ELSE 1 END, created_at
             LIMIT 1",
            params![title, artist_id],
            |row| row.get(0),
        )
        .optional()?
    {
        return Ok(Some(id));
    }

    let id = track_id_for_path(&format!("album:{}:{title}", artist_id.unwrap_or_default()));
    conn.execute(
        "INSERT OR IGNORE INTO albums (id, title, artist_id) VALUES (?1, ?2, ?3)",
        params![id, title, artist_id],
    )?;
    Ok(Some(id))
}

/// Read a bounded sample from the beginning and end of an authorized regular audio file.
/// The result only narrows library move candidates; it is not a full-file integrity hash.
fn quick_file_hash(conn: &Connection, path: &Path) -> Option<String> {
    quick_file_hash_with_authorization(conn, path, false)
}

fn quick_file_hash_with_authorization(
    conn: &Connection,
    path: &Path,
    explicitly_authorized: bool,
) -> Option<String> {
    if !is_authorized_track_file(conn, path, explicitly_authorized).ok()? {
        return None;
    }
    let mut file = std::fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    let head_len = size.min(QUICK_HASH_SAMPLE_BYTES) as usize;
    let mut head = vec![0; head_len];
    file.read_exact(&mut head).ok()?;

    let mut context = md5::Context::new();
    context.consume(size.to_le_bytes());
    context.consume(&head);

    let tail_start = if size > QUICK_HASH_SAMPLE_BYTES {
        (size - QUICK_HASH_SAMPLE_BYTES).max(QUICK_HASH_SAMPLE_BYTES)
    } else {
        size
    };
    if tail_start < size {
        file.seek(SeekFrom::Start(tail_start)).ok()?;
        context.consume(tail_start.to_le_bytes());
        let mut tail = Vec::with_capacity((size - tail_start) as usize);
        file.read_to_end(&mut tail).ok()?;
        context.consume(&tail);
    }

    Some(format!("{:x}", context.compute()))
}

fn backfill_quick_identity_batch(
    conn: &Connection,
    after_track_id: Option<&str>,
) -> Result<QuickIdentityBackfillDto, String> {
    if after_track_id
        .is_some_and(|cursor| cursor.len() > 256 || cursor.chars().any(char::is_control))
    {
        return Err("快速摘要批次游标无效".into());
    }

    let tracks = {
        let mut statement = conn
            .prepare(
                "SELECT id, file_path, explicit_path_authorized
                 FROM tracks
                 WHERE source = 'local' AND ignored_by_rules = 0
                   AND (quick_hash IS NULL OR quick_hash_version IS NULL OR quick_hash_version != ?1)
                   AND (?2 IS NULL OR id COLLATE BINARY > ?2)
                 ORDER BY id COLLATE BINARY
                 LIMIT ?3",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(
                params![
                    QUICK_HASH_VERSION,
                    after_track_id,
                    MAX_QUICK_IDENTITY_BACKFILL_BATCH
                ],
                |row| {
                    Ok(QuickIdentityBackfillTrack {
                        id: row.get(0)?,
                        file_path: row.get(1)?,
                        explicitly_authorized: row.get::<_, i64>(2)? != 0,
                    })
                },
            )
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };

    let cursor = tracks.last().map(|track| track.id.clone());
    let mut skipped_count = 0_i64;
    let mut hashes = Vec::with_capacity(tracks.len());
    for track in &tracks {
        let path = Path::new(&track.file_path);
        let Some(hash) = is_supported_audio_path(path)
            .then(|| quick_file_hash_with_authorization(conn, path, track.explicitly_authorized))
            .flatten()
        else {
            skipped_count += 1;
            continue;
        };
        hashes.push((track.id.clone(), hash));
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let mut updated_count = 0_i64;
    for (track_id, hash) in hashes {
        let changed = tx
            .execute(
                "UPDATE tracks SET quick_hash = ?1, quick_hash_version = ?2
                 WHERE id = ?3 AND source = 'local' AND ignored_by_rules = 0
                   AND (quick_hash IS NULL OR quick_hash_version IS NULL OR quick_hash_version != ?2)",
                params![hash, QUICK_HASH_VERSION, track_id],
            )
            .map_err(|error| error.to_string())?;
        if changed == 1 {
            updated_count += 1;
        } else {
            skipped_count += 1;
        }
    }

    let remaining_count = if let Some(cursor) = cursor.as_deref() {
        tx.query_row(
            "SELECT COUNT(*) FROM tracks
             WHERE source = 'local' AND ignored_by_rules = 0
               AND (quick_hash IS NULL OR quick_hash_version IS NULL OR quick_hash_version != ?1)
               AND id COLLATE BINARY > ?2",
            params![QUICK_HASH_VERSION, cursor],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?
    } else {
        0
    };
    tx.commit().map_err(|error| error.to_string())?;

    Ok(QuickIdentityBackfillDto {
        examined_count: tracks.len() as i64,
        updated_count,
        skipped_count,
        remaining_count,
        next_cursor: (remaining_count > 0).then_some(cursor).flatten(),
    })
}

#[cfg(test)]
pub fn insert_track(conn: &Connection, track: &NewTrack) -> Result<(), rusqlite::Error> {
    insert_track_with_replay_gain(conn, track, ReplayGainMetadata::default())
}

#[cfg(test)]
fn insert_track_with_replay_gain(
    conn: &Connection,
    track: &NewTrack,
    replay_gain: ReplayGainMetadata,
) -> Result<(), rusqlite::Error> {
    insert_track_with_replay_gain_and_genres(conn, track, replay_gain, &[])
}

fn insert_track_with_replay_gain_and_genres(
    conn: &Connection,
    track: &NewTrack,
    replay_gain: ReplayGainMetadata,
    genres: &[String],
) -> Result<(), rusqlite::Error> {
    let id = track_id_for_path(&track.file_path);
    let quick_hash = quick_file_hash(conn, Path::new(&track.file_path));
    let quick_hash_version = quick_hash.as_ref().map(|_| QUICK_HASH_VERSION);
    let genres_json = serde_json::to_string(&normalize_track_genres(genres.iter().cloned()))
        .unwrap_or_else(|_| "[]".into());
    let overridden_artist: Option<(i64, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM track_metadata_overrides o
                 JOIN tracks t ON t.id = o.track_id
                 WHERE t.file_path = ?1
             ), artist_id, album_id FROM tracks WHERE file_path = ?1",
            params![track.file_path],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let keep_override = overridden_artist
        .as_ref()
        .is_some_and(|(overridden, _, _)| *overridden != 0);

    // 已手工修正的曲目不再为文件标签创建新艺人实体。
    let artist_id: Option<String> = if keep_override {
        overridden_artist
            .as_ref()
            .and_then(|(_, artist_id, _)| artist_id.clone())
    } else {
        ensure_artist(conn, &track.artist)?
    };
    let album_id = if keep_override {
        overridden_artist
            .as_ref()
            .and_then(|(_, _, album_id)| album_id.clone())
    } else {
        ensure_album(conn, artist_id.as_deref(), &track.album)?
    };
    conn.execute(
        "INSERT INTO tracks (id, title, artist_id, album_id, duration_seconds, file_path, source, cover_path, genres_json,
                             quick_hash, quick_hash_version, replay_gain_track_gain_db, replay_gain_album_gain_db,
                             replay_gain_track_peak, replay_gain_album_peak)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'local', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(file_path) DO UPDATE SET
            title = CASE WHEN EXISTS (
                SELECT 1 FROM track_metadata_overrides o WHERE o.track_id = tracks.id
            ) THEN tracks.title ELSE excluded.title END,
            artist_id = CASE WHEN EXISTS (
                SELECT 1 FROM track_metadata_overrides o WHERE o.track_id = tracks.id
            ) THEN tracks.artist_id ELSE excluded.artist_id END,
            album_id = CASE WHEN EXISTS (
                SELECT 1 FROM track_metadata_overrides o WHERE o.track_id = tracks.id
            ) THEN tracks.album_id ELSE excluded.album_id END,
            duration_seconds = excluded.duration_seconds,
            cover_path = excluded.cover_path,
            genres_json = excluded.genres_json,
            quick_hash = COALESCE(excluded.quick_hash, tracks.quick_hash),
            quick_hash_version = COALESCE(excluded.quick_hash_version, tracks.quick_hash_version),
            replay_gain_track_gain_db = excluded.replay_gain_track_gain_db,
            replay_gain_album_gain_db = excluded.replay_gain_album_gain_db,
            replay_gain_track_peak = excluded.replay_gain_track_peak,
            replay_gain_album_peak = excluded.replay_gain_album_peak,
            updated_at = CURRENT_TIMESTAMP",
        params![
            id,
            track.title,
            artist_id,
            album_id,
            track.duration_seconds,
            track.file_path,
            track.cover_path,
            genres_json,
            quick_hash,
            quick_hash_version,
            replay_gain.track_gain_db,
            replay_gain.album_gain_db,
            replay_gain.track_peak,
            replay_gain.album_peak,
        ],
    )?;
    Ok(())
}

fn checked_metadata_value(value: &str, label: &str, required: bool) -> Result<String, String> {
    let value = value.trim();
    if required && value.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if value.chars().count() > 200 {
        return Err(format!("{label}不能超过 200 个字符"));
    }
    Ok(value.to_string())
}

fn checked_audio_tag_year(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    let year = value.parse::<u16>().ok();
    if value.len() != 4
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || !year.is_some_and(|year| (1000..=9999).contains(&year))
    {
        return Err("年份需填写 1000 至 9999 之间的四位数字".into());
    }
    Ok(value.to_string())
}

fn checked_audio_tag_number(value: &str, label: &str) -> Result<Option<u32>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("{label}需填写正整数或留空"));
    }
    let number = value
        .parse::<u32>()
        .ok()
        .filter(|number| *number > 0)
        .ok_or_else(|| format!("{label}需填写正整数或留空"))?;
    Ok(Some(number))
}

fn checked_audio_tag_bpm(value: &str) -> Result<Option<u16>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let bpm = value.parse::<u16>().ok();
    if !value.bytes().all(|byte| byte.is_ascii_digit())
        || !bpm.is_some_and(|bpm| (1..=999).contains(&bpm))
    {
        return Err("BPM 需填写 1 至 999 的正整数或留空".into());
    }
    Ok(bpm)
}

fn checked_audio_tag_comment(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.chars().count() > 4_000 || value.len() > 16_000 {
        return Err("备注不能超过 4,000 个字符".into());
    }
    Ok(value.to_string())
}

fn checked_metadata_source(value: &str) -> Result<String, String> {
    match value {
        "fileTags" | "netease" | "qq" | "kugou" | "manual" | "unknown" => Ok(value.to_string()),
        _ => Err("曲目资料来源无效".into()),
    }
}

/// 只更改应用数据库中的本地展示资料；不会触碰音频文件标签。
#[cfg(test)]
pub fn update_track_metadata(
    conn: &mut Connection,
    id: &str,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<TrackDto, String> {
    update_track_metadata_with_sources(
        conn,
        id,
        title,
        artist,
        album,
        &TrackMetadataSourcesDto::manual(),
    )
}

pub fn update_track_metadata_with_sources(
    conn: &mut Connection,
    id: &str,
    title: &str,
    artist: &str,
    album: &str,
    metadata_sources: &TrackMetadataSourcesDto,
) -> Result<TrackDto, String> {
    update_track_metadata_with_override(conn, id, title, artist, album, true, metadata_sources)
}

fn update_track_metadata_with_override(
    conn: &mut Connection,
    id: &str,
    title: &str,
    artist: &str,
    album: &str,
    keep_override: bool,
    metadata_sources: &TrackMetadataSourcesDto,
) -> Result<TrackDto, String> {
    let title = checked_metadata_value(title, "曲名", true)?;
    let artist = checked_metadata_value(artist, "艺人", true)?;
    let album = checked_metadata_value(album, "专辑", false)?;
    let metadata_sources = TrackMetadataSourcesDto {
        title: checked_metadata_source(&metadata_sources.title)?,
        artist: checked_metadata_source(&metadata_sources.artist)?,
        album: checked_metadata_source(&metadata_sources.album)?,
    };

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let source: Option<String> = tx
        .query_row(
            "SELECT source FROM tracks WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match source.as_deref() {
        None => return Err("曲目不存在".into()),
        Some("local") => {}
        Some(_) => return Err("只能修正本地曲目的资料".into()),
    }

    let artist_id = ensure_artist(&tx, &artist)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "艺人不能为空".to_string())?;

    let album_id =
        ensure_album(&tx, Some(&artist_id), &album).map_err(|error| error.to_string())?;

    if keep_override {
        tx.execute(
            "INSERT OR IGNORE INTO track_metadata_overrides
                 (track_id, original_title, original_artist, original_album)
             SELECT t.id, t.title, COALESCE(ar.name, ''), COALESCE(a.title, '')
             FROM tracks t
             LEFT JOIN artists ar ON ar.id = t.artist_id
             LEFT JOIN albums a ON a.id = t.album_id
             WHERE t.id = ?1 AND t.source = 'local'",
            params![id],
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "UPDATE track_metadata_overrides SET
                 title_source = ?2, artist_source = ?3, album_source = ?4
             WHERE track_id = ?1",
            params![
                id,
                metadata_sources.title,
                metadata_sources.artist,
                metadata_sources.album
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    let changed = tx
        .execute(
            "UPDATE tracks SET title = ?2, artist_id = ?3, album_id = ?4,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND source = 'local'",
            params![id, title, artist_id, album_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("曲目不存在或不是本地曲目".into());
    }
    if !keep_override {
        tx.execute(
            "DELETE FROM track_metadata_overrides WHERE track_id = ?1",
            params![id],
        )
        .map_err(|error| error.to_string())?;
    }
    let updated = tx
        .query_row(
            &(TRACK_SELECT.to_string() + " WHERE t.id = ?1"),
            params![id],
            row_to_track,
        )
        .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(updated)
}

fn sync_local_album_tag_to_library(
    conn: &mut Connection,
    id: &str,
    album: &str,
) -> Result<TrackDto, String> {
    let track = conn
        .query_row(
            &(TRACK_SELECT.to_string() + " WHERE t.id = ?1"),
            params![id],
            row_to_track,
        )
        .map_err(|error| error.to_string())?;
    if track.source != "local" {
        return Err("只能同步本地曲目的专辑标签".into());
    }
    let mut metadata_sources = track
        .metadata_sources
        .unwrap_or_else(TrackMetadataSourcesDto::file_tags);
    metadata_sources.album = "fileTags".into();
    update_track_metadata_with_override(
        conn,
        id,
        &track.title,
        &track.artist,
        album,
        true,
        &metadata_sources,
    )
}

fn append_entity_alias(
    aliases_json: &str,
    previous_name: &str,
    new_name: &str,
) -> Result<String, String> {
    let mut aliases: Vec<String> =
        serde_json::from_str(aliases_json).map_err(|error| format!("实体别名数据无效：{error}"))?;
    aliases.retain(|alias| alias != previous_name && alias != new_name);
    if !previous_name.is_empty() {
        aliases.push(previous_name.to_string());
    }
    serde_json::to_string(&aliases).map_err(|error| error.to_string())
}

fn rename_conflicts_with_artist(
    conn: &Connection,
    id: &str,
    new_name: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM artists other
             WHERE other.id <> ?1 AND (
                 other.name = ?2 OR EXISTS (
                     SELECT 1 FROM json_each(
                         CASE WHEN json_valid(other.aliases_json) THEN other.aliases_json ELSE '[]' END
                     ) AS alias WHERE alias.value = ?2
                 )
             )
         )",
        params![id, new_name],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn rename_conflicts_with_album(
    conn: &Connection,
    id: &str,
    new_name: &str,
    artist_id: Option<&str>,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM albums other
             WHERE other.id <> ?1 AND other.artist_id IS ?3 AND (
                 other.title = ?2 OR EXISTS (
                     SELECT 1 FROM json_each(
                         CASE WHEN json_valid(other.aliases_json) THEN other.aliases_json ELSE '[]' END
                     ) AS alias WHERE alias.value = ?2
                 )
             )
         )",
        params![id, new_name, artist_id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn local_tracks_for_artist(conn: &Connection, artist_id: &str) -> Result<Vec<TrackDto>, String> {
    let mut stmt = conn
        .prepare(
            &(TRACK_SELECT.to_string()
                + " WHERE t.artist_id = ?1 AND t.source = 'local' ORDER BY t.title COLLATE NOCASE"),
        )
        .map_err(|error| error.to_string())?;
    let tracks = stmt
        .query_map([artist_id], row_to_track)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(tracks)
}

fn local_tracks_for_album(conn: &Connection, album_id: &str) -> Result<Vec<TrackDto>, String> {
    let mut stmt = conn
        .prepare(
            &(TRACK_SELECT.to_string()
                + " WHERE t.album_id = ?1 AND t.source = 'local' ORDER BY t.title COLLATE NOCASE"),
        )
        .map_err(|error| error.to_string())?;
    let tracks = stmt
        .query_map([album_id], row_to_track)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(tracks)
}

#[derive(Clone)]
struct CatalogArtistRecord {
    id: String,
    name: String,
    aliases_json: String,
    genres_json: String,
}

#[derive(Clone)]
struct CatalogAlbumRecord {
    id: String,
    title: String,
    artist_id: Option<String>,
    year: Option<i64>,
    cover_path: Option<String>,
    aliases_json: String,
    local_track_count: i64,
    other_source_track_count: i64,
}

#[derive(Clone)]
struct CatalogAlbumMergePlan {
    source: CatalogAlbumRecord,
    target: CatalogAlbumRecord,
}

struct CatalogArtistMergePlan {
    source: CatalogArtistRecord,
    target: CatalogArtistRecord,
    source_track_ids: Vec<String>,
    target_track_count: i64,
    album_merges: Vec<CatalogAlbumMergePlan>,
    albums_to_reparent: Vec<CatalogAlbumRecord>,
}

fn read_entity_aliases(aliases_json: &str) -> Result<Vec<String>, String> {
    serde_json::from_str(aliases_json).map_err(|error| format!("实体别名数据无效：{error}"))
}

fn identity_values(name: &str, aliases_json: &str) -> Result<HashSet<String>, String> {
    let mut values = read_entity_aliases(aliases_json)?
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<HashSet<_>>();
    if !name.trim().is_empty() {
        values.insert(name.to_string());
    }
    Ok(values)
}

fn merged_aliases_json(
    target_name: &str,
    target_aliases_json: &str,
    source_name: &str,
    source_aliases_json: &str,
) -> Result<String, String> {
    let mut aliases = Vec::new();
    for alias in read_entity_aliases(target_aliases_json)?
        .into_iter()
        .chain(std::iter::once(source_name.to_string()))
        .chain(read_entity_aliases(source_aliases_json)?)
    {
        if alias.trim().is_empty() || alias == target_name || aliases.contains(&alias) {
            continue;
        }
        aliases.push(alias);
    }
    serde_json::to_string(&aliases).map_err(|error| error.to_string())
}

fn merged_string_list_json(target_json: &str, source_json: &str) -> Result<String, String> {
    let target: Vec<String> =
        serde_json::from_str(target_json).map_err(|error| format!("艺人流派数据无效：{error}"))?;
    let source: Vec<String> =
        serde_json::from_str(source_json).map_err(|error| format!("艺人流派数据无效：{error}"))?;
    let mut merged = target;
    for value in source {
        if !value.trim().is_empty() && !merged.contains(&value) {
            merged.push(value);
        }
    }
    serde_json::to_string(&merged).map_err(|error| error.to_string())
}

fn catalog_artist(conn: &Connection, id: &str) -> Result<CatalogArtistRecord, String> {
    conn.query_row(
        "SELECT id, name, aliases_json, genres_json FROM artists WHERE id = ?1",
        [id],
        |row| {
            Ok(CatalogArtistRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                aliases_json: row.get(2)?,
                genres_json: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "艺人不存在".to_string())
}

fn catalog_artist_track_count(conn: &Connection, id: &str, source: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE artist_id = ?1 AND source = ?2",
        params![id, source],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn catalog_artist_other_source_track_count(conn: &Connection, id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE artist_id = ?1 AND source <> 'local'",
        [id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn catalog_album_track_ids(conn: &Connection, id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM tracks WHERE album_id = ?1 AND source = 'local' ORDER BY id")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn catalog_artist_local_track_ids(conn: &Connection, id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM tracks WHERE artist_id = ?1 AND source = 'local' ORDER BY id")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn catalog_albums_for_artist(
    conn: &Connection,
    artist_id: Option<&str>,
) -> Result<Vec<CatalogAlbumRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.title, a.artist_id, a.year, a.cover_path, a.aliases_json,
                    (SELECT COUNT(*) FROM tracks t WHERE t.album_id = a.id AND t.source = 'local'),
                    (SELECT COUNT(*) FROM tracks t WHERE t.album_id = a.id AND t.source <> 'local')
             FROM albums a WHERE a.artist_id IS ?1 ORDER BY a.id",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([artist_id], |row| {
            Ok(CatalogAlbumRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                artist_id: row.get(2)?,
                year: row.get(3)?,
                cover_path: row.get(4)?,
                aliases_json: row.get(5)?,
                local_track_count: row.get(6)?,
                other_source_track_count: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn values_overlap(left: &HashSet<String>, right: &HashSet<String>) -> bool {
    left.iter().any(|value| right.contains(value))
}

fn validate_artist_alias_merge(
    conn: &Connection,
    source: &CatalogArtistRecord,
    target: &CatalogArtistRecord,
) -> Result<(), String> {
    let source_values = identity_values(&source.name, &source.aliases_json)?;
    let target_values = identity_values(&target.name, &target.aliases_json)?;
    let mut merged_values = source_values;
    merged_values.extend(target_values);
    let mut stmt = conn
        .prepare("SELECT id, name, aliases_json FROM artists WHERE id NOT IN (?1, ?2)")
        .map_err(|error| error.to_string())?;
    let others = stmt
        .query_map(params![source.id, target.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (_, name, aliases_json) in others {
        if values_overlap(&merged_values, &identity_values(&name, &aliases_json)?) {
            return Err("合并后的艺人名称或别名会与其他艺人冲突，请先整理重名实体".into());
        }
    }
    Ok(())
}

fn plan_artist_merge(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogArtistMergePlan, String> {
    if source_id == target_id {
        return Err("请选择另一个目标艺人".into());
    }
    let source = catalog_artist(conn, source_id)?;
    let target = catalog_artist(conn, target_id)?;
    let source_count = catalog_artist_track_count(conn, source_id, "local")?;
    let target_count = catalog_artist_track_count(conn, target_id, "local")?;
    if source_count == 0 || target_count == 0 {
        return Err("只能合并仍关联本地曲目的艺人".into());
    }
    if catalog_artist_other_source_track_count(conn, source_id)? > 0 {
        return Err("待合并艺人还关联在线曲目；为避免改动在线资料，暂不能合并".into());
    }
    validate_artist_alias_merge(conn, &source, &target)?;
    merged_string_list_json(&target.genres_json, &source.genres_json)?;
    let source_track_ids = catalog_artist_local_track_ids(conn, source_id)?;
    let source_albums = catalog_albums_for_artist(conn, Some(source_id))?;
    let target_albums = catalog_albums_for_artist(conn, Some(target_id))?;
    let mut album_merges = Vec::new();
    let mut albums_to_reparent = Vec::new();
    let mut used_target_albums = HashSet::new();
    for source_album in source_albums {
        if source_album.other_source_track_count > 0 {
            return Err(format!(
                "待合并艺人的专辑「{}」还关联在线曲目；为避免改动在线资料，暂不能合并",
                source_album.title
            ));
        }
        let source_values = identity_values(&source_album.title, &source_album.aliases_json)?;
        let mut matches = Vec::new();
        for target_album in &target_albums {
            if values_overlap(
                &source_values,
                &identity_values(&target_album.title, &target_album.aliases_json)?,
            ) {
                matches.push(target_album.clone());
            }
        }
        if matches.len() > 1 {
            return Err(format!(
                "專輯「{}」對應到多張目標專輯，請先整理專輯別名",
                source_album.title
            ));
        }
        if let Some(target_album) = matches.pop() {
            if !used_target_albums.insert(target_album.id.clone()) {
                return Err("多張來源專輯指向同一張目標專輯，請先整理專輯別名".into());
            }
            let merged_values = identity_values(&target_album.title, &target_album.aliases_json)?
                .into_iter()
                .chain(source_values)
                .collect::<HashSet<_>>();
            for other in &target_albums {
                if other.id == target_album.id {
                    continue;
                }
                if values_overlap(
                    &merged_values,
                    &identity_values(&other.title, &other.aliases_json)?,
                ) {
                    return Err(format!(
                        "合并后的专辑「{}」会与目标艺人的其他专辑冲突",
                        target_album.title
                    ));
                }
            }
            album_merges.push(CatalogAlbumMergePlan {
                source: source_album,
                target: target_album,
            });
        } else {
            albums_to_reparent.push(source_album);
        }
    }
    Ok(CatalogArtistMergePlan {
        source,
        target,
        source_track_ids,
        target_track_count: target_count,
        album_merges,
        albums_to_reparent,
    })
}

fn artist_merge_preview(plan: &CatalogArtistMergePlan) -> CatalogEntityMergePreviewDto {
    CatalogEntityMergePreviewDto {
        source_id: plan.source.id.clone(),
        source_name: plan.source.name.clone(),
        target_id: plan.target.id.clone(),
        target_name: plan.target.name.clone(),
        source_track_count: plan.source_track_ids.len() as i64,
        target_track_count: plan.target_track_count,
        consolidated_albums: plan
            .album_merges
            .iter()
            .map(|merge| CatalogAlbumMergePreviewDto {
                source_name: merge.source.title.clone(),
                target_name: merge.target.title.clone(),
                track_count: merge.source.local_track_count,
            })
            .collect(),
    }
}

fn tracks_for_ids(conn: &Connection, ids: &[String]) -> Result<Vec<TrackDto>, String> {
    let mut stmt = conn
        .prepare(&(TRACK_SELECT.to_string() + " WHERE t.id = ?1"))
        .map_err(|error| error.to_string())?;
    ids.iter()
        .map(|id| {
            stmt.query_row([id], row_to_track)
                .map_err(|error| error.to_string())
        })
        .collect()
}

pub fn preview_library_artist_merge(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogEntityMergePreviewDto, String> {
    plan_artist_merge(conn, source_id, target_id).map(|plan| artist_merge_preview(&plan))
}

pub fn merge_library_artist(
    conn: &mut Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogEntityRenameDto, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let plan = plan_artist_merge(&tx, source_id, target_id)?;
    let source_name = plan.source.name.clone();
    let target_name = plan.target.name.clone();
    let aliases_json = merged_aliases_json(
        &plan.target.name,
        &plan.target.aliases_json,
        &plan.source.name,
        &plan.source.aliases_json,
    )?;
    let genres_json = merged_string_list_json(&plan.target.genres_json, &plan.source.genres_json)?;
    for album_merge in &plan.album_merges {
        tx.execute(
            "UPDATE tracks SET album_id = ?2 WHERE album_id = ?1 AND source = 'local'",
            params![album_merge.source.id, album_merge.target.id],
        )
        .map_err(|error| error.to_string())?;
        let aliases_json = merged_aliases_json(
            &album_merge.target.title,
            &album_merge.target.aliases_json,
            &album_merge.source.title,
            &album_merge.source.aliases_json,
        )?;
        tx.execute(
            "UPDATE albums SET aliases_json = ?2, year = COALESCE(year, ?3),
                    cover_path = COALESCE(cover_path, ?4), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                album_merge.target.id,
                aliases_json,
                album_merge.source.year,
                album_merge.source.cover_path
            ],
        )
        .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM albums WHERE id = ?1", [&album_merge.source.id])
            .map_err(|error| error.to_string())?;
    }
    for album in &plan.albums_to_reparent {
        tx.execute(
            "UPDATE albums SET artist_id = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![album.id, plan.target.id],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.execute(
        "UPDATE tracks SET artist_id = ?2 WHERE artist_id = ?1 AND source = 'local'",
        params![plan.source.id, plan.target.id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE artists SET aliases_json = ?2, genres_json = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![plan.target.id, aliases_json, genres_json],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM artists WHERE id = ?1", [&plan.source.id])
        .map_err(|error| error.to_string())?;
    let tracks = tracks_for_ids(&tx, &plan.source_track_ids)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntityRenameDto {
        id: plan.target.id,
        previous_name: source_name,
        name: target_name,
        tracks,
    })
}

fn catalog_album(conn: &Connection, id: &str) -> Result<CatalogAlbumRecord, String> {
    conn.query_row(
        "SELECT a.id, a.title, a.artist_id, a.year, a.cover_path, a.aliases_json,
                (SELECT COUNT(*) FROM tracks t WHERE t.album_id = a.id AND t.source = 'local'),
                (SELECT COUNT(*) FROM tracks t WHERE t.album_id = a.id AND t.source <> 'local')
         FROM albums a WHERE a.id = ?1",
        [id],
        |row| {
            Ok(CatalogAlbumRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                artist_id: row.get(2)?,
                year: row.get(3)?,
                cover_path: row.get(4)?,
                aliases_json: row.get(5)?,
                local_track_count: row.get(6)?,
                other_source_track_count: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "专辑不存在".to_string())
}

fn plan_album_merge(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogAlbumMergePlan, String> {
    if source_id == target_id {
        return Err("请选择另一张目标专辑".into());
    }
    let source = catalog_album(conn, source_id)?;
    let target = catalog_album(conn, target_id)?;
    if source.artist_id != target.artist_id {
        return Err("只能合并同一艺人名下的专辑".into());
    }
    if source.local_track_count == 0 || target.local_track_count == 0 {
        return Err("只能合并仍关联本地曲目的专辑".into());
    }
    if source.other_source_track_count > 0 {
        return Err("待合并专辑还关联在线曲目；为避免改动在线资料，暂不能合并".into());
    }
    let merged_values = identity_values(&target.title, &target.aliases_json)?
        .into_iter()
        .chain(identity_values(&source.title, &source.aliases_json)?)
        .collect::<HashSet<_>>();
    let others = catalog_albums_for_artist(conn, source.artist_id.as_deref())?;
    for other in others {
        if other.id == source.id || other.id == target.id {
            continue;
        }
        if values_overlap(
            &merged_values,
            &identity_values(&other.title, &other.aliases_json)?,
        ) {
            return Err("合并后的专辑名称或别名会与同艺人的其他专辑冲突".into());
        }
    }
    Ok(CatalogAlbumMergePlan { source, target })
}

pub fn preview_library_album_merge(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogEntityMergePreviewDto, String> {
    let plan = plan_album_merge(conn, source_id, target_id)?;
    Ok(CatalogEntityMergePreviewDto {
        source_id: plan.source.id.clone(),
        source_name: plan.source.title.clone(),
        target_id: plan.target.id.clone(),
        target_name: plan.target.title.clone(),
        source_track_count: plan.source.local_track_count,
        target_track_count: plan.target.local_track_count,
        consolidated_albums: Vec::new(),
    })
}

pub fn merge_library_album(
    conn: &mut Connection,
    source_id: &str,
    target_id: &str,
) -> Result<CatalogEntityRenameDto, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let plan = plan_album_merge(&tx, source_id, target_id)?;
    let source_track_ids = catalog_album_track_ids(&tx, source_id)?;
    let aliases_json = merged_aliases_json(
        &plan.target.title,
        &plan.target.aliases_json,
        &plan.source.title,
        &plan.source.aliases_json,
    )?;
    tx.execute(
        "UPDATE tracks SET album_id = ?2 WHERE album_id = ?1 AND source = 'local'",
        params![plan.source.id, plan.target.id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE albums SET aliases_json = ?2, year = COALESCE(year, ?3),
                cover_path = COALESCE(cover_path, ?4), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![
            plan.target.id,
            aliases_json,
            plan.source.year,
            plan.source.cover_path
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM albums WHERE id = ?1", [&plan.source.id])
        .map_err(|error| error.to_string())?;
    let tracks = tracks_for_ids(&tx, &source_track_ids)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntityRenameDto {
        id: plan.target.id,
        previous_name: plan.source.title,
        name: plan.target.title,
        tracks,
    })
}

struct CatalogArtistAlbumSplitPlan {
    album: CatalogAlbumRecord,
    selected_track_ids: Vec<String>,
    reparent: bool,
}

struct CatalogArtistSplitPlan {
    source: CatalogArtistRecord,
    new_name: String,
    new_artist_id: String,
    selected_track_ids: Vec<String>,
    track_albums: Vec<(String, Option<String>)>,
    remaining_track_count: i64,
    albums: Vec<CatalogArtistAlbumSplitPlan>,
}

struct CatalogAlbumSplitPlan {
    source: CatalogAlbumRecord,
    new_name: String,
    new_album_id: String,
    selected_track_ids: Vec<String>,
    remaining_track_count: i64,
}

fn validate_split_selection(selected_ids: &[String], source_ids: &[String]) -> Result<(), String> {
    if selected_ids.is_empty() {
        return Err("请至少选择一首要拆出的本地曲目".into());
    }
    let selected = selected_ids.iter().collect::<HashSet<_>>();
    if selected.len() != selected_ids.len() {
        return Err("拆分曲目列表包含重复项，请重新选择".into());
    }
    let source = source_ids.iter().collect::<HashSet<_>>();
    if selected.iter().any(|id| !source.contains(id)) {
        return Err("所选曲目已不属于当前实体或不是本地曲目，请刷新后重试".into());
    }
    if selected_ids.len() >= source_ids.len() {
        return Err("拆分后至少要为原实体保留一首本地曲目".into());
    }
    Ok(())
}

fn next_artist_split_id(conn: &Connection, source_id: &str, name: &str) -> Result<String, String> {
    for suffix in 0..u32::MAX {
        let seed = format!("artist:split:{source_id}:{name}:{suffix}");
        let candidate = track_id_for_path(&seed);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM artists WHERE id = ?1)",
                [&candidate],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err("无法为新艺人分配曲库编号".into())
}

fn next_album_split_id(
    conn: &Connection,
    source_id: &str,
    artist_id: &str,
    name: &str,
) -> Result<String, String> {
    for suffix in 0..u32::MAX {
        let seed = format!("album:split:{source_id}:{artist_id}:{name}:{suffix}");
        let candidate = track_id_for_path(&seed);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM albums WHERE id = ?1)",
                [&candidate],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err("无法为新专辑分配曲库编号".into())
}

fn plan_artist_split(
    conn: &Connection,
    source_id: &str,
    requested_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogArtistSplitPlan, String> {
    let new_name = checked_metadata_value(requested_name, "艺人名", true)?;
    let source = catalog_artist(conn, source_id)?;
    let source_track_ids = catalog_artist_local_track_ids(conn, source_id)?;
    validate_split_selection(selected_track_ids, &source_track_ids)?;
    if rename_conflicts_with_artist(conn, "", &new_name)? {
        return Err("曲库中已存在同名或同别名艺人".into());
    }
    let new_artist_id = next_artist_split_id(conn, source_id, &new_name)?;

    let mut track_albums = Vec::with_capacity(selected_track_ids.len());
    let mut album_track_ids: HashMap<String, Vec<String>> = HashMap::new();
    for track_id in selected_track_ids {
        let album_id: Option<String> = conn
            .query_row(
                "SELECT album_id FROM tracks WHERE id = ?1 AND artist_id = ?2 AND source = 'local'",
                params![track_id, source_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .flatten();
        if let Some(album_id) = &album_id {
            album_track_ids
                .entry(album_id.clone())
                .or_default()
                .push(track_id.clone());
        }
        track_albums.push((track_id.clone(), album_id));
    }

    let mut albums = Vec::with_capacity(album_track_ids.len());
    for (album_id, selected_ids) in album_track_ids {
        let album = catalog_album(conn, &album_id)?;
        let total_track_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tracks WHERE album_id = ?1",
                [&album_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let reparent = album.artist_id.as_deref() == Some(source_id)
            && total_track_count == selected_ids.len() as i64;
        albums.push(CatalogArtistAlbumSplitPlan {
            album,
            selected_track_ids: selected_ids,
            reparent,
        });
    }
    albums.sort_by(|left, right| left.album.id.cmp(&right.album.id));

    let duplicated = albums
        .iter()
        .filter(|album| !album.reparent)
        .collect::<Vec<_>>();
    for (index, album) in duplicated.iter().enumerate() {
        let values = identity_values(&album.album.title, &album.album.aliases_json)?;
        for other in duplicated.iter().skip(index + 1) {
            if values_overlap(
                &values,
                &identity_values(&other.album.title, &other.album.aliases_json)?,
            ) {
                return Err("拆分曲目包含名称或别名重叠的多张专辑，请先整理专辑关系".into());
            }
        }
    }

    Ok(CatalogArtistSplitPlan {
        source,
        new_name,
        new_artist_id,
        selected_track_ids: selected_track_ids.to_vec(),
        track_albums,
        remaining_track_count: (source_track_ids.len() - selected_track_ids.len()) as i64,
        albums,
    })
}

fn plan_album_split(
    conn: &Connection,
    source_id: &str,
    requested_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogAlbumSplitPlan, String> {
    let new_name = checked_metadata_value(requested_name, "专辑名", true)?;
    let source = catalog_album(conn, source_id)?;
    let source_track_ids = catalog_album_track_ids(conn, source_id)?;
    validate_split_selection(selected_track_ids, &source_track_ids)?;
    if rename_conflicts_with_album(conn, "", &new_name, source.artist_id.as_deref())? {
        return Err("同一艺人名下已存在同名或同别名专辑".into());
    }
    let artist_key = source.artist_id.as_deref().unwrap_or_default();
    let new_album_id = next_album_split_id(conn, source_id, artist_key, &new_name)?;
    Ok(CatalogAlbumSplitPlan {
        source,
        new_name,
        new_album_id,
        selected_track_ids: selected_track_ids.to_vec(),
        remaining_track_count: (source_track_ids.len() - selected_track_ids.len()) as i64,
    })
}

fn artist_split_preview(plan: &CatalogArtistSplitPlan) -> CatalogEntitySplitPreviewDto {
    let preview_albums = |reparent: bool| {
        plan.albums
            .iter()
            .filter(|album| album.reparent == reparent)
            .map(|album| CatalogAlbumSplitPreviewDto {
                name: album.album.title.clone(),
                track_count: album.selected_track_ids.len() as i64,
            })
            .collect()
    };
    CatalogEntitySplitPreviewDto {
        source_id: plan.source.id.clone(),
        source_name: plan.source.name.clone(),
        new_name: plan.new_name.clone(),
        selected_track_count: plan.selected_track_ids.len() as i64,
        remaining_track_count: plan.remaining_track_count,
        reparented_albums: preview_albums(true),
        duplicated_albums: preview_albums(false),
    }
}

pub fn preview_library_artist_split(
    conn: &Connection,
    source_id: &str,
    new_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogEntitySplitPreviewDto, String> {
    plan_artist_split(conn, source_id, new_name, selected_track_ids)
        .map(|plan| artist_split_preview(&plan))
}

pub fn split_library_artist(
    conn: &mut Connection,
    source_id: &str,
    new_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogEntitySplitDto, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let plan = plan_artist_split(&tx, source_id, new_name, selected_track_ids)?;
    let genres_json = merged_string_list_json("[]", &plan.source.genres_json)?;
    tx.execute(
        "INSERT INTO artists (id, name, aliases_json, genres_json) VALUES (?1, ?2, '[]', ?3)",
        params![plan.new_artist_id, plan.new_name, genres_json],
    )
    .map_err(|error| error.to_string())?;
    snapshot_split_track_metadata(&tx, &plan.selected_track_ids)?;

    let mut cloned_album_ids = HashMap::new();
    for album in &plan.albums {
        if album.reparent {
            tx.execute(
                "UPDATE albums SET artist_id = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![album.album.id, plan.new_artist_id],
            )
            .map_err(|error| error.to_string())?;
        } else {
            let new_album_id = next_album_split_id(
                &tx,
                &album.album.id,
                &plan.new_artist_id,
                &album.album.title,
            )?;
            tx.execute(
                "INSERT INTO albums (id, title, artist_id, year, cover_path, aliases_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    new_album_id,
                    album.album.title,
                    plan.new_artist_id,
                    album.album.year,
                    album.album.cover_path,
                    album.album.aliases_json
                ],
            )
            .map_err(|error| error.to_string())?;
            cloned_album_ids.insert(album.album.id.clone(), new_album_id);
        }
    }
    for (track_id, album_id) in &plan.track_albums {
        let new_album_id = album_id
            .as_ref()
            .and_then(|id| cloned_album_ids.get(id))
            .or(album_id.as_ref());
        let changed = tx
            .execute(
                "UPDATE tracks SET artist_id = ?2, album_id = ?3, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND artist_id = ?4 AND source = 'local'",
                params![track_id, plan.new_artist_id, new_album_id, plan.source.id],
            )
            .map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("所选曲目已发生变化，请刷新后重新预览".into());
        }
    }
    let tracks = tracks_for_ids(&tx, &plan.selected_track_ids)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntitySplitDto {
        id: plan.new_artist_id,
        source_name: plan.source.name,
        name: plan.new_name,
        tracks,
    })
}

pub fn preview_library_album_split(
    conn: &Connection,
    source_id: &str,
    new_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogEntitySplitPreviewDto, String> {
    let plan = plan_album_split(conn, source_id, new_name, selected_track_ids)?;
    Ok(CatalogEntitySplitPreviewDto {
        source_id: plan.source.id,
        source_name: plan.source.title,
        new_name: plan.new_name,
        selected_track_count: plan.selected_track_ids.len() as i64,
        remaining_track_count: plan.remaining_track_count,
        reparented_albums: Vec::new(),
        duplicated_albums: Vec::new(),
    })
}

pub fn split_library_album(
    conn: &mut Connection,
    source_id: &str,
    new_name: &str,
    selected_track_ids: &[String],
) -> Result<CatalogEntitySplitDto, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let plan = plan_album_split(&tx, source_id, new_name, selected_track_ids)?;
    tx.execute(
        "INSERT INTO albums (id, title, artist_id, year, cover_path, aliases_json)
         VALUES (?1, ?2, ?3, ?4, ?5, '[]')",
        params![
            plan.new_album_id,
            plan.new_name,
            plan.source.artist_id,
            plan.source.year,
            plan.source.cover_path
        ],
    )
    .map_err(|error| error.to_string())?;
    snapshot_split_track_metadata(&tx, &plan.selected_track_ids)?;
    for track_id in &plan.selected_track_ids {
        let changed = tx
            .execute(
                "UPDATE tracks SET album_id = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND album_id = ?3 AND source = 'local'",
                params![track_id, plan.new_album_id, plan.source.id],
            )
            .map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("所选曲目已发生变化，请刷新后重新预览".into());
        }
    }
    let tracks = tracks_for_ids(&tx, &plan.selected_track_ids)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntitySplitDto {
        id: plan.new_album_id,
        source_name: plan.source.title,
        name: plan.new_name,
        tracks,
    })
}

fn snapshot_split_track_metadata(conn: &Connection, track_ids: &[String]) -> Result<(), String> {
    for track_id in track_ids {
        conn.execute(
            "INSERT OR IGNORE INTO track_metadata_overrides (track_id)
             SELECT id FROM tracks WHERE id = ?1 AND source = 'local'",
            [track_id],
        )
        .map_err(|error| error.to_string())?;
        conn.execute(
            "UPDATE track_metadata_overrides SET
                 original_title = COALESCE(original_title, (SELECT title FROM tracks WHERE id = ?1)),
                 original_artist = COALESCE(original_artist, (SELECT COALESCE(ar.name, '') FROM tracks t LEFT JOIN artists ar ON ar.id = t.artist_id WHERE t.id = ?1)),
                 original_album = COALESCE(original_album, (SELECT COALESCE(a.title, '') FROM tracks t LEFT JOIN albums a ON a.id = t.album_id WHERE t.id = ?1))
             WHERE track_id = ?1",
            [track_id],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// 改本地曲库艺人的展示名，保留旧名供后续导入/重扫回归同一实体。
pub fn rename_library_artist(
    conn: &mut Connection,
    id: &str,
    name: &str,
) -> Result<CatalogEntityRenameDto, String> {
    let name = checked_metadata_value(name, "艺人名", true)?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let current: Option<(String, String)> = tx
        .query_row(
            "SELECT name, aliases_json FROM artists WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((previous_name, aliases_json)) = current else {
        return Err("艺人不存在".into());
    };
    let local_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE artist_id = ?1 AND source = 'local'",
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if local_count == 0 {
        return Err("只能修正仍关联本地曲目的艺人".into());
    }
    let other_source_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE artist_id = ?1 AND source <> 'local'",
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if other_source_count > 0 {
        return Err("此艺人还关联其他来源的曲目，为避免同时更改它们，暂不能改名".into());
    }
    if name != previous_name {
        if rename_conflicts_with_artist(&tx, id, &name)? {
            return Err("曲库中已存在同名或同别名艺人；请先处理实体合并".into());
        }
        let next_aliases = append_entity_alias(&aliases_json, &previous_name, &name)?;
        tx.execute(
            "UPDATE artists SET name = ?2, aliases_json = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, name, next_aliases],
        )
        .map_err(|error| error.to_string())?;
    }
    let tracks = local_tracks_for_artist(&tx, id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntityRenameDto {
        id: id.to_string(),
        previous_name,
        name,
        tracks,
    })
}

/// 改本地曲库专辑的展示名，保留旧名并按关联艺人匹配重扫。
pub fn rename_library_album(
    conn: &mut Connection,
    id: &str,
    name: &str,
) -> Result<CatalogEntityRenameDto, String> {
    let name = checked_metadata_value(name, "专辑名", true)?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let current: Option<(String, String, Option<String>)> = tx
        .query_row(
            "SELECT title, aliases_json, artist_id FROM albums WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((previous_name, aliases_json, artist_id)) = current else {
        return Err("专辑不存在".into());
    };
    let local_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE album_id = ?1 AND source = 'local'",
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if local_count == 0 {
        return Err("只能修正仍关联本地曲目的专辑".into());
    }
    let other_source_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE album_id = ?1 AND source <> 'local'",
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if other_source_count > 0 {
        return Err("此专辑还关联其他来源的曲目，为避免同时更改它们，暂不能改名".into());
    }
    if name != previous_name {
        if rename_conflicts_with_album(&tx, id, &name, artist_id.as_deref())? {
            return Err("该艺人下已存在同名或同别名专辑；请先处理实体合并".into());
        }
        let next_aliases = append_entity_alias(&aliases_json, &previous_name, &name)?;
        tx.execute(
            "UPDATE albums SET title = ?2, aliases_json = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, name, next_aliases],
        )
        .map_err(|error| error.to_string())?;
    }
    let tracks = local_tracks_for_album(&tx, id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(CatalogEntityRenameDto {
        id: id.to_string(),
        previous_name,
        name,
        tracks,
    })
}

fn is_authorized_track_file(
    conn: &Connection,
    path: &Path,
    explicitly_authorized: bool,
) -> Result<bool, String> {
    if explicitly_authorized {
        return Ok(is_regular_path_without_symlink_components(path));
    }
    let directories =
        list_authorized_music_directory_records(conn).map_err(|error| error.to_string())?;
    let Some(directory) = directories
        .iter()
        .filter(|directory| path_is_within_directory(path, &directory.path))
        .max_by_key(|directory| normalized_path_key(&directory.path).len())
    else {
        return Ok(false);
    };
    Ok(
        directory.path.is_dir()
            && is_regular_file_without_symlink_components(path, &directory.path),
    )
}

/// Resolve a writable audio-tag target through the same per-file/directory authorization used
/// by library recovery. This deliberately refuses ignored, missing, unsupported, and symlinked
/// tracks; callers must never treat the database path alone as file-system permission.
fn authorized_audio_tag_target(conn: &Connection, track_id: &str) -> Result<PathBuf, String> {
    let details: Option<(String, String, bool, bool)> = conn
        .query_row(
            "SELECT source, file_path, ignored_by_rules, explicit_path_authorized
             FROM tracks WHERE id = ?1",
            params![track_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, i64>(3)? != 0,
                ))
            },
        )
        .optional()
        .map_err(|_| "无法读取曲库音频记录".to_string())?;
    let Some((source, path, ignored, explicitly_authorized)) = details else {
        return Err("曲目不存在".into());
    };
    if source != "local" || ignored {
        return Err("只能写入未被规则排除的本地曲目".into());
    }
    let path = PathBuf::from(path);
    if !is_supported_audio_path(&path) {
        return Err("此音频格式不支持标签写入".into());
    }
    if !is_authorized_track_file(conn, &path, explicitly_authorized)? {
        return Err("音频文件不在当前有效授权范围内，请先恢复目录或文件访问".into());
    }
    if !is_regular_path_without_symlink_components(&path) {
        return Err("音频文件不可访问或包含符号链接".into());
    }
    path.canonicalize()
        .map_err(|_| "音频文件当前无法访问".to_string())
}

/// Resolve a local track for an explicit, read-only sidecar-video lookup. Directory enumeration
/// is allowed only when the track remains under a registered music directory; a single-file grant
/// is deliberately insufficient to inspect neighboring files.
pub(crate) fn local_video_track_context(
    conn: &Connection,
    track_id: &str,
) -> Result<LocalVideoTrackContext, String> {
    let details: Option<(String, String, String, String, bool, bool)> = conn
        .query_row(
            "SELECT t.source, t.title, COALESCE(ar.name, ''), t.file_path,
                    t.ignored_by_rules, t.explicit_path_authorized
             FROM tracks t LEFT JOIN artists ar ON ar.id = t.artist_id WHERE t.id = ?1",
            params![track_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get::<_, i64>(4)? != 0,
                    row.get::<_, i64>(5)? != 0,
                ))
            },
        )
        .optional()
        .map_err(|_| "无法读取本地曲目".to_string())?;
    let Some((source, title, artist, stored_path, ignored, explicitly_authorized)) = details else {
        return Err("曲目不存在".into());
    };
    if source != "local" || ignored {
        return Err("本地视频候选仅适用于未排除的本地曲目".into());
    }
    if explicitly_authorized {
        return Err("本地视频候选需要已登记的音乐目录授权".into());
    }

    let audio_path = PathBuf::from(stored_path);
    if !is_supported_audio_path(&audio_path)
        || !is_authorized_track_file(conn, &audio_path, false)?
        || !is_regular_path_without_symlink_components(&audio_path)
    {
        return Err("本地音频当前不在可用的目录授权范围内".into());
    }
    let audio_path = audio_path
        .canonicalize()
        .map_err(|_| "本地音频当前无法访问".to_string())?;
    let directories = list_authorized_music_directory_records(conn)
        .map_err(|_| "无法读取已授权音乐目录".to_string())?;
    let authorized_root = directories
        .into_iter()
        .filter(|directory| {
            directory.path.is_dir() && path_is_within_directory(&audio_path, &directory.path)
        })
        .max_by_key(|directory| normalized_path_key(&directory.path).len())
        .and_then(|directory| {
            let canonical = directory.path.canonicalize().ok()?;
            (normalized_path_key(&canonical) == normalized_path_key(&directory.path))
                .then_some(canonical)
        })
        .filter(|root| path_is_within_directory(&audio_path, root))
        .ok_or_else(|| "没有可用于本地视频匹配的已登记目录".to_string())?;

    Ok(LocalVideoTrackContext {
        track_id: track_id.to_string(),
        title,
        artist,
        audio_path,
        authorized_root,
    })
}

/// Revalidate the track authorization and video path before every local-video media range.
pub(crate) fn local_video_path_is_authorized(
    conn: &Connection,
    track_id: &str,
    path: &Path,
) -> Result<bool, String> {
    let context = local_video_track_context(conn, track_id)?;
    let canonical_path = match path.canonicalize() {
        Ok(path) => path,
        Err(_) => return Ok(false),
    };
    if normalized_path_key(&canonical_path) != normalized_path_key(path) {
        return Ok(false);
    }
    Ok(
        path_is_within_directory(&canonical_path, &context.authorized_root)
            && is_regular_file_without_symlink_components(
                &canonical_path,
                &context.authorized_root,
            ),
    )
}

/// 媒体协议 `/local` 的授权闸门：只放行「曲库登记且仍在授权范围内的本地文件」。
///
/// 媒体协议跑在 WebView 里，若不校验路径，任何脚本都能借
/// `ome-media.localhost/local?p=<任意绝对路径>` 读取磁盘上的任意文件。这里复用曲库既有的
/// 两层授权：已授权音乐目录（含符号链接检查）与用户逐文件显式授权。
///
/// 目标不存在时仍按目录规则放行（随后自然 404）：封面缓存被系统清理后的自愈依赖这条
/// 404 路径，不能在授权阶段就把它挡掉。
pub(crate) fn local_media_path_is_authorized(conn: &Connection, target: &Path) -> bool {
    let canonical = target.canonicalize().ok();
    let probe = canonical.as_deref().unwrap_or(target);
    let directories = list_authorized_music_directory_records(conn).unwrap_or_default();
    if directories.iter().any(|directory| {
        let root = directory
            .path
            .canonicalize()
            .unwrap_or_else(|_| directory.path.clone());
        path_is_within_directory(probe, &root)
            && (canonical.is_none() || is_regular_file_without_symlink_components(probe, &root))
    }) {
        return true;
    }
    // 逐文件显式授权（用户直接添加的单个文件，不在任何目录授权内）：数量很少，按规范化键
    // 比对，以免 `\\?\` 前缀、盘符大小写、分隔符差异造成误拒。
    let Ok(mut statement) = conn.prepare(
        "SELECT file_path FROM tracks WHERE source = 'local' AND explicit_path_authorized = 1",
    ) else {
        return false;
    };
    let Ok(rows) = statement.query_map([], |row| row.get::<_, String>(0)) else {
        return false;
    };
    let probe_key = normalized_path_key(probe);
    let stored_paths = rows.flatten().collect::<Vec<_>>();
    drop(statement);
    stored_paths.iter().any(|stored| {
        normalized_path_key(Path::new(stored)) == probe_key
            && is_regular_path_without_symlink_components(Path::new(stored))
    })
}

fn authorized_album_folder_target(conn: &Connection, album_id: &str) -> Result<PathBuf, String> {
    if album_id.trim().is_empty() {
        return Err("专辑不存在".into());
    }
    let mut statement = conn
        .prepare(
            "SELECT file_path, explicit_path_authorized
             FROM tracks
             WHERE album_id = ?1 AND source = 'local' AND ignored_by_rules = 0
             ORDER BY title COLLATE NOCASE, id",
        )
        .map_err(|_| "无法读取专辑曲目".to_string())?;
    let rows = statement
        .query_map(params![album_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
        })
        .map_err(|_| "无法读取专辑曲目".to_string())?;

    for row in rows {
        let (file_path, explicitly_authorized) = row.map_err(|_| "无法读取专辑曲目".to_string())?;
        let file_path = PathBuf::from(file_path);
        if !is_authorized_track_file(conn, &file_path, explicitly_authorized)?
            || !is_regular_path_without_symlink_components(&file_path)
        {
            continue;
        }
        let Ok(canonical_file) = file_path.canonicalize() else {
            continue;
        };
        if let Some(parent) = canonical_file.parent().filter(|parent| parent.is_dir()) {
            return Ok(parent.to_path_buf());
        }
    }
    Err("专辑中没有当前可访问的本地音频文件".into())
}

fn open_folder_in_file_manager(folder: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer.exe")
        .arg(folder)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open")
        .arg(folder)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open")
        .arg(folder)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let result: Result<std::process::Child, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "unsupported platform",
    ));

    result
        .map(|_child| ())
        .map_err(|_| "无法启动系统文件管理器".to_string())
}

#[tauri::command]
pub fn open_library_album_folder_command(
    state: State<'_, AppState>,
    album_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let folder = authorized_album_folder_target(&conn, &album_id)?;
    open_folder_in_file_manager(&folder)
}

fn audio_tag_backup_path(
    app_data_dir: &Path,
    track_id: &str,
    audio_path: &Path,
) -> Result<PathBuf, String> {
    let extension = audio_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
        .ok_or_else(|| "音频文件扩展名不受支持".to_string())?;
    let track_key = format!("{:x}", md5::compute(track_id.as_bytes()));
    let path_key = format!(
        "{:x}",
        md5::compute(normalized_path_key(audio_path).as_bytes())
    );
    Ok(app_data_dir
        .join("audio-tag-backups")
        .join(track_key)
        .join(path_key)
        .join(format!("original.{extension}")))
}

fn ensure_audio_tag_backup_parent(path: &Path, app_data_dir: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "无法定位音频标签备份目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|_| "无法创建音频标签备份目录".to_string())?;
    let root = app_data_dir
        .canonicalize()
        .map_err(|_| "应用数据目录当前不可访问".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "音频标签备份目录当前不可访问".to_string())?;
    if !canonical_parent.starts_with(root.join("audio-tag-backups")) {
        return Err("音频标签备份目录超出应用数据范围".into());
    }
    Ok(())
}

fn regular_audio_tag_backup(path: &Path, app_data_dir: &Path) -> Result<bool, String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("无法检查音频标签备份".into()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("音频标签备份不是普通文件".into());
    }
    let canonical_root = app_data_dir
        .join("audio-tag-backups")
        .canonicalize()
        .map_err(|_| "音频标签备份目录当前不可访问".to_string())?;
    let canonical_backup = path
        .canonicalize()
        .map_err(|_| "音频标签备份当前无法访问".to_string())?;
    if !canonical_backup.starts_with(canonical_root) {
        return Err("音频标签备份超出应用数据范围".into());
    }
    Ok(true)
}

fn restore_audio_file_copy(source: &Path, target: &Path) -> Result<(), String> {
    std::fs::copy(source, target)
        .map(|_| ())
        .map_err(|_| "无法恢复音频文件；保留的备份仍可用于再次恢复".to_string())
}

fn verify_audio_tag_values(
    path: &Path,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<(), String> {
    let tagged =
        lofty::read_from_path(path).map_err(|_| "写入后的音频文件无法重新读取".to_string())?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| "写入后的音频文件没有可读标签".to_string())?;
    let actual_title = tag
        .title()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let actual_artist = tag
        .artist()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let actual_album = tag
        .album()
        .map(|value| value.to_string())
        .unwrap_or_default();
    if actual_title != title || actual_artist != artist || actual_album != album {
        return Err("写入后的音频标签与确认内容不一致".into());
    }
    Ok(())
}

fn verify_audio_lyrics_value(path: &Path, expected: &str) -> Result<(), String> {
    let tagged =
        lofty::read_from_path(path).map_err(|_| "写入后的音频文件无法重新读取".to_string())?;
    let matches = tagged
        .primary_tag()
        .into_iter()
        .chain(tagged.tags())
        .any(|tag| {
            tag.get_string(ItemKey::UnsyncLyrics) == Some(expected)
                || tag.get_string(ItemKey::Lyrics) == Some(expected)
        });
    if !matches {
        return Err("写入后的内嵌歌词与确认内容不一致".into());
    }
    Ok(())
}

pub(crate) fn validate_audio_cover_dimensions(
    bytes: &[u8],
    mime_type: &MimeType,
) -> Result<(), String> {
    validate_cover_dimensions(bytes, mime_type, 10_000, MAX_AUDIO_COVER_PIXELS)
}

pub(crate) fn validate_remote_cover_dimensions(
    bytes: &[u8],
    mime_type: &MimeType,
) -> Result<(), String> {
    validate_cover_dimensions(bytes, mime_type, 2_048, 4_194_304)
}

fn validate_cover_dimensions(
    bytes: &[u8],
    mime_type: &MimeType,
    max_edge: u32,
    max_pixels: u64,
) -> Result<(), String> {
    let dimensions = match mime_type {
        MimeType::Png => {
            if bytes.len() < 24 || &bytes[12..16] != b"IHDR" {
                return Err("PNG 封面缺少有效的图像尺寸信息".into());
            }
            (
                u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]),
                u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]),
            )
        }
        MimeType::Jpeg => {
            let mut cursor = 2usize;
            let mut found = None;
            while cursor + 1 < bytes.len() {
                if bytes[cursor] != 0xff {
                    return Err("JPEG 封面结构无法读取".into());
                }
                while cursor < bytes.len() && bytes[cursor] == 0xff {
                    cursor += 1;
                }
                let Some(&marker) = bytes.get(cursor) else {
                    break;
                };
                cursor += 1;
                if marker == 0xd9 || marker == 0xda {
                    break;
                }
                if marker == 0x00 || marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
                    continue;
                }
                if cursor + 2 > bytes.len() {
                    break;
                }
                let segment_length =
                    u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
                if segment_length < 2 || cursor + segment_length > bytes.len() {
                    return Err("JPEG 封面结构无法读取".into());
                }
                if matches!(
                    marker,
                    0xc0 | 0xc1
                        | 0xc2
                        | 0xc3
                        | 0xc5
                        | 0xc6
                        | 0xc7
                        | 0xc9
                        | 0xca
                        | 0xcb
                        | 0xcd
                        | 0xce
                        | 0xcf
                ) {
                    if segment_length < 7 {
                        return Err("JPEG 封面缺少有效的图像尺寸信息".into());
                    }
                    found = Some((
                        u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32,
                        u16::from_be_bytes([bytes[cursor + 3], bytes[cursor + 4]]) as u32,
                    ));
                    break;
                }
                cursor += segment_length;
            }
            found.ok_or_else(|| "JPEG 封面缺少有效的图像尺寸信息".to_string())?
        }
        _ => return Err("封面只支持 PNG 或 JPEG 图片".into()),
    };
    let (width, height) = dimensions;
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 || width > max_edge || height > max_edge || pixels > max_pixels {
        return Err(format!(
            "封面尺寸过大；最长边需在 {max_edge} 像素以内且不超过 {} 百万像素",
            max_pixels / 1_000_000
        ));
    }
    Ok(())
}

fn decode_audio_cover(payload: AudioCoverArtWriteDto) -> Result<AudioCoverImage, String> {
    let encoded_limit = MAX_AUDIO_COVER_BYTES.div_ceil(3) * 4;
    if payload.image_base64.len() > encoded_limit {
        return Err("封面图片不能超过 8 MB".into());
    }
    let (mime_type, extension, signature): (MimeType, &'static str, &'static [u8]) =
        match payload.mime_type.as_str() {
            "image/png" => (MimeType::Png, "png", b"\x89PNG\r\n\x1a\n"),
            "image/jpeg" => (MimeType::Jpeg, "jpg", &[0xff, 0xd8, 0xff]),
            _ => return Err("封面只支持 PNG 或 JPEG 图片".into()),
        };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.image_base64.as_bytes())
        .map_err(|_| "封面图片数据无法读取".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_AUDIO_COVER_BYTES {
        return Err("封面图片为空或超过 8 MB".into());
    }
    if !bytes.starts_with(signature) {
        return Err("封面文件内容与图片格式不匹配".into());
    }
    validate_audio_cover_dimensions(&bytes, &mime_type)?;
    Ok(AudioCoverImage {
        bytes,
        mime_type,
        extension,
    })
}

fn verify_audio_cover_value(path: &Path, expected: &AudioCoverImage) -> Result<(), String> {
    let tagged =
        lofty::read_from_path(path).map_err(|_| "写入后的音频文件无法重新读取".to_string())?;
    let picture = tagged
        .primary_tag()
        .and_then(|tag| tag.get_picture_type(PictureType::CoverFront))
        .ok_or_else(|| "写入后的音频标签中没有正面封面".to_string())?;
    if picture.data() != expected.bytes.as_slice()
        || picture.mime_type() != Some(&expected.mime_type)
    {
        return Err("写入后的音频封面与选择的图片不一致".into());
    }
    Ok(())
}

fn album_audio_tag_strings(tag: &lofty::tag::Tag) -> AlbumAudioTagsDto {
    let year = tag
        .get_string(ItemKey::RecordingDate)
        .or_else(|| tag.get_string(ItemKey::Year))
        .and_then(|value| {
            let year: String = value.chars().take(4).collect();
            if year.len() == 4 && year.bytes().all(|byte| byte.is_ascii_digit()) {
                Some(year)
            } else {
                None
            }
        });
    AlbumAudioTagsDto {
        album: tag.album().unwrap_or_default().to_string(),
        album_artist: tag
            .get_string(ItemKey::AlbumArtist)
            .unwrap_or_default()
            .to_string(),
        year,
        genre: tag
            .genre()
            .map(|value| value.to_string())
            .unwrap_or_default(),
    }
}

fn track_audio_tag_strings(tag: &lofty::tag::Tag) -> TrackAudioTagsDto {
    let album_tags = album_audio_tag_strings(tag);
    let raw_comment = tag.comment().unwrap_or_default();
    let comment_truncated = raw_comment.chars().take(4_001).count() > 4_000;
    TrackAudioTagsDto {
        title: tag.title().unwrap_or_default().to_string(),
        artist: tag.artist().unwrap_or_default().to_string(),
        album: album_tags.album,
        album_artist: album_tags.album_artist,
        year: album_tags.year,
        genre: album_tags.genre,
        track_number: tag.track(),
        track_total: tag.track_total(),
        disc_number: tag.disk(),
        disc_total: tag.disk_total(),
        bpm: tag
            .get_string(ItemKey::Bpm)
            .or_else(|| tag.get_string(ItemKey::IntegerBpm))
            .map(|value| value.to_string()),
        comment: raw_comment.chars().take(4_000).collect(),
        comment_truncated,
    }
}

fn apply_track_audio_tag_values(
    tag: &mut lofty::tag::Tag,
    tag_type: TagType,
    values: &TrackAudioTagWriteValues,
) -> Result<(), String> {
    if let Some(track_number) = values.track_number {
        match track_number {
            Some(number) => tag.set_track(number),
            None => tag.remove_track(),
        }
        if let Some(total) = values.track_total {
            match total {
                Some(total) => tag.set_track_total(total),
                None => tag.remove_track_total(),
            }
        }
    }
    if let Some(disc_number) = values.disc_number {
        match disc_number {
            Some(number) => tag.set_disk(number),
            None => tag.remove_disk(),
        }
        if let Some(total) = values.disc_total {
            match total {
                Some(total) => tag.set_disk_total(total),
                None => tag.remove_disk_total(),
            }
        }
    }
    if let Some(bpm) = values.bpm {
        tag.remove_key(ItemKey::Bpm);
        tag.remove_key(ItemKey::IntegerBpm);
        if let Some(bpm) = bpm {
            let key = if matches!(tag_type, TagType::Id3v2 | TagType::Mp4Ilst) {
                ItemKey::IntegerBpm
            } else {
                ItemKey::Bpm
            };
            if !tag.insert_text(key, bpm.to_string()) {
                return Err("此音频格式的标签不支持写入 BPM".into());
            }
        }
    }
    if let Some(comment) = values.comment.as_ref() {
        tag.remove_key(ItemKey::Comment);
        if !comment.is_empty() && !tag.insert_text(ItemKey::Comment, comment.clone()) {
            return Err("此音频格式的标签不支持写入备注".into());
        }
    }
    Ok(())
}

fn verify_album_audio_tags(path: &Path, expected: &AlbumAudioTagValues) -> Result<(), String> {
    let tagged =
        lofty::read_from_path(path).map_err(|_| "写入后的音频文件无法重新读取".to_string())?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| "写入后的音频文件没有可读标签".to_string())?;
    let actual = album_audio_tag_strings(tag);
    if expected
        .album
        .as_deref()
        .is_some_and(|value| tag.album().unwrap_or_default() != value)
    {
        return Err("写入后的专辑名标签与确认内容不一致".into());
    }
    if expected
        .album_artist
        .as_deref()
        .is_some_and(|value| actual.album_artist != value)
    {
        return Err("写入后的专辑艺人标签与确认内容不一致".into());
    }
    if let Some(year) = expected.year.as_deref() {
        if actual.year.as_deref().unwrap_or_default() != year {
            return Err("写入后的专辑年份标签与确认内容不一致".into());
        }
    }
    if expected
        .genre
        .as_deref()
        .is_some_and(|value| actual.genre != value)
    {
        return Err("写入后的流派标签与确认内容不一致".into());
    }
    Ok(())
}

fn verify_track_audio_tag_values(
    path: &Path,
    expected: &TrackAudioTagWriteValues,
) -> Result<(), String> {
    let tagged =
        lofty::read_from_path(path).map_err(|_| "写入后的音频文件无法重新读取".to_string())?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| "写入后的音频文件没有可读标签".to_string())?;
    let actual = track_audio_tag_strings(tag);
    if expected
        .track_number
        .is_some_and(|number| actual.track_number != number)
    {
        return Err("写入后的音轨号与确认内容不一致".into());
    }
    if expected
        .track_total
        .is_some_and(|total| actual.track_total != total)
    {
        return Err("写入后的音轨总数发生变化".into());
    }
    if expected
        .disc_number
        .is_some_and(|number| actual.disc_number != number)
    {
        return Err("写入后的碟号与确认内容不一致".into());
    }
    if expected
        .disc_total
        .is_some_and(|total| actual.disc_total != total)
    {
        return Err("写入后的碟片总数发生变化".into());
    }
    if let Some(bpm) = expected.bpm {
        let actual_bpm = actual.bpm.and_then(|value| value.parse::<u16>().ok());
        if actual_bpm != bpm {
            return Err("写入后的 BPM 与确认内容不一致".into());
        }
    }
    if expected
        .comment
        .as_deref()
        .is_some_and(|comment| actual.comment != comment)
    {
        return Err("写入后的备注与确认内容不一致".into());
    }
    Ok(())
}

struct AudioCoverCachePaths {
    staged: PathBuf,
    destination: PathBuf,
    previous: PathBuf,
}

fn prepare_audio_cover_cache(
    app: &AppHandle,
    id: &str,
    token: &str,
    cover: &AudioCoverImage,
) -> Result<AudioCoverCachePaths, String> {
    if id.len() != 32 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("无法安全定位这首曲目的封面缓存".into());
    }
    let covers_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "应用封面缓存目录当前不可用".to_string())?
        .join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|_| "无法创建封面缓存目录".to_string())?;
    let staged = covers_dir.join(format!(".ome-cover-{token}.{}", cover.extension));
    let destination = covers_dir.join(format!("{id}.{}", cover.extension));
    let previous = covers_dir.join(format!(".ome-cover-previous-{token}.{}", cover.extension));
    let mut staged_file = match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)
    {
        Ok(file) => file,
        Err(error) => return Err(format!("无法暂存封面缓存：{error}")),
    };
    if let Err(error) = staged_file.write_all(&cover.bytes) {
        let _ = std::fs::remove_file(&staged);
        return Err(format!("无法暂存封面缓存：{error}"));
    }
    drop(staged_file);
    match std::fs::read(&staged) {
        Ok(bytes) if bytes == cover.bytes => Ok(AudioCoverCachePaths {
            staged,
            destination,
            previous,
        }),
        _ => {
            let _ = std::fs::remove_file(&staged);
            Err("封面缓存写入后校验失败".into())
        }
    }
}

fn rollback_audio_cover_cache(
    paths: &AudioCoverCachePaths,
    previous_moved: bool,
    published: bool,
) -> Result<(), String> {
    let mut errors = Vec::new();
    if published && paths.destination.exists() && std::fs::remove_file(&paths.destination).is_err()
    {
        errors.push("无法移除本次生成的封面缓存");
    }
    if previous_moved && std::fs::rename(&paths.previous, &paths.destination).is_err() {
        errors.push("无法恢复写入前的封面缓存");
    }
    if std::fs::remove_file(&paths.staged).is_err() && paths.staged.exists() {
        errors.push("无法清理临时封面缓存");
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

fn publish_audio_cover_cache(paths: &AudioCoverCachePaths) -> Result<bool, String> {
    match std::fs::symlink_metadata(&paths.previous) {
        Ok(_) => {
            let _ = std::fs::remove_file(&paths.staged);
            return Err("封面缓存临时路径已被占用，已停止写入".into());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            let _ = std::fs::remove_file(&paths.staged);
            return Err("无法检查封面缓存临时路径".into());
        }
    }
    let previous_moved = match std::fs::symlink_metadata(&paths.destination) {
        Ok(metadata) if metadata.file_type().is_file() => {
            if std::fs::rename(&paths.destination, &paths.previous).is_err() {
                let _ = std::fs::remove_file(&paths.staged);
                return Err("无法保护现有封面缓存".into());
            }
            true
        }
        Ok(_) => {
            let _ = std::fs::remove_file(&paths.staged);
            return Err("现有封面缓存不是普通文件，已停止写入".into());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => {
            let _ = std::fs::remove_file(&paths.staged);
            return Err("无法检查现有封面缓存".into());
        }
    };
    if std::fs::rename(&paths.staged, &paths.destination).is_err() {
        let cache_rollback = rollback_audio_cover_cache(paths, previous_moved, false);
        return Err(match cache_rollback {
            Ok(()) => "无法发布封面缓存".into(),
            Err(error) => format!("无法发布封面缓存，且旧缓存恢复失败：{error}"),
        });
    }
    Ok(previous_moved)
}

fn update_track_cover_path(
    conn: &mut Connection,
    id: &str,
    cover_path: &str,
) -> Result<TrackDto, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let updated_count = tx
        .execute(
            "UPDATE tracks SET cover_path = ?1 WHERE id = ?2 AND source = 'local' AND ignored_by_rules = 0",
            params![cover_path, id],
        )
        .map_err(|error| error.to_string())?;
    if updated_count != 1 {
        return Err("曲库中找不到可更新的本地曲目封面".into());
    }
    let updated = tx
        .query_row(
            &(TRACK_SELECT.to_string() + " WHERE t.id = ?1"),
            params![id],
            row_to_track,
        )
        .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(updated)
}

fn rollback_audio_tag_file_write(
    pending_backup: &Path,
    backup_path: &Path,
    output_path: &Path,
    audio_path: &Path,
    created_backup: bool,
) -> Result<(), String> {
    restore_audio_file_copy(pending_backup, audio_path)?;
    let _ = std::fs::remove_file(output_path);
    let _ = std::fs::remove_file(pending_backup);
    if created_backup {
        let _ = std::fs::remove_file(backup_path);
    }
    Ok(())
}

fn verify_audio_tag_write(
    path: &Path,
    metadata: Option<(&str, &str, &str)>,
    lyrics: Option<&str>,
    cover: Option<&AudioCoverImage>,
    album_tags: Option<&AlbumAudioTagValues>,
    track_tags: Option<&TrackAudioTagWriteValues>,
) -> Result<(), String> {
    if let Some((title, artist, album)) = metadata {
        verify_audio_tag_values(path, title, artist, album)?;
    }
    if let Some(lyrics) = lyrics {
        verify_audio_lyrics_value(path, lyrics)?;
    }
    if let Some(cover) = cover {
        verify_audio_cover_value(path, cover)?;
    }
    if let Some(album_tags) = album_tags {
        verify_album_audio_tags(path, album_tags)?;
    }
    if let Some(track_tags) = track_tags {
        verify_track_audio_tag_values(path, track_tags)?;
    }
    Ok(())
}

pub fn restore_track_metadata(
    conn: &mut Connection,
    id: &str,
) -> Result<TrackMetadataRestoreDto, String> {
    let details: Option<TrackMetadataRestoreSource> = conn
        .query_row(
            "SELECT t.source, t.ignored_by_rules, t.file_path, t.explicit_path_authorized,
                    o.track_id IS NOT NULL, o.original_title, o.original_artist, o.original_album
             FROM tracks t
             LEFT JOIN track_metadata_overrides o ON o.track_id = t.id
             WHERE t.id = ?1",
            params![id],
            |row| {
                Ok(TrackMetadataRestoreSource {
                    source: row.get(0)?,
                    ignored: row.get::<_, i64>(1)? != 0,
                    file_path: row.get(2)?,
                    explicitly_authorized: row.get::<_, i64>(3)? != 0,
                    has_override: row.get::<_, i64>(4)? != 0,
                    title: row.get(5)?,
                    artist: row.get(6)?,
                    album: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(details) = details else {
        return Err("曲目不存在".into());
    };
    if details.source != "local" || details.ignored {
        return Err("只能恢复未被规则排除的本地曲目资料".into());
    }
    if !details.has_override {
        return Err("这首曲目没有人工资料覆盖，无需恢复".into());
    }

    let (title, artist, album, restored_from) = match (details.title, details.artist, details.album)
    {
        (Some(title), Some(artist), Some(album)) => (title, artist, album, "snapshot"),
        _ => {
            let path = Path::new(&details.file_path);
            if !is_authorized_track_file(conn, path, details.explicitly_authorized)? {
                return Err("此旧版资料没有保存原始快照，当前音频文件不可访问，无法恢复".into());
            }
            if !is_supported_audio_path(path) {
                return Err("此旧版资料没有保存原始快照，当前文件不是受支持的音频格式".into());
            }
            let metadata = read_track_metadata(path)
                .ok_or_else(|| "此旧版资料没有保存原始快照，无法读取当前音频标签".to_string())?;
            (metadata.title, metadata.artist, metadata.album, "fileTags")
        }
    };

    let track = update_track_metadata_with_override(
        conn,
        id,
        &title,
        &artist,
        &album,
        false,
        &TrackMetadataSourcesDto::file_tags(),
    )?;
    Ok(TrackMetadataRestoreDto {
        track,
        source: restored_from.to_string(),
    })
}

/// 只删除 Ome 数据库中的本地曲库记录；外键会清除关联歌单、历史与本地分析数据。
/// 不访问、移动或删除记录中保存的音频文件路径。
pub fn remove_local_track(conn: &mut Connection, id: &str) -> Result<(), String> {
    remove_local_tracks(conn, &[id.to_string()])
}

/// Atomically remove a bounded set of local library indexes without touching audio files.
pub fn remove_local_tracks(conn: &mut Connection, ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Err("至少选择一首本地曲目".into());
    }
    if ids.len() > MAX_LIBRARY_REMOVAL_BATCH {
        return Err("一次最多移除 10000 首曲目".into());
    }
    let unique_ids: HashSet<&str> = ids.iter().map(String::as_str).collect();
    if unique_ids.len() != ids.len() {
        return Err("移除列表包含重复曲目".into());
    }

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for id in ids {
        let source: Option<String> = tx
            .query_row(
                "SELECT source FROM tracks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        match source.as_deref() {
            None => return Err("曲目不存在".into()),
            Some("local") => {}
            Some(_) => return Err("只能从曲库移除本地曲目".into()),
        }
    }

    for id in ids {
        tx.execute(
            "UPDATE lyrics_backfill_items
             SET status = 'skipped', provider = NULL, score = NULL,
                 message = '曲目已从曲库移除', updated_at = CURRENT_TIMESTAMP
             WHERE track_id = ?1 AND status IN ('pending', 'processing')",
            params![id],
        )
        .map_err(|error| error.to_string())?;
        let removed = tx
            .execute(
                "DELETE FROM tracks WHERE id = ?1 AND source = 'local'",
                params![id],
            )
            .map_err(|error| error.to_string())?;
        if removed != 1 {
            return Err("曲目不存在或不是本地曲目".into());
        }
    }
    tx.commit().map_err(|error| error.to_string())
}

/// 曲目行查询共用 SELECT（列序与 row_to_track 对应）；调用方拼自己的 FROM 后续
pub(crate) const TRACK_SELECT: &str =
    "SELECT t.id, t.artist_id, t.album_id, t.title, ar.name AS artist, a.title AS album, t.duration_seconds, t.file_path,
                t.source, t.source_id, t.unavailable_reason, t.cover_path, t.genres_json AS genres_json, t.liked, t.play_count,
                t.explicit_path_authorized AS explicit_path_authorized,
                t.quick_hash AS quick_hash, t.quick_hash_version AS quick_hash_version,
                t.replay_gain_track_gain_db AS replay_gain_track_gain_db,
                t.replay_gain_album_gain_db AS replay_gain_album_gain_db,
                t.replay_gain_track_peak AS replay_gain_track_peak,
                t.replay_gain_album_peak AS replay_gain_album_peak,
                EXISTS(SELECT 1 FROM track_metadata_overrides o WHERE o.track_id = t.id)
                    AS has_metadata_override,
                EXISTS(SELECT 1 FROM track_metadata_overrides o WHERE o.track_id = t.id
                    AND o.original_title IS NOT NULL AND o.original_artist IS NOT NULL
                    AND o.original_album IS NOT NULL) AS metadata_snapshot_available,
                COALESCE((SELECT o.title_source FROM track_metadata_overrides o WHERE o.track_id = t.id), 'unknown')
                    AS title_source,
                COALESCE((SELECT o.artist_source FROM track_metadata_overrides o WHERE o.track_id = t.id), 'unknown')
                    AS artist_source,
                COALESCE((SELECT o.album_source FROM track_metadata_overrides o WHERE o.track_id = t.id), 'unknown')
                    AS album_source
         FROM tracks t
         LEFT JOIN artists ar ON t.artist_id = ar.id
         LEFT JOIN albums a ON t.album_id = a.id";

pub(crate) fn row_to_track(row: &rusqlite::Row<'_>) -> Result<TrackDto, rusqlite::Error> {
    let has_metadata_override = row.get::<_, i64>("has_metadata_override")? != 0;
    let metadata_sources = if has_metadata_override {
        Some(TrackMetadataSourcesDto {
            title: row.get("title_source")?,
            artist: row.get("artist_source")?,
            album: row.get("album_source")?,
        })
    } else {
        None
    };
    Ok(TrackDto {
        id: row.get("id")?,
        artist_id: row.get("artist_id")?,
        album_id: row.get("album_id")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get::<_, Option<String>>("album")?.unwrap_or_default(),
        duration_seconds: row.get("duration_seconds")?,
        file_path: row.get("file_path")?,
        source: row.get("source")?,
        source_id: row.get("source_id")?,
        unavailable_reason: row.get("unavailable_reason")?,
        cover_path: row.get("cover_path")?,
        genres: decode_track_genres(&row.get::<_, String>("genres_json")?),
        liked: row.get::<_, i64>("liked")? != 0,
        play_count: row.get("play_count")?,
        replay_gain_track_gain_db: row.get("replay_gain_track_gain_db")?,
        replay_gain_album_gain_db: row.get("replay_gain_album_gain_db")?,
        replay_gain_track_peak: row.get("replay_gain_track_peak")?,
        replay_gain_album_peak: row.get("replay_gain_album_peak")?,
        has_metadata_override,
        metadata_snapshot_available: row.get::<_, i64>("metadata_snapshot_available")? != 0,
        metadata_sources,
    })
}

pub fn load_tracks(conn: &Connection) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        &(TRACK_SELECT.to_string()
            + " WHERE t.ignored_by_rules = 0 ORDER BY t.title COLLATE NOCASE"),
    )?;
    let rows = stmt.query_map([], row_to_track)?;
    rows.collect()
}

fn list_unavailable_local_tracks(conn: &Connection) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let directories = list_authorized_music_directory_records(conn)?;
    let mut stmt = conn.prepare(
        &(TRACK_SELECT.to_string()
            + " WHERE t.source = 'local' AND t.ignored_by_rules = 0 ORDER BY t.title COLLATE NOCASE"),
    )?;
    let tracks = stmt
        .query_map([], |row| {
            Ok((
                row_to_track(row)?,
                row.get::<_, i64>("explicit_path_authorized")? != 0,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks
        .into_iter()
        .filter_map(|(track, explicitly_authorized)| {
            let path = Path::new(&track.file_path);
            if explicitly_authorized {
                return (!is_regular_path_without_symlink_components(path)).then_some(track);
            }
            let directory = directories
                .iter()
                .filter(|directory| path_is_within_directory(path, &directory.path))
                .max_by_key(|directory| normalized_path_key(&directory.path).len());
            directory
                .is_some_and(|directory| {
                    directory.path.is_dir()
                        && !is_regular_file_without_symlink_components(path, &directory.path)
                })
                .then_some(track)
        })
        .collect())
}

fn normalized_move_metadata(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn move_candidate_reasons(old: &TrackDto, candidate: &TrackDto) -> Option<Vec<String>> {
    let old_title = normalized_move_metadata(&old.title);
    let new_title = normalized_move_metadata(&candidate.title);
    let old_artist = normalized_move_metadata(&old.artist);
    let new_artist = normalized_move_metadata(&candidate.artist);
    let old_album = normalized_move_metadata(&old.album);
    let new_album = normalized_move_metadata(&candidate.album);
    if old_title.is_empty()
        || old_artist.is_empty()
        || old_title != new_title
        || old_artist != new_artist
        || old.duration_seconds <= 0
        || candidate.duration_seconds <= 0
        || old.duration_seconds.abs_diff(candidate.duration_seconds) > 1
    {
        return None;
    }
    if !old_album.is_empty() && !new_album.is_empty() && old_album != new_album {
        return None;
    }

    let mut reasons = vec!["曲名与艺人资料一致".to_string()];
    if !old_album.is_empty() && old_album == new_album {
        reasons.push("专辑资料一致".to_string());
    }
    reasons.push(format!(
        "曲目时长相差 {} 秒",
        old.duration_seconds.abs_diff(candidate.duration_seconds)
    ));
    reasons.push("移动前后音频快速摘要一致".to_string());
    Some(reasons)
}

fn list_library_move_candidates(conn: &Connection) -> Result<Vec<LibraryMoveCandidateDto>, String> {
    let missing_tracks = list_unavailable_local_tracks(conn)
        .map_err(|error| format!("无法读取失联曲目：{error}"))?;
    let mut statement = conn
        .prepare(
            &(TRACK_SELECT.to_string()
                + " WHERE t.source = 'local' AND t.ignored_by_rules = 0
                     AND t.quick_hash IS NOT NULL AND t.quick_hash_version = ?1
                   ORDER BY t.title COLLATE NOCASE, t.file_path LIMIT 20000"),
        )
        .map_err(|error| error.to_string())?;
    let indexed_candidates = statement
        .query_map(params![QUICK_HASH_VERSION], |row| {
            Ok(QuickIdentityTrack {
                track: row_to_track(row)?,
                quick_hash: row.get("quick_hash")?,
                version: row.get("quick_hash_version")?,
                explicitly_authorized: row.get::<_, i64>("explicit_path_authorized")? != 0,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut candidates_by_hash: HashMap<(i64, String), Vec<usize>> = HashMap::new();
    let mut canonical_candidate_paths = HashMap::new();
    for (index, candidate) in indexed_candidates.iter().enumerate() {
        let Ok(path) = authorized_audio_tag_target(conn, &candidate.track.id) else {
            continue;
        };
        canonical_candidate_paths.insert(candidate.track.id.clone(), path);
        candidates_by_hash
            .entry((candidate.version, candidate.quick_hash.clone()))
            .or_default()
            .push(index);
    }
    let mut possible_pairs = Vec::new();
    let mut candidate_hash_is_current: HashMap<String, bool> = HashMap::new();
    for missing in missing_tracks.iter().take(20_000) {
        let identity: (Option<String>, Option<i64>) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version FROM tracks WHERE id = ?1",
                params![missing.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        let (Some(hash), Some(version)) = identity else {
            continue;
        };
        if version != QUICK_HASH_VERSION {
            continue;
        }
        let Some(indexes) = candidates_by_hash.get(&(version, hash)) else {
            continue;
        };
        // Pathological duplicate groups are left for the existing manual picker.
        if indexes.len() > 50 {
            continue;
        }
        for index in indexes {
            let indexed_candidate = &indexed_candidates[*index];
            let candidate = &indexed_candidate.track;
            if candidate.id == missing.id
                || normalized_path_key(Path::new(&candidate.file_path))
                    == normalized_path_key(Path::new(&missing.file_path))
            {
                continue;
            }
            let Some(reasons) = move_candidate_reasons(missing, candidate) else {
                continue;
            };
            let current_hash_matches = *candidate_hash_is_current
                .entry(candidate.id.clone())
                .or_insert_with(|| {
                    // Hash the registered path as stored in the catalog. The authorization
                    // check above proves its canonical target; retaining its spelling here
                    // also keeps Windows path-prefix checks consistent with registration.
                    quick_file_hash_with_authorization(
                        conn,
                        Path::new(&candidate.file_path),
                        indexed_candidate.explicitly_authorized,
                    )
                    .is_some_and(|hash| hash == indexed_candidate.quick_hash)
                });
            if !current_hash_matches {
                continue;
            }
            possible_pairs.push((missing.clone(), candidate.clone(), reasons));
        }
    }

    let mut old_pair_counts: HashMap<String, usize> = HashMap::new();
    let mut new_pair_counts: HashMap<String, usize> = HashMap::new();
    for (missing, candidate, _) in &possible_pairs {
        *old_pair_counts.entry(missing.id.clone()).or_default() += 1;
        *new_pair_counts.entry(candidate.id.clone()).or_default() += 1;
    }

    let mut result = Vec::with_capacity(possible_pairs.len().min(100));
    for (missing, candidate, reasons) in possible_pairs.into_iter().take(100) {
        let Some(canonical_path) = canonical_candidate_paths.get(&candidate.id) else {
            continue;
        };
        result.push(LibraryMoveCandidateDto {
            missing_track_id: missing.id.clone(),
            candidate_track_id: candidate.id.clone(),
            title: missing.title,
            artist: missing.artist,
            album: if missing.album.is_empty() {
                candidate.album
            } else {
                missing.album
            },
            missing_path: missing.file_path,
            candidate_path: canonical_path.to_string_lossy().into_owned(),
            duration_seconds: missing.duration_seconds,
            candidate_duration_seconds: candidate.duration_seconds,
            ambiguous: old_pair_counts
                .get(&missing.id)
                .copied()
                .unwrap_or_default()
                != 1
                || new_pair_counts
                    .get(&candidate.id)
                    .copied()
                    .unwrap_or_default()
                    != 1,
            // This implementation only has a bounded quick hash. It is a candidate
            // signal, never a trusted file identity suitable for automatic repair.
            confidence: "low".into(),
            reasons,
        });
    }
    result.sort_by(|left, right| {
        left.title
            .to_lowercase()
            .cmp(&right.title.to_lowercase())
            .then_with(|| left.missing_path.cmp(&right.missing_path))
            .then_with(|| left.candidate_path.cmp(&right.candidate_path))
    });
    Ok(result)
}

fn repair_local_track_path(
    conn: &mut Connection,
    track_id: &str,
    selected_path: &Path,
) -> Result<TrackDto, String> {
    let repaired_path = selected_path
        .canonicalize()
        .map_err(|_| "所选音频文件当前无法访问，请重新选择".to_string())?;
    if !is_supported_audio_path(&repaired_path)
        || !std::fs::metadata(&repaired_path)
            .map(|metadata| metadata.is_file())
            .unwrap_or(false)
    {
        return Err("请选择可访问的本地音频文件".into());
    }
    let (_, replay_gain, genres) = read_track_file_metadata(&repaired_path)
        .ok_or_else(|| "所选文件无法识别为可读音频".to_string())?;
    let genres_json = serde_json::to_string(&genres).unwrap_or_else(|_| "[]".into());

    let repaired_path_text = repaired_path.to_string_lossy().into_owned();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let existing: Option<(String, String, bool, bool)> = tx
        .query_row(
            "SELECT file_path, source, ignored_by_rules, explicit_path_authorized
             FROM tracks WHERE id = ?1",
            params![track_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, i64>(3)? != 0,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((existing_path, source, ignored_by_rules, explicitly_authorized)) = existing else {
        return Err("曲目不存在，请重新检查曲库".into());
    };
    if source != "local" || ignored_by_rules {
        return Err("只能修复未被规则排除的本地曲目".into());
    }

    let current_path = Path::new(&existing_path);
    if explicitly_authorized {
        if is_regular_path_without_symlink_components(current_path) {
            return Err("曲目文件目前仍可访问，无需重新关联".into());
        }
    } else {
        let directories =
            list_authorized_music_directory_records(&tx).map_err(|error| error.to_string())?;
        let current_directory = directories
            .iter()
            .filter(|directory| path_is_within_directory(current_path, &directory.path))
            .max_by_key(|directory| normalized_path_key(&directory.path).len())
            .ok_or_else(|| "曲目不在当前登记目录内，请先恢复目录访问".to_string())?;
        if !current_directory.path.is_dir() {
            return Err("曲目所在目录当前离线；请先重新选择该音乐目录".into());
        }
        if is_regular_file_without_symlink_components(current_path, &current_directory.path) {
            return Err("曲目文件目前仍可访问，无需重新关联".into());
        }
    }
    if !is_regular_path_without_symlink_components(&repaired_path) {
        return Err("所选音频文件包含不可访问的符号链接路径，请重新选择文件".into());
    }

    let duplicate: bool = tx
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM tracks
                WHERE file_path = ?1 COLLATE NOCASE AND id != ?2
            )",
            params![repaired_path_text, track_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if duplicate {
        return Err("所选文件已经关联到曲库中的另一首曲目".into());
    }

    tx.execute(
        "UPDATE tracks SET file_path = ?1, explicit_path_authorized = 1,
                           replay_gain_track_gain_db = ?2, replay_gain_album_gain_db = ?3,
                           replay_gain_track_peak = ?4, replay_gain_album_peak = ?5,
                           genres_json = ?6
         WHERE id = ?7 AND source = 'local'",
        params![
            repaired_path_text,
            replay_gain.track_gain_db,
            replay_gain.album_gain_db,
            replay_gain.track_peak,
            replay_gain.album_peak,
            genres_json,
            track_id,
        ],
    )
    .map_err(|error| error.to_string())?;
    // Manual recovery establishes a new, user-approved path. Refresh the bounded identity
    // sample now so legacy tracks can participate in future move-candidate checks. If the
    // sample cannot be read, clear any stale value rather than carrying an identity from the
    // previous file into the repaired record.
    let quick_hash = quick_file_hash_with_authorization(&tx, &repaired_path, true);
    let quick_hash_version = quick_hash.as_ref().map(|_| QUICK_HASH_VERSION);
    tx.execute(
        "UPDATE tracks SET quick_hash = ?1, quick_hash_version = ?2 WHERE id = ?3",
        params![quick_hash, quick_hash_version, track_id],
    )
    .map_err(|error| error.to_string())?;
    let updated = tx
        .query_row(
            &(TRACK_SELECT.to_string() + " WHERE t.id = ?1"),
            params![track_id],
            row_to_track,
        )
        .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(updated)
}

pub fn load_ignored_tracks(conn: &Connection) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        &(TRACK_SELECT.to_string()
            + " WHERE t.ignored_by_rules = 1 AND t.source = 'local'
               ORDER BY t.title COLLATE NOCASE"),
    )?;
    let rows = stmt.query_map([], row_to_track)?;
    rows.collect()
}

pub fn set_track_liked(conn: &Connection, id: &str, liked: bool) -> Result<(), rusqlite::Error> {
    let tx = conn.unchecked_transaction()?;
    let previous_liked = tx
        .query_row(
            "SELECT liked FROM tracks WHERE id = ?1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?;
    tx.execute(
        "UPDATE tracks SET liked = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, liked as i64],
    )?;
    if previous_liked.is_some_and(|value| (value != 0) != liked) {
        let event_type = if liked { "liked" } else { "unliked" };
        let now = std::time::SystemTime::now();
        let event_id = format!("{:x}", md5::compute(format!("{id}{event_type}{now:?}")));
        tx.execute(
            "INSERT INTO playback_events (id, track_id, event_type, position_seconds) VALUES (?1, ?2, ?3, 0)",
            params![event_id, id, event_type],
        )?;
    }
    tx.commit()
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

/// 历史条目：曲目 + 播放时间（每次播放一条，供前端做时间筛选与统计）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryDto {
    #[serde(flatten)]
    pub track: TrackDto,
    pub played_at: String,
}

pub fn playback_history_entries(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<HistoryEntryDto>, rusqlite::Error> {
    // TRACK_SELECT 自带 FROM/JOIN 子句：把 e.played_at 注入 SELECT 列表
    let sql = TRACK_SELECT.replacen(
        "FROM tracks t",
        ", e.played_at AS played_at FROM tracks t",
        1,
    ) + " JOIN playback_events e ON t.id = e.track_id
         WHERE e.event_type IN ('play', 'completed', 'replayed')
         ORDER BY e.played_at DESC
         LIMIT ?1";
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(HistoryEntryDto {
            track: row_to_track(row)?,
            played_at: row.get("played_at")?,
        })
    })?;
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

fn parse_replay_gain_db(raw: Option<&str>) -> Option<f64> {
    let raw = raw?.trim();
    let value = raw
        .strip_suffix("dB")
        .or_else(|| raw.strip_suffix("db"))
        .unwrap_or(raw)
        .trim();
    let value = value.parse::<f64>().ok()?;
    (value.is_finite() && (-60.0..=60.0).contains(&value)).then_some(value)
}

fn parse_replay_gain_peak(raw: Option<&str>) -> Option<f64> {
    let value = raw?.trim().parse::<f64>().ok()?;
    (value.is_finite() && value > 0.0 && value <= 64.0).then_some(value)
}

fn replay_gain_from_tag(tag: Option<&Tag>) -> ReplayGainMetadata {
    let Some(tag) = tag else {
        return ReplayGainMetadata::default();
    };
    ReplayGainMetadata {
        track_gain_db: parse_replay_gain_db(tag.get_string(ItemKey::ReplayGainTrackGain)),
        album_gain_db: parse_replay_gain_db(tag.get_string(ItemKey::ReplayGainAlbumGain)),
        track_peak: parse_replay_gain_peak(tag.get_string(ItemKey::ReplayGainTrackPeak)),
        album_peak: parse_replay_gain_peak(tag.get_string(ItemKey::ReplayGainAlbumPeak)),
    }
}

fn read_track_file_metadata(path: &Path) -> Option<(NewTrack, ReplayGainMetadata, Vec<String>)> {
    let file_path = path.to_string_lossy().to_string();
    let tagged = lofty::read_from_path(path).ok()?;
    let duration_seconds = tagged.properties().duration().as_secs() as i64;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let replay_gain = replay_gain_from_tag(tag);
    let genres = tag
        .and_then(|tag| tag.genre().map(|genre| genre.into_owned()))
        .map(|genre| split_track_genres(&genre))
        .unwrap_or_default();
    let fallback_title = path.file_stem()?.to_string_lossy().to_string();
    let track = NewTrack {
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
    };
    Some((track, replay_gain, genres))
}

fn read_track_metadata(path: &Path) -> Option<NewTrack> {
    read_track_file_metadata(path).map(|(track, _, _)| track)
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

fn list_authorized_music_directories(conn: &Connection) -> Result<Vec<PathBuf>, rusqlite::Error> {
    Ok(list_authorized_music_directory_records(conn)?
        .into_iter()
        .map(|directory| directory.path)
        .collect())
}

fn list_authorized_music_directory_records(
    conn: &Connection,
) -> Result<Vec<AuthorizedMusicDirectory>, rusqlite::Error> {
    let mut statement = conn
        .prepare("SELECT id, directory_path FROM authorized_music_directories ORDER BY id ASC")?;
    let rows = statement.query_map([], |row| {
        Ok(AuthorizedMusicDirectory {
            id: row.get(0)?,
            path: PathBuf::from(row.get::<_, String>(1)?),
        })
    })?;
    rows.collect()
}

fn authorized_music_directory_by_id(
    conn: &Connection,
    directory_id: i64,
) -> Result<Option<PathBuf>, rusqlite::Error> {
    conn.query_row(
        "SELECT directory_path FROM authorized_music_directories WHERE id = ?1",
        [directory_id],
        |row| row.get::<_, String>(0).map(PathBuf::from),
    )
    .optional()
}

fn revoke_authorized_music_directory(
    conn: &Connection,
    directory_id: i64,
) -> Result<bool, rusqlite::Error> {
    Ok(conn.execute(
        "DELETE FROM authorized_music_directories WHERE id = ?1",
        [directory_id],
    )? > 0)
}

fn list_authorized_music_directory_status(
    conn: &Connection,
) -> Result<Vec<AuthorizedMusicDirectoryDto>, rusqlite::Error> {
    let directories = list_authorized_music_directory_records(conn)?;
    let mut statement = conn.prepare("SELECT file_path FROM tracks WHERE source = 'local'")?;
    let track_paths = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(directories
        .into_iter()
        .map(|directory| AuthorizedMusicDirectoryDto {
            id: directory.id,
            available: directory.path.is_dir(),
            track_count: track_paths
                .iter()
                .filter(|track_path| {
                    path_is_within_directory(Path::new(track_path), &directory.path)
                })
                .count() as i64,
            path: directory.path.to_string_lossy().into_owned(),
        })
        .collect())
}

fn library_diagnostics_snapshot(
    conn: &Connection,
) -> Result<LibraryDiagnosticsSnapshot, rusqlite::Error> {
    let count = |sql: &str| conn.query_row(sql, [], |row| row.get::<_, i64>(0));
    let checked_at = conn.query_row("SELECT strftime('%Y-%m-%d %H:%M:%S', 'now')", [], |row| {
        row.get(0)
    })?;
    let total_indexed_track_count = count("SELECT COUNT(*) FROM tracks")?;
    let local_track_count =
        count("SELECT COUNT(*) FROM tracks WHERE source = 'local' AND ignored_by_rules = 0")?;
    let other_source_track_count =
        count("SELECT COUNT(*) FROM tracks WHERE source != 'local' AND ignored_by_rules = 0")?;
    let excluded_track_count =
        count("SELECT COUNT(*) FROM tracks WHERE source = 'local' AND ignored_by_rules = 1")?;
    let quick_identity_pending_track_count = conn.query_row(
        "SELECT COUNT(*) FROM tracks
         WHERE source = 'local' AND ignored_by_rules = 0
           AND (quick_hash IS NULL OR quick_hash_version IS NULL OR quick_hash_version != ?1)",
        params![QUICK_HASH_VERSION],
        |row| row.get::<_, i64>(0),
    )?;
    let artist_count = count("SELECT COUNT(*) FROM artists")?;
    let album_count = count("SELECT COUNT(*) FROM albums")?;
    let playlist_count = count("SELECT COUNT(*) FROM playlists")?;
    let playback_event_count = count("SELECT COUNT(*) FROM playback_events")?;
    let integrity_check = conn.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;

    let mut statement = conn.prepare(
        "SELECT file_path, ignored_by_rules, explicit_path_authorized
             FROM tracks WHERE source = 'local'",
    )?;
    let local_track_paths = statement
        .query_map([], |row| {
            Ok(DiagnosticTrackPath {
                path: PathBuf::from(row.get::<_, String>(0)?),
                excluded_by_rules: row.get::<_, i64>(1)? != 0,
                explicitly_authorized: row.get::<_, i64>(2)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let last_scan = conn
        .query_row(
            "SELECT completed_at, added, updated, total, skipped, scan_errors
             FROM library_scan_summary WHERE singleton = 1",
            [],
            |row| {
                Ok(LibraryScanSummaryDto {
                    completed_at: row.get(0)?,
                    added: row.get(1)?,
                    updated: row.get(2)?,
                    total: row.get(3)?,
                    skipped: row.get(4)?,
                    scan_errors: row.get(5)?,
                })
            },
        )
        .optional()?;

    Ok(LibraryDiagnosticsSnapshot {
        checked_at,
        total_indexed_track_count,
        local_track_count,
        other_source_track_count,
        excluded_track_count,
        quick_identity_pending_track_count,
        artist_count,
        album_count,
        playlist_count,
        playback_event_count,
        integrity_check,
        directory_records: list_authorized_music_directory_records(conn)?,
        local_track_paths,
        last_scan,
    })
}

fn build_library_diagnostics(
    snapshot: LibraryDiagnosticsSnapshot,
    database_path: PathBuf,
    covers_path: PathBuf,
) -> LibraryDiagnosticsDto {
    let mut directories: Vec<_> = snapshot
        .directory_records
        .iter()
        .map(|directory| LibraryDirectoryDiagnosticsDto {
            path: directory.path.to_string_lossy().into_owned(),
            available: directory.path.is_dir(),
            indexed_track_count: 0,
        })
        .collect();
    let mut accessible_track_count = 0;
    let mut unavailable_track_count = 0;
    let mut offline_directory_track_count = 0;
    let mut outside_directory_track_count = 0;

    for track in &snapshot.local_track_paths {
        let matching_directory = snapshot
            .directory_records
            .iter()
            .enumerate()
            .filter(|(_, directory)| path_is_within_directory(&track.path, &directory.path))
            .max_by_key(|(_, directory)| normalized_path_key(&directory.path).len());
        if let Some((directory_index, _)) = matching_directory {
            directories[directory_index].indexed_track_count += 1;
        }
        if track.excluded_by_rules {
            continue;
        }
        if track.explicitly_authorized {
            if is_regular_path_without_symlink_components(&track.path) {
                accessible_track_count += 1;
            } else {
                unavailable_track_count += 1;
            }
            continue;
        }
        let Some((_, directory)) = matching_directory else {
            outside_directory_track_count += 1;
            continue;
        };
        if !directory.path.is_dir() {
            offline_directory_track_count += 1;
        } else if is_regular_file_without_symlink_components(&track.path, &directory.path) {
            accessible_track_count += 1;
        } else {
            unavailable_track_count += 1;
        }
    }

    let database_size_bytes = sqlite_storage_size(&database_path);
    let covers_available = covers_path.is_dir();
    let (covers_file_count, covers_size_bytes) = if covers_available {
        let mut file_count = 0;
        let mut total_bytes = 0_u64;
        let mut complete = true;
        if let Ok(entries) = std::fs::read_dir(&covers_path) {
            for entry in entries {
                match entry.and_then(|entry| entry.metadata()) {
                    Ok(metadata) if metadata.is_file() => {
                        file_count += 1;
                        total_bytes = total_bytes.saturating_add(metadata.len());
                    }
                    Ok(_) => {}
                    Err(_) => complete = false,
                }
            }
        } else {
            complete = false;
        }
        (file_count, complete.then_some(total_bytes))
    } else {
        (0, Some(0))
    };

    LibraryDiagnosticsDto {
        checked_at: snapshot.checked_at,
        total_indexed_track_count: snapshot.total_indexed_track_count,
        local_track_count: snapshot.local_track_count,
        other_source_track_count: snapshot.other_source_track_count,
        excluded_track_count: snapshot.excluded_track_count,
        quick_identity_pending_track_count: snapshot.quick_identity_pending_track_count,
        accessible_track_count,
        unavailable_track_count,
        offline_directory_track_count,
        outside_directory_track_count,
        artist_count: snapshot.artist_count,
        album_count: snapshot.album_count,
        playlist_count: snapshot.playlist_count,
        playback_event_count: snapshot.playback_event_count,
        integrity_check: snapshot.integrity_check,
        directories,
        database_path: database_path.to_string_lossy().into_owned(),
        database_size_bytes,
        covers_path: covers_path.to_string_lossy().into_owned(),
        covers_available,
        covers_file_count,
        covers_size_bytes,
        last_scan: snapshot.last_scan,
    }
}

fn persist_library_scan_summary(
    conn: &Connection,
    added: i64,
    updated: i64,
    total: i64,
    skipped: i64,
    scan_errors: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO library_scan_summary
            (singleton, completed_at, added, updated, total, skipped, scan_errors)
         VALUES (1, CURRENT_TIMESTAMP, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(singleton) DO UPDATE SET
            completed_at = excluded.completed_at,
            added = excluded.added,
            updated = excluded.updated,
            total = excluded.total,
            skipped = excluded.skipped,
            scan_errors = excluded.scan_errors",
        params![added, updated, total, skipped, scan_errors],
    )?;
    Ok(())
}

pub(crate) fn normalized_path_key(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
    if let Some(unc_path) = normalized.strip_prefix("//?/unc/") {
        return format!("//{unc_path}");
    }
    normalized
        .strip_prefix("//?/")
        .unwrap_or(&normalized)
        .to_string()
}

pub(crate) fn path_is_within_directory(path: &Path, directory: &Path) -> bool {
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
        || directory
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return false;
    }
    let path_key = normalized_path_key(path);
    let directory_key = normalized_path_key(directory);
    let directory_key = if directory_key == "/" || directory_key.ends_with(":/") {
        directory_key
    } else {
        directory_key.trim_end_matches('/').to_string()
    };
    path_key == directory_key
        || path_key
            .strip_prefix(&directory_key)
            .is_some_and(|suffix| directory_key.ends_with('/') || suffix.starts_with('/'))
}

pub(crate) fn is_regular_file_without_symlink_components(path: &Path, directory: &Path) -> bool {
    let Ok(relative_path) = path.strip_prefix(directory) else {
        return false;
    };
    let components = relative_path.components().collect::<Vec<_>>();
    if components.is_empty() {
        return false;
    }
    let mut current = directory.to_path_buf();
    for (index, component) in components.iter().enumerate() {
        let std::path::Component::Normal(name) = component else {
            return false;
        };
        current.push(name);
        let Ok(metadata) = std::fs::symlink_metadata(&current) else {
            return false;
        };
        if metadata.file_type().is_symlink() {
            return false;
        }
        if index + 1 == components.len() {
            return metadata.is_file();
        }
        if !metadata.is_dir() {
            return false;
        }
    }
    false
}

fn is_regular_path_without_symlink_components(path: &Path) -> bool {
    let Ok(canonical_path) = path.canonicalize() else {
        return false;
    };
    if normalized_path_key(&canonical_path) != normalized_path_key(path) {
        return false;
    }
    std::fs::symlink_metadata(path)
        .map(|metadata| !metadata.file_type().is_symlink() && metadata.is_file())
        .unwrap_or(false)
}

fn sqlite_storage_size(path: &Path) -> Option<u64> {
    let mut total = 0_u64;
    let mut found = false;
    for suffix in ["", "-wal", "-shm"] {
        let mut candidate = path.as_os_str().to_os_string();
        candidate.push(suffix);
        match std::fs::metadata(PathBuf::from(candidate)) {
            Ok(metadata) => {
                found = true;
                total = total.saturating_add(metadata.len());
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return None,
        }
    }
    found.then_some(total)
}

#[derive(Clone, Debug)]
struct IgnoredEntry {
    path: PathBuf,
    is_directory: bool,
}

#[derive(Default)]
struct DiscoveryResult {
    audio_paths: Vec<PathBuf>,
    ignored_entries: Vec<IgnoredEntry>,
    invalid_rule_directories: Vec<PathBuf>,
}

fn ignored_entry_matches_track(entry: &IgnoredEntry, track_path: &Path) -> bool {
    if entry.is_directory {
        path_is_within_directory(track_path, &entry.path)
    } else {
        normalized_path_key(track_path) == normalized_path_key(&entry.path)
    }
}

fn mark_tracks_ignored_by_rules(
    conn: &Connection,
    ignored_entries: &[IgnoredEntry],
) -> Result<(), rusqlite::Error> {
    if ignored_entries.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    let tracks = {
        let mut statement =
            tx.prepare("SELECT id, file_path FROM tracks WHERE source = 'local'")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, file_path) in tracks {
        if ignored_entries
            .iter()
            .any(|entry| ignored_entry_matches_track(entry, Path::new(&file_path)))
        {
            tx.execute(
                "UPDATE tracks SET ignored_by_rules = 1 WHERE id = ?1 AND source = 'local'",
                params![id],
            )?;
        }
    }
    tx.commit()
}

fn restore_track_after_successful_scan(
    conn: &Connection,
    path: &Path,
    invalid_rule_directories: &[PathBuf],
) -> Result<(), rusqlite::Error> {
    if invalid_rule_directories
        .iter()
        .any(|directory| path_is_within_directory(path, directory))
    {
        return Ok(());
    }
    conn.execute(
        "UPDATE tracks SET ignored_by_rules = 0 WHERE file_path = ?1 AND source = 'local'",
        params![path.to_string_lossy()],
    )?;
    Ok(())
}

fn discover_audio_paths(
    folders: Vec<PathBuf>,
    progress: &mut LibraryImportProgressDto,
    mut publish: impl FnMut(&LibraryImportProgressDto),
) -> DiscoveryResult {
    let mut discovered = DiscoveryResult::default();
    let mut seen_audio_paths = HashSet::new();
    let mut seen_ignored_entries = HashSet::new();
    let mut seen_invalid_rule_directories = HashSet::new();
    let mut last_progress = std::time::Instant::now();
    for folder in folders {
        let mut scopes_by_directory: HashMap<PathBuf, Arc<Vec<Arc<IgnoreScope>>>> = HashMap::new();
        let ignore_rule_errors = Cell::new(0_i64);
        let ignored_entries = RefCell::new(Vec::new());
        let invalid_rule_directories = RefCell::new(Vec::new());
        let walker = WalkDir::new(&folder).into_iter().filter_entry(|entry| {
            let path = entry.path();
            let inherited = if entry.depth() == 0 {
                Vec::new()
            } else {
                path.parent()
                    .and_then(|parent| scopes_by_directory.get(parent))
                    .map(|scopes| scopes.as_ref().clone())
                    .unwrap_or_default()
            };
            let is_directory = entry.file_type().is_dir();
            if is_ignored(&inherited, path, is_directory) {
                ignored_entries.borrow_mut().push(IgnoredEntry {
                    path: path.to_path_buf(),
                    is_directory,
                });
                return false;
            }
            if is_directory {
                let scopes = match child_scopes(&inherited, path) {
                    Ok(scopes) => scopes,
                    Err(_) => {
                        ignore_rule_errors.set(ignore_rule_errors.get() + 1);
                        invalid_rule_directories
                            .borrow_mut()
                            .push(path.to_path_buf());
                        inherited
                    }
                };
                scopes_by_directory.insert(path.to_path_buf(), Arc::new(scopes));
            }
            true
        });
        for entry in walker {
            match entry {
                Ok(entry) => {
                    progress.examined_entries += 1;
                    let is_regular_audio =
                        entry.file_type().is_file() && is_supported_audio_path(entry.path());
                    let path = entry.into_path();
                    if is_regular_audio {
                        let key = normalized_path_key(&path);
                        if seen_audio_paths.insert(key) {
                            discovered.audio_paths.push(path);
                            progress.discovered_files += 1;
                        }
                    }
                }
                Err(_) => {
                    progress.examined_entries += 1;
                    progress.scan_errors += 1;
                }
            }
            if last_progress.elapsed() >= std::time::Duration::from_secs(1) {
                publish(progress);
                last_progress = std::time::Instant::now();
            }
        }
        progress.scan_errors += ignore_rule_errors.get();
        for entry in ignored_entries.into_inner() {
            let key = (normalized_path_key(&entry.path), entry.is_directory);
            if seen_ignored_entries.insert(key) {
                discovered.ignored_entries.push(entry);
            }
        }
        for directory in invalid_rule_directories.into_inner() {
            if seen_invalid_rule_directories.insert(normalized_path_key(&directory)) {
                discovered.invalid_rule_directories.push(directory);
            }
        }
    }
    discovered
}

async fn scan_music_folders(
    app: AppHandle,
    state_path: PathBuf,
    covers_dir: PathBuf,
    folders: Vec<PathBuf>,
) -> Result<ImportResultDto, String> {
    let activity_guard = begin_library_scan()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<ImportResultDto, String> {
        let _activity_guard = activity_guard;
        let conn = crate::db::open_db(&state_path).map_err(|error| error.to_string())?;
        let mut progress = LibraryImportProgressDto {
            phase: "discovering".into(),
            ..Default::default()
        };
        emit_import_progress(&app, &progress);

        let discovery = discover_audio_paths(folders, &mut progress, |value| {
            emit_import_progress(&app, value)
        });
        mark_tracks_ignored_by_rules(&conn, &discovery.ignored_entries)
            .map_err(|error| error.to_string())?;
        let invalid_rule_directories = discovery.invalid_rule_directories;
        let audio_paths = discovery.audio_paths;

        progress.phase = "reading".into();
        progress.total_files = Some(audio_paths.len() as i64);
        emit_import_progress(&app, &progress);

        let mut last_progress = std::time::Instant::now();
        for path in &audio_paths {
            if !is_authorized(&conn, path).map_err(|error| error.to_string())? {
                progress.skipped += 1;
            } else {
                let existed: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM tracks WHERE file_path = ?1",
                        params![path.to_string_lossy()],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                // 单个文件损坏/解析失败只跳过计数，不中止整个导入
                if let Some((mut track, replay_gain, genres)) = read_track_file_metadata(path) {
                    let cover_result = extract_cover(&conn, &covers_dir, path, &track);
                    match cover_result {
                        Ok(cover_path) => {
                            track.cover_path = cover_path;
                            insert_track_with_replay_gain_and_genres(
                                &conn,
                                &track,
                                replay_gain,
                                &genres,
                            )
                            .map_err(|error| error.to_string())?;
                            restore_track_after_successful_scan(
                                &conn,
                                path,
                                &invalid_rule_directories,
                            )
                            .map_err(|error| error.to_string())?;
                            if existed > 0 {
                                progress.updated += 1;
                            } else {
                                progress.added += 1;
                            }
                        }
                        Err(_) => progress.skipped += 1,
                    }
                } else {
                    progress.skipped += 1;
                }
            }

            progress.processed_files += 1;
            if progress.processed_files == progress.total_files.unwrap_or_default()
                || last_progress.elapsed() >= std::time::Duration::from_secs(1)
            {
                emit_import_progress(&app, &progress);
                last_progress = std::time::Instant::now();
            }
        }
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        persist_library_scan_summary(
            &conn,
            progress.added,
            progress.updated,
            total,
            progress.skipped,
            progress.scan_errors,
        )
        .map_err(|error| error.to_string())?;
        progress.phase = "complete".into();
        emit_import_progress(&app, &progress);
        Ok(ImportResultDto {
            added: progress.added,
            updated: progress.updated,
            total,
            skipped: progress.skipped,
            scan_errors: progress.scan_errors,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn import_music_folder(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ImportResultDto, String> {
    let progress = LibraryImportProgressDto {
        phase: "selecting".into(),
        ..Default::default()
    };
    emit_import_progress(&app, &progress);
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
    scan_music_folders(app, state_path, covers_dir, vec![folder]).await
}

#[tauri::command]
pub async fn rescan_music_folders(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ImportResultDto, String> {
    let folders = {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        list_authorized_music_directories(&conn).map_err(|error| error.to_string())?
    };
    if folders.is_empty() {
        return Err("还没有已授权的音乐文件夹，请先导入一个文件夹".into());
    }

    let covers_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|error| error.to_string())?;
    let state_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ome-music.db");
    scan_music_folders(app, state_path, covers_dir, folders).await
}

#[tauri::command]
pub fn list_authorized_music_directories_command(
    state: State<'_, AppState>,
) -> Result<Vec<AuthorizedMusicDirectoryDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    list_authorized_music_directory_status(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_diagnostics_command(app: AppHandle) -> Result<LibraryDiagnosticsDto, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let database_path = app_data_dir.join("ome-music.db");
    let covers_path = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("covers");
    tauri::async_runtime::spawn_blocking(move || {
        let conn = Connection::open_with_flags(
            &database_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )
        .map_err(|error| error.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| error.to_string())?;
        let snapshot = library_diagnostics_snapshot(&conn).map_err(|error| error.to_string())?;
        Ok(build_library_diagnostics(
            snapshot,
            database_path,
            covers_path,
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn list_unavailable_local_tracks_command(
    state: State<'_, AppState>,
) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    list_unavailable_local_tracks(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_library_move_candidates_command(
    state: State<'_, AppState>,
) -> Result<Vec<LibraryMoveCandidateDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    list_library_move_candidates(&conn)
}

#[tauri::command]
pub fn backfill_quick_identity_command(
    state: State<'_, AppState>,
    after_track_id: Option<String>,
) -> Result<QuickIdentityBackfillDto, String> {
    let _activity_guard = begin_library_database_maintenance()?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    backfill_quick_identity_batch(&conn, after_track_id.as_deref())
}

#[tauri::command]
pub fn repair_local_track_path_command(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<Option<TrackDto>, String> {
    let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .add_filter("音频", AUDIO_EXTENSIONS)
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected_path = selected.into_path().map_err(|error| error.to_string())?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    repair_local_track_path(&mut conn, &id, &selected_path).map(Some)
}

#[tauri::command]
pub async fn rescan_music_directory(
    state: State<'_, AppState>,
    app: AppHandle,
    directory_id: i64,
) -> Result<ImportResultDto, String> {
    let folder = {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        authorized_music_directory_by_id(&conn, directory_id)
            .map_err(|error| error.to_string())?
            .ok_or("这个扫描目录已不在登记列表，请重新选择目录")?
    };
    if !folder.is_dir() {
        return Err("目录当前不可用，请重新选择目录以恢复扫描".into());
    }

    let covers_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|error| error.to_string())?;
    let state_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ome-music.db");
    scan_music_folders(app, state_path, covers_dir, vec![folder]).await
}

#[tauri::command]
pub fn revoke_music_directory_authorization(
    state: State<'_, AppState>,
    directory_id: i64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    if revoke_authorized_music_directory(&conn, directory_id).map_err(|error| error.to_string())? {
        Ok(())
    } else {
        Err("这个扫描目录已不在登记列表".into())
    }
}

fn write_cover(covers_dir: &Path, track_id: &str, path: &Path) -> Result<Option<PathBuf>, String> {
    let tagged = match lofty::read_from_path(path) {
        Ok(tagged) => tagged,
        Err(_) => return Ok(None),
    };
    let picture = tagged
        .primary_tag()
        .and_then(|tag| {
            tag.get_picture_type(PictureType::CoverFront)
                .or_else(|| tag.pictures().first())
        })
        .or_else(|| {
            tagged.first_tag().and_then(|tag| {
                tag.get_picture_type(PictureType::CoverFront)
                    .or_else(|| tag.pictures().first())
            })
        });
    let picture = match picture {
        Some(picture) => picture,
        None => return Ok(None),
    };
    let extension = match picture.mime_type() {
        Some(lofty::picture::MimeType::Png) => "png",
        _ => "jpg",
    };
    let cover_path = covers_dir.join(format!("{track_id}.{extension}"));
    if !cover_path.exists() {
        std::fs::write(&cover_path, picture.data()).map_err(|error| error.to_string())?;
    }
    Ok(Some(cover_path))
}

fn extract_cover(
    _conn: &Connection,
    covers_dir: &Path,
    path: &Path,
    track: &NewTrack,
) -> Result<Option<String>, String> {
    Ok(
        write_cover(covers_dir, &track_id_for_path(&track.file_path), path)?
            .map(|path| path.to_string_lossy().to_string()),
    )
}

/// 封面缓存自愈：按曲目 id 找到源音频并重提取封面到 covers_dir（媒体协议 404 时调用）。
/// 封面存在 app_cache（可能被系统清理），DB 里的绝对路径会悬空，此函数就地再生。
pub fn reextract_cover_by_id(
    conn: &Connection,
    covers_dir: &Path,
    track_id: &str,
) -> Option<PathBuf> {
    let src: String = conn
        .query_row(
            "SELECT file_path FROM tracks WHERE id = ?1 AND source = 'local'",
            params![track_id],
            |row| row.get(0),
        )
        .ok()?;
    write_cover(covers_dir, track_id, Path::new(&src))
        .ok()
        .flatten()
}

#[tauri::command]
pub fn list_tracks(state: State<'_, AppState>) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_tracks(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_ignored_tracks(state: State<'_, AppState>) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_ignored_tracks(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_track_metadata_command(
    state: State<'_, AppState>,
    id: String,
    title: String,
    artist: String,
    album: String,
    metadata_sources: TrackMetadataSourcesDto,
) -> Result<TrackDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    update_track_metadata_with_sources(&mut conn, &id, &title, &artist, &album, &metadata_sources)
}

#[tauri::command]
pub fn track_audio_tag_backup_status_command(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<TrackAudioTagBackupStatusDto, String> {
    let conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "应用数据目录当前不可用".to_string())?;
    let backup_path = audio_tag_backup_path(&app_data_dir, &id, &audio_path)?;
    let available = regular_audio_tag_backup(&backup_path, &app_data_dir)?;
    let size_bytes = if available {
        std::fs::metadata(&backup_path)
            .ok()
            .map(|metadata| metadata.len())
    } else {
        Some(0)
    };
    Ok(TrackAudioTagBackupStatusDto {
        available,
        size_bytes,
    })
}

#[tauri::command]
pub fn read_track_album_audio_tags_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<AlbumAudioTagsDto, String> {
    let conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let tagged =
        lofty::read_from_path(&audio_path).map_err(|_| "音频文件无法读取内嵌标签".to_string())?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| "音频文件没有可读标签".to_string())?;
    Ok(album_audio_tag_strings(tag))
}

#[tauri::command]
pub fn read_track_audio_tags_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<TrackAudioTagsDto, String> {
    let conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let tagged =
        lofty::read_from_path(&audio_path).map_err(|_| "音频文件无法读取内嵌标签".to_string())?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| "音频文件没有可读标签".to_string())?;
    Ok(track_audio_tag_strings(tag))
}

#[tauri::command]
pub fn write_track_audio_tags_command(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    payload: AudioTagWritePayloadDto,
) -> Result<TrackDto, String> {
    let sync_library_album = payload.sync_library_album.unwrap_or(false);
    let sync_library_metadata = payload.sync_library_metadata.unwrap_or(true);
    let (metadata, album_only) = match (payload.title, payload.artist, payload.album) {
        (Some(title), Some(artist), Some(album)) => (
            Some((
                checked_metadata_value(&title, "曲名", true)?,
                checked_metadata_value(&artist, "艺人", true)?,
                checked_metadata_value(&album, "专辑", false)?,
            )),
            None,
        ),
        (None, None, Some(album)) => (None, Some(checked_metadata_value(&album, "专辑", true)?)),
        (None, None, None) => (None, None),
        _ => return Err("曲名、艺人和专辑必须同时提供或同时留空".into()),
    };
    let album_artist = payload
        .album_artist
        .map(|value| checked_metadata_value(&value, "专辑艺人", false))
        .transpose()?;
    let year = payload
        .year
        .map(|value| checked_audio_tag_year(&value))
        .transpose()?;
    let genre = payload
        .genre
        .map(|value| checked_metadata_value(&value, "流派", false))
        .transpose()?;
    let mut track_tags = TrackAudioTagWriteValues {
        track_number: payload
            .track_number
            .map(|value| checked_audio_tag_number(&value, "音轨号"))
            .transpose()?,
        track_total: None,
        disc_number: payload
            .disc_number
            .map(|value| checked_audio_tag_number(&value, "碟号"))
            .transpose()?,
        disc_total: None,
        bpm: payload
            .bpm
            .map(|value| checked_audio_tag_bpm(&value))
            .transpose()?,
        comment: payload
            .comment
            .map(|value| checked_audio_tag_comment(&value))
            .transpose()?,
    };
    let has_track_tag_updates = track_tags.has_updates();
    let album_tags =
        if album_only.is_some() || album_artist.is_some() || year.is_some() || genre.is_some() {
            Some(AlbumAudioTagValues {
                album: album_only,
                album_artist,
                year,
                genre,
            })
        } else {
            None
        };
    let lyrics = payload
        .lyrics
        .map(|value| -> Result<String, String> {
            let lyrics = value
                .trim()
                .trim_start_matches('\u{feff}')
                .trim()
                .to_string();
            if lyrics.is_empty() {
                return Err("内嵌歌词不能为空".into());
            }
            if lyrics.len() > 1_000_000 || lyrics.chars().count() > 200_000 {
                return Err("内嵌歌词超出允许长度".into());
            }
            Ok(lyrics)
        })
        .transpose()?;
    let cover = payload.cover.map(decode_audio_cover).transpose()?;
    if sync_library_album
        && (album_tags
            .as_ref()
            .and_then(|tags| tags.album.as_ref())
            .is_none()
            || metadata.is_some()
            || lyrics.is_some()
            || cover.is_some()
            || has_track_tag_updates)
    {
        return Err("曲库专辑同步只能随专辑标签单独写入".into());
    }
    if cover.is_some() && (metadata.is_some() || lyrics.is_some() || has_track_tag_updates) {
        return Err("封面图片需要单独写入；音频文件未更改".into());
    }
    if metadata.is_none()
        && lyrics.is_none()
        && cover.is_none()
        && album_tags.is_none()
        && !has_track_tag_updates
    {
        return Err("没有可写入的音频标签内容".into());
    }
    let mut conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "应用数据目录当前不可用".to_string())?;
    let backup_path = audio_tag_backup_path(&app_data_dir, &id, &audio_path)?;
    ensure_audio_tag_backup_parent(&backup_path, &app_data_dir)?;
    let backup_exists = regular_audio_tag_backup(&backup_path, &app_data_dir)?;
    if backup_exists && lofty::read_from_path(&backup_path).is_err() {
        return Err("已有音频备份无法读取；为避免覆盖恢复点，已停止写入".into());
    }

    let audio_metadata =
        std::fs::metadata(&audio_path).map_err(|_| "音频文件当前无法访问".to_string())?;
    if audio_metadata.permissions().readonly() {
        return Err("音频文件为只读状态，请先检查文件权限".into());
    }
    let extension = audio_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
        .ok_or_else(|| "音频文件扩展名不受支持".to_string())?;
    let token = format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id()
    );
    let backup_parent = backup_path
        .parent()
        .ok_or_else(|| "无法定位音频标签备份目录".to_string())?;
    let pending_backup = backup_parent.join(format!("pending-{token}.{extension}"));
    let output_path = audio_path
        .parent()
        .ok_or_else(|| "音频文件所在目录当前不可访问".to_string())?
        .join(format!(".ome-audio-tags-{token}.{extension}"));

    std::fs::copy(&audio_path, &pending_backup)
        .map_err(|_| "无法在应用数据目录创建本次写入的恢复副本；音频文件未更改".to_string())?;
    let cover_cache = if let Some(cover) = cover.as_ref() {
        match prepare_audio_cover_cache(&app, &id, &token, cover) {
            Ok(paths) => Some(paths),
            Err(error) => {
                let _ = std::fs::remove_file(&pending_backup);
                return Err(error);
            }
        }
    } else {
        None
    };
    let write_result = (|| -> Result<(), String> {
        let mut tagged_file = lofty::read_from_path(&audio_path)
            .map_err(|_| "音频文件无法解析，未写入标签".to_string())?;
        let tag_type = tagged_file.primary_tag_type();
        if !tagged_file.tag_support(tag_type).is_writable() {
            return Err("此音频格式的主要标签类型不支持写入".into());
        }
        if tagged_file.primary_tag().is_none() {
            tagged_file.insert_tag(lofty::tag::Tag::new(tag_type));
        }
        let tag = tagged_file
            .primary_tag_mut()
            .ok_or_else(|| "无法创建此音频格式的主要标签".to_string())?;
        if track_tags.track_number.is_some() {
            track_tags.track_total = Some(tag.track_total());
        }
        if track_tags.disc_number.is_some() {
            track_tags.disc_total = Some(tag.disk_total());
        }
        if let Some((title, artist, album)) = metadata.as_ref() {
            tag.set_title(title.clone());
            tag.set_artist(artist.clone());
            tag.set_album(album.clone());
        }
        if let Some(album_tags) = album_tags.as_ref() {
            if let Some(album) = album_tags.album.as_ref() {
                tag.remove_album();
                if !album.is_empty() {
                    tag.set_album(album.clone());
                }
            }
            if let Some(album_artist) = album_tags.album_artist.as_ref() {
                tag.remove_key(ItemKey::AlbumArtist);
                if !album_artist.is_empty()
                    && !tag.insert_text(ItemKey::AlbumArtist, album_artist.clone())
                {
                    return Err("此音频格式的标签不支持写入专辑艺人".into());
                }
            }
            if let Some(year) = album_tags.year.as_ref() {
                tag.remove_key(ItemKey::RecordingDate);
                tag.remove_key(ItemKey::Year);
                if !year.is_empty() && !tag.insert_text(ItemKey::RecordingDate, year.clone()) {
                    return Err("此音频格式的标签不支持写入年份".into());
                }
            }
            if let Some(genre) = album_tags.genre.as_ref() {
                tag.remove_key(ItemKey::Genre);
                if !genre.is_empty() && !tag.insert_text(ItemKey::Genre, genre.clone()) {
                    return Err("此音频格式的标签不支持写入流派".into());
                }
            }
        }
        apply_track_audio_tag_values(tag, tag_type, &track_tags)?;
        if let Some(lyrics) = lyrics.as_ref() {
            tag.remove_key(ItemKey::Lyrics);
            tag.remove_key(ItemKey::UnsyncLyrics);
            let key = if tag_type == TagType::Id3v2 {
                ItemKey::UnsyncLyrics
            } else {
                ItemKey::Lyrics
            };
            if !tag.insert_text(key, lyrics.clone()) {
                return Err("此音频格式的标签不支持写入内嵌歌词".into());
            }
        }
        if let Some(cover) = cover.as_ref() {
            tag.remove_picture_type(PictureType::CoverFront);
            tag.push_picture(
                Picture::unchecked(cover.bytes.clone())
                    .pic_type(PictureType::CoverFront)
                    .mime_type(cover.mime_type.clone())
                    .build(),
            );
        }
        tagged_file
            .save_to_path(&output_path, lofty::config::WriteOptions::default())
            .map_err(|_| "无法生成音频标签更新副本".to_string())?;
        std::fs::set_permissions(&output_path, audio_metadata.permissions())
            .map_err(|_| "无法保留音频文件权限；原文件未更改".to_string())?;
        verify_audio_tag_write(
            &output_path,
            metadata
                .as_ref()
                .map(|(title, artist, album)| (title.as_str(), artist.as_str(), album.as_str())),
            lyrics.as_deref(),
            cover.as_ref(),
            album_tags.as_ref(),
            has_track_tag_updates.then_some(&track_tags),
        )?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&output_path);
        let _ = std::fs::remove_file(&pending_backup);
        if let Some(cache) = cover_cache.as_ref() {
            let _ = std::fs::remove_file(&cache.staged);
        }
        return Err(error);
    }

    let created_backup = !backup_exists;
    if created_backup {
        let backup_result = std::fs::copy(&pending_backup, &backup_path)
            .map_err(|_| "无法保存首次写入前的整首音频备份；原文件未更改".to_string())
            .and_then(|copied_bytes| {
                let backup_bytes = std::fs::metadata(&backup_path)
                    .map_err(|_| "无法核对整首音频备份；原文件未更改".to_string())?
                    .len();
                if copied_bytes == backup_bytes {
                    Ok(())
                } else {
                    Err("整首音频备份不完整；原文件未更改".into())
                }
            });
        if let Err(error) = backup_result {
            let _ = std::fs::remove_file(&backup_path);
            let _ = std::fs::remove_file(&output_path);
            let _ = std::fs::remove_file(&pending_backup);
            if let Some(cache) = cover_cache.as_ref() {
                let _ = std::fs::remove_file(&cache.staged);
            }
            return Err(error);
        }
    }

    if std::fs::copy(&output_path, &audio_path).is_err() {
        let restored = restore_audio_file_copy(&pending_backup, &audio_path);
        let _ = std::fs::remove_file(&output_path);
        if let Some(cache) = cover_cache.as_ref() {
            let _ = std::fs::remove_file(&cache.staged);
        }
        if restored.is_ok() {
            let _ = std::fs::remove_file(&pending_backup);
            if created_backup {
                let _ = std::fs::remove_file(&backup_path);
            }
            return Err("无法替换原音频文件，已恢复写入前的文件".into());
        }
        return Err("音频文件替换失败且自动恢复未完成；应用数据中保留了本次恢复副本".into());
    }

    if let Err(error) = verify_audio_tag_write(
        &audio_path,
        metadata
            .as_ref()
            .map(|(title, artist, album)| (title.as_str(), artist.as_str(), album.as_str())),
        lyrics.as_deref(),
        cover.as_ref(),
        album_tags.as_ref(),
        has_track_tag_updates.then_some(&track_tags),
    ) {
        let restored = restore_audio_file_copy(&pending_backup, &audio_path);
        let _ = std::fs::remove_file(&output_path);
        if let Some(cache) = cover_cache.as_ref() {
            let _ = std::fs::remove_file(&cache.staged);
        }
        if restored.is_ok() {
            let _ = std::fs::remove_file(&pending_backup);
            if created_backup {
                let _ = std::fs::remove_file(&backup_path);
            }
            return Err(error);
        }
        return Err("写入校验失败且自动恢复未完成；应用数据中保留了本次恢复副本".into());
    }

    let cover_previous_moved = if let Some(cache) = cover_cache.as_ref() {
        match publish_audio_cover_cache(cache) {
            Ok(previous_moved) => Some(previous_moved),
            Err(error) => {
                let restored = rollback_audio_tag_file_write(
                    &pending_backup,
                    &backup_path,
                    &output_path,
                    &audio_path,
                    created_backup,
                );
                return Err(if restored.is_ok() {
                    format!("{error}；已恢复写入前的音频文件")
                } else {
                    format!("{error}；音频自动恢复未完成，应用数据中保留了本次恢复副本")
                });
            }
        }
    } else {
        None
    };

    let updated = if sync_library_album {
        let album = album_tags
            .as_ref()
            .and_then(|tags| tags.album.as_deref())
            .ok_or_else(|| "缺少要同步的专辑标签".to_string())?;
        sync_local_album_tag_to_library(&mut conn, &id, album)
    } else if let Some((title, artist, album)) = metadata.as_ref().filter(|_| sync_library_metadata)
    {
        update_track_metadata_with_override(
            &mut conn,
            &id,
            title,
            artist,
            album,
            false,
            &TrackMetadataSourcesDto::file_tags(),
        )
    } else if let Some(cache) = cover_cache.as_ref() {
        update_track_cover_path(&mut conn, &id, &cache.destination.to_string_lossy())
    } else {
        conn.query_row(
            &(TRACK_SELECT.to_string() + " WHERE t.id = ?1"),
            params![id],
            row_to_track,
        )
        .map_err(|error| error.to_string())
    };
    let updated = match updated {
        Ok(updated) => updated,
        Err(error) => {
            let cache_restored = match (cover_cache.as_ref(), cover_previous_moved) {
                (Some(cache), Some(previous_moved)) => {
                    rollback_audio_cover_cache(cache, previous_moved, true)
                }
                _ => Ok(()),
            };
            let audio_restored = rollback_audio_tag_file_write(
                &pending_backup,
                &backup_path,
                &output_path,
                &audio_path,
                created_backup,
            );
            return match (audio_restored, cache_restored) {
                (Ok(()), Ok(())) => Err(format!("曲库资料更新失败，已恢复原音频文件：{error}")),
                (Err(audio_error), Ok(())) => Err(format!(
                    "曲库资料更新失败且音频自动恢复未完成（{audio_error}）；应用数据中保留了恢复副本"
                )),
                (Ok(()), Err(cache_error)) => Err(format!(
                    "曲库资料更新失败，音频已恢复，但旧封面缓存恢复失败（{cache_error}）"
                )),
                (Err(audio_error), Err(cache_error)) => Err(format!(
                    "曲库资料更新失败，音频与封面缓存自动恢复均未完成（{audio_error}；{cache_error}）；应用数据中保留了恢复副本"
                )),
            };
        }
    };
    let _ = std::fs::remove_file(&pending_backup);
    let _ = std::fs::remove_file(&output_path);
    if let (Some(cache), Some(true)) = (cover_cache.as_ref(), cover_previous_moved) {
        let _ = std::fs::remove_file(&cache.previous);
    }
    Ok(updated)
}

#[tauri::command]
pub fn restore_track_audio_tag_backup_command(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<TrackDto, String> {
    let mut conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "应用数据目录当前不可用".to_string())?;
    let backup_path = audio_tag_backup_path(&app_data_dir, &id, &audio_path)?;
    if !regular_audio_tag_backup(&backup_path, &app_data_dir)? {
        return Err("这首曲目没有可恢复的音频文件备份".into());
    }
    lofty::read_from_path(&backup_path)
        .map_err(|_| "音频文件备份无法解析，为保留现有文件未执行恢复".to_string())?;
    let extension = audio_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
        .ok_or_else(|| "音频文件扩展名不受支持".to_string())?;
    let token = format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id()
    );
    let rollback_path = backup_path
        .parent()
        .ok_or_else(|| "无法定位音频标签备份目录".to_string())?
        .join(format!("restore-pending-{token}.{extension}"));
    std::fs::copy(&audio_path, &rollback_path)
        .map_err(|_| "无法创建恢复操作的回滚副本，音频文件未更改".to_string())?;

    if std::fs::copy(&backup_path, &audio_path).is_err() {
        let restored = restore_audio_file_copy(&rollback_path, &audio_path);
        if restored.is_ok() {
            let _ = std::fs::remove_file(&rollback_path);
            return Err("备份无法写回音频文件，已恢复当前文件".into());
        }
        return Err("备份写回失败且当前文件自动恢复未完成；回滚副本仍保留在应用数据中".into());
    }

    let original_metadata = match read_track_metadata(&audio_path) {
        Some(metadata) => metadata,
        None => {
            let restored = restore_audio_file_copy(&rollback_path, &audio_path);
            if restored.is_ok() {
                let _ = std::fs::remove_file(&rollback_path);
                return Err("恢复副本校验失败，已恢复当前文件".into());
            }
            return Err(
                "恢复副本校验失败且当前文件自动恢复未完成；回滚副本仍保留在应用数据中".into(),
            );
        }
    };
    let updated = update_track_metadata_with_override(
        &mut conn,
        &id,
        &original_metadata.title,
        &original_metadata.artist,
        &original_metadata.album,
        false,
        &TrackMetadataSourcesDto::file_tags(),
    );
    let updated = match updated {
        Ok(updated) => updated,
        Err(error) => {
            let restored = restore_audio_file_copy(&rollback_path, &audio_path);
            if restored.is_ok() {
                let _ = std::fs::remove_file(&rollback_path);
                return Err(format!("恢复后的资料无法更新曲库，已恢复当前文件：{error}"));
            }
            return Err(
                "恢复后的资料无法更新曲库，且当前文件自动恢复未完成；回滚副本仍保留在应用数据中"
                    .into(),
            );
        }
    };
    let _ = std::fs::remove_file(&rollback_path);
    Ok(updated)
}

#[tauri::command]
pub fn clear_track_audio_tag_backup_command(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "曲库当前不可用".to_string())?;
    let audio_path = authorized_audio_tag_target(&conn, &id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "应用数据目录当前不可用".to_string())?;
    let backup_path = audio_tag_backup_path(&app_data_dir, &id, &audio_path)?;
    if regular_audio_tag_backup(&backup_path, &app_data_dir)? {
        std::fs::remove_file(&backup_path).map_err(|_| "无法清除音频标签备份".to_string())?;
    }
    if let Some(parent) = backup_path.parent() {
        let _ = std::fs::remove_dir(parent);
        if let Some(track_dir) = parent.parent() {
            let _ = std::fs::remove_dir(track_dir);
        }
        if let Some(root) = parent.parent().and_then(Path::parent) {
            let _ = std::fs::remove_dir(root);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn restore_track_metadata_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<TrackMetadataRestoreDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    restore_track_metadata(&mut conn, &id)
}

#[tauri::command]
pub fn rename_library_artist_command(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<CatalogEntityRenameDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    rename_library_artist(&mut conn, &id, &name)
}

#[tauri::command]
pub fn rename_library_album_command(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<CatalogEntityRenameDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    rename_library_album(&mut conn, &id, &name)
}

#[tauri::command]
pub fn preview_library_artist_merge_command(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<CatalogEntityMergePreviewDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    preview_library_artist_merge(&conn, &source_id, &target_id)
}

#[tauri::command]
pub fn merge_library_artist_command(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<CatalogEntityRenameDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    merge_library_artist(&mut conn, &source_id, &target_id)
}

#[tauri::command]
pub fn preview_library_album_merge_command(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<CatalogEntityMergePreviewDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    preview_library_album_merge(&conn, &source_id, &target_id)
}

#[tauri::command]
pub fn merge_library_album_command(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<CatalogEntityRenameDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    merge_library_album(&mut conn, &source_id, &target_id)
}

#[tauri::command]
pub fn preview_library_artist_split_command(
    state: State<'_, AppState>,
    source_id: String,
    new_name: String,
    selected_track_ids: Vec<String>,
) -> Result<CatalogEntitySplitPreviewDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    preview_library_artist_split(&conn, &source_id, &new_name, &selected_track_ids)
}

#[tauri::command]
pub fn split_library_artist_command(
    state: State<'_, AppState>,
    source_id: String,
    new_name: String,
    selected_track_ids: Vec<String>,
) -> Result<CatalogEntitySplitDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    split_library_artist(&mut conn, &source_id, &new_name, &selected_track_ids)
}

#[tauri::command]
pub fn preview_library_album_split_command(
    state: State<'_, AppState>,
    source_id: String,
    new_name: String,
    selected_track_ids: Vec<String>,
) -> Result<CatalogEntitySplitPreviewDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    preview_library_album_split(&conn, &source_id, &new_name, &selected_track_ids)
}

#[tauri::command]
pub fn split_library_album_command(
    state: State<'_, AppState>,
    source_id: String,
    new_name: String,
    selected_track_ids: Vec<String>,
) -> Result<CatalogEntitySplitDto, String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    split_library_album(&mut conn, &source_id, &new_name, &selected_track_ids)
}

#[tauri::command]
pub fn remove_local_track_command(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    remove_local_track(&mut conn, &id)
}

#[tauri::command]
pub fn remove_local_tracks_command(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    remove_local_tracks(&mut conn, &ids)
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

#[tauri::command]
pub fn playback_history_entries_command(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<HistoryEntryDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let limit = limit.unwrap_or(200).clamp(1, 500);
    playback_history_entries(&conn, limit).map_err(|error| error.to_string())
}

/// 本地曲目的同目录侧车歌词与内嵌歌词（base64 编码）。
///
/// 主歌词支持 `track.lrc` / `track.mp3.lrc` 等命名和 .lrc / .vtt / .ttml / .qrc / .krc；
/// 翻译支持 `track.t.lrc` / `track.t.vtt`，罗马音支持 `track.r.lrc` / `track.r.vtt`。
/// `.krc` 在本侧解密为明文。
/// 无可用侧车时读取音频标签中的 `Lyrics` / `UnsyncLyrics` 文本；时间轴格式由前端识别。
/// 编码探测交给前端 TextDecoder（utf-8 fatal → gbk 回退）：Windows 下歌词
/// 大量是 GBK，Rust 侧不加编码依赖也能正确解码。格式嗅探同样在前端
/// （lib/lyricfmt.ts），本侧只管找文件与解密。
#[tauri::command]
pub fn local_lyric(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<LocalLyricDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let Some(audio_path) = authorized_local_track_path(&conn, &id)? else {
        return Ok(None);
    };
    let lrc = read_sidecar_lrc(&audio_path).ok().flatten();
    let embedded_lrc = read_embedded_lyrics(&audio_path);
    if lrc.is_none() && embedded_lrc.is_none() {
        return Ok(None);
    }
    // 翻译是可选 sidecar，缺失或单独不可读时保留有效主歌词。
    let tlyric = read_sidecar_translation(&audio_path).ok().flatten();
    let rlyric = read_sidecar_romanization(&audio_path).ok().flatten();
    Ok(Some(LocalLyricDto {
        lrc: lrc.unwrap_or_default(),
        tlyric,
        rlyric,
        embedded_lrc,
    }))
}

fn authorized_local_track_path(
    conn: &Connection,
    track_id: &str,
) -> Result<Option<PathBuf>, String> {
    let row: Option<(String, String, bool, bool)> = conn
        .query_row(
            "SELECT source, file_path, ignored_by_rules, explicit_path_authorized
             FROM tracks WHERE id = ?1",
            params![track_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, i64>(3)? != 0,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((source, file_path, ignored, explicitly_authorized)) = row else {
        return Err("曲目不存在".into());
    };
    if source != "local" {
        return Ok(None);
    }
    if ignored {
        return Err("已按扫描规则排除的曲目不能读取歌词".into());
    }
    let path = PathBuf::from(file_path);
    if !is_supported_audio_path(&path)
        || !is_authorized_track_file(conn, &path, explicitly_authorized)?
        || !is_regular_path_without_symlink_components(&path)
    {
        return Err("音频文件不在当前有效授权范围内或无法访问".into());
    }
    Ok(Some(path))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LyricsBackfillTrackDto {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
}

pub(crate) fn lyrics_backfill_track_candidate(
    conn: &Connection,
    track_id: &str,
) -> Result<Option<LyricsBackfillTrackDto>, String> {
    if authorized_local_track_path(conn, track_id)?.is_none() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT t.id, t.title, COALESCE(ar.name, ''), COALESCE(a.title, ''), t.duration_seconds
         FROM tracks t
         LEFT JOIN artists ar ON ar.id = t.artist_id
         LEFT JOIN albums a ON a.id = t.album_id
         WHERE t.id = ?1 AND t.source = 'local' AND t.ignored_by_rules = 0",
        params![track_id],
        |row| {
            Ok(LyricsBackfillTrackDto {
                track_id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                album: row.get(3)?,
                duration_seconds: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

pub(crate) fn has_local_main_lyrics_for_backfill(
    conn: &Connection,
    track_id: &str,
) -> Result<bool, String> {
    let Some(audio_path) = authorized_local_track_path(conn, track_id)? else {
        return Ok(false);
    };
    let sidecar = read_sidecar_lrc(&audio_path).ok().flatten();
    Ok(sidecar.is_some_and(|value| !value.trim().is_empty())
        || read_embedded_lyrics(&audio_path).is_some())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLyricDto {
    pub lrc: String,
    pub tlyric: Option<String>,
    pub rlyric: Option<String>,
    pub embedded_lrc: Option<String>,
}

const MAX_SAVED_TRACK_LYRICS_BYTES: usize = 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTrackLyricsRequestDto {
    pub provider: String,
    pub provider_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub raw_lyrics_json: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTrackLyricsDto {
    pub track_id: String,
    pub provider: String,
    pub provider_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub raw_lyrics: serde_json::Value,
    pub saved_at: String,
}

pub(crate) fn validate_saved_track_lyrics_request(
    request: &SaveTrackLyricsRequestDto,
) -> Result<serde_json::Value, String> {
    if !matches!(
        request.provider.as_str(),
        "netease" | "amll" | "lrclib" | "qqmusic" | "kugou" | "kuwo"
    ) {
        return Err("不支持的歌词来源".into());
    }
    if request.provider_id.trim().is_empty() || request.provider_id.len() > 256 {
        return Err("歌词候选编号无效".into());
    }
    for (value, label) in [(&request.title, "曲名"), (&request.artist, "艺人")] {
        if value.trim().is_empty() || value.chars().count() > 500 {
            return Err(format!("{label}无效"));
        }
    }
    if request
        .album
        .as_ref()
        .is_some_and(|album| album.chars().count() > 500)
    {
        return Err("专辑名称过长".into());
    }
    if request.raw_lyrics_json.len() > MAX_SAVED_TRACK_LYRICS_BYTES {
        return Err("歌词内容超过保存上限".into());
    }
    let raw_lyrics: serde_json::Value = serde_json::from_str(&request.raw_lyrics_json)
        .map_err(|_| "歌词内容格式无效".to_string())?;
    let Some(fields) = raw_lyrics.as_object() else {
        return Err("歌词内容格式无效".into());
    };
    let has_lyrics = ["lrc", "yrc", "plainLyrics", "ttml", "qrc"]
        .iter()
        .any(|key| {
            fields
                .get(*key)
                .and_then(serde_json::Value::as_str)
                .is_some_and(|text| !text.trim().is_empty())
        });
    if !has_lyrics {
        return Err("歌词内容为空".into());
    }
    Ok(raw_lyrics)
}

fn ensure_saved_lyrics_track(conn: &Connection, track_id: &str) -> Result<(), String> {
    let track: Option<(String, bool)> = conn
        .query_row(
            "SELECT source, ignored_by_rules FROM tracks WHERE id = ?1",
            params![track_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match track {
        Some((source, false)) if source == "local" => Ok(()),
        Some((source, _)) if source != "local" => Err("只能为本地曲目保存歌词".into()),
        Some(_) => Err("已按扫描规则排除的曲目不能保存歌词".into()),
        None => Err("曲目不存在".into()),
    }
}

fn save_track_lyrics(
    conn: &Connection,
    track_id: &str,
    request: &SaveTrackLyricsRequestDto,
) -> Result<SavedTrackLyricsDto, String> {
    let raw_lyrics = validate_saved_track_lyrics_request(request)?;
    ensure_saved_lyrics_track(conn, track_id)?;
    let raw_lyrics_json = serde_json::to_string(&raw_lyrics).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO saved_track_lyrics (
            track_id, provider, provider_id, title, artist, album, raw_lyrics_json, saved_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
         ON CONFLICT(track_id) DO UPDATE SET
            provider = excluded.provider,
            provider_id = excluded.provider_id,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            raw_lyrics_json = excluded.raw_lyrics_json,
            saved_at = CURRENT_TIMESTAMP",
        params![
            track_id,
            request.provider,
            request.provider_id.trim(),
            request.title.trim(),
            request.artist.trim(),
            request
                .album
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            raw_lyrics_json,
        ],
    )
    .map_err(|error| error.to_string())?;
    get_saved_track_lyrics(conn, track_id)?.ok_or_else(|| "歌词保存后无法读取".into())
}

fn get_saved_track_lyrics(
    conn: &Connection,
    track_id: &str,
) -> Result<Option<SavedTrackLyricsDto>, String> {
    conn.query_row(
        "SELECT track_id, provider, provider_id, title, artist, album, raw_lyrics_json, saved_at
         FROM saved_track_lyrics WHERE track_id = ?1",
        params![track_id],
        |row| {
            let raw_lyrics_json: String = row.get(6)?;
            let raw_lyrics = serde_json::from_str(&raw_lyrics_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    raw_lyrics_json.len(),
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

fn delete_track_lyrics(conn: &Connection, track_id: &str) -> Result<bool, String> {
    ensure_saved_lyrics_track(conn, track_id)?;
    let deleted = conn
        .execute(
            "DELETE FROM saved_track_lyrics WHERE track_id = ?1",
            params![track_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(deleted > 0)
}

#[tauri::command]
pub fn save_track_lyrics_command(
    state: State<'_, AppState>,
    id: String,
    request: SaveTrackLyricsRequestDto,
) -> Result<SavedTrackLyricsDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    save_track_lyrics(&conn, &id, &request)
}

#[tauri::command]
pub fn get_saved_track_lyrics_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<SavedTrackLyricsDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    get_saved_track_lyrics(&conn, &id)
}

#[tauri::command]
pub fn delete_saved_track_lyrics_command(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_track_lyrics(&conn, &id)
}

/// Reads generic embedded lyric text from the primary tag first, then other tags.
/// ID3 SYLT is parsed separately because Lofty retains it as a binary frame;
/// common USLT, Vorbis, and MP4 lyric fields continue through the generic tag API.
fn read_embedded_lyrics(audio_path: &Path) -> Option<String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;

    if let Some(synchronized_lrc) = read_id3_synchronized_lyrics(audio_path) {
        return Some(BASE64.encode(synchronized_lrc.as_bytes()));
    }

    let tagged_file = lofty::read_from_path(audio_path).ok()?;
    let text = tagged_file
        .primary_tag()
        .into_iter()
        .chain(tagged_file.tags())
        .flat_map(|tag| {
            [ItemKey::Lyrics, ItemKey::UnsyncLyrics]
                .into_iter()
                .flat_map(|key| tag.get_strings(key))
        })
        .map(str::trim)
        .find(|text| !text.is_empty())?;

    Some(BASE64.encode(text.as_bytes()))
}

/// Reads MP3 ID3v2 SYLT lyrics when the frame uses absolute millisecond timestamps.
/// MPEG-frame timestamps and non-lyric SYLT content are skipped instead of guessed.
fn read_id3_synchronized_lyrics(audio_path: &Path) -> Option<String> {
    use lofty::config::ParseOptions;
    use lofty::id3::v2::{
        Frame, FrameId, SyncTextContentType, SynchronizedTextFrame, TimestampFormat,
    };
    use lofty::mpeg::MpegFile;
    use std::borrow::Cow;
    use std::fs::File;

    if !audio_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("mp3"))
    {
        return None;
    }

    const SYLT_FRAME_ID: FrameId<'static> = FrameId::Valid(Cow::Borrowed("SYLT"));

    let mut file = File::open(audio_path).ok()?;
    let mpeg_file = MpegFile::read_from(&mut file, ParseOptions::new()).ok()?;
    let tag = mpeg_file.id3v2()?;
    let Frame::Binary(binary_frame) = tag.get(&SYLT_FRAME_ID)? else {
        return None;
    };
    let synchronized =
        SynchronizedTextFrame::parse(binary_frame.data.as_ref(), binary_frame.flags()).ok()?;

    if synchronized.content_type != SyncTextContentType::Lyrics
        || synchronized.timestamp_format != TimestampFormat::MS
    {
        return None;
    }

    let mut lines = synchronized
        .content
        .iter()
        .filter_map(|(timestamp_ms, text)| {
            let text = text.replace(['\r', '\n'], " ");
            let text = text.trim();
            (!text.is_empty()).then_some((*timestamp_ms, text.to_owned()))
        })
        .collect::<Vec<_>>();
    lines.sort_by_key(|(timestamp_ms, _)| *timestamp_ms);

    let lrc = lines
        .into_iter()
        .map(|(timestamp_ms, text)| {
            let centiseconds = (u64::from(timestamp_ms) + 5) / 10;
            let total_seconds = centiseconds / 100;
            let minutes = total_seconds / 60;
            let seconds = total_seconds % 60;
            let fraction = centiseconds % 100;
            format!("[{minutes:02}:{seconds:02}.{fraction:02}]{text}")
        })
        .collect::<Vec<_>>()
        .join("\n");

    (!lrc.is_empty()).then_some(lrc)
}

/// 同目录按格式优先级查找侧车歌词；支持 `track.lrc` 与 `track.audio-ext.lrc`。
fn find_sidecar_lrc(audio_path: &Path) -> Option<std::path::PathBuf> {
    let stem = audio_path.file_stem()?.to_string_lossy();
    let file_name = audio_path.file_name()?.to_string_lossy();
    let lower_audio_extension = audio_path
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())?;
    let dir = audio_path.parent()?;
    let bases = [
        stem.to_string(),
        file_name.to_string(),
        format!("{stem}.{lower_audio_extension}"),
    ];
    for ext in ["lrc", "vtt", "ttml", "qrc", "krc"] {
        for base in &bases {
            for name in [
                format!("{base}.{ext}"),
                format!("{base}.{}", ext.to_uppercase()),
            ] {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// 翻译歌词使用与音频扩展无关的 `.t.lrc` / `.t.vtt` 命名。
fn find_sidecar_translation(audio_path: &Path) -> Option<std::path::PathBuf> {
    let stem = audio_path.file_stem()?.to_string_lossy();
    let dir = audio_path.parent()?;
    for ext in ["lrc", "vtt"] {
        for name in [
            format!("{stem}.t.{ext}"),
            format!("{stem}.t.{}", ext.to_uppercase()),
        ] {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 罗马音歌词使用与音频扩展无关的 `.r.lrc` / `.r.vtt` 命名。
fn find_sidecar_romanization(audio_path: &Path) -> Option<std::path::PathBuf> {
    let stem = audio_path.file_stem()?.to_string_lossy();
    let dir = audio_path.parent()?;
    for ext in ["lrc", "vtt"] {
        for name in [
            format!("{stem}.r.{ext}"),
            format!("{stem}.r.{}", ext.to_uppercase()),
        ] {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn read_sidecar_lrc(audio_path: &Path) -> Result<Option<String>, String> {
    let Some(found) = find_sidecar_lrc(audio_path) else {
        return Ok(None);
    };
    read_sidecar_file(&found).map(Some)
}

fn read_sidecar_translation(audio_path: &Path) -> Result<Option<String>, String> {
    let Some(found) = find_sidecar_translation(audio_path) else {
        return Ok(None);
    };
    read_sidecar_file(&found).map(Some)
}

fn read_sidecar_romanization(audio_path: &Path) -> Result<Option<String>, String> {
    let Some(found) = find_sidecar_romanization(audio_path) else {
        return Ok(None);
    };
    read_sidecar_file(&found).map(Some)
}

fn read_sidecar_file(found: &Path) -> Result<String, String> {
    if !std::fs::symlink_metadata(found)
        .map(|metadata| !metadata.file_type().is_symlink() && metadata.is_file())
        .unwrap_or(false)
    {
        return Err("歌词 sidecar 当前不可安全读取".into());
    }
    let bytes = std::fs::read(found).map_err(|error| error.to_string())?;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;
    let is_krc = found
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("krc"));
    let plain = if is_krc {
        decrypt_krc(&bytes).ok_or_else(|| "krc 歌词解密失败".to_string())?
    } else {
        bytes
    };
    Ok(BASE64.encode(plain))
}

/// 酷狗 krc：逐字节与 [0x40, 0x47, 0x61, 0x62] 循环异或后 zlib 解压
fn decrypt_krc(bytes: &[u8]) -> Option<Vec<u8>> {
    use std::io::Read;
    const KEY: [u8; 4] = [0x40, 0x47, 0x61, 0x62];
    let xored: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ KEY[index % KEY.len()])
        .collect();
    let mut plain = Vec::new();
    flate2::read::ZlibDecoder::new(&xored[..])
        .read_to_end(&mut plain)
        .ok()?;
    Some(plain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    #[test]
    fn replay_gain_tags_are_parsed_and_out_of_range_values_are_ignored() {
        let mut tag = Tag::new(TagType::Id3v2);
        assert!(tag.insert_text(ItemKey::ReplayGainTrackGain, "+3.25 dB".into()));
        assert!(tag.insert_text(ItemKey::ReplayGainAlbumGain, "-5.5 dB".into()));
        assert!(tag.insert_text(ItemKey::ReplayGainTrackPeak, "0.8912509".into()));
        assert!(tag.insert_text(ItemKey::ReplayGainAlbumPeak, "NaN".into()));

        let values = replay_gain_from_tag(Some(&tag));
        assert_eq!(values.track_gain_db, Some(3.25));
        assert_eq!(values.album_gain_db, Some(-5.5));
        assert_eq!(values.track_peak, Some(0.8912509));
        assert_eq!(values.album_peak, None);
        assert_eq!(parse_replay_gain_db(Some("61 dB")), None);
        assert_eq!(parse_replay_gain_db(Some("inf")), None);
        assert_eq!(parse_replay_gain_peak(Some("0")), None);
        assert_eq!(parse_replay_gain_peak(Some("65")), None);
    }

    #[test]
    fn replay_gain_metadata_round_trips_and_rescan_clears_removed_tags() {
        let conn = memory_db();
        let track = NewTrack {
            title: "Tagged Track".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            duration_seconds: 120,
            file_path: r"C:\music\tagged.flac".into(),
            cover_path: None,
        };
        insert_track_with_replay_gain_and_genres(
            &conn,
            &track,
            ReplayGainMetadata {
                track_gain_db: Some(-4.2),
                album_gain_db: Some(-6.0),
                track_peak: Some(0.95),
                album_peak: Some(0.98),
            },
            &["Dream pop".into()],
        )
        .unwrap();

        let indexed = load_tracks(&conn).unwrap().remove(0);
        assert_eq!(indexed.genres, vec!["Dream pop"]);
        assert_eq!(indexed.replay_gain_track_gain_db, Some(-4.2));
        assert_eq!(indexed.replay_gain_album_gain_db, Some(-6.0));
        assert_eq!(indexed.replay_gain_track_peak, Some(0.95));
        assert_eq!(indexed.replay_gain_album_peak, Some(0.98));

        insert_track(&conn, &track).unwrap();
        let rescanned = load_tracks(&conn).unwrap().remove(0);
        assert!(rescanned.genres.is_empty());
        assert_eq!(rescanned.replay_gain_track_gain_db, None);
        assert_eq!(rescanned.replay_gain_album_gain_db, None);
        assert_eq!(rescanned.replay_gain_track_peak, None);
        assert_eq!(rescanned.replay_gain_album_peak, None);
    }

    #[test]
    fn track_genres_are_trimmed_deduplicated_bounded_and_decoded_safely() {
        assert_eq!(
            split_track_genres(" Ambient / dream pop;ambient| "),
            vec!["Ambient", "dream pop"]
        );
        assert!(decode_track_genres("not-json").is_empty());
        let too_long = "x".repeat(MAX_TRACK_GENRE_CHARS + 1);
        assert!(split_track_genres(&too_long).is_empty());
    }

    #[test]
    fn album_audio_tag_year_validation_accepts_only_four_digit_years_or_clear() {
        assert_eq!(checked_audio_tag_year("2024").unwrap(), "2024");
        assert_eq!(checked_audio_tag_year("  ").unwrap(), "");
        assert!(checked_audio_tag_year("999").is_err());
        assert!(checked_audio_tag_year("20xx").is_err());
        assert!(checked_audio_tag_year("0000").is_err());
    }

    #[test]
    fn album_audio_tag_reader_extracts_id3_album_fields() {
        let mut tag = lofty::tag::Tag::new(TagType::Id3v2);
        assert!(tag.insert_text(ItemKey::AlbumArtist, "林桥".into()));
        assert!(tag.insert_text(ItemKey::RecordingDate, "2024".into()));
        assert!(tag.insert_text(ItemKey::Genre, "Dream pop".into()));

        let values = album_audio_tag_strings(&tag);
        assert_eq!(values.album_artist, "林桥");
        assert_eq!(values.year.as_deref(), Some("2024"));
        assert_eq!(values.genre, "Dream pop");
    }

    #[test]
    fn single_track_audio_tag_validators_bound_numeric_and_comment_values() {
        assert_eq!(checked_audio_tag_number("12", "音轨号").unwrap(), Some(12));
        assert_eq!(checked_audio_tag_number(" ", "音轨号").unwrap(), None);
        assert!(checked_audio_tag_number("0", "音轨号").is_err());
        assert!(checked_audio_tag_number("1.5", "音轨号").is_err());
        assert_eq!(checked_audio_tag_bpm("128").unwrap(), Some(128));
        assert_eq!(checked_audio_tag_bpm("").unwrap(), None);
        assert!(checked_audio_tag_bpm("1000").is_err());
        assert_eq!(
            checked_audio_tag_comment("  现场录音  ").unwrap(),
            "现场录音"
        );
        assert!(checked_audio_tag_comment(&"a".repeat(4_001)).is_err());
    }

    #[test]
    fn single_track_audio_tag_update_preserves_track_and_disc_totals() {
        let mut tag = lofty::tag::Tag::new(TagType::Id3v2);
        tag.set_track(3);
        tag.set_track_total(12);
        tag.set_disk(1);
        tag.set_disk_total(2);
        assert!(tag.insert_text(ItemKey::IntegerBpm, "120".into()));
        assert!(tag.insert_text(ItemKey::Comment, "旧备注".into()));

        let updates = TrackAudioTagWriteValues {
            track_number: Some(Some(4)),
            track_total: Some(tag.track_total()),
            disc_number: None,
            disc_total: None,
            bpm: Some(Some(128)),
            comment: Some("新备注".into()),
        };
        apply_track_audio_tag_values(&mut tag, TagType::Id3v2, &updates).unwrap();

        let values = track_audio_tag_strings(&tag);
        assert_eq!(values.track_number, Some(4));
        assert_eq!(values.track_total, Some(12));
        assert_eq!(values.disc_number, Some(1));
        assert_eq!(values.disc_total, Some(2));
        assert_eq!(values.bpm.as_deref(), Some("128"));
        assert_eq!(values.comment, "新备注");
    }

    #[test]
    fn single_track_audio_tag_reader_caps_oversized_comments_without_losing_them() {
        let mut tag = lofty::tag::Tag::new(TagType::Id3v2);
        tag.set_comment("注".repeat(4_001));

        let values = track_audio_tag_strings(&tag);
        assert_eq!(values.comment.chars().count(), 4_000);
        assert!(values.comment_truncated);
        assert_eq!(tag.comment().unwrap().chars().count(), 4_001);
    }

    #[test]
    fn single_track_audio_tag_bpm_uses_format_supported_key() {
        let mut tag = lofty::tag::Tag::new(TagType::VorbisComments);
        let updates = TrackAudioTagWriteValues {
            track_number: None,
            track_total: None,
            disc_number: None,
            disc_total: None,
            bpm: Some(Some(96)),
            comment: None,
        };
        apply_track_audio_tag_values(&mut tag, TagType::VorbisComments, &updates).unwrap();

        assert_eq!(tag.get_string(ItemKey::Bpm), Some("96"));
        assert_eq!(tag.get_string(ItemKey::IntegerBpm), None);
    }

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn local_media_authorization_follows_directory_and_explicit_grants() {
        let root = std::env::temp_dir().join(format!(
            "ome-local-media-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let inside = root.join("夜航.mp3");
        let outside = root.with_extension("outside.mp3");
        std::fs::write(&inside, b"test audio").unwrap();
        std::fs::write(&outside, b"outside audio").unwrap();

        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![root.to_string_lossy()],
        )
        .unwrap();

        assert!(local_media_path_is_authorized(&conn, &inside));
        assert!(!local_media_path_is_authorized(&conn, &outside));

        // 目录授权被撤销后必须立刻失效，不能有任何缓存绕过。
        conn.execute("DELETE FROM authorized_music_directories", [])
            .unwrap();
        assert!(!local_media_path_is_authorized(&conn, &inside));

        // 逐文件显式授权：用户直接添加的单个文件，不在任何目录授权内。
        insert_track(
            &conn,
            &NewTrack {
                title: "夜航".into(),
                artist: "林桥".into(),
                album: "雨后唱片".into(),
                duration_seconds: 180,
                file_path: outside.to_string_lossy().into_owned(),
                cover_path: None,
            },
        )
        .unwrap();
        conn.execute("UPDATE tracks SET explicit_path_authorized = 1", [])
            .unwrap();
        assert!(local_media_path_is_authorized(&conn, &outside));

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn local_video_lookup_requires_a_registered_directory_and_revalidates_candidates() {
        let root = std::env::temp_dir().join(format!(
            "ome-local-video-library-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let audio = root.join("夜航.mp3");
        let video = root.join("MV").join("林桥 - 夜航.mp4");
        let outside = root.with_extension("outside.mp4");
        std::fs::write(&audio, b"test audio").unwrap();
        std::fs::create_dir_all(video.parent().unwrap()).unwrap();
        std::fs::write(&video, b"test video").unwrap();
        std::fs::write(&outside, b"outside video").unwrap();

        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![root.to_string_lossy()],
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "夜航".into(),
                artist: "林桥".into(),
                album: "雨后唱片".into(),
                duration_seconds: 180,
                file_path: audio.to_string_lossy().into_owned(),
                cover_path: None,
            },
        )
        .unwrap();
        let track = load_tracks(&conn).unwrap().remove(0);

        let context = local_video_track_context(&conn, &track.id).unwrap();
        assert_eq!(context.authorized_root, root.canonicalize().unwrap());
        assert!(local_video_path_is_authorized(&conn, &track.id, &video).unwrap());
        assert!(!local_video_path_is_authorized(&conn, &track.id, &outside).unwrap());

        conn.execute(
            "UPDATE tracks SET explicit_path_authorized = 1 WHERE id = ?1",
            params![track.id],
        )
        .unwrap();
        assert!(local_video_track_context(&conn, &track.id)
            .err()
            .unwrap()
            .contains("已登记的音乐目录授权"));

        let _ = std::fs::remove_file(outside);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_video_lookup_rejects_tracks_excluded_by_library_rules() {
        let root = std::env::temp_dir().join(format!(
            "ome-local-video-ignored-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let audio = root.join("night.mp3");
        std::fs::write(&audio, b"test audio").unwrap();

        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![root.to_string_lossy()],
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "Night".into(),
                artist: "Artist".into(),
                album: "Album".into(),
                duration_seconds: 180,
                file_path: audio.to_string_lossy().into_owned(),
                cover_path: None,
            },
        )
        .unwrap();
        let track = load_tracks(&conn).unwrap().remove(0);
        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 1 WHERE id = ?1",
            params![track.id],
        )
        .unwrap();

        assert!(local_video_track_context(&conn, &track.id)
            .err()
            .unwrap()
            .contains("未排除的本地曲目"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn batch_removal_deletes_multiple_local_library_indexes() {
        let mut conn = memory_db();
        for (title, path) in [
            ("Track A", r"C:\music\a.flac"),
            ("Track B", r"C:\music\b.flac"),
        ] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: "Artist".into(),
                    album: "Album".into(),
                    duration_seconds: 120,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        let ids = load_tracks(&conn)
            .unwrap()
            .into_iter()
            .map(|track| track.id)
            .collect::<Vec<_>>();
        conn.execute(
            "INSERT INTO playlists (id, name, source) VALUES ('playlist', 'Mix', 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO lyrics_backfill_jobs (id, mode, threshold, status, total_count)
             VALUES ('job', 'quick', 82, 'running', 2)",
            [],
        )
        .unwrap();
        for (index, id) in ids.iter().enumerate() {
            conn.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('playlist', ?1, ?2)",
                params![id, index as i64],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO playback_events (id, track_id, event_type) VALUES (?1, ?2, 'play')",
                params![format!("event-{index}"), id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO saved_track_lyrics (track_id, provider, provider_id, title, artist, raw_lyrics_json)
                 VALUES (?1, 'amll', ?2, 'Lyric', 'Artist', '{}')",
                params![id, format!("saved-{index}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO backfilled_track_lyrics (track_id, provider, provider_id, title, artist, raw_lyrics_json, score)
                 VALUES (?1, 'amll', ?2, 'Lyric', 'Artist', '{}', 90)",
                params![id, format!("automatic-{index}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO lyrics_backfill_items (job_id, track_id, status) VALUES ('job', ?1, 'pending')",
                params![id],
            )
            .unwrap();
        }

        remove_local_tracks(&mut conn, &ids).unwrap();

        assert!(load_tracks(&conn).unwrap().is_empty());
        for table in [
            "playlist_tracks",
            "playback_events",
            "saved_track_lyrics",
            "backfilled_track_lyrics",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} should cascade with its removed tracks");
        }
        let skipped_backfill_items: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lyrics_backfill_items
                 WHERE status = 'skipped' AND message = '曲目已从曲库移除'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(skipped_backfill_items, 2);
    }

    #[test]
    fn batch_removal_rejects_invalid_member_without_partial_deletion() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "Local".into(),
                artist: "Artist".into(),
                album: "Album".into(),
                duration_seconds: 120,
                file_path: r"C:\music\local.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let local = load_tracks(&conn).unwrap().remove(0);
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source)
             VALUES ('remote', 'Online track', ?1, 120, 'netease://remote', 'netease')",
            [local.artist_id],
        )
        .unwrap();

        assert!(remove_local_tracks(&mut conn, &[local.id, "remote".into()]).is_err());
        assert_eq!(load_tracks(&conn).unwrap().len(), 2);
    }

    #[test]
    fn batch_removal_rejects_duplicate_ids_without_deleting() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "Local".into(),
                artist: "Artist".into(),
                album: "Album".into(),
                duration_seconds: 120,
                file_path: r"C:\music\local.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();

        assert!(remove_local_tracks(&mut conn, &[id.clone(), id]).is_err());
        assert_eq!(load_tracks(&conn).unwrap().len(), 1);
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
        assert_eq!(loaded.album, "十一月的萧邦");
        assert_eq!(loaded.duration_seconds, 226);
        assert!(!loaded.liked);
        // 同路径再插入 → 更新不重复
        insert_track(&conn, &track).unwrap();
        assert_eq!(load_tracks(&conn).unwrap().len(), 1);
    }

    #[test]
    fn album_folder_target_uses_an_authorized_existing_local_track() {
        let conn = memory_db();
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ome-album-folder-{suffix}"));
        let album_dir = root.join("album");
        std::fs::create_dir_all(&album_dir).unwrap();
        let audio_path = album_dir.join("track.flac");
        std::fs::write(&audio_path, b"test audio").unwrap();
        let root = root.canonicalize().unwrap();
        let audio_path = root.join("album").join("track.flac");
        let root_text = root.to_string_lossy().into_owned();
        let audio_text = audio_path.to_string_lossy().into_owned();

        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            [&root_text],
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "Track".into(),
                artist: "Artist".into(),
                album: "Album".into(),
                duration_seconds: 120,
                file_path: audio_text,
                cover_path: None,
            },
        )
        .unwrap();
        let album_id = load_tracks(&conn).unwrap()[0].album_id.clone().unwrap();

        assert_eq!(
            authorized_album_folder_target(&conn, &album_id).unwrap(),
            root.join("album")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn album_folder_target_rejects_unregistered_local_paths() {
        let conn = memory_db();
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ome-album-folder-unauthed-{suffix}"));
        std::fs::create_dir_all(&root).unwrap();
        let audio_path = root.join("track.flac");
        std::fs::write(&audio_path, b"test audio").unwrap();
        let root = root.canonicalize().unwrap();
        let audio_text = root.join("track.flac").to_string_lossy().into_owned();

        insert_track(
            &conn,
            &NewTrack {
                title: "Track".into(),
                artist: "Artist".into(),
                album: "Album".into(),
                duration_seconds: 120,
                file_path: audio_text,
                cover_path: None,
            },
        )
        .unwrap();
        let album_id = load_tracks(&conn).unwrap()[0].album_id.clone().unwrap();

        assert!(authorized_album_folder_target(&conn, &album_id).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saved_track_lyrics_roundtrip_replace_and_delete() {
        let conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "夜曲".into(),
                artist: "周杰伦".into(),
                album: "十一月的萧邦".into(),
                duration_seconds: 226,
                file_path: r"C:\music\夜曲.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let track_id = load_tracks(&conn).unwrap().remove(0).id;
        let request = SaveTrackLyricsRequestDto {
            provider: "qqmusic".into(),
            provider_id: "12345".into(),
            title: "夜曲".into(),
            artist: "周杰伦".into(),
            album: Some("十一月的萧邦".into()),
            raw_lyrics_json: r#"{"lrc":"","qrc":"[1000,1000]<1000,1000>歌词","tlyric":"[00:01.00]translation","rlyric":"[00:01.00]romanization"}"#.into(),
        };

        let saved = save_track_lyrics(&conn, &track_id, &request).unwrap();
        assert_eq!(saved.provider, "qqmusic");
        assert_eq!(saved.raw_lyrics["qrc"], "[1000,1000]<1000,1000>歌词");
        assert_eq!(
            get_saved_track_lyrics(&conn, &track_id)
                .unwrap()
                .unwrap()
                .provider_id,
            "12345"
        );

        let replacement = SaveTrackLyricsRequestDto {
            provider: "lrclib".into(),
            provider_id: "98765".into(),
            title: "夜曲".into(),
            artist: "周杰伦".into(),
            album: None,
            raw_lyrics_json: r#"{"lrc":"[00:01.00]新歌词"}"#.into(),
        };
        save_track_lyrics(&conn, &track_id, &replacement).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM saved_track_lyrics", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
        let loaded = get_saved_track_lyrics(&conn, &track_id).unwrap().unwrap();
        assert_eq!(loaded.provider, "lrclib");
        assert_eq!(loaded.raw_lyrics["lrc"], "[00:01.00]新歌词");

        assert!(delete_track_lyrics(&conn, &track_id).unwrap());
        assert!(get_saved_track_lyrics(&conn, &track_id).unwrap().is_none());
        assert!(!delete_track_lyrics(&conn, &track_id).unwrap());
        save_track_lyrics(&conn, &track_id, &replacement).unwrap();
        conn.execute("DELETE FROM tracks WHERE id = ?1", params![track_id])
            .unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM saved_track_lyrics", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn saved_track_lyrics_reject_unsupported_and_excluded_tracks() {
        let conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "测试曲目".into(),
                artist: "测试艺人".into(),
                album: "".into(),
                duration_seconds: 120,
                file_path: r"C:\music\test.mp3".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let track_id = load_tracks(&conn).unwrap().remove(0).id;
        let mut request = SaveTrackLyricsRequestDto {
            provider: "unknown".into(),
            provider_id: "1".into(),
            title: "测试曲目".into(),
            artist: "测试艺人".into(),
            album: None,
            raw_lyrics_json: r#"{"lrc":"[00:01.00]歌词"}"#.into(),
        };
        assert!(validate_saved_track_lyrics_request(&request).is_err());

        request.provider = "netease".into();
        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 1 WHERE id = ?1",
            params![track_id],
        )
        .unwrap();
        assert!(save_track_lyrics(&conn, &track_id, &request)
            .unwrap_err()
            .contains("排除"));

        request.raw_lyrics_json = format!(
            r#"{{"lrc":"{}"}}"#,
            "歌词".repeat(MAX_SAVED_TRACK_LYRICS_BYTES)
        );
        assert!(validate_saved_track_lyrics_request(&request)
            .unwrap_err()
            .contains("上限"));
    }

    #[test]
    fn catalog_renames_keep_aliases_and_match_old_tags_on_rescan() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "第一首".into(),
                artist: "旧艺人名".into(),
                album: "旧专辑名".into(),
                duration_seconds: 180,
                file_path: r"C:\music\first.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let original = load_tracks(&conn).unwrap().remove(0);
        let artist_id = original.artist_id.clone().unwrap();
        let album_id = original.album_id.clone().unwrap();

        let artist = rename_library_artist(&mut conn, &artist_id, "新艺人名").unwrap();
        assert_eq!(artist.previous_name, "旧艺人名");
        assert_eq!(artist.name, "新艺人名");
        assert_eq!(artist.tracks[0].artist, "新艺人名");

        let album = rename_library_album(&mut conn, &album_id, "新专辑名").unwrap();
        assert_eq!(album.previous_name, "旧专辑名");
        assert_eq!(album.name, "新专辑名");
        assert_eq!(album.tracks[0].album, "新专辑名");

        insert_track(
            &conn,
            &NewTrack {
                title: "第二首".into(),
                artist: "旧艺人名".into(),
                album: "旧专辑名".into(),
                duration_seconds: 190,
                file_path: r"C:\music\second.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let tracks = load_tracks(&conn).unwrap();
        assert_eq!(tracks.len(), 2);
        assert!(tracks.iter().all(|track| track.artist == "新艺人名"));
        assert!(tracks.iter().all(|track| track.album == "新专辑名"));
        assert!(tracks
            .iter()
            .all(|track| track.artist_id.as_deref() == Some(artist_id.as_str())));
        assert!(tracks
            .iter()
            .all(|track| track.album_id.as_deref() == Some(album_id.as_str())));
    }

    #[test]
    fn catalog_rename_rejects_collisions_and_nonlocal_links() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "本地曲目".into(),
                artist: "艺人甲".into(),
                album: "专辑甲".into(),
                duration_seconds: 180,
                file_path: r"C:\music\local.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "其他艺人曲目".into(),
                artist: "艺人乙".into(),
                album: "专辑乙".into(),
                duration_seconds: 180,
                file_path: r"C:\music\other.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "同艺人另一张专辑".into(),
                artist: "艺人甲".into(),
                album: "目标专辑".into(),
                duration_seconds: 180,
                file_path: r"C:\music\target.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let tracks = load_tracks(&conn).unwrap();
        let artist_a = tracks
            .iter()
            .find(|track| track.artist == "艺人甲")
            .unwrap();
        let artist_b = tracks
            .iter()
            .find(|track| track.artist == "艺人乙")
            .unwrap();
        let album_a = tracks.iter().find(|track| track.album == "专辑甲").unwrap();
        let album_target = tracks
            .iter()
            .find(|track| track.album == "目标专辑")
            .unwrap();
        assert!(
            rename_library_artist(&mut conn, artist_a.artist_id.as_deref().unwrap(), "艺人乙")
                .is_err()
        );
        assert!(
            rename_library_album(&mut conn, album_a.album_id.as_deref().unwrap(), "目标专辑")
                .is_err()
        );
        assert_ne!(album_a.album_id, album_target.album_id);

        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source)
             VALUES ('remote-shared-artist', '远程曲目', ?1, 180, 'netease://remote-shared-artist', 'netease')",
            [artist_b.artist_id.as_deref().unwrap()],
        )
        .unwrap();
        assert!(
            rename_library_artist(&mut conn, artist_b.artist_id.as_deref().unwrap(), "艺人丙")
                .is_err()
        );
        let unchanged: String = conn
            .query_row(
                "SELECT name FROM artists WHERE id = ?1",
                [artist_b.artist_id.as_deref().unwrap()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unchanged, "艺人乙");
    }

    #[test]
    fn artist_merge_reparents_tracks_and_consolidates_matching_albums() {
        let mut conn = memory_db();
        for (title, artist, album, path) in [
            ("来源曲目", "来源艺人", "旧版辑", r"C:\music\source.flac"),
            (
                "来源独有曲目",
                "来源艺人",
                "独有辑",
                r"C:\music\source-unique.flac",
            ),
            ("目标曲目", "目标艺人", "标准辑", r"C:\music\target.flac"),
        ] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: artist.into(),
                    album: album.into(),
                    duration_seconds: 180,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        let original = load_tracks(&conn).unwrap();
        let source_artist_id = original
            .iter()
            .find(|track| track.artist == "来源艺人")
            .unwrap()
            .artist_id
            .clone()
            .unwrap();
        let target_artist_id = original
            .iter()
            .find(|track| track.artist == "目标艺人")
            .unwrap()
            .artist_id
            .clone()
            .unwrap();
        let source_matching_album = original
            .iter()
            .find(|track| track.album == "旧版辑")
            .unwrap()
            .album_id
            .clone()
            .unwrap();
        let target_matching_album = original
            .iter()
            .find(|track| track.album == "标准辑")
            .unwrap()
            .album_id
            .clone()
            .unwrap();
        let unique_album_id = original
            .iter()
            .find(|track| track.album == "独有辑")
            .unwrap()
            .album_id
            .clone()
            .unwrap();
        conn.execute(
            "UPDATE artists SET aliases_json = '[\"来源别名\"]', genres_json = '[\"ambient\"]' WHERE id = ?1",
            [&source_artist_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE artists SET aliases_json = '[\"目标别名\"]', genres_json = '[\"pop\"]' WHERE id = ?1",
            [&target_artist_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE albums SET aliases_json = '[\"旧版辑\"]', year = 2008 WHERE id = ?1",
            [&target_matching_album],
        )
        .unwrap();

        let preview =
            preview_library_artist_merge(&conn, &source_artist_id, &target_artist_id).unwrap();
        assert_eq!(preview.source_track_count, 2);
        assert_eq!(preview.target_track_count, 1);
        assert_eq!(preview.consolidated_albums.len(), 1);
        assert_eq!(preview.consolidated_albums[0].source_name, "旧版辑");
        assert_eq!(preview.consolidated_albums[0].target_name, "标准辑");

        let result = merge_library_artist(&mut conn, &source_artist_id, &target_artist_id).unwrap();
        assert_eq!(result.id, target_artist_id);
        assert_eq!(result.previous_name, "来源艺人");
        assert_eq!(result.tracks.len(), 2);
        assert!(result
            .tracks
            .iter()
            .all(|track| track.artist_id.as_deref() == Some(target_artist_id.as_str())));
        let matched = result
            .tracks
            .iter()
            .find(|track| track.title == "来源曲目")
            .unwrap();
        assert_eq!(
            matched.album_id.as_deref(),
            Some(target_matching_album.as_str())
        );
        assert_eq!(matched.album, "标准辑");
        let unique = result
            .tracks
            .iter()
            .find(|track| track.title == "来源独有曲目")
            .unwrap();
        assert_eq!(unique.album_id.as_deref(), Some(unique_album_id.as_str()));
        let album_artist_id: String = conn
            .query_row(
                "SELECT artist_id FROM albums WHERE id = ?1",
                [&unique_album_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(album_artist_id, target_artist_id);

        let aliases_json: String = conn
            .query_row(
                "SELECT aliases_json FROM artists WHERE id = ?1",
                [&target_artist_id],
                |row| row.get(0),
            )
            .unwrap();
        let aliases: Vec<String> = serde_json::from_str(&aliases_json).unwrap();
        assert!(aliases.contains(&"来源艺人".to_string()));
        assert!(aliases.contains(&"来源别名".to_string()));
        assert!(aliases.contains(&"目标别名".to_string()));
        let genres_json: String = conn
            .query_row(
                "SELECT genres_json FROM artists WHERE id = ?1",
                [&target_artist_id],
                |row| row.get(0),
            )
            .unwrap();
        let genres: Vec<String> = serde_json::from_str(&genres_json).unwrap();
        assert_eq!(genres, vec!["pop", "ambient"]);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM albums WHERE id = ?1",
                [&source_matching_album],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn album_merge_preserves_track_ids_and_rejects_cross_artist_targets() {
        let mut conn = memory_db();
        for (title, artist, album, path) in [
            ("来源曲目", "艺人甲", "旧专辑", r"C:\music\old-album.flac"),
            (
                "目标曲目",
                "艺人甲",
                "目标专辑",
                r"C:\music\target-album.flac",
            ),
            (
                "另一艺人曲目",
                "艺人乙",
                "其他专辑",
                r"C:\music\other-album.flac",
            ),
        ] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: artist.into(),
                    album: album.into(),
                    duration_seconds: 180,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        let original = load_tracks(&conn).unwrap();
        let source = original
            .iter()
            .find(|track| track.album == "旧专辑")
            .unwrap();
        let target = original
            .iter()
            .find(|track| track.album == "目标专辑")
            .unwrap();
        let other = original
            .iter()
            .find(|track| track.album == "其他专辑")
            .unwrap();
        assert!(preview_library_album_merge(
            &conn,
            source.album_id.as_deref().unwrap(),
            other.album_id.as_deref().unwrap()
        )
        .is_err());

        let source_id = source.album_id.as_deref().unwrap().to_string();
        let target_id = target.album_id.as_deref().unwrap().to_string();
        let source_track_id = source.id.clone();
        let merged = merge_library_album(&mut conn, &source_id, &target_id).unwrap();
        assert_eq!(merged.tracks.len(), 1);
        assert_eq!(merged.tracks[0].id, source_track_id);
        assert_eq!(
            merged.tracks[0].album_id.as_deref(),
            Some(target_id.as_str())
        );
        assert_eq!(merged.tracks[0].album, "目标专辑");
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM albums WHERE id = ?1",
                [&source_id],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn artist_merge_rejects_online_tracks_without_partial_changes() {
        let mut conn = memory_db();
        for (artist, album, path) in [
            ("来源艺人", "来源专辑", r"C:\music\source-merge.flac"),
            ("目标艺人", "目标专辑", r"C:\music\target-merge.flac"),
        ] {
            insert_track(
                &conn,
                &NewTrack {
                    title: "曲目".into(),
                    artist: artist.into(),
                    album: album.into(),
                    duration_seconds: 180,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        let original = load_tracks(&conn).unwrap();
        let source_id = original
            .iter()
            .find(|track| track.artist == "来源艺人")
            .unwrap()
            .artist_id
            .clone()
            .unwrap();
        let target_id = original
            .iter()
            .find(|track| track.artist == "目标艺人")
            .unwrap()
            .artist_id
            .clone()
            .unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source)
             VALUES ('remote-linked', '在线曲目', ?1, 180, 'netease://remote-linked', 'netease')",
            [&source_id],
        )
        .unwrap();
        assert!(preview_library_artist_merge(&conn, &source_id, &target_id).is_err());
        assert!(merge_library_artist(&mut conn, &source_id, &target_id).is_err());
        let artist_name: String = conn
            .query_row(
                "SELECT name FROM artists WHERE id = ?1",
                [&source_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(artist_name, "来源艺人");
        let local_artist_id: String = conn
            .query_row(
                "SELECT artist_id FROM tracks WHERE file_path = ?1",
                [r"C:\music\source-merge.flac"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(local_artist_id, source_id);
    }

    #[test]
    fn local_metadata_override_survives_rescan_updates() {
        let mut conn = memory_db();
        let file_path = r"C:\music\song.flac";
        let original = NewTrack {
            title: "文件标签曲名".into(),
            artist: "文件标签艺人".into(),
            album: String::new(),
            duration_seconds: 90,
            file_path: file_path.into(),
            cover_path: None,
        };
        insert_track(&conn, &original).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();

        let edited =
            update_track_metadata(&mut conn, &id, "修正曲名", "修正艺人", "精选辑").unwrap();
        assert_eq!(edited.title, "修正曲名");
        assert_eq!(edited.artist, "修正艺人");
        assert_eq!(edited.album, "精选辑");
        let original_snapshot: (String, String, String) = conn
            .query_row(
                "SELECT original_title, original_artist, original_album
                 FROM track_metadata_overrides WHERE track_id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            original_snapshot,
            ("文件标签曲名".into(), "文件标签艺人".into(), String::new())
        );

        insert_track(
            &conn,
            &NewTrack {
                title: "重扫读到的新曲名".into(),
                artist: "重扫读到的新艺人".into(),
                album: "重扫读到的新专辑".into(),
                duration_seconds: 95,
                file_path: file_path.into(),
                cover_path: Some("cover-cache".into()),
            },
        )
        .unwrap();
        let rescanned = load_tracks(&conn).unwrap().remove(0);
        assert_eq!(rescanned.title, "修正曲名");
        assert_eq!(rescanned.artist, "修正艺人");
        assert_eq!(rescanned.album, "精选辑");
        assert_eq!(rescanned.album, "精选辑");
        assert_eq!(rescanned.duration_seconds, 95);
        assert_eq!(rescanned.cover_path.as_deref(), Some("cover-cache"));
    }

    #[test]
    fn album_tag_sync_preserves_other_metadata_and_original_restore_point() {
        let mut conn = memory_db();
        let original = NewTrack {
            title: "文件曲名".into(),
            artist: "文件艺人".into(),
            album: "旧专辑".into(),
            duration_seconds: 123,
            file_path: r"C:\music\album-sync.flac".into(),
            cover_path: None,
        };
        insert_track(&conn, &original).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        update_track_metadata(&mut conn, &id, "人工曲名", "人工艺人", "曲库旧名").unwrap();

        let updated = sync_local_album_tag_to_library(&mut conn, &id, "音频新专辑").unwrap();

        assert_eq!(updated.title, "人工曲名");
        assert_eq!(updated.artist, "人工艺人");
        assert_eq!(updated.album, "音频新专辑");
        let metadata_sources = updated.metadata_sources.unwrap();
        assert_eq!(metadata_sources.title, "manual");
        assert_eq!(metadata_sources.artist, "manual");
        assert_eq!(metadata_sources.album, "fileTags");
        let snapshot: (String, String, String) = conn
            .query_row(
                "SELECT original_title, original_artist, original_album
                 FROM track_metadata_overrides WHERE track_id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            snapshot,
            ("文件曲名".into(), "文件艺人".into(), "旧专辑".into())
        );
    }

    #[test]
    fn metadata_restore_uses_first_edit_snapshot_and_clears_override() {
        let mut conn = memory_db();
        let original = NewTrack {
            title: "导入时曲名".into(),
            artist: "导入时艺人".into(),
            album: "导入时专辑".into(),
            duration_seconds: 123,
            file_path: r"C:\offline\song.flac".into(),
            cover_path: None,
        };
        insert_track(&conn, &original).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        update_track_metadata(&mut conn, &id, "人工曲名", "人工艺人", "人工专辑").unwrap();
        update_track_metadata(&mut conn, &id, "再次修正", "再次修正艺人", "再次修正专辑").unwrap();

        let restored = restore_track_metadata(&mut conn, &id).unwrap();

        assert_eq!(restored.source, "snapshot");
        assert_eq!(restored.track.title, "导入时曲名");
        assert_eq!(restored.track.artist, "导入时艺人");
        assert_eq!(restored.track.album, "导入时专辑");
        assert!(!restored.track.has_metadata_override);
        assert!(!restored.track.metadata_snapshot_available);
        let override_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM track_metadata_overrides WHERE track_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(override_count, 0);
    }

    #[test]
    fn legacy_metadata_override_requires_an_accessible_source_file() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "旧版导入曲名".into(),
                artist: "旧版艺人".into(),
                album: String::new(),
                duration_seconds: 90,
                file_path: r"C:\missing\legacy.mp3".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        update_track_metadata(&mut conn, &id, "旧版人工曲名", "旧版人工艺人", "").unwrap();
        conn.execute(
            "UPDATE track_metadata_overrides
             SET original_title = NULL, original_artist = NULL, original_album = NULL
             WHERE track_id = ?1",
            params![id],
        )
        .unwrap();

        let error = restore_track_metadata(&mut conn, &id)
            .err()
            .expect("旧版覆盖项在文件不可访问时应安全失败");

        assert!(error.contains("音频文件不可访问"));
        let unchanged = load_tracks(&conn).unwrap().remove(0);
        assert_eq!(unchanged.title, "旧版人工曲名");
        assert!(unchanged.has_metadata_override);
        assert!(!unchanged.metadata_snapshot_available);
    }

    #[test]
    fn metadata_editor_rejects_remote_tracks_and_invalid_values_without_changes() {
        let mut conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "本地曲目".into(),
                artist: "本地艺人".into(),
                album: String::new(),
                duration_seconds: 1,
                file_path: "local-path".into(),
                cover_path: None,
            },
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source)
             VALUES ('remote-track', '远程曲目', (SELECT id FROM artists WHERE name = '本地艺人'),
                     1, 'https://example.invalid/track', 'netease')",
            [],
        )
        .unwrap();
        let local_id = load_tracks(&conn)
            .unwrap()
            .into_iter()
            .find(|track| track.source == "local")
            .unwrap()
            .id;

        assert!(update_track_metadata(&mut conn, "missing", "x", "y", "").is_err());
        assert!(update_track_metadata(&mut conn, "remote-track", "x", "y", "").is_err());
        assert!(update_track_metadata(&mut conn, &local_id, "  ", "艺人", "").is_err());
        assert!(update_track_metadata(&mut conn, &local_id, &"x".repeat(201), "艺人", "").is_err());
        assert!(update_track_metadata(&mut conn, &local_id, "曲名", "  ", "").is_err());

        let unchanged = load_tracks(&conn)
            .unwrap()
            .into_iter()
            .find(|track| track.id == local_id)
            .unwrap();
        assert_eq!(unchanged.title, "本地曲目");
        assert_eq!(unchanged.artist, "本地艺人");
        let override_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM track_metadata_overrides WHERE track_id = ?1",
                params![local_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(override_count, 0);
    }

    #[test]
    fn set_liked_persists_and_records_only_changes() {
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
        set_track_liked(&conn, &id, true).unwrap();
        set_track_liked(&conn, &id, false).unwrap();
        assert!(!load_tracks(&conn).unwrap()[0].liked);
        let feedback: Vec<String> = conn
            .prepare("SELECT event_type FROM playback_events WHERE track_id = ?1 ORDER BY rowid")
            .unwrap()
            .query_map(params![id], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(feedback, ["liked", "unliked"]);
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

    // ---------- 同目录歌词 sidecar ----------

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
    fn supported_audio_extensions_are_case_insensitive_and_filtered() {
        assert!(is_supported_audio_path(Path::new("music/track.FLAC")));
        assert!(is_supported_audio_path(Path::new("music/track.m4a")));
        assert!(!is_supported_audio_path(Path::new("music/cover.jpg")));
        assert!(!is_supported_audio_path(Path::new("music/no-extension")));
    }

    #[test]
    fn music_scan_applies_nested_foliaignore_rules_before_discovery() {
        let root = std::env::temp_dir().join(format!(
            "ome-scan-ignore-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        let cache = root.join("cache");
        let live = root.join("live");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::create_dir_all(&live).unwrap();
        std::fs::write(
            root.join(".foliaignore"),
            "cache/\n*.tmp.mp3\n!keep.tmp.mp3\n",
        )
        .unwrap();
        std::fs::write(live.join(".foliaignore"), "*.wav\n!keep.wav\n").unwrap();
        for path in [
            root.join("cache/hidden.flac"),
            root.join("draft.tmp.mp3"),
            root.join("keep.tmp.mp3"),
            root.join("ordinary.flac"),
            live.join("skip.wav"),
            live.join("keep.wav"),
        ] {
            std::fs::write(path, b"placeholder").unwrap();
        }

        let mut progress = LibraryImportProgressDto::default();
        let discovered = discover_audio_paths(vec![root.clone()], &mut progress, |_| {});
        let mut names = discovered
            .audio_paths
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(names, vec!["keep.tmp.mp3", "keep.wav", "ordinary.flac"]);
        assert_eq!(progress.discovered_files, 3);
        assert_eq!(progress.scan_errors, 0);
        assert!(discovered
            .ignored_entries
            .iter()
            .any(|entry| { entry.path == root.join("cache") && entry.is_directory }));
        assert!(discovered
            .ignored_entries
            .iter()
            .any(|entry| { entry.path == root.join("draft.tmp.mp3") && !entry.is_directory }));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_foliaignore_is_counted_and_does_not_abort_scanning() {
        let root = std::env::temp_dir().join(format!(
            "ome-scan-ignore-invalid-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".foliaignore"), format!("{}\n", "x".repeat(4097))).unwrap();
        let audio = root.join("ordinary.flac");
        std::fs::write(&audio, b"placeholder").unwrap();

        let mut progress = LibraryImportProgressDto::default();
        let discovered = discover_audio_paths(vec![root.clone()], &mut progress, |_| {});

        assert_eq!(discovered.audio_paths, vec![audio]);
        assert_eq!(discovered.invalid_rule_directories, vec![root.clone()]);
        assert_eq!(progress.scan_errors, 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn rule_exclusions_hide_existing_tracks_and_restore_only_after_a_safe_scan() {
        let conn = memory_db();
        for (title, path) in [
            ("inside", r"C:\Music\Album\inside.flac"),
            ("neighbor", r"C:\Music-2\neighbor.flac"),
        ] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: "artist".into(),
                    album: String::new(),
                    duration_seconds: 1,
                    file_path: path.into(),
                    cover_path: None,
                },
            )
            .unwrap();
        }

        mark_tracks_ignored_by_rules(
            &conn,
            &[IgnoredEntry {
                path: PathBuf::from(r"C:\Music"),
                is_directory: true,
            }],
        )
        .unwrap();
        assert_eq!(load_tracks(&conn).unwrap().len(), 1);
        assert_eq!(load_ignored_tracks(&conn).unwrap()[0].title, "inside");

        let inside = Path::new(r"C:\Music\Album\inside.flac");
        restore_track_after_successful_scan(&conn, inside, &[PathBuf::from(r"C:\Music\Album")])
            .unwrap();
        assert_eq!(load_ignored_tracks(&conn).unwrap().len(), 1);

        restore_track_after_successful_scan(&conn, inside, &[]).unwrap();
        assert_eq!(load_tracks(&conn).unwrap().len(), 2);
        assert!(load_ignored_tracks(&conn).unwrap().is_empty());
    }

    #[test]
    fn exact_rule_exclusion_does_not_match_sibling_path() {
        let conn = memory_db();
        let ignored_path = PathBuf::from(r"C:\Music\one.flac");
        let sibling_path = PathBuf::from(r"C:\Music\one.flac.backup");
        for (title, path) in [("ignored", &ignored_path), ("sibling", &sibling_path)] {
            insert_track(
                &conn,
                &NewTrack {
                    title: title.into(),
                    artist: "artist".into(),
                    album: String::new(),
                    duration_seconds: 1,
                    file_path: path.to_string_lossy().into_owned(),
                    cover_path: None,
                },
            )
            .unwrap();
        }
        mark_tracks_ignored_by_rules(
            &conn,
            &[IgnoredEntry {
                path: ignored_path,
                is_directory: false,
            }],
        )
        .unwrap();

        assert_eq!(load_tracks(&conn).unwrap()[0].title, "sibling");
        assert_eq!(load_ignored_tracks(&conn).unwrap()[0].title, "ignored");
    }

    #[test]
    fn playback_history_remains_available_for_rule_excluded_tracks() {
        let conn = memory_db();
        let track = NewTrack {
            title: "留在记忆里的歌".into(),
            artist: "artist".into(),
            album: String::new(),
            duration_seconds: 1,
            file_path: r"C:\Music\remembered.flac".into(),
            cover_path: None,
        };
        insert_track(&conn, &track).unwrap();
        let id: String = conn
            .query_row(
                "SELECT id FROM tracks WHERE file_path = ?1",
                params![track.file_path],
                |row| row.get(0),
            )
            .unwrap();
        record_playback_event(&conn, &id, "play", 0).unwrap();
        conn.execute(
            "UPDATE tracks SET ignored_by_rules = 1 WHERE id = ?1",
            params![id],
        )
        .unwrap();

        assert!(load_tracks(&conn).unwrap().is_empty());
        assert_eq!(playback_history(&conn, 10).unwrap().len(), 1);
        assert_eq!(playback_history_entries(&conn, 10).unwrap().len(), 1);
    }

    #[test]
    fn unreadable_audio_files_are_not_added_as_metadata_only_tracks() {
        let path = std::env::temp_dir().join(format!(
            "ome-invalid-audio-{:x}.flac",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::write(&path, b"not an audio stream").unwrap();
        assert!(read_track_metadata(&path).is_none());
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn library_import_progress_uses_camel_case_and_contains_only_counts() {
        let progress = LibraryImportProgressDto {
            phase: "reading".into(),
            examined_entries: 128,
            discovered_files: 3,
            processed_files: 1,
            total_files: Some(3),
            added: 1,
            updated: 0,
            skipped: 0,
            scan_errors: 0,
        };
        let json = serde_json::to_value(progress).unwrap();
        assert_eq!(json["examinedEntries"], 128);
        assert_eq!(json["totalFiles"], 3);
        assert!(json.get("filePath").is_none());
    }

    #[test]
    fn authorized_music_directories_are_read_in_registration_order() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1), (?2)",
            params!["C:/Music", "D:/Albums"],
        )
        .unwrap();
        assert_eq!(
            list_authorized_music_directories(&conn).unwrap(),
            vec![PathBuf::from("C:/Music"), PathBuf::from("D:/Albums")]
        );
    }

    #[test]
    fn no_registered_music_directories_returns_an_empty_list() {
        assert!(list_authorized_music_directories(&memory_db())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn directory_status_reports_availability_and_counts_only_its_tracks() {
        let conn = memory_db();
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ome-library-root-{suffix}"));
        std::fs::create_dir_all(&root).unwrap();
        let root_text = root.to_string_lossy().into_owned();
        let in_root = root.join("ALBUM/song.flac").to_string_lossy().into_owned();
        let sibling = root
            .with_file_name(format!("ome-library-root-{suffix}-sibling"))
            .join("song.flac")
            .to_string_lossy()
            .into_owned();

        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            [&root_text],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, file_path) VALUES ('inside', 'Inside', ?1), ('outside', 'Outside', ?2)",
            params![in_root, sibling],
        )
        .unwrap();

        let directories = list_authorized_music_directory_status(&conn).unwrap();
        assert_eq!(directories.len(), 1);
        assert!(directories[0].available);
        assert_eq!(directories[0].track_count, 1);
        let json = serde_json::to_value(&directories[0]).unwrap();
        assert_eq!(json["trackCount"], 1);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn directory_lookup_requires_a_registered_id() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            ["C:/Music"],
        )
        .unwrap();
        let id = conn.last_insert_rowid();

        assert_eq!(
            authorized_music_directory_by_id(&conn, id).unwrap(),
            Some(PathBuf::from("C:/Music"))
        );
        assert_eq!(
            authorized_music_directory_by_id(&conn, id + 1).unwrap(),
            None
        );
    }

    #[test]
    fn revoking_directory_authorization_preserves_tracks_and_playlist_links() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            ["C:/Music"],
        )
        .unwrap();
        let directory_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tracks (id, title, file_path) VALUES ('track', 'Keep me', 'C:/Music/song.flac')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlists (id, name, source) VALUES ('playlist', 'Keep this list', 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('playlist', 'track', 0)",
            [],
        )
        .unwrap();

        assert!(revoke_authorized_music_directory(&conn, directory_id).unwrap());
        assert!(!revoke_authorized_music_directory(&conn, directory_id).unwrap());
        let tracks: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .unwrap();
        let playlist_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM playlist_tracks", [], |row| row.get(0))
            .unwrap();
        let directory_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM authorized_music_directories",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tracks, 1);
        assert_eq!(playlist_links, 1);
        assert_eq!(directory_records, 0);
    }

    #[test]
    fn normalized_path_key_ignores_windows_case_and_separator_differences() {
        assert_eq!(
            normalized_path_key(Path::new("C:\\Music\\夜曲.FLAC")),
            normalized_path_key(Path::new("c:/music/夜曲.flac"))
        );
        assert_eq!(
            normalized_path_key(Path::new("\\\\?\\C:\\Music\\夜曲.FLAC")),
            normalized_path_key(Path::new("C:/Music/夜曲.FLAC"))
        );
        assert_eq!(
            normalized_path_key(Path::new("\\\\?\\UNC\\server\\share\\music.flac")),
            normalized_path_key(Path::new("\\\\server\\share\\music.flac"))
        );
        let audio = make_sidecar_pair("path-check.lrc", b"[00:01.00]path");
        assert!(is_regular_path_without_symlink_components(&audio));
    }

    #[test]
    fn directory_count_path_matching_ignores_case_but_respects_component_boundaries() {
        assert!(path_is_within_directory(
            Path::new("c:/MUSIC/album/song.flac"),
            Path::new("C:\\Music")
        ));
        assert!(!path_is_within_directory(
            Path::new("C:/Music-Archive/song.flac"),
            Path::new("C:/Music")
        ));
    }

    #[test]
    fn sidecar_lrc_supports_uppercase_extension() {
        let audio = make_sidecar_pair("夜曲.LRC", b"[00:01.00]hi");
        assert!(read_sidecar_lrc(&audio).unwrap().is_some());
    }

    #[test]
    fn sidecar_lrc_supports_audio_filename_suffix() {
        let dir = std::env::temp_dir().join(format!(
            "ome-lrc-audio-name-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("夜曲.MP3");
        let sidecar = dir.join("夜曲.mp3.lrc");
        std::fs::write(&audio, b"fake-audio").unwrap();
        std::fs::write(&sidecar, b"[00:01.00]hello").unwrap();
        let found = find_sidecar_lrc(&audio).expect("应命中追加音频扩展名的歌词");
        assert_eq!(
            found.file_name().unwrap().to_string_lossy().to_lowercase(),
            sidecar
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_lowercase()
        );
    }

    #[test]
    fn sidecar_translation_supports_lrc_and_vtt_names() {
        let dir = std::env::temp_dir().join(format!(
            "ome-lrc-translation-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("夜曲.flac");
        let translation = dir.join("夜曲.t.vtt");
        let vtt = b"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n";
        std::fs::write(&audio, b"fake-audio").unwrap();
        std::fs::write(&translation, vtt).unwrap();

        assert_eq!(
            find_sidecar_translation(&audio).as_deref(),
            Some(translation.as_path())
        );
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine as _;
        assert_eq!(
            BASE64
                .decode(read_sidecar_translation(&audio).unwrap().unwrap())
                .unwrap(),
            vtt
        );
        let dto = serde_json::to_value(LocalLyricDto {
            lrc: "main".into(),
            tlyric: Some("translation".into()),
            rlyric: Some("romanization".into()),
            embedded_lrc: None,
        })
        .unwrap();
        assert_eq!(dto["tlyric"], "translation");
        assert_eq!(dto["rlyric"], "romanization");
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

    #[test]
    fn sidecar_priority_is_lrc_then_vtt_then_ttml() {
        let dir = std::env::temp_dir().join(format!(
            "ome-lrc-test-prio-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("歌.flac");
        std::fs::write(&audio, b"fake-audio").unwrap();
        std::fs::write(dir.join("歌.ttml"), b"<tt/>").unwrap();
        std::fs::write(dir.join("歌.vtt"), b"WEBVTT\n").unwrap();
        std::fs::write(dir.join("歌.krc"), b"junk").unwrap();
        let found = find_sidecar_lrc(&audio).unwrap();
        assert_eq!(found.extension().and_then(|e| e.to_str()), Some("vtt"));
        std::fs::write(dir.join("歌.lrc"), b"[00:01.00]x").unwrap();
        let found = find_sidecar_lrc(&audio).unwrap();
        assert_eq!(found.extension().and_then(|e| e.to_str()), Some("lrc"));
    }

    #[test]
    fn sidecar_vtt_bytes_are_returned_unchanged() {
        let vtt = "WEBVTT\n\n00:00:01.200 --> 00:00:02.000\n你好\n";
        let audio = make_sidecar_pair("夜曲.VTT", vtt.as_bytes());
        let encoded = read_sidecar_lrc(&audio).unwrap().expect("应命中同目录 VTT");
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine as _;
        assert_eq!(BASE64.decode(encoded).unwrap(), vtt.as_bytes());
    }

    #[test]
    fn krc_decrypt_roundtrip_via_zlib_xor() {
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;
        const KEY: [u8; 4] = [0x40, 0x47, 0x61, 0x62];
        let plain = b"[1200,3000]<1200,300>hello".to_vec();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&plain).unwrap();
        let compressed = encoder.finish().unwrap();
        let encrypted: Vec<u8> = compressed
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ KEY[i % 4])
            .collect();
        let dir = std::env::temp_dir().join(format!(
            "ome-lrc-test-krc-{:x}",
            md5::compute(std::process::id().to_string())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("歌.flac");
        std::fs::write(&audio, b"fake-audio").unwrap();
        std::fs::write(dir.join("歌.krc"), &encrypted).unwrap();
        let encoded = read_sidecar_lrc(&audio).unwrap().expect("应命中 .krc");
        use base64::engine::general_purpose::STANDARD as BASE64;
        use base64::Engine as _;
        assert_eq!(BASE64.decode(encoded).unwrap(), plain);
    }

    #[test]
    fn krc_decrypt_rejects_garbage() {
        assert!(decrypt_krc(b"definitely not zlib").is_none());
    }

    // ---------- 历史条目（每次播放一条 + 时间戳） ----------

    #[test]
    fn history_entries_list_each_play_newest_first() {
        let conn = memory_db();
        insert_track(
            &conn,
            &NewTrack {
                title: "歌一".into(),
                artist: "歌手".into(),
                album: "专辑".into(),
                duration_seconds: 200,
                file_path: "C:\\music\\a.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        insert_track(
            &conn,
            &NewTrack {
                title: "歌二".into(),
                artist: "歌手".into(),
                album: "专辑".into(),
                duration_seconds: 210,
                file_path: "C:\\music\\b.flac".into(),
                cover_path: None,
            },
        )
        .unwrap();
        let tracks = load_tracks(&conn).unwrap();
        let (a, b) = (&tracks[0].id, &tracks[1].id);
        // 同一首歌播两次：条目不去重
        let plays = [
            (a.as_str(), "2026-09-24 08:00:00"),
            (b.as_str(), "2026-09-24 09:00:00"),
            (a.as_str(), "2026-09-24 10:00:00"),
        ];
        for (id, at) in plays {
            conn.execute(
                "INSERT INTO playback_events (id, track_id, event_type, position_seconds, played_at)
                 VALUES (?1, ?2, 'play', 0, ?3)",
                params![format!("evt-{id}-{at}"), id, at],
            )
            .unwrap();
        }
        let entries = playback_history_entries(&conn, 50).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].played_at, "2026-09-24 10:00:00");
        assert_eq!(entries[0].track.title, "歌一"); // 最新在前
        assert_eq!(entries[1].track.title, "歌二");
        assert_eq!(entries[2].track.title, "歌一"); // 同一首多次播放不去重
    }

    #[test]
    fn library_diagnostics_only_stats_tracks_inside_available_authorized_roots() {
        let conn = memory_db();
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!(
            "ome-library-diagnostics-{}-{unique}",
            std::process::id()
        ));
        let available_root = temp_root.join("available-music");
        let offline_root = temp_root.join("offline-music");
        let cache_root = temp_root.join("cache").join("covers");
        std::fs::create_dir_all(&available_root).unwrap();
        std::fs::create_dir_all(&cache_root).unwrap();

        let available_track = available_root.join("reachable-track.mp3");
        let unavailable_track = available_root.join("unavailable-track.mp3");
        let offline_track = offline_root.join("offline-track.mp3");
        let outside_track = temp_root.join("outside-track.mp3");
        let traversal_track = available_root.join("..").join("traversal-track.mp3");
        let excluded_track = available_root.join("excluded-track.mp3");
        let remote_track = PathBuf::from("netease://song/1");
        std::fs::write(&available_track, b"metadata-only fixture").unwrap();
        std::fs::write(temp_root.join("traversal-track.mp3"), b"must not inspect").unwrap();
        std::fs::write(cache_root.join("cover.jpg"), b"cover").unwrap();
        let database_path = temp_root.join("ome-music.db");
        std::fs::write(&database_path, b"database-size-fixture").unwrap();
        std::fs::write(temp_root.join("ome-music.db-wal"), b"wal").unwrap();
        std::fs::write(temp_root.join("ome-music.db-shm"), b"shm!").unwrap();

        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1), (?2)",
            params![
                available_root.to_string_lossy(),
                offline_root.to_string_lossy()
            ],
        )
        .unwrap();
        for (id, path, source, ignored) in [
            ("reachable", &available_track, "local", 0),
            ("unavailable", &unavailable_track, "local", 0),
            ("offline", &offline_track, "local", 0),
            ("outside", &outside_track, "local", 0),
            ("traversal", &traversal_track, "local", 0),
            ("excluded", &excluded_track, "local", 1),
            ("remote", &remote_track, "netease", 0),
        ] {
            conn.execute(
                "INSERT INTO tracks (id, title, file_path, source, ignored_by_rules)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, id, path.to_string_lossy(), source, ignored],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO artists (id, name) VALUES ('artist-1', '歌手')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO albums (id, title, artist_id) VALUES ('album-1', '专辑', 'artist-1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlists (id, name, source) VALUES ('playlist-1', '歌单', 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playback_events (id, track_id, event_type)
             VALUES ('event-1', 'reachable', 'play')",
            [],
        )
        .unwrap();
        persist_library_scan_summary(&conn, 2, 1, 7, 3, 4).unwrap();

        let snapshot = library_diagnostics_snapshot(&conn).unwrap();
        let report = build_library_diagnostics(snapshot, database_path, cache_root);
        assert_eq!(report.total_indexed_track_count, 7);
        assert_eq!(report.local_track_count, 5);
        assert_eq!(report.other_source_track_count, 1);
        assert_eq!(report.excluded_track_count, 1);
        assert_eq!(report.accessible_track_count, 1);
        assert_eq!(report.unavailable_track_count, 1);
        assert_eq!(report.offline_directory_track_count, 1);
        assert_eq!(report.outside_directory_track_count, 2);
        assert_eq!(report.artist_count, 1);
        assert_eq!(report.album_count, 1);
        assert_eq!(report.playlist_count, 1);
        assert_eq!(report.playback_event_count, 1);
        assert_eq!(report.integrity_check, "ok");
        assert_eq!(report.directories[0].indexed_track_count, 3);
        assert!(report.directories[0].available);
        assert_eq!(report.directories[1].indexed_track_count, 1);
        assert!(!report.directories[1].available);
        assert_eq!(report.database_size_bytes, Some(28));
        assert_eq!(report.covers_file_count, 1);
        assert_eq!(report.covers_size_bytes, Some(5));
        let last_scan = report.last_scan.as_ref().expect("应保存最近一次扫描摘要");
        assert_eq!(last_scan.added, 2);
        assert_eq!(last_scan.scan_errors, 4);

        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("reachable-track.mp3"));
        assert!(!serialized.contains("unavailable-track.mp3"));
        assert!(!serialized.contains("outside-track.mp3"));
        assert!(!serialized.contains("traversal-track.mp3"));
        drop(conn);
        std::fs::remove_dir_all(temp_root).unwrap();
    }

    fn write_minimal_wav(path: &Path) {
        let mut bytes = Vec::from(&b"RIFF"[..]);
        bytes.extend_from_slice(&38_u32.to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&8_000_u32.to_le_bytes());
        bytes.extend_from_slice(&16_000_u32.to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&2_u32.to_le_bytes());
        bytes.extend_from_slice(&[0, 0]);
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn repair_local_track_path_preserves_identity_and_grants_only_the_selected_file() {
        let mut conn = memory_db();
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!(
            "ome-library-repair-{}-{unique}",
            std::process::id()
        ));
        let authorized_root = temp_root.join("old-library");
        let moved_root = temp_root.join("moved-library");
        std::fs::create_dir_all(&authorized_root).unwrap();
        std::fs::create_dir_all(&moved_root).unwrap();
        let old_path = authorized_root.join("missing.flac");
        let replacement = moved_root.join("replacement.wav");
        write_minimal_wav(&replacement);

        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![authorized_root.to_string_lossy()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO artists (id, name) VALUES ('repair-artist', '测试歌手')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, file_path, source)
             VALUES ('repair-me', '保留的歌', 'repair-artist', ?1, 'local')",
            params![old_path.to_string_lossy()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlists (id, name, source) VALUES ('repair-playlist', '保留歌单', 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position)
             VALUES ('repair-playlist', 'repair-me', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playback_events (id, track_id, event_type)
             VALUES ('repair-event', 'repair-me', 'play')",
            [],
        )
        .unwrap();

        let updated = repair_local_track_path(&mut conn, "repair-me", &replacement).unwrap();
        assert_eq!(updated.id, "repair-me");
        assert_eq!(
            Path::new(&updated.file_path),
            replacement.canonicalize().unwrap().as_path()
        );
        let explicitly_authorized: i64 = conn
            .query_row(
                "SELECT explicit_path_authorized FROM tracks WHERE id = 'repair-me'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(explicitly_authorized, 1);
        let (stored_hash, stored_version): (Option<String>, Option<i64>) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version FROM tracks WHERE id = 'repair-me'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            stored_hash.as_deref(),
            quick_file_hash_with_authorization(&conn, &replacement, true).as_deref()
        );
        assert_eq!(stored_version, Some(QUICK_HASH_VERSION));
        assert!(list_unavailable_local_tracks(&conn).unwrap().is_empty());
        let snapshot = library_diagnostics_snapshot(&conn).unwrap();
        let report = build_library_diagnostics(snapshot, PathBuf::new(), PathBuf::new());
        assert_eq!(report.accessible_track_count, 1);
        assert_eq!(report.unavailable_track_count, 0);
        assert_eq!(report.outside_directory_track_count, 0);
        let playlist_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM playlist_tracks", [], |row| row.get(0))
            .unwrap();
        let history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM playback_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(playlist_count, 1);
        assert_eq!(history_count, 1);

        drop(conn);
        std::fs::remove_dir_all(temp_root).unwrap();
    }

    #[test]
    fn quick_identity_reads_only_authorized_audio_and_updates_on_rescan() {
        let conn = memory_db();
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ome-library-quick-hash-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let audio = root.join("track.wav");
        write_minimal_wav(&audio);
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![root.to_string_lossy()],
        )
        .unwrap();

        let first_hash = quick_file_hash(&conn, &audio).expect("授权音频应生成摘要");
        assert_eq!(
            quick_file_hash(&conn, &audio).as_deref(),
            Some(first_hash.as_str())
        );

        insert_track(
            &conn,
            &NewTrack {
                title: "可迁移曲目".into(),
                artist: "测试艺人".into(),
                album: "测试专辑".into(),
                duration_seconds: 120,
                file_path: audio.to_string_lossy().into_owned(),
                cover_path: None,
            },
        )
        .unwrap();
        let stored: (Option<String>, Option<i64>) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version FROM tracks WHERE file_path = ?1",
                params![audio.to_string_lossy()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stored, (Some(first_hash), Some(QUICK_HASH_VERSION)));

        let outside = root.parent().unwrap().join(format!("outside-{unique}.wav"));
        write_minimal_wav(&outside);
        assert!(quick_file_hash(&conn, &outside).is_none());
        drop(conn);
        std::fs::remove_file(outside).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn quick_identity_backfill_is_bounded_authorized_and_cursor_paged() {
        let conn = memory_db();
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ome-library-quick-backfill-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let available = root.join("available.wav");
        let stale = root.join("stale.wav");
        let outside_ungranted = root
            .parent()
            .unwrap()
            .join(format!("ome-library-ungranted-{unique}.wav"));
        let explicit_file = root
            .parent()
            .unwrap()
            .join(format!("ome-library-explicit-{unique}.wav"));
        write_minimal_wav(&available);
        write_minimal_wav(&stale);
        write_minimal_wav(&outside_ungranted);
        write_minimal_wav(&explicit_file);
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
            params![root.to_string_lossy()],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO tracks (id, title, file_path, source, ignored_by_rules)
             VALUES ('a-available', '可读曲目', ?1, 'local', 0),
                    ('b-missing', '缺失曲目', ?2, 'local', 0),
                    ('remote', '在线曲目', 'netease://song/1', 'netease', 0),
                    ('excluded', '排除曲目', ?4, 'local', 1),
                    ('stale', '旧版本摘要', ?3, 'local', 0),
                    ('x-ungranted', '未授权但仍存在', ?5, 'local', 0),
                    ('z-explicit', '单文件授权曲目', ?6, 'local', 0)",
            params![
                available.to_string_lossy(),
                root.join("missing.wav").to_string_lossy(),
                stale.to_string_lossy(),
                root.join("excluded.wav").to_string_lossy(),
                outside_ungranted.to_string_lossy(),
                explicit_file.to_string_lossy(),
            ],
        )
        .unwrap();
        conn.execute(
            "UPDATE tracks SET explicit_path_authorized = 1 WHERE id = 'z-explicit'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE tracks SET quick_hash = 'old-version', quick_hash_version = 0 WHERE id = 'stale'",
            [],
        )
        .unwrap();
        for index in 0..101 {
            conn.execute(
                "INSERT INTO tracks (id, title, file_path, source)
                 VALUES (?1, ?1, ?2, 'local')",
                params![
                    format!("batch-{index:03}"),
                    root.join(format!("missing-{index:03}.wav"))
                        .to_string_lossy(),
                ],
            )
            .unwrap();
        }

        let first = backfill_quick_identity_batch(&conn, None).unwrap();
        assert_eq!(first.examined_count, MAX_QUICK_IDENTITY_BACKFILL_BATCH);
        assert_eq!(first.updated_count, 1);
        assert_eq!(first.skipped_count, 99);
        assert_eq!(first.remaining_count, 6);
        assert!(first.next_cursor.is_some());

        let second = backfill_quick_identity_batch(&conn, first.next_cursor.as_deref()).unwrap();
        assert_eq!(second.examined_count, 6);
        assert_eq!(second.updated_count, 2);
        assert_eq!(second.skipped_count, 4);
        assert_eq!(second.remaining_count, 0);
        assert_eq!(second.next_cursor, None);

        let summary: (Option<String>, Option<i64>, String, i64) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version, file_path, explicit_path_authorized
                 FROM tracks WHERE id = 'stale'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(summary.1, Some(QUICK_HASH_VERSION));
        assert_eq!(summary.2, stale.to_string_lossy());
        assert_eq!(summary.3, 0, "补建不得扩展文件授权");
        assert!(summary.0.is_some());

        let explicit_summary: (Option<String>, Option<i64>, String, i64) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version, file_path, explicit_path_authorized
                 FROM tracks WHERE id = 'z-explicit'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(explicit_summary.1, Some(QUICK_HASH_VERSION));
        assert_eq!(explicit_summary.2, explicit_file.to_string_lossy());
        assert_eq!(explicit_summary.3, 1, "补建只复用既有单文件授权");
        assert!(explicit_summary.0.is_some());

        let ungranted_summary: (Option<String>, Option<i64>, i64) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version, explicit_path_authorized
                 FROM tracks WHERE id = 'x-ungranted'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(ungranted_summary, (None, None, 0));

        let untouched: (Option<String>, Option<i64>) = conn
            .query_row(
                "SELECT quick_hash, quick_hash_version FROM tracks WHERE id = 'b-missing'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(untouched, (None, None));

        drop(conn);
        std::fs::remove_file(outside_ungranted).unwrap();
        std::fs::remove_file(explicit_file).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_candidates_require_matching_quick_identity_and_flag_ambiguity() {
        let conn = memory_db();
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ome-library-move-candidates-{}-{unique}",
            std::process::id()
        ));
        let old_root = root.join("old");
        let new_root = root.join("new");
        std::fs::create_dir_all(&old_root).unwrap();
        std::fs::create_dir_all(&new_root).unwrap();
        let missing_path = old_root.join("song.mp3");
        let candidate_a = root.join("single-file-candidate.wav");
        let candidate_b = new_root.join("song-copy.mp3");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&candidate_a, b"same candidate sample").unwrap();
        std::fs::write(&candidate_b, b"same candidate sample").unwrap();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES (?1), (?2)",
            params![old_root.to_string_lossy(), new_root.to_string_lossy()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO artists (id, name) VALUES ('move-artist', '测试艺人')",
            [],
        )
        .unwrap();
        let matching_hash = quick_file_hash_with_authorization(&conn, &candidate_a, true).unwrap();
        conn.execute(
            "INSERT INTO tracks (id, title, artist_id, duration_seconds, file_path, source, quick_hash, quick_hash_version)
             VALUES ('move-old', '夜航', 'move-artist', 240, ?1, 'local', ?2, ?3),
                    ('move-new-a', '夜航', 'move-artist', 241, ?4, 'local', ?2, ?3),
                    ('move-new-b', '夜航', 'move-artist', 240, ?5, 'local', ?2, ?3),
                    ('move-no-hash', '夜航', 'move-artist', 240, ?6, 'local', NULL, NULL)",
            params![
                missing_path.to_string_lossy(),
                matching_hash,
                QUICK_HASH_VERSION,
                candidate_a.to_string_lossy(),
                candidate_b.to_string_lossy(),
                new_root.join("no-hash.mp3").to_string_lossy(),
            ],
        )
        .unwrap();
        conn.execute(
            "UPDATE tracks SET explicit_path_authorized = 1 WHERE id = 'move-new-a'",
            [],
        )
        .unwrap();

        assert_eq!(list_unavailable_local_tracks(&conn).unwrap().len(), 2);
        assert!(quick_file_hash(&conn, &candidate_a).is_none());
        assert_eq!(
            quick_file_hash_with_authorization(&conn, &candidate_a, true).as_deref(),
            Some(matching_hash.as_str())
        );
        let candidates = list_library_move_candidates(&conn).unwrap();
        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().all(|candidate| candidate.ambiguous));
        assert!(candidates
            .iter()
            .all(|candidate| candidate.confidence == "low"));
        assert!(candidates.iter().all(|candidate| {
            candidate.missing_track_id == "move-old"
                && candidate
                    .reasons
                    .iter()
                    .any(|reason| reason.contains("快速摘要"))
        }));
        let indexed_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(indexed_count, 4, "候选检查不得修改曲库");

        conn.execute("DELETE FROM tracks WHERE id = 'move-new-b'", [])
            .unwrap();
        let unique_candidate = list_library_move_candidates(&conn).unwrap();
        assert_eq!(unique_candidate.len(), 1);
        assert!(!unique_candidate[0].ambiguous);

        std::fs::write(&candidate_a, b"changed since last scan").unwrap();
        assert!(list_library_move_candidates(&conn).unwrap().is_empty());

        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }
}
