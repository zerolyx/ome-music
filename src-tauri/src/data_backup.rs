use crate::{db, library, AppState};
use rusqlite::{Connection, DatabaseName, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::Read;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const BACKUP_FORMAT: &str = "ome-data-backup";
const BACKUP_VERSION: u32 = 1;
// 支持的最高库结构版本 = 迁移脚本总数。
// 历史上这里手写成常量，迁移 016/017 加入后漏更新，导致导出/恢复全部被拒（见 DECISIONS/交接记录）。
// 直接取自 db.rs 的 MIGRATIONS，保证两者永不脱节。
const CURRENT_SCHEMA_VERSION: i64 = crate::db::MIGRATIONS.len() as i64;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024;
const MAX_PREFERENCES_BYTES: u64 = 64 * 1024;
const MAX_QUEUE_BYTES: u64 = 256 * 1024;
const MAX_QUEUE_TRACKS: usize = 100;
const MAX_DATABASE_BYTES: u64 = 1024 * 1024 * 1024;
const RECOVERY_ROOT_NAME: &str = "ome-restore-points";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupManifest {
    format: String,
    version: u32,
    exported_at: String,
    app_version: String,
    schema_version: i64,
    track_count: u64,
    playlist_count: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    backup_id: String,
    folder_name: String,
    exported_at: String,
    app_version: String,
    schema_version: i64,
    track_count: u64,
    playlist_count: u64,
    database_bytes: u64,
    has_queue_session: bool,
    preferences_json: String,
    queue_session_json: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataRestoreResult {
    preferences_json: String,
    queue_session_json: Option<String>,
    restored_tracks: u64,
    restored_playlists: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataBackupResult {
    folder_name: String,
    track_count: u64,
    playlist_count: u64,
    has_queue_session: bool,
}

struct CreatedDirectory(PathBuf);

impl CreatedDirectory {
    fn disarm(self) -> PathBuf {
        let path = self.0.clone();
        std::mem::forget(self);
        path
    }
}

impl Drop for CreatedDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn now_stamp() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    Ok(format!("{nanos:020}"))
}

fn write_synced(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    file.write_all(contents)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

fn read_bounded_file(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("备份中的文件类型无效".into());
    }
    if metadata.len() > max_bytes {
        return Err("备份文件超过允许大小".into());
    }
    fs::read(path).map_err(|error| error.to_string())
}

fn exact_keys(value: &Value, expected: &[&str]) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}

const PREFERENCE_KEYS: &[&str] = &[
    "format",
    "version",
    "exportedAt",
    "appVersion",
    "preferences",
    "theme",
    "choice",
    "customColors",
    "bg",
    "surface",
    "text",
    "accent",
    "accentMode",
    "playback",
    "radioEnabled",
    "fadeEnabled",
    "sound",
    "eqEnabled",
    "eqPreset",
    "eqGains",
    "eqPreampDb",
    "replayGainEnabled",
    "replayGainMode",
    "replayGainPreventClipping",
    "replayGainPreampDb",
    "channelTools",
    "channelToolsPresets",
    "channelToolsComparison",
    "enabled",
    "balance",
    "leftGainDb",
    "rightGainDb",
    "bandGains",
    "low",
    "mid",
    "high",
    "leftDelayMs",
    "rightDelayMs",
    "swapLeftRight",
    "monoMode",
    "invertLeft",
    "invertRight",
    "constantPower",
    "id",
    "name",
    "settings",
    "A",
    "B",
    "visual",
    "danmakuEnabled",
    "visualizerMode",
    "visualizerPalette",
    "stageEffect",
    "stageFontScale",
    "lyrics",
    "subtitleMode",
    "backfillThreshold",
];

fn validate_preference_keys(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                if !PREFERENCE_KEYS.contains(&key.as_str()) {
                    return Err("偏好文件包含不支持的字段".into());
                }
                validate_preference_keys(child)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                validate_preference_keys(child)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_preferences_json(raw: &str) -> Result<(), String> {
    if raw.len() as u64 > MAX_PREFERENCES_BYTES {
        return Err("偏好文件超过允许大小".into());
    }
    let value: Value = serde_json::from_str(raw).map_err(|_| "偏好文件不是有效 JSON")?;
    if !exact_keys(
        &value,
        &[
            "format",
            "version",
            "exportedAt",
            "appVersion",
            "preferences",
        ],
    ) || value.get("format").and_then(Value::as_str) != Some("ome-preferences")
        || !matches!(value.get("version").and_then(Value::as_i64), Some(1..=5))
        || value.get("exportedAt").and_then(Value::as_str).is_none()
        || value.get("appVersion").and_then(Value::as_str).is_none()
        || !exact_keys(
            &value["preferences"],
            &["theme", "playback", "sound", "visual", "lyrics"],
        )
    {
        return Err("偏好文件格式或版本不受支持".into());
    }
    validate_preference_keys(&value)
}

fn validate_queue_session_json(raw: &str) -> Result<(), String> {
    if raw.len() as u64 > MAX_QUEUE_BYTES {
        return Err("队列快照超过允许大小".into());
    }
    let value: Value = serde_json::from_str(raw).map_err(|_| "队列快照不是有效 JSON")?;
    if !exact_keys(&value, &["version", "currentIndex", "tracks"])
        || value.get("version").and_then(Value::as_i64) != Some(1)
    {
        return Err("队列快照格式不受支持".into());
    }
    let tracks = value
        .get("tracks")
        .and_then(Value::as_array)
        .ok_or("队列快照曲目列表无效")?;
    if tracks.is_empty() || tracks.len() > MAX_QUEUE_TRACKS {
        return Err("队列快照曲目数量无效".into());
    }
    let current_index = value
        .get("currentIndex")
        .and_then(Value::as_u64)
        .ok_or("队列快照播放位置无效")? as usize;
    if current_index >= tracks.len() {
        return Err("队列快照播放位置无效".into());
    }
    for track in tracks {
        let source = track.get("source").and_then(Value::as_str);
        let local = source == Some("local");
        let expected: &[&str] = if local {
            &["source", "id"]
        } else if matches!(source, Some("netease" | "bilibili")) {
            &[
                "source",
                "id",
                "sourceId",
                "title",
                "artist",
                "album",
                "durationSeconds",
            ]
        } else {
            return Err("队列快照包含不支持的音乐源".into());
        };
        if !exact_keys(track, expected)
            || !track
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| !id.is_empty() && id.len() <= 256)
        {
            return Err("队列快照曲目字段无效".into());
        }
        if !local {
            for (field, max_length) in [
                ("sourceId", 256),
                ("title", 160),
                ("artist", 120),
                ("album", 160),
            ] {
                if !track
                    .get(field)
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty() && value.len() <= max_length)
                {
                    return Err("队列快照曲目信息无效".into());
                }
            }
            if !track
                .get("durationSeconds")
                .and_then(Value::as_f64)
                .is_some_and(|duration| {
                    duration.is_finite() && (0.0..=86_400.0).contains(&duration)
                })
            {
                return Err("队列快照时长无效".into());
            }
        }
    }
    Ok(())
}

