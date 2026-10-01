//! Read-only SMB library sessions. Server paths and credentials stay in memory
//! and are exposed to the webview only through opaque, session-scoped IDs.

use rand::random;
use serde::Serialize;
use smb::{
    connection::EncryptionMode, Client, ClientConfig, ConnectionConfig, FileAccessMask,
    FileAttributes, FileCreateArgs, FileDirectoryInformation, GetLen, ReadAt, Resource, UncPath,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const MAX_HOST_BYTES: usize = 253;
const MAX_SHARE_BYTES: usize = 80;
const MAX_USERNAME_BYTES: usize = 256;
const MAX_PASSWORD_BYTES: usize = 1024;
const MAX_PATH_SEGMENTS: usize = 32;
const MAX_NAME_CHARS: usize = 255;
const MAX_DIRECTORY_ITEMS: usize = 500;
const MAX_SESSION_ITEMS: usize = 20_000;
const MAX_STREAM_CHUNK_BYTES: u64 = 4 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_DIRECTORY_DURATION: Duration = Duration::from_secs(30);
const MAX_STREAM_DURATION: Duration = Duration::from_secs(30);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbStatus {
    pub connected: bool,
    pub server_label: Option<String>,
    pub root_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbBreadcrumbDto {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbEntryDto {
    pub id: String,
    pub name: String,
    pub is_directory: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbDirectoryDto {
    pub breadcrumbs: Vec<SmbBreadcrumbDto>,
    pub entries: Vec<SmbEntryDto>,
}

pub(crate) struct SmbStreamChunk {
    pub body: Vec<u8>,
    pub content_type: &'static str,
    pub content_range: String,
}

#[derive(Clone)]
struct ItemRef {
    path: Vec<String>,
    is_directory: bool,
    size_bytes: Option<u64>,
}

pub(crate) struct SmbSession {
    client: Client,
    root: UncPath,
    server_label: String,
    root_label: String,
    generation: u64,
    root_id: String,
    directory_ids: HashMap<Vec<String>, String>,
    items: HashMap<String, ItemRef>,
}

impl Drop for SmbSession {
    fn drop(&mut self) {
        self.items.clear();
        self.directory_ids.clear();
        let _ = self.client.close();
    }
}

impl SmbSession {
    fn connect(
        host: &str,
        share: &str,
        sub_path: &str,
        username: &str,
        password: String,
        generation: u64,
    ) -> Result<Self, String> {
        let host = validate_host(host)?;
        let share = validate_share(share)?;
        let base_segments = validate_relative_path(sub_path)?;
        let (username, password) = validate_credentials(username, password)?;
        let mut root = UncPath::new(&host)
            .and_then(|path| path.with_share(&share))
            .map_err(|_| "SMB 主机或共享名无效".to_string())?;
        if !base_segments.is_empty() {
            root = root.with_path(&base_segments.join("\\"));
        }

        let config = ClientConfig {
            dfs: false,
            connection: ConnectionConfig {
                port: Some(445),
                timeout: Some(IO_TIMEOUT),
                encryption_mode: EncryptionMode::Allowed,
                ..ConnectionConfig::default()
            },
            ..ClientConfig::default()
        };
        let client = Client::new(config);
        client
            .share_connect(&root, &username, password)
            .map_err(|_| "无法连接 SMB 共享，请检查主机、共享名、账号密码与网络".to_string())?;

        let root_id = new_item_id();
        let root_label = if base_segments.is_empty() {
            share.clone()
        } else {
            format!("{share}/{}", base_segments.join("/"))
        };
        let mut directory_ids = HashMap::new();
        directory_ids.insert(Vec::new(), root_id.clone());
        let mut items = HashMap::new();
        items.insert(
            root_id.clone(),
            ItemRef {
                path: Vec::new(),
                is_directory: true,
                size_bytes: None,
            },
        );

        Ok(Self {
            client,
            root,
            server_label: host,
            root_label,
            generation,
            root_id,
            directory_ids,
            items,
        })
    }

    fn status(&self, active_generation: u64) -> SmbStatus {
        let connected = self.generation == active_generation;
        SmbStatus {
            connected,
            server_label: connected.then(|| self.server_label.clone()),
            root_id: connected.then(|| self.root_id.clone()),
        }
    }

    fn list_directory(
        &mut self,
        directory_id: Option<&str>,
        active_generation: &AtomicU64,
    ) -> Result<SmbDirectoryDto, String> {
        self.ensure_active(active_generation)?;
        let directory_id = directory_id.unwrap_or(&self.root_id);
        let item = self
            .items
            .get(directory_id)
            .filter(|item| item.is_directory)
            .cloned()
            .ok_or_else(|| "这个 SMB 目录已失效，请返回曲库根目录".to_string())?;
        let path = self.resolve_path(&item.path)?;
        let deadline = Instant::now() + MAX_DIRECTORY_DURATION;
        let resource = self
            .client
            .create_file(
                &path,
                &FileCreateArgs::make_open_existing(FileAccessMask::new().with_generic_read(true)),
            )
            .map_err(|_| "无法读取 SMB 目录".to_string())?;
        let directory = match resource {
            Resource::Directory(directory) => directory,
            Resource::File(file) => {
                let _ = file.close();
                return Err("SMB 项目不再是目录".to_string());
            }
            Resource::Pipe(pipe) => {
                let _ = pipe.close();
                return Err("SMB 项目不是可浏览的目录".to_string());
            }
        };

        let raw_result = (|| {
            let iterator = directory
                .query::<FileDirectoryInformation>("*")
                .map_err(|_| "无法读取 SMB 目录".to_string())?;
            let mut output = Vec::new();
            let mut count = 0usize;
            for result in iterator {
                self.ensure_active(active_generation)?;
                if Instant::now() >= deadline {
                    return Err("读取 SMB 目录超时，请刷新后重试".to_string());
                }
                count += 1;
                if count > MAX_DIRECTORY_ITEMS {
                    return Err("SMB 目录超过 500 项，请缩小服务器端目录范围".to_string());
                }
                let entry = result.map_err(|_| "SMB 目录响应无效".to_string())?;
                let raw_name = entry.file_name.to_string();
                if !browsable_entry(&raw_name, &entry.file_attributes) {
                    continue;
                }
                let display_name = clean_name(&raw_name);
                if display_name.is_empty() {
                    continue;
                }
                let is_directory = entry.file_attributes.directory();
                if is_directory && item.path.len() >= MAX_PATH_SEGMENTS {
                    continue;
                }
                let size_bytes = (!is_directory).then_some(entry.end_of_file);
                if !is_directory && audio_content_type(&raw_name).is_none() {
                    continue;
                }
                output.push((raw_name, display_name, is_directory, size_bytes));
            }
            Ok(output)
        })();
        let close_result = directory.close();
        let mut entries = raw_result?;
        close_result.map_err(|_| "SMB 目录句柄无法关闭".to_string())?;
        if Instant::now() >= deadline {
            return Err("读取 SMB 目录超时，请刷新后重试".to_string());
        }
        self.ensure_active(active_generation)?;

        entries.sort_by(|left, right| {
            right
                .2
                .cmp(&left.2)
                .then_with(|| left.1.to_lowercase().cmp(&right.1.to_lowercase()))
        });
        if self.items.len().saturating_add(entries.len()) > MAX_SESSION_ITEMS {
            return Err("本次连接浏览项目过多，请重新连接以清理临时映射".to_string());
        }

        let mut result_entries = Vec::with_capacity(entries.len());
        for (remote_name, display_name, is_directory, size_bytes) in entries {
            let mut relative_path = item.path.clone();
            relative_path.push(remote_name);
            let id = new_item_id();
            if is_directory {
                self.directory_ids.insert(relative_path.clone(), id.clone());
            }
            self.items.insert(
                id.clone(),
                ItemRef {
                    path: relative_path,
                    is_directory,
                    size_bytes,
                },
            );
            result_entries.push(SmbEntryDto {
                id,
                name: display_name,
                is_directory,
                size_bytes,
            });
        }

        let mut breadcrumbs = vec![SmbBreadcrumbDto {
            id: self.root_id.clone(),
            name: self.root_label.clone(),
        }];
        for depth in 1..=item.path.len() {
            let path = item.path[..depth].to_vec();
            let id = self
                .directory_ids
                .get(&path)
                .ok_or_else(|| "SMB 目录路径已失效，请返回根目录".to_string())?;
            breadcrumbs.push(SmbBreadcrumbDto {
                id: id.clone(),
                name: clean_name(&path[depth - 1]),
            });
        }
        Ok(SmbDirectoryDto {
            breadcrumbs,
            entries: result_entries,
        })
    }

    pub(crate) fn stream_chunk(
        &mut self,
        item_id: &str,
        range: Option<&str>,
        active_generation: &AtomicU64,
    ) -> Result<SmbStreamChunk, String> {
        self.ensure_active(active_generation)?;
        let item = self
            .items
            .get(item_id)
            .filter(|item| !item.is_directory)
            .cloned()
            .ok_or_else(|| "SMB 曲目标识已失效，请重新打开目录".to_string())?;
        let path = self.resolve_path(&item.path)?;
        let expected_size = item
            .size_bytes
            .ok_or_else(|| "SMB 曲目长度无效".to_string())?;
        let content_type = item
            .path
            .last()
            .and_then(|name| audio_content_type(name))
            .ok_or_else(|| "SMB 文件类型不受支持".to_string())?;
        let (start, end) = bounded_range(range, expected_size)?;
        let deadline = Instant::now() + MAX_STREAM_DURATION;
        let resource = self
            .client
            .create_file(
                &path,
                &FileCreateArgs::make_open_existing(FileAccessMask::new().with_generic_read(true)),
            )
            .map_err(|_| "SMB 音频暂时无法读取".to_string())?;
        let file = match resource {
            Resource::File(file) => file,
            Resource::Directory(directory) => {
                let _ = directory.close();
                return Err("SMB 曲目不再是音频文件".to_string());
            }
            Resource::Pipe(pipe) => {
                let _ = pipe.close();
                return Err("SMB 项目不是可播放的音频文件".to_string());
            }
        };
        let result = (|| {
            let actual_size = file.get_len().map_err(|_| "SMB 音频长度无效".to_string())?;
            if actual_size != expected_size {
                return Err("SMB 曲目在浏览后发生变化，请刷新目录".to_string());
            }
            let length =
                usize::try_from(end - start + 1).map_err(|_| "SMB 音频分段长度无效".to_string())?;
            if length == 0 || length as u64 > MAX_STREAM_CHUNK_BYTES {
                return Err("SMB 音频分段超过大小限制".to_string());
            }
            let mut body = vec![0; length];
            let mut offset = 0usize;
            while offset < body.len() {
                self.ensure_active(active_generation)?;
                if Instant::now() >= deadline {
                    return Err("读取 SMB 音频分段超时，请稍后重试".to_string());
                }
                let read = file
                    .read_at(&mut body[offset..], start + offset as u64)
                    .map_err(|_| "SMB 音频分段读取失败".to_string())?;
                if read == 0 {
                    return Err("SMB 音频分段不完整".to_string());
                }
                offset = offset.saturating_add(read);
            }
            if Instant::now() >= deadline {
                return Err("读取 SMB 音频分段超时，请稍后重试".to_string());
            }
            self.ensure_active(active_generation)?;
            Ok(SmbStreamChunk {
                body,
                content_type,
                content_range: format!("bytes {start}-{end}/{actual_size}"),
            })
        })();
        let close_result = file.close();
        let chunk = result?;
        close_result.map_err(|_| "SMB 音频句柄无法关闭".to_string())?;
        Ok(chunk)
    }

    fn ensure_active(&self, generation: &AtomicU64) -> Result<(), String> {
        if self.generation == generation.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err("SMB 连接已断开或已切换".to_string())
        }
    }

    fn resolve_path(&self, relative: &[String]) -> Result<UncPath, String> {
        if relative.len() > MAX_PATH_SEGMENTS || relative.iter().any(|part| !safe_segment(part)) {
            return Err("SMB 目录路径无效".to_string());
        }
        if relative.is_empty() {
            Ok(self.root.clone())
        } else {
            Ok(self.root.clone().with_add_path(&relative.join("\\")))
        }
    }
}

#[tauri::command]
pub async fn smb_connect(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    host: String,
    share: String,
    sub_path: Option<String>,
    username: String,
    password: String,
) -> Result<SmbStatus, String> {
    let generation = state.smb_generation.fetch_add(1, Ordering::AcqRel) + 1;
    let previous = state
        .smb_session
        .lock()
        .map_err(|_| "SMB 曲库状态暂时不可用".to_string())?
        .take();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        drop(previous);
        let session = SmbSession::connect(
            &host,
            &share,
            sub_path.as_deref().unwrap_or_default(),
            &username,
            password,
            generation,
        )?;
        let state = app
            .try_state::<crate::AppState>()
            .ok_or_else(|| "SMB 曲库状态暂时不可用".to_string())?;
        if state.smb_generation.load(Ordering::Acquire) != generation {
            drop(session);
            return Err("SMB 连接已取消".to_string());
        }
        let status = session.status(generation);
        let mut slot = state
            .smb_session
            .lock()
            .map_err(|_| "SMB 曲库状态暂时不可用".to_string())?;
        if state.smb_generation.load(Ordering::Acquire) != generation {
            drop(slot);
            drop(session);
            return Err("SMB 连接已取消".to_string());
        }
        *slot = Some(session);
        Ok(status)
    })
    .await
    .map_err(|_| "SMB 连接任务失败".to_string())?
}

#[tauri::command]
pub fn smb_status(state: State<'_, crate::AppState>) -> SmbStatus {
    state
        .smb_session
        .lock()
        .ok()
        .and_then(|session| {
            session
                .as_ref()
                .map(|session| session.status(state.smb_generation.load(Ordering::Acquire)))
        })
        .unwrap_or(SmbStatus {
            connected: false,
            server_label: None,
            root_id: None,
        })
}

#[tauri::command]
pub async fn smb_disconnect(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.smb_generation.fetch_add(1, Ordering::AcqRel);
    let session = state
        .smb_session
        .lock()
        .map_err(|_| "SMB 曲库状态暂时不可用".to_string())?
        .take();
    tauri::async_runtime::spawn_blocking(move || drop(session))
        .await
        .map_err(|_| "SMB 断开任务失败".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn smb_list_directory(
    app: AppHandle,
    directory_id: Option<String>,
) -> Result<SmbDirectoryDto, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app
            .try_state::<crate::AppState>()
            .ok_or_else(|| "SMB 曲库状态暂时不可用".to_string())?;
        let mut guard = state
            .smb_session
            .lock()
            .map_err(|_| "SMB 曲库状态暂时不可用".to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "请先连接 SMB 曲库".to_string())?;
        session.list_directory(directory_id.as_deref(), &state.smb_generation)
    })
    .await
    .map_err(|_| "SMB 目录读取任务失败".to_string())?
}

