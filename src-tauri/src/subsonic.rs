//! Session-only Navidrome / Subsonic music source.
//!
//! Credentials remain in AppState memory for this application run. Responses and
//! stream URLs never carry the password or a reusable authentication token into
//! the webview.

use std::net::{IpAddr, Ipv6Addr};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use rand::distributions::Alphanumeric;
use rand::Rng;
use reqwest::header::{ACCEPT_ENCODING, CONTENT_RANGE, CONTENT_TYPE, RANGE};
use reqwest::Url;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

const API_VERSION: &str = "1.16.1";
const CLIENT_NAME: &str = "OmeMusic";
const MAX_QUERY_BYTES: usize = 256;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_PLAYLISTS: usize = 100;
const MAX_PLAYLIST_TRACKS: usize = 200;
const ALBUM_PAGE_SIZE: usize = 24;
const ALBUM_API_PAGE_SIZE: usize = ALBUM_PAGE_SIZE + 1;
const MAX_ALBUM_OFFSET: u32 = 100_000;
const MAX_ALBUM_TRACKS: usize = 200;
const MAX_COVER_ART_BYTES: usize = 2 * 1024 * 1024;
const MAX_REPORTED_PLAYLIST_TRACKS: u64 = 100_000;
const MAX_LYRIC_TRACKS: usize = 24;
const MAX_LYRIC_LINES: usize = 4_000;
const MAX_LYRIC_LINE_CHARS: usize = 2_000;
const MAX_LYRIC_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_LYRIC_TIME_MS: u64 = 99 * 60 * 1_000 + 59_999;
pub(crate) const MAX_STREAM_CHUNK_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone)]
pub struct SubsonicSession {
    base_url: Url,
    username: String,
    password: String,
    server_label: String,
    song_lyrics_version: Arc<Mutex<Option<u32>>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicStatus {
    pub connected: bool,
    pub server_label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicSongDto {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicPlaylistDto {
    pub id: String,
    pub name: String,
    pub song_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicPlaylistPageDto {
    pub playlists: Vec<SubsonicPlaylistDto>,
    pub total_count: u32,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicPlaylistTracksDto {
    pub playlist_id: String,
    pub name: String,
    pub total_songs: u32,
    pub tracks: Vec<SubsonicSongDto>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicAlbumDto {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub year: Option<u32>,
    pub song_count: u32,
    pub cover_art_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicAlbumPageDto {
    pub albums: Vec<SubsonicAlbumDto>,
    pub offset: u32,
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicAlbumTracksDto {
    pub album: SubsonicAlbumDto,
    pub tracks: Vec<SubsonicSongDto>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicLyricsDto {
    pub lrc: String,
    pub yrc: Option<String>,
    pub tlyric: Option<String>,
    pub rlyric: Option<String>,
    pub plain_lyrics: Option<String>,
}

pub(crate) struct CoverArt {
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

pub struct StreamChunk {
    pub content_type: String,
    pub content_range: String,
    pub body: Vec<u8>,
}

impl SubsonicSession {
    fn new(server_url: &str, username: &str, password: &str) -> Result<Self, String> {
        let mut base_url = validate_server_url(server_url)?;
        if !base_url.path().ends_with('/') {
            let path = format!("{}/", base_url.path());
            base_url.set_path(&path);
        }
        let server_label = base_url.host_str().unwrap_or("音乐服务器").to_string();
        Ok(Self {
            base_url,
            username: username.trim().to_string(),
            password: password.to_string(),
            server_label,
            song_lyrics_version: Arc::new(Mutex::new(None)),
        })
    }

    pub fn status(&self) -> SubsonicStatus {
        SubsonicStatus {
            connected: true,
            server_label: Some(self.server_label.clone()),
        }
    }

    fn endpoint(&self, name: &str) -> Result<Url, String> {
        self.base_url
            .join(&format!("rest/{name}"))
            .map_err(|_| "无法识别音乐服务器地址".to_string())
    }

    async fn request_json(&self, name: &str, extra: &[(&str, String)]) -> Result<Value, String> {
        let mut url = self.endpoint(name)?;
        let salt: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect();
        let token = format!("{:x}", md5::compute(format!("{}{salt}", self.password)));
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("u", &self.username)
                .append_pair("t", &token)
                .append_pair("s", &salt)
                .append_pair("v", API_VERSION)
                .append_pair("c", CLIENT_NAME)
                .append_pair("f", "json");
            for (key, value) in extra {
                query.append_pair(key, value);
            }
        }

        let response = http_client()
            .get(url)
            .send()
            .await
            .map_err(|_| "音乐服务器暂时无法连接".to_string())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err("音乐服务器暂时无法提供曲库资料".to_string());
        }
        let bytes = read_limited_body(response, MAX_RESPONSE_BYTES).await?;
        let json: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "无法识别音乐服务器返回的资料".to_string())?;
        let envelope = json
            .get("subsonic-response")
            .ok_or_else(|| "无法识别音乐服务器返回的资料".to_string())?;
        if envelope.get("status").and_then(Value::as_str) != Some("ok") {
            let code = envelope
                .get("error")
                .and_then(|error| error.get("code"))
                .and_then(Value::as_i64);
            return Err(match code {
                Some(40 | 41) => "音乐服务器拒绝了登录，请检查账号与密码".to_string(),
                _ => "音乐服务器请求失败，请稍后重试".to_string(),
            });
        }
        Ok(envelope.clone())
    }

    pub async fn ping(&self) -> Result<(), String> {
        self.request_json("ping.view", &[]).await.map(|_| ())
    }

    pub async fn search(&self, keywords: &str, limit: u32) -> Result<Vec<SubsonicSongDto>, String> {
        let query = keywords.trim();
        if query.is_empty() || query.len() > MAX_QUERY_BYTES || query.chars().any(char::is_control)
        {
            return Err("请输入不超过 256 字节的搜索内容".to_string());
        }
        let limit = limit.clamp(1, 30);
        let result = self
            .request_json(
                "search3.view",
                &[
                    ("query", query.to_string()),
                    ("songCount", limit.to_string()),
                    ("songOffset", "0".to_string()),
                    ("albumCount", "0".to_string()),
                    ("artistCount", "0".to_string()),
                ],
            )
            .await?;
        let songs = result
            .get("searchResult3")
            .and_then(|value| value.get("song"));
        Ok(songs
            .map(values_as_array)
            .into_iter()
            .flatten()
            .filter_map(parse_song)
            .take(limit as usize)
            .collect())
    }

    pub async fn playlists(&self) -> Result<SubsonicPlaylistPageDto, String> {
        let result = self.request_json("getPlaylists.view", &[]).await?;
        Ok(parse_playlist_page(&result))
    }

    pub async fn playlist_tracks(
        &self,
        playlist_id: &str,
    ) -> Result<SubsonicPlaylistTracksDto, String> {
        let playlist_id = validate_song_id(playlist_id)?;
        let result = self
            .request_json("getPlaylist.view", &[("id", playlist_id.clone())])
            .await?;
        parse_playlist_tracks(&result, &playlist_id)
    }

    pub async fn albums(&self, offset: u32) -> Result<SubsonicAlbumPageDto, String> {
        if offset > MAX_ALBUM_OFFSET {
            return Err("专辑页码超出可浏览范围".to_string());
        }
        let result = self
            .request_json(
                "getAlbumList2.view",
                &[
                    ("type", "newest".to_string()),
                    ("size", ALBUM_API_PAGE_SIZE.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(parse_album_page(&result, offset))
    }

    pub async fn album_tracks(&self, album_id: &str) -> Result<SubsonicAlbumTracksDto, String> {
        let album_id = validate_song_id(album_id)?;
        let result = self
            .request_json("getAlbum.view", &[("id", album_id.clone())])
            .await?;
        parse_album_tracks(&result, &album_id)
    }

    pub async fn lyrics(&self, song_id: &str) -> Result<Option<SubsonicLyricsDto>, String> {
        let song_id = validate_song_id(song_id)?;
        let Some(version) = self.song_lyrics_extension_version().await else {
            return Ok(None);
        };
        if version == 0 {
            return Ok(None);
        }
        let mut params = vec![("id", song_id)];
        if version >= 2 {
            params.push(("enhanced", "true".to_string()));
        }
        let result = self.request_json("getLyricsBySongId.view", &params).await?;
        Ok(parse_lyrics(&result))
    }

    async fn song_lyrics_extension_version(&self) -> Option<u32> {
        if let Ok(version) = self.song_lyrics_version.lock() {
            if let Some(version) = *version {
                return Some(version);
            }
        }

        let result = self
            .request_json("getOpenSubsonicExtensions.view", &[])
            .await
            .ok()?;
        let version = parse_song_lyrics_extension_version(&result);
        if let Ok(mut cached) = self.song_lyrics_version.lock() {
            *cached = Some(version);
        }
        Some(version)
    }

    pub async fn cover_art(&self, cover_art_id: &str) -> Result<CoverArt, String> {
        let cover_art_id = validate_song_id(cover_art_id)?;
        let mut url = self.endpoint("getCoverArt.view")?;
        let salt: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect();
        let token = format!("{:x}", md5::compute(format!("{}{salt}", self.password)));
        url.query_pairs_mut()
            .append_pair("u", &self.username)
            .append_pair("t", &token)
            .append_pair("s", &salt)
            .append_pair("v", API_VERSION)
            .append_pair("c", CLIENT_NAME)
            .append_pair("f", "json")
            .append_pair("id", &cover_art_id)
            .append_pair("size", "384");

        let response = http_client()
            .get(url)
            .header(reqwest::header::ACCEPT, "image/png,image/jpeg")
            .send()
            .await
            .map_err(|_| "专辑封面暂时无法读取".to_string())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_COVER_ART_BYTES as u64)
        {
            return Err("音乐服务器暂时无法提供专辑封面".to_string());
        }
        let body = read_limited_body(response, MAX_COVER_ART_BYTES).await?;
        let (mime_type, content_type) = if body.starts_with(b"\x89PNG\r\n\x1a\n") {
            (lofty::picture::MimeType::Png, "image/png")
        } else if body.starts_with(&[0xff, 0xd8, 0xff]) {
            (lofty::picture::MimeType::Jpeg, "image/jpeg")
        } else {
            return Err("音乐服务器返回了不支持的封面格式".to_string());
        };
        crate::library::validate_remote_cover_dimensions(&body, &mime_type)
            .map_err(|_| "音乐服务器返回的专辑封面无效".to_string())?;
        Ok(CoverArt { content_type, body })
    }

    pub async fn stream_chunk(&self, id: &str, range: Option<&str>) -> Result<StreamChunk, String> {
        let id = validate_song_id(id)?;
        let (start, end) = bounded_range(range)?;
        let mut url = self.endpoint("stream.view")?;
        let salt: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect();
        let token = format!("{:x}", md5::compute(format!("{}{salt}", self.password)));
        url.query_pairs_mut()
            .append_pair("u", &self.username)
            .append_pair("t", &token)
            .append_pair("s", &salt)
            .append_pair("v", API_VERSION)
            .append_pair("c", CLIENT_NAME)
            .append_pair("f", "json")
            .append_pair("id", &id);

        let response = http_client()
            .get(url)
            .header(ACCEPT_ENCODING, "identity")
            .header(RANGE, format!("bytes={start}-{end}"))
            .send()
            .await
            .map_err(|_| "远程曲目暂时无法读取".to_string())?;
        if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err("音乐服务器不支持安全的分段播放".to_string());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_STREAM_CHUNK_BYTES)
        {
            return Err("音乐服务器返回的音频分段超出限制".to_string());
        }
        let content_range = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|header| header.to_str().ok())
            .filter(|value| valid_content_range(value, start, end))
            .ok_or_else(|| "音乐服务器未返回有效的音频分段".to_string())?
            .to_string();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|header| header.to_str().ok())
            .filter(|value| value.starts_with("audio/") || *value == "application/octet-stream")
            .unwrap_or("application/octet-stream")
            .to_string();
        let body = read_limited_body(response, MAX_STREAM_CHUNK_BYTES as usize).await?;
        if body.is_empty() {
            return Err("音乐服务器返回了空音频分段".to_string());
        }
        Ok(StreamChunk {
            content_type,
            content_range,
            body,
        })
    }
}

#[tauri::command]
pub async fn subsonic_connect(
    state: State<'_, crate::AppState>,
    server_url: String,
    username: String,
    password: String,
) -> Result<SubsonicStatus, String> {
    let username = username.trim();
    if username.is_empty() || username.len() > 256 || username.chars().any(char::is_control) {
        return Err("请输入有效的音乐服务器账号".to_string());
    }
    if password.is_empty() || password.len() > 1024 || password.chars().any(char::is_control) {
        return Err("请输入有效的音乐服务器密码".to_string());
    }
    let session = SubsonicSession::new(&server_url, username, &password)?;
    session.ping().await?;
    let status = session.status();
    *state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())? = Some(session);
    Ok(status)
}

#[tauri::command]
pub fn subsonic_status(state: State<'_, crate::AppState>) -> SubsonicStatus {
    state
        .subsonic_session
        .lock()
        .ok()
        .and_then(|session| session.as_ref().map(SubsonicSession::status))
        .unwrap_or(SubsonicStatus {
            connected: false,
            server_label: None,
        })
}

#[tauri::command]
pub fn subsonic_disconnect(state: State<'_, crate::AppState>) -> Result<(), String> {
    *state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn subsonic_search(
    state: State<'_, crate::AppState>,
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<SubsonicSongDto>, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.search(&keywords, limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn subsonic_playlists(
    state: State<'_, crate::AppState>,
) -> Result<SubsonicPlaylistPageDto, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.playlists().await
}

#[tauri::command]
pub async fn subsonic_playlist_tracks(
    state: State<'_, crate::AppState>,
    playlist_id: String,
) -> Result<SubsonicPlaylistTracksDto, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.playlist_tracks(&playlist_id).await
}

#[tauri::command]
pub async fn subsonic_albums(
    state: State<'_, crate::AppState>,
    offset: Option<u32>,
) -> Result<SubsonicAlbumPageDto, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.albums(offset.unwrap_or_default()).await
}

#[tauri::command]
pub async fn subsonic_album_tracks(
    state: State<'_, crate::AppState>,
    album_id: String,
) -> Result<SubsonicAlbumTracksDto, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.album_tracks(&album_id).await
}

#[tauri::command]
pub async fn subsonic_lyrics(
    state: State<'_, crate::AppState>,
    song_id: String,
) -> Result<Option<SubsonicLyricsDto>, String> {
    let session = state
        .subsonic_session
        .lock()
        .map_err(|_| "音乐服务器状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接远程曲库".to_string())?;
    session.lyrics(&song_id).await
}

pub(crate) async fn cover_art(
    session: &SubsonicSession,
    cover_art_id: &str,
) -> Result<CoverArt, String> {
    session.cover_art(cover_art_id).await
}

pub(crate) async fn stream_chunk(
    session: &SubsonicSession,
    id: &str,
    range: Option<&str>,
) -> Result<StreamChunk, String> {
    session.stream_chunk(id, range).await
}

fn validate_server_url(raw: &str) -> Result<Url, String> {
    if raw.trim().len() > 2048 {
        return Err("音乐服务器地址过长".to_string());
    }
    let url = Url::parse(raw.trim()).map_err(|_| "请输入有效的音乐服务器地址".to_string())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("服务器地址仅支持不含账号信息、查询参数或片段的 HTTP(S) 地址".to_string());
    }
    if url.scheme() == "http" && !is_private_or_local_host(url.host_str().unwrap_or_default()) {
        return Err("公网音乐服务器必须使用 HTTPS；HTTP 仅允许本机或局域网地址".to_string());
    }
    Ok(url)
}

fn is_private_or_local_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") || host.to_ascii_lowercase().ends_with(".local") {
        return true;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => {
            address.is_loopback()
                || address.is_private()
                || (address.octets()[0] == 169 && address.octets()[1] == 254)
        }
        Ok(IpAddr::V6(address)) => {
            address.is_loopback() || is_ipv6_unique_local(address) || is_ipv6_link_local(address)
        }
        Err(_) => false,
    }
}

fn is_ipv6_unique_local(address: Ipv6Addr) -> bool {
    (address.segments()[0] & 0xfe00) == 0xfc00
}

fn is_ipv6_link_local(address: Ipv6Addr) -> bool {
    (address.segments()[0] & 0xffc0) == 0xfe80
}

fn parse_song(raw: &Value) -> Option<SubsonicSongDto> {
    let id = raw.get("id")?.as_str()?.trim();
    let id = validate_song_id(id).ok()?;
    let title = clean_text(raw.get("title"), 160)?;
    let artist = clean_text(raw.get("artist"), 120).unwrap_or_else(|| "未知艺人".to_string());
    let album = clean_text(raw.get("album"), 160).unwrap_or_default();
    let duration_seconds = raw
        .get("duration")
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        .unwrap_or_default()
        .min(24 * 60 * 60) as u32;
    Some(SubsonicSongDto {
        id,
        title,
        artist,
        album,
        duration_seconds,
    })
}

fn parse_playlist_page(result: &Value) -> SubsonicPlaylistPageDto {
    let entries = result
        .get("playlists")
        .and_then(|value| value.get("playlist"))
        .map(values_as_array)
        .unwrap_or_default();
    let total_count = entries.len().min(u32::MAX as usize) as u32;
    let playlists = entries
        .into_iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.trim();
            let id = validate_song_id(id).ok()?;
            let name = clean_text(item.get("name"), 160)?;
            Some(SubsonicPlaylistDto {
                id,
                name,
                song_count: bounded_count(item.get("songCount")),
            })
        })
        .take(MAX_PLAYLISTS)
        .collect::<Vec<_>>();
    SubsonicPlaylistPageDto {
        truncated: total_count as usize > MAX_PLAYLISTS,
        playlists,
        total_count,
    }
}