fn validate_database(path: &Path) -> Result<(i64, u64, u64), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("备份数据库文件类型无效".into());
    }
    if metadata.len() > MAX_DATABASE_BYTES {
        return Err("备份数据库超过 1 GiB，无法处理".into());
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )
    .map_err(|_| "备份数据库无法打开".to_string())?;
    let integrity: String = conn
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .map_err(|_| "备份数据库检查失败".to_string())?;
    if integrity != "ok" {
        return Err("备份数据库完整性检查未通过".into());
    }
    let mut foreign_keys = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|_| "备份数据库关系检查失败".to_string())?;
    if foreign_keys
        .exists([])
        .map_err(|_| "备份数据库关系检查失败".to_string())?
    {
        return Err("备份数据库包含无效的曲库关联".into());
    }
    let schema_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "备份数据库缺少版本信息".to_string())?;
    if !(1..=CURRENT_SCHEMA_VERSION).contains(&schema_version) {
        return Err("备份数据库版本不受支持".into());
    }
    let track_count: u64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .map_err(|_| "备份数据库缺少曲库数据".to_string())?;
    let playlist_count: u64 = conn
        .query_row("SELECT COUNT(*) FROM playlists", [], |row| row.get(0))
        .map_err(|_| "备份数据库缺少歌单数据".to_string())?;
    Ok((schema_version, track_count, playlist_count))
}