pub(crate) fn stream_chunk(
    session: &mut SmbSession,
    item_id: &str,
    range: Option<&str>,
    generation: &AtomicU64,
) -> Result<SmbStreamChunk, String> {
    session.stream_chunk(item_id, range, generation)
}

fn validate_credentials(username: &str, password: String) -> Result<(String, String), String> {
    let username = username.trim();
    if username.is_empty()
        || username.len() > MAX_USERNAME_BYTES
        || password.is_empty()
        || password.len() > MAX_PASSWORD_BYTES
        || username.chars().any(char::is_control)
        || password.chars().any(char::is_control)
    {
        return Err("SMB 用户名和密码必须完整且有效".to_string());
    }
    Ok((username.to_string(), password))
}

fn validate_host(raw: &str) -> Result<String, String> {
    let host = raw.trim();
    if host.is_empty()
        || host.len() > MAX_HOST_BYTES
        || !host.is_ascii()
        || host.starts_with('.')
        || host.ends_with('.')
        || host.contains("..")
        || !host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        || host.split('.').any(|label| {
            label.is_empty() || label.starts_with('-') || label.ends_with('-') || label.len() > 63
        })
    {
        return Err("请输入有效的 SMB 主机名或 IPv4 地址".to_string());
    }
    Ok(host.to_ascii_lowercase())
}