fn parse_album_page(result: &Value, offset: u32) -> SubsonicAlbumPageDto {
    let entries = result
        .get("albumList2")
        .and_then(|value| value.get("album"))
        .map(values_as_array)
        .unwrap_or_default();
    let has_more = entries.len() > ALBUM_PAGE_SIZE;
    let albums = entries
        .into_iter()
        .take(ALBUM_PAGE_SIZE)
        .filter_map(parse_album)
        .collect();
    SubsonicAlbumPageDto {
        albums,
        offset,
        has_more,
    }
}

fn parse_album(raw: &Value) -> Option<SubsonicAlbumDto> {
    let id = raw.get("id")?.as_str()?.trim();
    let id = validate_song_id(id).ok()?;
    let name = clean_text(raw.get("name"), 160)?;
    let artist = clean_text(raw.get("artist"), 120).unwrap_or_else(|| "未知艺人".to_string());
    let year = raw
        .get("year")
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        .filter(|year| (1000..=9999).contains(year))
        .map(|year| year as u32);
    let cover_art_id = raw
        .get("coverArt")
        .and_then(Value::as_str)
        .and_then(|id| validate_song_id(id).ok());
    Some(SubsonicAlbumDto {
        id,
        name,
        artist,
        year,
        song_count: bounded_count(raw.get("songCount")),
        cover_art_id,
    })
}