fn database_digest(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut context = md5::Context::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        context.consume(&buffer[..count]);
    }
    Ok(format!("{:x}", context.compute()))
}

fn sanitize_portable_database(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM app_config", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM authorized_music_directories", [])
        .map_err(|error| error.to_string())?;
    conn.execute("UPDATE tracks SET explicit_path_authorized = 0", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn online_backup(conn: &Connection, destination: &Path) -> Result<(), String> {
    conn.backup(DatabaseName::Main, destination, None)
        .map_err(|error| error.to_string())
}

fn validate_backup_folder(path: &Path) -> Result<(BackupPreview, PathBuf), String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "无法读取备份文件夹".to_string())?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err("备份位置必须是普通文件夹".into());
    }
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    let mut names = BTreeSet::new();
    for entry in fs::read_dir(&canonical).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let child_meta = fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
        if child_meta.file_type().is_symlink() || !child_meta.file_type().is_file() {
            return Err("备份文件夹包含不支持的文件或链接".into());
        }
        if ![
            "manifest.json",
            "library.sqlite",
            "preferences.json",
            "queue-session.json",
        ]
        .contains(&name.as_str())
            || !names.insert(name)
        {
            return Err("备份文件夹包含未知或重复文件".into());
        }
    }
    if !["manifest.json", "library.sqlite", "preferences.json"]
        .iter()
        .all(|name| names.contains(*name))
    {
        return Err("备份文件夹缺少必要文件".into());
    }
    let manifest_raw = read_bounded_file(&canonical.join("manifest.json"), MAX_MANIFEST_BYTES)?;
    let manifest: BackupManifest = serde_json::from_slice(&manifest_raw)
        .map_err(|_| "备份说明文件无效或包含未知字段".to_string())?;
    if manifest.format != BACKUP_FORMAT || manifest.version != BACKUP_VERSION {
        return Err("备份格式或版本不受支持".into());
    }
    if manifest.exported_at.len() > 64
        || manifest.app_version.trim().is_empty()
        || manifest.app_version.len() > 64
        || manifest.schema_version > CURRENT_SCHEMA_VERSION
    {
        return Err("备份说明信息无效".into());
    }
    let preferences_raw =
        read_bounded_file(&canonical.join("preferences.json"), MAX_PREFERENCES_BYTES)?;
    let preferences_json =
        String::from_utf8(preferences_raw).map_err(|_| "偏好文件编码无效".to_string())?;
    validate_preferences_json(&preferences_json)?;
    let queue_path = canonical.join("queue-session.json");
    let queue_session_json = if names.contains("queue-session.json") {
        let raw = read_bounded_file(&queue_path, MAX_QUEUE_BYTES)?;
        let raw = String::from_utf8(raw).map_err(|_| "队列快照编码无效".to_string())?;
        validate_queue_session_json(&raw)?;
        Some(raw)
    } else {
        None
    };
    let database_path = canonical.join("library.sqlite");
    let (schema_version, track_count, playlist_count) = validate_database(&database_path)?;
    if manifest.schema_version != schema_version
        || manifest.track_count != track_count
        || manifest.playlist_count != playlist_count
    {
        return Err("备份说明与数据库内容不一致".into());
    }
    let database_bytes = fs::metadata(&database_path)
        .map_err(|error| error.to_string())?
        .len();
    let folder_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Ome-Music-Backup")
        .to_string();
    let backup_id = format!("{}-{:016x}", now_stamp()?, rand::random::<u64>());
    Ok((
        BackupPreview {
            backup_id,
            folder_name,
            exported_at: manifest.exported_at,
            app_version: manifest.app_version,
            schema_version,
            track_count,
            playlist_count,
            database_bytes,
            has_queue_session: queue_session_json.is_some(),
            preferences_json,
            queue_session_json,
        },
        canonical,
    ))
}