fn validate_share(raw: &str) -> Result<String, String> {
    let share = raw.trim();
    if share.is_empty()
        || share.len() > MAX_SHARE_BYTES
        || share == "."
        || share == ".."
        || share
            .chars()
            .any(|character| character.is_control() || matches!(character, '\\' | '/' | ':'))
    {
        return Err("请输入有效的 SMB 共享名".to_string());
    }
    Ok(share.to_string())
}

fn validate_relative_path(raw: &str) -> Result<Vec<String>, String> {
    if raw.len() > MAX_SHARE_BYTES * 4 || raw.chars().any(char::is_control) {
        return Err("SMB 子目录路径无效".to_string());
    }
    let value = raw.trim();
    if value.starts_with(['\\', '/']) || value.contains(':') {
        return Err("SMB 子目录必须位于共享根目录内".to_string());
    }
    let segments = value
        .split(['\\', '/'])
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if segments.len() > MAX_PATH_SEGMENTS
        || segments
            .iter()
            .any(|segment| !safe_segment(segment) || matches!(segment.as_str(), "." | ".."))
    {
        return Err("SMB 子目录必须位于共享根目录内".to_string());
    }
    Ok(segments)
}

fn safe_segment(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 1024
        && !matches!(name, "." | "..")
        && !name
            .chars()
            .any(|character| character.is_control() || matches!(character, '\\' | '/' | ':'))
}