fn parse_album_tracks(
    result: &Value,
    requested_id: &str,
) -> Result<SubsonicAlbumTracksDto, String> {
    let raw_album = result
        .get("album")
        .ok_or_else(|| "无法识别远程专辑资料".to_string())?;
    let raw_id = raw_album
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| *id == requested_id)
        .ok_or_else(|| "远程专辑资料与所选项目不匹配".to_string())?;
    let album = parse_album(raw_album)
        .filter(|album| album.id == raw_id)
        .ok_or_else(|| "无法识别远程专辑资料".to_string())?;
    let entries = raw_album
        .get("song")
        .map(values_as_array)
        .unwrap_or_default();
    let tracks = entries
        .iter()
        .filter_map(|entry| parse_song(entry))
        .take(MAX_ALBUM_TRACKS)
        .collect::<Vec<_>>();
    let truncated = album.song_count as usize > tracks.len() || entries.len() > MAX_ALBUM_TRACKS;
    Ok(SubsonicAlbumTracksDto {
        album,
        tracks,
        truncated,
    })
}

fn parse_playlist_tracks(
    result: &Value,
    requested_id: &str,
) -> Result<SubsonicPlaylistTracksDto, String> {
    let playlist = result
        .get("playlist")
        .ok_or_else(|| "无法识别远程歌单资料".to_string())?;
    let id = playlist
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| *id == requested_id)
        .ok_or_else(|| "远程歌单资料与所选项目不匹配".to_string())?;
    let name =
        clean_text(playlist.get("name"), 160).ok_or_else(|| "无法识别远程歌单名称".to_string())?;
    let entries = playlist
        .get("entry")
        .map(values_as_array)
        .unwrap_or_default();
    let tracks = entries
        .iter()
        .filter_map(|entry| parse_song(entry))
        .take(MAX_PLAYLIST_TRACKS)
        .collect::<Vec<_>>();
    let reported_count = bounded_count(playlist.get("songCount"));
    let entries_count = entries.len().min(MAX_REPORTED_PLAYLIST_TRACKS as usize) as u32;
    let total_songs = reported_count.max(entries_count);
    Ok(SubsonicPlaylistTracksDto {
        playlist_id: id.to_string(),
        name,
        total_songs,
        truncated: total_songs as usize > tracks.len() || entries.len() > MAX_PLAYLIST_TRACKS,
        tracks,
    })
}