fn selected_folder(app: &AppHandle, prompt: &str) -> Result<PathBuf, String> {
    tauri_plugin_dialog::DialogExt::dialog(app)
        .file()
        .set_title(prompt)
        .blocking_pick_folder()
        .ok_or_else(|| "已取消文件夹选择".to_string())?
        .into_path()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_data_backup_command(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences_json: String,
    queue_session_json: Option<String>,
) -> Result<DataBackupResult, String> {
    validate_preferences_json(&preferences_json)?;
    if let Some(queue) = &queue_session_json {
        validate_queue_session_json(queue)?;
    }
    let parent = selected_folder(&app, "选择备份保存位置")?;
    let parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
    if !parent.is_dir() {
        return Err("备份保存位置无效".into());
    }
    let _activity_guard = library::begin_library_database_maintenance()?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let stamp = now_stamp()?;
    let mut folder_name = format!("Ome-Music-Backup-{stamp}");
    let mut final_path = parent.join(&folder_name);
    let mut suffix = 1;
    while final_path.exists() {
        folder_name = format!("Ome-Music-Backup-{stamp}-{suffix}");
        final_path = parent.join(&folder_name);
        suffix += 1;
    }
    let stage_path = parent.join(format!(
        ".ome-music-backup-stage-{}-{stamp}",
        std::process::id()
    ));
    fs::create_dir(&stage_path).map_err(|error| error.to_string())?;
    let stage = CreatedDirectory(stage_path.clone());
    let database_path = stage_path.join("library.sqlite");
    online_backup(&conn, &database_path)?;
    {
        let portable = Connection::open(&database_path).map_err(|error| error.to_string())?;
        db::run_migrations(&portable).map_err(|error| error.to_string())?;
        sanitize_portable_database(&portable)?;
        portable
            .execute_batch("PRAGMA journal_mode=DELETE;")
            .map_err(|error| error.to_string())?;
    }
    let (schema_version, track_count, playlist_count) = validate_database(&database_path)?;
    let preferences_path = stage_path.join("preferences.json");
    write_synced(&preferences_path, preferences_json.as_bytes())?;
    if let Some(queue) = &queue_session_json {
        write_synced(&stage_path.join("queue-session.json"), queue.as_bytes())?;
    }
    let manifest = BackupManifest {
        format: BACKUP_FORMAT.into(),
        version: BACKUP_VERSION,
        exported_at: chrono_free_timestamp(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version,
        track_count,
        playlist_count,
    };
    let manifest_json = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    if manifest_json.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("备份说明文件过大".into());
    }
    write_synced(&stage_path.join("manifest.json"), &manifest_json)?;
    fs::rename(&stage_path, &final_path).map_err(|error| error.to_string())?;
    let _ = stage.disarm();
    Ok(DataBackupResult {
        folder_name,
        track_count,
        playlist_count,
        has_queue_session: queue_session_json.is_some(),
    })
}

fn chrono_free_timestamp() -> String {
    // UTC seconds are stable across locales; nanosecond precision is unnecessary in the UI.
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

#[tauri::command]
pub fn inspect_data_backup_command(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BackupPreview, String> {
    let path = selected_folder(&app, "选择 Ome Music 备份文件夹")?;
    let (preview, canonical) = validate_backup_folder(&path)?;
    let digest = database_digest(&canonical.join("library.sqlite"))?;
    *state
        .backup_selection
        .lock()
        .map_err(|error| error.to_string())? = Some((preview.backup_id.clone(), canonical, digest));
    Ok(preview)
}

fn recovery_root(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let root = data_dir.join(RECOVERY_ROOT_NAME);
    match fs::symlink_metadata(&root) {
        Ok(metadata) if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() => {
            Err("本机恢复点目录类型异常".into())
        }
        Ok(_) => Ok(root),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&root).map_err(|error| error.to_string())?;
            Ok(root)
        }
        Err(error) => Err(error.to_string()),
    }
}

fn active_restore_point_id(root: &Path) -> Result<Option<String>, String> {
    let mut markers = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("active-") {
            let metadata = fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
            if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
                return Err("本机恢复点标记无效".into());
            }
            markers.push((name, entry.path()));
        }
    }
    markers.sort_by(|left, right| left.0.cmp(&right.0));
    let Some((_, path)) = markers.pop() else {
        return Ok(None);
    };
    let id = String::from_utf8(read_bounded_file(&path, 64)?)
        .map_err(|_| "本机恢复点标记无效".to_string())?;
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("本机恢复点标记无效".into());
    }
    Ok(Some(id))
}