fn browsable_entry(name: &str, attributes: &FileAttributes) -> bool {
    safe_segment(name) && !attributes.reparse_point()
}

fn clean_name(name: &str) -> String {
    name.chars()
        .filter(|character| !character.is_control())
        .take(MAX_NAME_CHARS)
        .collect::<String>()
        .trim()
        .to_string()
}

fn audio_content_type(name: &str) -> Option<&'static str> {
    let extension = name.rsplit_once('.')?.1;
    match extension.to_ascii_lowercase().as_str() {
        "mp3" => Some("audio/mpeg"),
        "flac" => Some("audio/flac"),
        "wav" => Some("audio/wav"),
        "m4a" | "aac" => Some("audio/mp4"),
        "ogg" | "opus" => Some("audio/ogg"),
        _ => None,
    }
}

fn new_item_id() -> String {
    format!("smb-{:032x}", random::<u128>())
}

fn bounded_range(raw: Option<&str>, size: u64) -> Result<(u64, u64), String> {
    if size == 0 {
        return Err("SMB 音频文件为空".to_string());
    }
    let (start, requested_end) = match raw {
        Some(header) => crate::media::parse_range(Some(header), size)
            .ok_or_else(|| "SMB 音频分段请求无效".to_string())?,
        None => (0, size - 1),
    };
    let end = requested_end.min(start.saturating_add(MAX_STREAM_CHUNK_BYTES - 1));
    if end < start || end - start + 1 > MAX_STREAM_CHUNK_BYTES {
        return Err("SMB 音频分段超过大小限制".to_string());
    }
    Ok((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smb_host_only_accepts_dns_names_and_ipv4() {
        assert_eq!(validate_host(" nas.home ").unwrap(), "nas.home");
        assert_eq!(validate_host("192.168.1.10").unwrap(), "192.168.1.10");
        for value in [
            "",
            "-nas",
            "nas..home",
            "\\\\host\\share",
            "host:445",
            "::1",
            "user@host",
        ] {
            assert!(validate_host(value).is_err(), "accepted {value:?}");
        }
    }

    #[test]
    fn smb_share_and_relative_paths_cannot_escape_the_share() {
        assert_eq!(validate_share("Music").unwrap(), "Music");
        assert!(validate_share("..").is_err());
        assert!(validate_share("music\\other").is_err());
        assert_eq!(
            validate_relative_path("Artist/Album").unwrap(),
            ["Artist", "Album"]
        );
        for value in [
            "../outside",
            "Artist/../../outside",
            "\\\\host\\share",
            "C:\\Music",
        ] {
            assert!(validate_relative_path(value).is_err(), "accepted {value:?}");
        }
    }

    #[test]
    fn smb_names_reject_protocol_separators_and_control_characters() {
        assert!(safe_segment("Album 01"));
        assert!(!safe_segment(".."));
        assert!(!safe_segment("Artist\\Album"));
        assert!(!safe_segment("track:alternate.flac"));
        assert!(!safe_segment("bad\nname"));
        assert_eq!(audio_content_type("SONG.FLAC"), Some("audio/flac"));
        assert_eq!(audio_content_type("cover.jpg"), None);
    }

    #[test]
    fn smb_directory_listing_skips_reparse_points() {
        let directory = FileAttributes::new()
            .with_directory(true)
            .with_reparse_point(true);
        let regular_file = FileAttributes::new().with_archive(true);

        assert!(!browsable_entry("linked-music", &directory));
        assert!(browsable_entry(
            "Album 01",
            &FileAttributes::new().with_directory(true)
        ));
        assert!(browsable_entry("track.flac", &regular_file));
        assert!(!browsable_entry("..", &regular_file));
    }

    #[test]
    fn smb_ranges_are_single_and_bounded_to_four_megabytes() {
        assert_eq!(bounded_range(None, 12).unwrap(), (0, 11));
        assert_eq!(bounded_range(Some("bytes=10-"), 100).unwrap(), (10, 99));
        assert_eq!(
            bounded_range(Some("bytes=0-99999999"), 8 * 1024 * 1024).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert!(bounded_range(Some("bytes=1-2,5-6"), 100).is_err());
        assert!(bounded_range(Some("bytes=200-300"), 100).is_err());
    }

    #[test]
    fn smb_opaque_ids_are_random_and_not_paths() {
        let first = new_item_id();
        let second = new_item_id();
        assert_eq!(first.len(), 36);
        assert!(first.starts_with("smb-"));
        assert_ne!(first, second);
        assert!(!first.contains('\\'));
    }

    #[test]
    fn smb_ranges_are_bounded_and_reject_empty_files() {
        assert_eq!(
            bounded_range(Some("bytes=0-"), 9_000_000).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert_eq!(
            bounded_range(Some("bytes=9000000-"), 9_000_001).unwrap(),
            (9_000_000, 9_000_000)
        );
        assert!(bounded_range(Some("bytes=1-2"), 0).is_err());
        assert!(bounded_range(Some("invalid"), 100).is_err());
    }
}