#[derive(Debug)]
struct ParsedLyricTrack {
    kind: String,
    lrc: Option<String>,
    yrc: Option<String>,
    plain: Option<String>,
}

fn parse_lyrics(result: &Value) -> Option<SubsonicLyricsDto> {
    let entries = result
        .get("lyricsList")
        .and_then(|value| value.get("structuredLyrics"))
        .map(values_as_array)
        .unwrap_or_default();
    let tracks = entries
        .into_iter()
        .take(MAX_LYRIC_TRACKS)
        .filter_map(parse_lyric_track)
        .collect::<Vec<_>>();

    let main = tracks
        .iter()
        .find(|track| track.kind == "main" && (track.lrc.is_some() || track.yrc.is_some()))
        .or_else(|| {
            tracks
                .iter()
                .find(|track| track.kind == "main" && track.plain.is_some())
        })?;
    let translation = tracks
        .iter()
        .find(|track| track.kind == "translation" && track.lrc.is_some())
        .and_then(|track| track.lrc.clone());
    let pronunciation = tracks
        .iter()
        .find(|track| track.kind == "pronunciation" && track.lrc.is_some())
        .and_then(|track| track.lrc.clone())
        .or_else(|| {
            tracks
                .iter()
                .find(|track| track.kind == "pronunciation" && track.plain.is_some())
                .and_then(|track| track.plain.clone())
        });
    let lyrics = SubsonicLyricsDto {
        lrc: main.lrc.clone().unwrap_or_default(),
        yrc: main.yrc.clone(),
        tlyric: translation,
        rlyric: pronunciation,
        plain_lyrics: main.plain.clone(),
    };
    let output_bytes = lyrics.lrc.len()
        + lyrics.yrc.as_ref().map_or(0, String::len)
        + lyrics.tlyric.as_ref().map_or(0, String::len)
        + lyrics.rlyric.as_ref().map_or(0, String::len)
        + lyrics.plain_lyrics.as_ref().map_or(0, String::len);
    (output_bytes <= MAX_LYRIC_OUTPUT_BYTES).then_some(lyrics)
}

fn parse_song_lyrics_extension_version(result: &Value) -> u32 {
    result
        .get("openSubsonicExtensions")
        .map(values_as_array)
        .unwrap_or_default()
        .into_iter()
        .find(|extension| extension.get("name").and_then(Value::as_str) == Some("songLyrics"))
        .and_then(|extension| extension.get("versions"))
        .map(values_as_array)
        .unwrap_or_default()
        .into_iter()
        .filter_map(Value::as_u64)
        .filter_map(|version| u32::try_from(version).ok())
        .max()
        .unwrap_or_default()
        .min(2)
}