fn recovery_point_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("本机恢复点标记无效".into());
    }
    let path = root.join(format!("point-{id}"));
    let metadata = fs::symlink_metadata(&path).map_err(|_| "本机恢复点数据缺失".to_string())?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err("本机恢复点目录无效".into());
    }
    Ok(path)
}

fn prepare_restore_point(
    root: &Path,
    conn: &Connection,
    preferences_json: &str,
    queue_session_json: Option<&str>,
) -> Result<String, String> {
    validate_preferences_json(preferences_json)?;
    if let Some(queue) = queue_session_json {
        validate_queue_session_json(queue)?;
    }
    let id = now_stamp()?;
    let path = root.join(format!("point-{id}"));
    fs::create_dir(&path).map_err(|error| error.to_string())?;
    let created = CreatedDirectory(path.clone());
    online_backup(conn, &path.join("library.sqlite"))?;
    write_synced(&path.join("preferences.json"), preferences_json.as_bytes())?;
    if let Some(queue) = queue_session_json {
        write_synced(&path.join("queue-session.json"), queue.as_bytes())?;
    }
    let marker_path = root.join(format!("active-{id}"));
    if let Err(error) = write_synced(&marker_path, id.as_bytes()) {
        let _ = fs::remove_file(&marker_path);
        return Err(error);
    }
    let _ = created.disarm();
    Ok(id)
}

fn restore_database(conn: &mut Connection, path: &Path) -> Result<(), String> {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    conn.restore(
        DatabaseName::Main,
        path,
        None::<fn(rusqlite::backup::Progress)>,
    )
    .map_err(|error| error.to_string())?;
    db::run_migrations(conn).map_err(|error| error.to_string())?;
    let integrity: String = conn
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if integrity != "ok" {
        return Err("恢复后的曲库完整性检查未通过".into());
    }
    Ok(())
}