fn parse_lyric_track(raw: &Value) -> Option<ParsedLyricTrack> {
    let kind = match raw.get("kind").and_then(Value::as_str).unwrap_or("main") {
        "main" => "main",
        "translation" => "translation",
        "pronunciation" => "pronunciation",
        _ => return None,
    }
    .to_string();
    let synced = raw.get("synced").and_then(Value::as_bool).unwrap_or(false);
    let offset = raw
        .get("offset")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    let lines = raw
        .get("line")
        .map(values_as_array)
        .unwrap_or_default()
        .into_iter()
        .take(MAX_LYRIC_LINES)
        .filter_map(|line| {
            let text = safe_lyric_line(line.get("value")?.as_str()?)?;
            if synced {
                let start = lyric_time(line.get("start")?, offset)?;
                Some((Some(start), text))
            } else {
                Some((None, text))
            }
        })
        .collect::<Vec<_>>();

    let (lrc, plain) = if synced {
        let mut timed = lines
            .iter()
            .filter_map(|(time, text)| time.map(|time| (time, text.as_str())))
            .collect::<Vec<_>>();
        timed.sort_by_key(|(time, _)| *time);
        let lrc = timed
            .into_iter()
            .map(|(time, text)| format!("{}{}", lrc_timestamp(time), text))
            .collect::<Vec<_>>()
            .join("\n");
        ((!lrc.is_empty()).then_some(lrc), None)
    } else {
        let plain = lines
            .iter()
            .map(|(_, text)| text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        (None, (!plain.is_empty()).then_some(plain))
    };
    let yrc = if synced {
        parse_lyric_cue_lines(raw.get("cueLine"), offset)
    } else {
        None
    };

    (lrc.is_some() || plain.is_some() || yrc.is_some()).then_some(ParsedLyricTrack {
        kind,
        lrc,
        yrc,
        plain,
    })
}

fn parse_lyric_cue_lines(cue_lines: Option<&Value>, offset: i64) -> Option<String> {
    let cue_lines = cue_lines
        .map(values_as_array)
        .unwrap_or_default()
        .into_iter()
        .take(MAX_LYRIC_LINES)
        .collect::<Vec<_>>();
    let mut seen_indices = Vec::with_capacity(cue_lines.len());
    for cue_line in &cue_lines {
        let index = cue_line.get("index").and_then(Value::as_u64)?;
        if seen_indices.contains(&index) {
            // 当前歌词视图只有一个主声部；重复行索引代表并行声部，退回行级 LRC。
            return None;
        }
        seen_indices.push(index);
    }

    let mut output = Vec::new();
    for cue_line in cue_lines {
        let Some(start) = cue_line
            .get("start")
            .and_then(|value| lyric_time(value, offset))
        else {
            continue;
        };
        let Some(end) = cue_line
            .get("end")
            .and_then(|value| lyric_time(value, offset))
            .filter(|end| *end > start)
        else {
            continue;
        };
        let cues = cue_line.get("cue").map(values_as_array).unwrap_or_default();
        let mut words = String::new();
        let mut pending_whitespace = String::new();
        for cue in cues.into_iter().take(MAX_LYRIC_LINES) {
            let Some(word_start) = cue.get("start").and_then(|value| lyric_time(value, offset))
            else {
                continue;
            };
            let Some(word_end) = cue
                .get("end")
                .and_then(|value| lyric_time(value, offset))
                .filter(|word_end| *word_end > word_start)
            else {
                continue;
            };
            let Some(text) = cue
                .get("value")
                .and_then(Value::as_str)
                .and_then(safe_lyric_segment)
            else {
                continue;
            };
            if text.is_empty() {
                continue;
            }
            if text.contains('(') || text.contains(')') {
                return None;
            }
            if text.trim().is_empty() {
                pending_whitespace.push_str(&text);
                continue;
            }
            let duration = word_end - word_start;
            words.push_str(&format!(
                "({word_start},{duration}){pending_whitespace}{text}"
            ));
            pending_whitespace.clear();
        }
        if !pending_whitespace.is_empty() {
            if let Some(last_word) = words.rfind(')') {
                // Whitespace cues carry timing but are only display separators in the
                // existing karaoke renderer; preserve their text on the prior word.
                let insertion = words[last_word + 1..]
                    .find('(')
                    .map(|index| last_word + 1 + index)
                    .unwrap_or(words.len());
                words.insert_str(insertion, &pending_whitespace);
            }
        }
        if !words.is_empty() {
            output.push(format!("[{start},{}]{words}", end - start));
        }
    }
    let result = output.join("\n");
    (!result.is_empty() && result.len() <= MAX_LYRIC_OUTPUT_BYTES).then_some(result)
}

fn lyric_time(value: &Value, offset: i64) -> Option<u64> {
    let start = value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))?;
    let adjusted = if offset < 0 {
        start.saturating_sub(offset.unsigned_abs())
    } else {
        start.saturating_add(offset as u64)
    };
    (adjusted <= MAX_LYRIC_TIME_MS).then_some(adjusted)
}

fn lrc_timestamp(milliseconds: u64) -> String {
    let minutes = milliseconds / 60_000;
    let seconds = (milliseconds % 60_000) / 1_000;
    let millis = milliseconds % 1_000;
    format!("[{minutes:02}:{seconds:02}.{millis:03}]")
}

fn safe_lyric_line(value: &str) -> Option<String> {
    if value.chars().any(char::is_control) {
        return None;
    }
    let value = value.trim();
    if value.is_empty() || value.chars().count() > MAX_LYRIC_LINE_CHARS {
        return None;
    }
    Some(value.to_string())
}

fn safe_lyric_segment(value: &str) -> Option<String> {
    if value.chars().count() > MAX_LYRIC_LINE_CHARS || value.chars().any(char::is_control) {
        return None;
    }
    Some(value.to_string())
}

fn bounded_count(value: Option<&Value>) -> u32 {
    value
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        .unwrap_or_default()
        .min(MAX_REPORTED_PLAYLIST_TRACKS) as u32
}

fn clean_text(value: Option<&Value>, max_chars: usize) -> Option<String> {
    let value = value?.as_str()?.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return None;
    }
    Some(value.chars().take(max_chars).collect())
}

fn values_as_array(value: &Value) -> Vec<&Value> {
    match value {
        Value::Array(items) => items.iter().collect(),
        Value::Object(_) => vec![value],
        _ => Vec::new(),
    }
}

fn validate_song_id(raw: &str) -> Result<String, String> {
    let id = raw.trim();
    if id.is_empty() || id.len() > MAX_QUERY_BYTES || id.chars().any(char::is_control) {
        return Err("无法识别远程曲目".to_string());
    }
    Ok(id.to_string())
}

fn bounded_range(raw: Option<&str>) -> Result<(u64, u64), String> {
    let Some(raw) = raw else {
        return Ok((0, MAX_STREAM_CHUNK_BYTES - 1));
    };
    let spec = raw
        .trim()
        .strip_prefix("bytes=")
        .ok_or_else(|| "无效的音频分段请求".to_string())?;
    if spec.contains(',') {
        return Err("不支持多段音频请求".to_string());
    }
    let (start, end) = spec
        .split_once('-')
        .ok_or_else(|| "无效的音频分段请求".to_string())?;
    let start = start
        .parse::<u64>()
        .map_err(|_| "无效的音频分段请求".to_string())?;
    let end = if end.is_empty() {
        start.saturating_add(MAX_STREAM_CHUNK_BYTES - 1)
    } else {
        end.parse::<u64>()
            .map_err(|_| "无效的音频分段请求".to_string())?
            .min(start.saturating_add(MAX_STREAM_CHUNK_BYTES - 1))
    };
    if end < start {
        return Err("无效的音频分段请求".to_string());
    }
    Ok((start, end))
}

fn valid_content_range(value: &str, requested_start: u64, requested_end: u64) -> bool {
    let Some(spec) = value.strip_prefix("bytes ") else {
        return false;
    };
    let Some((actual, total)) = spec.split_once('/') else {
        return false;
    };
    let Some((start, end)) = actual.split_once('-') else {
        return false;
    };
    let (Ok(start), Ok(end)) = (start.parse::<u64>(), end.parse::<u64>()) else {
        return false;
    };
    let total_ok = total == "*" || total.parse::<u64>().is_ok_and(|length| length > end);
    start == requested_start && end >= start && end <= requested_end && total_ok
}

async fn read_limited_body(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("音乐服务器返回内容超出大小限制".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取音乐服务器返回内容失败".to_string())?
    {
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err("音乐服务器返回内容超出大小限制".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("构建远程曲库客户端失败")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn reply(status: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn png_header(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".to_vec();
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes
    }

    #[test]
    fn accepts_https_and_private_http_but_rejects_public_plaintext_and_url_credentials() {
        assert!(validate_server_url("https://music.example.com/base").is_ok());
        assert!(validate_server_url("http://192.168.1.12:4533").is_ok());
        assert!(validate_server_url("http://localhost:4533").is_ok());
        assert!(validate_server_url("http://music.example.com").is_err());
        assert!(validate_server_url("https://user:secret@music.example.com").is_err());
        assert!(validate_server_url("https://music.example.com?token=x").is_err());
    }

    #[test]
    fn bounds_ranges_to_four_mib_and_rejects_multipart() {
        assert_eq!(
            bounded_range(None).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert_eq!(
            bounded_range(Some("bytes=12-")).unwrap(),
            (12, 12 + MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert_eq!(
            bounded_range(Some("bytes=0-9999999")).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert!(bounded_range(Some("bytes=0-1,4-5")).is_err());
        assert!(bounded_range(Some("bytes=-1024")).is_err());
    }

    #[test]
    fn song_parser_limits_text_and_rejects_invalid_ids_and_titles() {
        let song = parse_song(&serde_json::json!({
            "id": "server-track:1",
            "title": "  First song  ",
            "artist": "Artist",
            "album": "Album",
            "duration": 182
        }))
        .unwrap();
        assert_eq!(song.id, "server-track:1");
        assert_eq!(song.title, "First song");
        assert_eq!(song.duration_seconds, 182);
        assert!(parse_song(&serde_json::json!({"id":"x", "title":"\n"})).is_none());
        assert!(!valid_content_range("bytes 0-4/4", 0, 4));
        assert!(valid_content_range("bytes 0-4/8", 0, 4));
    }

    #[test]
    fn playlist_parsers_validate_ids_and_bound_results() {
        let page = parse_playlist_page(&serde_json::json!({
            "playlists": { "playlist": [
                { "id": "playlist-1", "name": "  Evening  ", "songCount": 3 },
                { "id": "playlist-2", "name": "\n", "songCount": 1 }
            ] }
        }));
        assert_eq!(page.total_count, 2);
        assert_eq!(page.playlists.len(), 1);
        assert_eq!(page.playlists[0].id, "playlist-1");
        assert_eq!(page.playlists[0].name, "Evening");
        assert!(!page.truncated);

        let tracks = parse_playlist_tracks(
            &serde_json::json!({
                "playlist": {
                    "id": "playlist-1",
                    "name": "Evening",
                    "songCount": 2,
                    "entry": [
                        { "id": "track-1", "title": "First", "duration": 100 },
                        { "id": "track-2", "title": "Second", "duration": 120 }
                    ]
                }
            }),
            "playlist-1",
        )
        .unwrap();
        assert_eq!(tracks.total_songs, 2);
        assert_eq!(tracks.tracks.len(), 2);
        assert!(!tracks.truncated);

        let many_playlists = (0..=MAX_PLAYLISTS)
            .map(|index| {
                serde_json::json!({
                    "id": format!("playlist-{index}"),
                    "name": format!("Playlist {index}")
                })
            })
            .collect::<Vec<_>>();
        let bounded_page = parse_playlist_page(&serde_json::json!({
            "playlists": { "playlist": many_playlists }
        }));
        assert_eq!(bounded_page.playlists.len(), MAX_PLAYLISTS);
        assert_eq!(bounded_page.total_count, (MAX_PLAYLISTS + 1) as u32);
        assert!(bounded_page.truncated);

        let many_tracks = (0..=MAX_PLAYLIST_TRACKS)
            .map(|index| {
                serde_json::json!({
                    "id": format!("track-{index}"),
                    "title": format!("Track {index}")
                })
            })
            .collect::<Vec<_>>();
        let bounded_tracks = parse_playlist_tracks(
            &serde_json::json!({
                "playlist": {
                    "id": "playlist-long",
                    "name": "Long playlist",
                    "songCount": MAX_PLAYLIST_TRACKS + 1,
                    "entry": many_tracks
                }
            }),
            "playlist-long",
        )
        .unwrap();
        assert_eq!(bounded_tracks.tracks.len(), MAX_PLAYLIST_TRACKS);
        assert_eq!(bounded_tracks.total_songs, (MAX_PLAYLIST_TRACKS + 1) as u32);
        assert!(bounded_tracks.truncated);

        assert!(parse_playlist_tracks(
            &serde_json::json!({ "playlist": { "id": "other", "name": "Evening" } }),
            "playlist-1",
        )
        .is_err());
    }

    #[test]
    fn album_parsers_page_read_only_results_and_bound_detail_tracks() {
        let entries = (0..=ALBUM_PAGE_SIZE)
            .map(|index| {
                serde_json::json!({
                    "id": format!("album-{index}"),
                    "name": format!("Record {index}"),
                    "artist": "Artist",
                    "year": "2024",
                    "songCount": 2,
                    "coverArt": format!("cover-{index}")
                })
            })
            .collect::<Vec<_>>();
        let page = parse_album_page(
            &serde_json::json!({ "albumList2": { "album": entries } }),
            24,
        );
        assert_eq!(page.offset, 24);
        assert_eq!(page.albums.len(), ALBUM_PAGE_SIZE);
        assert!(page.has_more);
        assert_eq!(page.albums[0].cover_art_id.as_deref(), Some("cover-0"));
        assert_eq!(page.albums[0].year, Some(2024));

        let detail = parse_album_tracks(
            &serde_json::json!({
                "album": {
                    "id": "album-1",
                    "name": "Record",
                    "artist": "Artist",
                    "year": 2024,
                    "songCount": MAX_ALBUM_TRACKS + 1,
                    "coverArt": "cover-1",
                    "song": (0..=MAX_ALBUM_TRACKS).map(|index| serde_json::json!({
                        "id": format!("track-{index}"),
                        "title": format!("Track {index}"),
                        "duration": 100
                    })).collect::<Vec<_>>()
                }
            }),
            "album-1",
        )
        .unwrap();
        assert_eq!(detail.album.name, "Record");
        assert_eq!(detail.tracks.len(), MAX_ALBUM_TRACKS);
        assert!(detail.truncated);
        assert!(parse_album_tracks(
            &serde_json::json!({ "album": { "id": "another", "name": "Other" } }),
            "album-1",
        )
        .is_err());
    }

    #[test]
    fn lyrics_parser_maps_synced_translation_pronunciation_and_word_timing() {
        let lyrics = parse_lyrics(&serde_json::json!({
            "lyricsList": { "structuredLyrics": [
                {
                    "kind": "main",
                    "synced": true,
                    "offset": -100,
                    "line": [
                        { "start": 1000, "value": "你好" },
                        { "start": 3000, "value": "世界" }
                    ],
                    "cueLine": [{
                        "index": 0,
                        "start": 1000,
                        "end": 3000,
                        "cue": [
                            { "start": 1000, "end": 1400, "value": "你" },
                            { "start": 1400, "end": 1800, "value": " " },
                            { "start": 1800, "end": 2200, "value": "好" }
                        ]
                    }]
                },
                {
                    "kind": "translation",
                    "synced": true,
                    "line": [{ "start": 1000, "value": "hello" }]
                },
                {
                    "kind": "pronunciation",
                    "synced": false,
                    "line": [{ "value": "ni hao" }]
                }
            ] }
        }))
        .unwrap();

        assert_eq!(lyrics.lrc, "[00:00.900]你好\n[00:02.900]世界");
        assert_eq!(
            lyrics.yrc.as_deref(),
            Some("[900,2000](900,400)你(1700,400) 好")
        );
        assert_eq!(lyrics.tlyric.as_deref(), Some("[00:01.000]hello"));
        assert_eq!(lyrics.rlyric.as_deref(), Some("ni hao"));
        assert_eq!(lyrics.plain_lyrics, None);
    }

    #[test]
    fn lyrics_parser_supports_v1_single_object_plain_text_and_bounds_untrusted_data() {
        let lyrics = parse_lyrics(&serde_json::json!({
            "lyricsList": { "structuredLyrics": {
                "synced": false,
                "line": [
                    { "value": " first line " },
                    { "value": "second line" },
                    { "value": "\nignored control line" }
                ]
            } }
        }))
        .unwrap();
        assert_eq!(lyrics.lrc, "");
        assert_eq!(
            lyrics.plain_lyrics.as_deref(),
            Some("first line\nsecond line")
        );
        assert_eq!(lyrics.yrc, None);

        assert!(parse_lyrics(&serde_json::json!({
            "lyricsList": { "structuredLyrics": {
                "kind": "main",
                "synced": true,
                "line": [{ "start": 100 * 60 * 1000, "value": "too late" }]
            } }
        }))
        .is_none());
        assert!(parse_lyrics(&serde_json::json!({
            "lyricsList": { "structuredLyrics": {
                "kind": "unknown",
                "synced": true,
                "line": [{ "start": 0, "value": "ignored" }]
            } }
        }))
        .is_none());

        let multi_voice = parse_lyrics(&serde_json::json!({
            "lyricsList": { "structuredLyrics": {
                "kind": "main",
                "synced": true,
                "line": [{ "start": 0, "value": "combined voice line" }],
                "cueLine": [
                    { "index": 0, "start": 0, "end": 1000, "cue": [{ "start": 0, "end": 500, "value": "main" }] },
                    { "index": 0, "start": 0, "end": 1000, "cue": [{ "start": 500, "end": 1000, "value": "echo" }] }
                ]
            } }
        })).unwrap();
        assert_eq!(multi_voice.lrc, "[00:00.000]combined voice line");
        assert_eq!(multi_voice.yrc, None);
    }

    #[test]
    fn song_lyrics_extension_negotiation_caps_known_versions() {
        assert_eq!(
            parse_song_lyrics_extension_version(&serde_json::json!({
                "openSubsonicExtensions": [
                    { "name": "other", "versions": [1, 3] },
                    { "name": "songLyrics", "versions": [1, 2, 9] }
                ]
            })),
            2
        );
        assert_eq!(
            parse_song_lyrics_extension_version(&serde_json::json!({
                "openSubsonicExtensions": [{ "name": "songLyrics", "versions": [1] }]
            })),
            1
        );
        assert_eq!(
            parse_song_lyrics_extension_version(
                &serde_json::json!({ "openSubsonicExtensions": [] })
            ),
            0
        );
    }

    #[test]
    fn lyric_requests_keep_the_song_id_and_credentials_inside_the_native_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let mut targets = Vec::new();
            for body in [
                r#"{"subsonic-response":{"status":"ok","openSubsonicExtensions":[{"name":"songLyrics","versions":[1,2]}]}}"#,
                r#"{"subsonic-response":{"status":"ok","lyricsList":{"structuredLyrics":{"synced":true,"line":{"start":1000,"value":"A line"}}}}}"#,
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                loop {
                    let count = stream.read(&mut buffer).unwrap_or(0);
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                    if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        break;
                    }
                }
                targets.push(
                    String::from_utf8_lossy(&request)
                        .lines()
                        .next()
                        .unwrap_or_default()
                        .to_string(),
                );
                let response = reply("200 OK", body);
                let _ = stream.write_all(response.as_bytes());
            }
            targets
        });

        let lyrics = tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            session.lyrics("track/one").await.unwrap().unwrap()
        });
        assert_eq!(lyrics.lrc, "[00:01.000]A line");
        let targets = worker.join().unwrap();
        assert!(targets[0].contains("getOpenSubsonicExtensions.view"));
        assert!(targets[1].contains("getLyricsBySongId.view"));
        assert!(targets[1].contains("id=track%2Fone"));
        assert!(targets[1].contains("enhanced=true"));
        for target in targets {
            assert!(!target.contains("private-password"));
        }
    }

    #[test]
    fn v1_song_lyrics_servers_receive_no_enhanced_parameter() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let mut targets = Vec::new();
            for body in [
                r#"{"subsonic-response":{"status":"ok","openSubsonicExtensions":[{"name":"songLyrics","versions":[1]}]}}"#,
                r#"{"subsonic-response":{"status":"ok","lyricsList":{"structuredLyrics":{"synced":true,"line":{"start":2000,"value":"Older server line"}}}}}"#,
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                loop {
                    let count = stream.read(&mut buffer).unwrap_or(0);
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                    if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        break;
                    }
                }
                targets.push(
                    String::from_utf8_lossy(&request)
                        .lines()
                        .next()
                        .unwrap_or_default()
                        .to_string(),
                );
                let response = reply("200 OK", body);
                let _ = stream.write_all(response.as_bytes());
            }
            targets
        });

        let lyrics = tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            session.lyrics("old-track").await.unwrap().unwrap()
        });
        assert_eq!(lyrics.lrc, "[00:02.000]Older server line");
        let targets = worker.join().unwrap();
        assert!(targets[1].contains("getLyricsBySongId.view"));
        assert!(targets[1].contains("id=old-track"));
        assert!(!targets[1].contains("enhanced=true"));
    }

    #[test]
    fn remote_cover_art_has_a_smaller_decode_budget_than_embedded_covers() {
        assert!(crate::library::validate_remote_cover_dimensions(
            &png_header(384, 384),
            &lofty::picture::MimeType::Png,
        )
        .is_ok());
        assert!(crate::library::validate_remote_cover_dimensions(
            &png_header(2049, 1),
            &lofty::picture::MimeType::Png,
        )
        .is_err());
        assert!(crate::library::validate_remote_cover_dimensions(
            &png_header(2048, 2048),
            &lofty::picture::MimeType::Png,
        )
        .is_ok());
    }

    #[test]
    fn album_requests_keep_authentication_on_the_native_side() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let mut targets = Vec::new();
            for body in [
                r#"{"subsonic-response":{"status":"ok","albumList2":{"album":[{"id":"album-1","name":"Record","artist":"Artist","songCount":1,"coverArt":"cover-1"}]}}}"#,
                r#"{"subsonic-response":{"status":"ok","album":{"id":"album-1","name":"Record","artist":"Artist","songCount":1,"coverArt":"cover-1","song":{"id":"track-1","title":"First song","duration":100}}}}"#,
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                loop {
                    let count = stream.read(&mut buffer).unwrap_or(0);
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                    if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        break;
                    }
                }
                let target = String::from_utf8_lossy(&request)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                let response = reply("200 OK", body);
                let _ = stream.write_all(response.as_bytes());
                targets.push(target);
            }
            targets
        });

        tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            assert!(session.albums(MAX_ALBUM_OFFSET + 1).await.is_err());
            let page = session.albums(0).await.unwrap();
            assert_eq!(page.albums.len(), 1);
            let detail = session.album_tracks("album-1").await.unwrap();
            assert_eq!(detail.tracks.len(), 1);
        });

        let targets = worker.join().unwrap();
        assert!(targets[0].contains("getAlbumList2.view"));
        assert!(targets[0].contains("type=newest"));
        assert!(targets[0].contains("size=25"));
        assert!(targets[1].contains("getAlbum.view"));
        for target in targets {
            assert!(!target.contains("private-password"));
        }
    }

    #[test]
    fn cover_art_is_fetched_with_native_auth_and_signature_checked() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            loop {
                let count = stream.read(&mut buffer).unwrap_or(0);
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    break;
                }
            }
            let target = String::from_utf8_lossy(&request)
                .lines()
                .next()
                .unwrap_or_default()
                .to_string();
            let body = png_header(384, 384);
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(headers.as_bytes()).unwrap();
            stream.write_all(&body).unwrap();
            target
        });

        let cover = tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            session.cover_art("cover-1").await.unwrap()
        });

        assert_eq!(cover.content_type, "image/png");
        assert!(cover.body.starts_with(b"\x89PNG\r\n\x1a\n"));
        let target = worker.join().unwrap();
        assert!(target.contains("getCoverArt.view"));
        assert!(target.contains("id=cover-1"));
        assert!(target.contains("size=384"));
        assert!(!target.contains("private-password"));
    }

    #[test]
    fn session_auth_uses_salted_token_and_search_does_not_send_password() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let mut targets = Vec::new();
            for (index, body) in [
                r#"{"subsonic-response":{"status":"ok","version":"1.16.1"}}"#,
                r#"{"subsonic-response":{"status":"ok","searchResult3":{"song":[{"id":"track-1","title":"First song","artist":"Artist","album":"Album","duration":182}]}}}"#,
            ]
            .iter()
            .enumerate()
            {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                loop {
                    let count = stream.read(&mut buffer).unwrap_or(0);
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                    if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8_lossy(&request);
                let target = request.lines().next().unwrap_or_default().to_string();
                targets.push(target.clone());
                let response = reply("200 OK", body);
                let _ = stream.write_all(response.as_bytes());
                if index == 1 {
                    assert!(target.contains("search3.view"));
                }
            }
            targets
        });

        tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            session.ping().await.unwrap();
            let songs = session.search("quiet night", 20).await.unwrap();
            assert_eq!(songs.len(), 1);
            assert_eq!(songs[0].title, "First song");
        });

        let targets = worker.join().unwrap();
        for target in targets {
            assert!(!target.contains("private-password"));
            let path = target.split_whitespace().nth(1).unwrap();
            let url = Url::parse(&format!("http://{address}{path}")).unwrap();
            let pairs = url
                .query_pairs()
                .into_owned()
                .collect::<std::collections::HashMap<_, _>>();
            let salt = pairs.get("s").unwrap();
            let token = pairs.get("t").unwrap();
            assert_eq!(
                token,
                &format!("{:x}", md5::compute(format!("private-password{salt}")))
            );
            assert_eq!(pairs.get("u").map(String::as_str), Some("listener"));
        }
    }

    #[test]
    fn stream_requests_are_range_limited_and_return_only_audio_bytes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            loop {
                let count = stream.read(&mut buffer).unwrap_or(0);
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            let request = request.to_ascii_lowercase();
            assert!(request.contains("range: bytes=0-4194303"));
            assert!(!request.contains("private-password"));
            stream
                .write_all(
                    b"HTTP/1.1 206 Partial Content\r\nContent-Type: audio/mpeg\r\nContent-Range: bytes 0-4/10\r\nContent-Length: 5\r\nConnection: close\r\n\r\n12345",
                )
                .unwrap();
        });

        let chunk = tauri::async_runtime::block_on(async {
            let session =
                SubsonicSession::new(&format!("http://{address}"), "listener", "private-password")
                    .unwrap();
            session
                .stream_chunk("track-1", Some("bytes=0-99999999"))
                .await
                .unwrap()
        });
        worker.join().unwrap();
        assert_eq!(chunk.body, b"12345");
        assert_eq!(chunk.content_type, "audio/mpeg");
        assert_eq!(chunk.content_range, "bytes 0-4/10");
    }
}