fn preserve_current_device_settings(
    current: &Connection,
    imported: &Connection,
) -> Result<(), String> {
    let mut config = Vec::new();
    {
        let mut statement = current
            .prepare("SELECT key, value FROM app_config")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            config.push(row.map_err(|error| error.to_string())?);
        }
    }
    for (key, value) in config {
        imported
            .execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES (?1, ?2)",
                [&key, &value],
            )
            .map_err(|error| error.to_string())?;
    }

    let mut directories = Vec::new();
    {
        let mut statement = current
            .prepare("SELECT directory_path FROM authorized_music_directories")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        for row in rows {
            let path = PathBuf::from(row.map_err(|error| error.to_string())?);
            if fs::symlink_metadata(&path).is_ok_and(|metadata| {
                metadata.file_type().is_dir() && !metadata.file_type().is_symlink()
            }) {
                directories.push(path.to_string_lossy().into_owned());
            }
        }
    }
    for directory in directories {
        imported
            .execute(
                "INSERT OR IGNORE INTO authorized_music_directories (directory_path) VALUES (?1)",
                [&directory],
            )
            .map_err(|error| error.to_string())?;
    }

    let mut explicit_files = Vec::new();
    {
        let mut statement = current
            .prepare("SELECT id, file_path FROM tracks WHERE explicit_path_authorized = 1")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let (id, path) = row.map_err(|error| error.to_string())?;
            if fs::symlink_metadata(&path).is_ok_and(|metadata| {
                metadata.file_type().is_file() && !metadata.file_type().is_symlink()
            }) {
                explicit_files.push((id, path));
            }
        }
    }
    for (id, path) in explicit_files {
        imported
            .execute(
                "UPDATE tracks SET explicit_path_authorized = 1 WHERE id = ?1 AND file_path = ?2",
                [&id, &path],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn validate_recovery_point(path: &Path) -> Result<(String, Option<String>), String> {
    let db_path = path.join("library.sqlite");
    let _ = validate_database(&db_path)?;
    let preferences = String::from_utf8(read_bounded_file(
        &path.join("preferences.json"),
        MAX_PREFERENCES_BYTES,
    )?)
    .map_err(|_| "本机恢复点偏好编码无效".to_string())?;
    validate_preferences_json(&preferences)?;
    let queue_path = path.join("queue-session.json");
    let queue = match fs::symlink_metadata(&queue_path) {
        Ok(_) => {
            let raw = String::from_utf8(read_bounded_file(&queue_path, MAX_QUEUE_BYTES)?)
                .map_err(|_| "本机恢复点队列编码无效".to_string())?;
            validate_queue_session_json(&raw)?;
            Some(raw)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    Ok((preferences, queue))
}

fn prune_recovery_points(root: &Path, keep_id: &str) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(id) = name.strip_prefix("active-") {
            if id != keep_id {
                let _ = fs::remove_file(entry.path());
            }
        } else if let Some(id) = name.strip_prefix("point-") {
            if id != keep_id {
                let metadata = fs::symlink_metadata(entry.path());
                if metadata
                    .is_ok_and(|meta| meta.file_type().is_dir() && !meta.file_type().is_symlink())
                {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
    }
}

#[tauri::command]
pub fn restore_data_backup_command(
    app: AppHandle,
    state: State<'_, AppState>,
    backup_id: String,
    expected_preferences_json: String,
    expected_queue_session_json: Option<String>,
    current_preferences_json: String,
    current_queue_session_json: Option<String>,
) -> Result<DataRestoreResult, String> {
    let selected = state
        .backup_selection
        .lock()
        .map_err(|error| error.to_string())?
        .take()
        .filter(|(selected_id, _, _)| selected_id == &backup_id)
        .ok_or("请重新选择并检查要恢复的备份")?;
    let backup_path = selected.1;
    let inspected_database_digest = selected.2;
    let (preview, _) = validate_backup_folder(&backup_path)?;
    if preview.preferences_json != expected_preferences_json
        || preview.queue_session_json != expected_queue_session_json
        || database_digest(&backup_path.join("library.sqlite"))? != inspected_database_digest
    {
        return Err("备份内容在预览后发生变化，请重新选择并检查".into());
    }
    let _activity_guard = library::begin_library_database_maintenance()?;
    let root = recovery_root(&app)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    let imported_stage_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(format!(".ome-import-stage-{}", now_stamp()?));
    fs::create_dir(&imported_stage_path).map_err(|error| error.to_string())?;
    let imported_stage = CreatedDirectory(imported_stage_path.clone());
    let imported_path = imported_stage_path.join("library.sqlite");
    let recovery_id = prepare_restore_point(
        &root,
        &conn,
        &current_preferences_json,
        current_queue_session_json.as_deref(),
    )?;
    let recovery_path = recovery_point_path(&root, &recovery_id)?;
    let import_result = (|| -> Result<(), String> {
        fs::copy(backup_path.join("library.sqlite"), &imported_path)
            .map_err(|error| error.to_string())?;
        if database_digest(&imported_path)? != inspected_database_digest {
            return Err("备份数据库在检查后发生变化，请重新选择并检查".into());
        }
        let (schema_version, track_count, playlist_count) = validate_database(&imported_path)?;
        if schema_version != preview.schema_version
            || track_count != preview.track_count
            || playlist_count != preview.playlist_count
        {
            return Err("备份数据库内容与预览不一致".into());
        }
        {
            let imported = Connection::open(&imported_path).map_err(|error| error.to_string())?;
            db::run_migrations(&imported).map_err(|error| error.to_string())?;
            sanitize_portable_database(&imported)?;
            preserve_current_device_settings(&conn, &imported)?;
            imported
                .execute_batch("PRAGMA journal_mode=DELETE;")
                .map_err(|error| error.to_string())?;
        }
        let _ = validate_database(&imported_path)?;
        restore_database(&mut conn, &imported_path)
    })();
    drop(imported_stage);
    if let Err(error) = import_result {
        let rollback = restore_database(&mut conn, &recovery_path.join("library.sqlite"));
        return match rollback {
            Ok(()) => {
                let _ = fs::remove_file(root.join(format!("active-{recovery_id}")));
                let _ = fs::remove_dir_all(&recovery_path);
                Err(format!("恢复未完成，已还原本机曲库：{error}"))
            }
            Err(rollback_error) => Err(format!(
                "恢复失败：{error}；本机回退也未完成：{rollback_error}"
            )),
        };
    }
    prune_recovery_points(&root, &recovery_id);
    Ok(DataRestoreResult {
        preferences_json: preview.preferences_json,
        queue_session_json: preview.queue_session_json,
        restored_tracks: preview.track_count,
        restored_playlists: preview.playlist_count,
    })
}

#[tauri::command]
pub fn has_last_restore_point_command(app: AppHandle) -> Result<bool, String> {
    let root = recovery_root(&app)?;
    let Some(id) = active_restore_point_id(&root)? else {
        return Ok(false);
    };
    let path = recovery_point_path(&root, &id)?;
    validate_recovery_point(&path)?;
    Ok(true)
}

#[tauri::command]
pub fn restore_last_import_command(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DataRestoreResult, String> {
    let _activity_guard = library::begin_library_database_maintenance()?;
    let root = recovery_root(&app)?;
    let id = active_restore_point_id(&root)?.ok_or("没有可撤销的数据恢复点")?;
    let path = recovery_point_path(&root, &id)?;
    let (preferences_json, queue_session_json) = validate_recovery_point(&path)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    restore_database(&mut conn, &path.join("library.sqlite"))?;
    let (_, track_count, playlist_count) = validate_database(&path.join("library.sqlite"))?;
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == format!("active-{id}") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let _ = fs::remove_dir_all(&path);
    Ok(DataRestoreResult {
        preferences_json,
        queue_session_json,
        restored_tracks: track_count,
        restored_playlists: playlist_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_PREFERENCES: &str = r#"{"format":"ome-preferences","version":5,"exportedAt":"2026-09-26T00:00:00Z","appVersion":"0.7.0","preferences":{"theme":{},"playback":{},"sound":{},"visual":{},"lyrics":{}}}"#;

    #[test]
    fn preference_file_rejects_sensitive_or_unknown_keys() {
        assert!(validate_preferences_json(VALID_PREFERENCES).is_ok());
        let with_secret =
            VALID_PREFERENCES.replace("\"theme\":{}", "\"theme\":{\"apiKey\":\"secret\"}");
        assert!(validate_preferences_json(&with_secret).is_err());
    }

    #[test]
    fn queue_file_requires_local_ids_or_bounded_remote_metadata() {
        let queue =
            r#"{"version":1,"currentIndex":0,"tracks":[{"source":"local","id":"local-1"}]}"#;
        assert!(validate_queue_session_json(queue).is_ok());
        let with_path = queue.replace(
            "\"id\":\"local-1\"",
            "\"id\":\"local-1\",\"filePath\":\"C:/music/a.flac\"",
        );
        assert!(validate_queue_session_json(&with_path).is_err());
    }

    #[test]
    fn portable_database_drops_credentials_and_folder_authorizations() {
        let conn = Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO app_config (key, value) VALUES ('api_key', 'private')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO authorized_music_directories (directory_path) VALUES ('C:/private/music')",
            [],
        )
        .unwrap();
        sanitize_portable_database(&conn).unwrap();
        let config_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM app_config", [], |row| row.get(0))
            .unwrap();
        let grant_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM authorized_music_directories",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(config_count, 0);
        assert_eq!(grant_count, 0);
    }

    #[test]
    fn restore_keeps_only_current_device_credentials_and_existing_grants() {
        let temp_path =
            std::env::temp_dir().join(format!("ome-grant-test-{}", now_stamp().unwrap()));
        fs::create_dir(&temp_path).unwrap();
        let _cleanup = CreatedDirectory(temp_path.clone());
        let audio_path = temp_path.join("authorized-track.flac");
        write_synced(&audio_path, b"test audio placeholder").unwrap();

        let current = Connection::open_in_memory().unwrap();
        db::run_migrations(&current).unwrap();
        current
            .execute(
                "INSERT INTO app_config (key, value) VALUES ('api_key', 'current-secret')",
                [],
            )
            .unwrap();
        current
            .execute(
                "INSERT INTO authorized_music_directories (directory_path) VALUES (?1)",
                [temp_path.to_string_lossy().as_ref()],
            )
            .unwrap();
        current
            .execute(
                "INSERT INTO tracks (id, title, file_path, explicit_path_authorized) VALUES ('local-1', 'Test', ?1, 1)",
                [audio_path.to_string_lossy().as_ref()],
            )
            .unwrap();

        let imported = Connection::open_in_memory().unwrap();
        db::run_migrations(&imported).unwrap();
        imported
            .execute(
                "INSERT INTO app_config (key, value) VALUES ('api_key', 'backup-secret')",
                [],
            )
            .unwrap();
        imported
            .execute(
                "INSERT INTO authorized_music_directories (directory_path) VALUES ('C:/backup/grant')",
                [],
            )
            .unwrap();
        imported
            .execute(
                "INSERT INTO tracks (id, title, file_path, explicit_path_authorized) VALUES ('local-1', 'Test', ?1, 1)",
                [audio_path.to_string_lossy().as_ref()],
            )
            .unwrap();

        sanitize_portable_database(&imported).unwrap();
        preserve_current_device_settings(&current, &imported).unwrap();
        let api_key: String = imported
            .query_row(
                "SELECT value FROM app_config WHERE key = 'api_key'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let grant_count: i64 = imported
            .query_row(
                "SELECT COUNT(*) FROM authorized_music_directories WHERE directory_path = ?1",
                [temp_path.to_string_lossy().as_ref()],
                |row| row.get(0),
            )
            .unwrap();
        let backup_grant_count: i64 = imported
            .query_row(
                "SELECT COUNT(*) FROM authorized_music_directories WHERE directory_path = 'C:/backup/grant'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let explicit_file_grant: i64 = imported
            .query_row(
                "SELECT explicit_path_authorized FROM tracks WHERE id = 'local-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(api_key, "current-secret");
        assert_eq!(grant_count, 1);
        assert_eq!(backup_grant_count, 0);
        assert_eq!(explicit_file_grant, 1);
    }

    #[test]
    fn online_database_backup_roundtrips_and_rejects_unexpected_files() {
        let path = std::env::temp_dir().join(format!("ome-backup-test-{}", now_stamp().unwrap()));
        fs::create_dir(&path).unwrap();
        let _cleanup = CreatedDirectory(path.clone());
        let source = Connection::open_in_memory().unwrap();
        db::run_migrations(&source).unwrap();
        online_backup(&source, &path.join("library.sqlite")).unwrap();
        let copied = Connection::open(path.join("library.sqlite")).unwrap();
        sanitize_portable_database(&copied).unwrap();
        drop(copied);
        let (schema_version, track_count, playlist_count) =
            validate_database(&path.join("library.sqlite")).unwrap();
        let preferences = VALID_PREFERENCES.as_bytes();
        write_synced(&path.join("preferences.json"), preferences).unwrap();
        let manifest = BackupManifest {
            format: BACKUP_FORMAT.into(),
            version: BACKUP_VERSION,
            exported_at: "1790380800".into(),
            app_version: "0.7.0".into(),
            schema_version,
            track_count,
            playlist_count,
        };
        write_synced(
            &path.join("manifest.json"),
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        let (preview, _) = validate_backup_folder(&path).unwrap();
        assert_eq!(preview.track_count, 0);
        assert_eq!(preview.playlist_count, 0);

        write_synced(&path.join("unexpected.txt"), b"not part of the format").unwrap();
        assert!(validate_backup_folder(&path).is_err());
    }
}
