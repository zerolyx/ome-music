//! Session-only Jellyfin music source.
//!
//! The webview receives only bounded song metadata and opaque item IDs. Passwords
//! and access tokens stay in this Rust session and are sent only in HTTPS/local
//! HTTP requests to the explicitly configured server.

use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;

use rand::distributions::Alphanumeric;
use rand::Rng;
use reqwest::header::{ACCEPT_ENCODING, AUTHORIZATION, CONTENT_RANGE, CONTENT_TYPE, RANGE};
use reqwest::{Method, RequestBuilder, Url};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

const CLIENT_NAME: &str = "Ome Music";
const DEVICE_NAME: &str = "Windows Desktop";
const MAX_QUERY_BYTES: usize = 256;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_COVER_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const MAX_STREAM_CHUNK_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ID_BYTES: usize = 64;
const MAX_LYRIC_LINES: usize = 2000;
const MAX_LYRIC_LINE_CHARS: usize = 2000;
const TICKS_PER_SECOND: u64 = 10_000_000;
const MAX_LYRIC_TICKS: u64 = 24 * 60 * 60 * TICKS_PER_SECOND;
const ALBUM_PAGE_SIZE: u32 = 24;
const MAX_ALBUM_OFFSET: u32 = 100_000;
const MAX_REMOTE_PLAYLISTS: usize = 100;
const MAX_REMOTE_TRACKS: usize = 200;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MediaServerProtocol {
    Jellyfin,
    Emby,
}

impl MediaServerProtocol {
    fn label(self) -> &'static str {
        match self {
            Self::Jellyfin => "Jellyfin",
            Self::Emby => "Emby",
        }
    }
}

#[derive(Clone)]
pub(crate) struct RemoteMediaSession {
    protocol: MediaServerProtocol,
    base_url: Url,
    user_id: String,
    access_token: String,
    device_id: String,
    server_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinStatus {
    pub connected: bool,
    pub server_label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinSongDto {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: u32,
    pub cover_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinAlbumDto {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub year: Option<u32>,
    pub song_count: u32,
    pub cover_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinAlbumPageDto {
    pub albums: Vec<JellyfinAlbumDto>,
    pub offset: u32,
    pub next_offset: u32,
    pub total_count: u32,
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinPlaylistDto {
    pub id: String,
    pub name: String,
    pub song_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinPlaylistPageDto {
    pub playlists: Vec<JellyfinPlaylistDto>,
    pub total_count: u32,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinTracksPageDto {
    pub tracks: Vec<JellyfinSongDto>,
    pub total_count: u32,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JellyfinLyricsDto {
    pub lrc: String,
    pub yrc: Option<String>,
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

impl RemoteMediaSession {
    async fn authenticate(
        protocol: MediaServerProtocol,
        server_url: &str,
        username: &str,
        password: &str,
    ) -> Result<Self, String> {
        let base_url = validate_server_url(server_url)?;
        let username = username.trim();
        if username.is_empty() || username.len() > 256 || username.chars().any(char::is_control) {
            return Err("请输入有效的远程曲库用户名".to_string());
        }
        if password.is_empty() || password.len() > 1024 || password.chars().any(char::is_control) {
            return Err("请输入有效的远程曲库密码".to_string());
        }

        let device_id: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();
        let server_label = base_url.host_str().unwrap_or(protocol.label()).to_string();
        let auth_header = authorization_header(protocol, None, &device_id, None);
        let url = base_url
            .join("Users/AuthenticateByName")
            .map_err(|_| "无法识别远程曲库服务器地址".to_string())?;
        let response = http_client()
            .post(url)
            .header(AUTHORIZATION, auth_header)
            .header(CONTENT_TYPE, "application/json")
            .json(&serde_json::json!({ "Username": username, "Pw": password }))
            .send()
            .await
            .map_err(|_| "远程曲库服务器暂时无法连接".to_string())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(format!(
                "{} 登录失败，请检查服务器、用户名与密码",
                protocol.label()
            ));
        }
        let bytes = read_limited_body(response, MAX_RESPONSE_BYTES).await?;
        let auth: Value =
            serde_json::from_slice(&bytes).map_err(|_| "无法识别远程曲库登录响应".to_string())?;
        let access_token = auth
            .get("AccessToken")
            .and_then(Value::as_str)
            .filter(|value| {
                !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
            })
            .ok_or_else(|| format!("{} 未返回有效的登录令牌", protocol.label()))?
            .to_string();
        let user_id = auth
            .get("User")
            .and_then(|user| user.get("Id"))
            .and_then(Value::as_str)
            .filter(|value| valid_item_id(value))
            .ok_or_else(|| format!("{} 未返回有效的用户标识", protocol.label()))?
            .to_string();

        Ok(Self {
            protocol,
            base_url,
            user_id,
            access_token,
            device_id,
            server_label,
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, String> {
        self.base_url
            .join(path)
            .map_err(|_| "无法识别远程曲库服务器地址".to_string())
    }

    fn auth_header(&self) -> String {
        authorization_header(
            self.protocol,
            Some(&self.user_id),
            &self.device_id,
            Some(&self.access_token),
        )
    }

    fn apply_auth(&self, request: RequestBuilder) -> RequestBuilder {
        let request = request.header(AUTHORIZATION, self.auth_header());
        match self.protocol {
            MediaServerProtocol::Jellyfin => request,
            MediaServerProtocol::Emby => request.header("X-Emby-Token", &self.access_token),
        }
    }

    async fn request_json(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Value, String> {
        self.request_json_optional(method, path, query)
            .await?
            .ok_or_else(|| "远程曲库暂时无法提供资料".to_string())
    }

    async fn request_json_optional(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Option<Value>, String> {
        let mut url = self.endpoint(path)?;
        if !query.is_empty() {
            url.query_pairs_mut()
                .extend_pairs(query.iter().map(|(key, value)| (*key, value)));
        }
        let response = self
            .apply_auth(http_client().request(method, url))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|_| "远程曲库服务器暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err("远程曲库暂时无法提供资料".to_string());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err("远程曲库返回内容超出大小限制".to_string());
        }
        let bytes = read_limited_body(response, MAX_RESPONSE_BYTES).await?;
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "无法识别远程曲库返回的资料".to_string())
    }

    pub fn status(&self) -> JellyfinStatus {
        JellyfinStatus {
            connected: true,
            server_label: Some(self.server_label.clone()),
        }
    }

    pub async fn search(&self, keywords: &str, limit: u32) -> Result<Vec<JellyfinSongDto>, String> {
        let query = keywords.trim();
        if query.is_empty() || query.len() > MAX_QUERY_BYTES || query.chars().any(char::is_control)
        {
            return Err("请输入不超过 256 字节的搜索内容".to_string());
        }
        let limit = limit.clamp(1, 30);
        let response = self
            .request_json(
                Method::GET,
                "Items",
                &[
                    ("userId", self.user_id.clone()),
                    ("searchTerm", query.to_string()),
                    ("includeItemTypes", "Audio".to_string()),
                    ("recursive", "true".to_string()),
                    ("limit", limit.to_string()),
                    ("enableTotalRecordCount", "false".to_string()),
                ],
            )
            .await?;
        let items = response
            .get("Items")
            .map(values_as_array)
            .unwrap_or_default();
        Ok(items
            .into_iter()
            .filter_map(parse_song)
            .take(limit as usize)
            .collect())
    }

    pub async fn albums(&self, offset: u32) -> Result<JellyfinAlbumPageDto, String> {
        let offset = offset.min(MAX_ALBUM_OFFSET);
        let response = self
            .request_json(
                Method::GET,
                "Items",
                &[
                    ("userId", self.user_id.clone()),
                    ("includeItemTypes", "MusicAlbum".to_string()),
                    ("recursive", "true".to_string()),
                    ("startIndex", offset.to_string()),
                    ("limit", (ALBUM_PAGE_SIZE + 1).to_string()),
                    ("enableTotalRecordCount", "true".to_string()),
                ],
            )
            .await?;
        Ok(parse_album_page(&response, offset))
    }

    pub async fn album_tracks(&self, album_id: &str) -> Result<JellyfinTracksPageDto, String> {
        let album_id = validate_item_id(album_id)?;
        let response = self
            .request_json(
                Method::GET,
                "Items",
                &[
                    ("userId", self.user_id.clone()),
                    ("parentId", album_id.to_string()),
                    ("includeItemTypes", "Audio".to_string()),
                    ("recursive", "true".to_string()),
                    ("startIndex", "0".to_string()),
                    ("limit", (MAX_REMOTE_TRACKS as u32 + 1).to_string()),
                    ("enableTotalRecordCount", "true".to_string()),
                    (
                        "sortBy",
                        "ParentIndexNumber,IndexNumber,SortName".to_string(),
                    ),
                ],
            )
            .await?;
        Ok(parse_track_page(&response, MAX_REMOTE_TRACKS))
    }

    pub async fn playlists(&self) -> Result<JellyfinPlaylistPageDto, String> {
        let response = self
            .request_json(
                Method::GET,
                "Items",
                &[
                    ("userId", self.user_id.clone()),
                    ("includeItemTypes", "Playlist".to_string()),
                    ("mediaTypes", "Audio".to_string()),
                    ("recursive", "true".to_string()),
                    ("startIndex", "0".to_string()),
                    ("limit", (MAX_REMOTE_PLAYLISTS as u32 + 1).to_string()),
                    ("enableTotalRecordCount", "true".to_string()),
                ],
            )
            .await?;
        Ok(parse_playlist_page(&response))
    }

    pub async fn playlist_tracks(
        &self,
        playlist_id: &str,
    ) -> Result<JellyfinTracksPageDto, String> {
        let playlist_id = validate_item_id(playlist_id)?;
        let response = self
            .request_json(
                Method::GET,
                &format!("Playlists/{playlist_id}/Items"),
                &[
                    ("userId", self.user_id.clone()),
                    ("startIndex", "0".to_string()),
                    ("limit", (MAX_REMOTE_TRACKS as u32 + 1).to_string()),
                ],
            )
            .await?;
        Ok(parse_track_page(&response, MAX_REMOTE_TRACKS))
    }

    pub async fn lyrics(&self, item_id: &str) -> Result<Option<JellyfinLyricsDto>, String> {
        if self.protocol != MediaServerProtocol::Jellyfin {
            return Err("当前远程曲库不支持原生歌词读取".to_string());
        }
        let item_id = validate_item_id(item_id)?;
        let response = self
            .request_json_optional(Method::GET, &format!("Audio/{item_id}/Lyrics"), &[])
            .await?;
        Ok(response.as_ref().and_then(parse_jellyfin_lyrics))
    }

    pub async fn stream_chunk(
        &self,
        item_id: &str,
        range: Option<&str>,
    ) -> Result<StreamChunk, String> {
        let item_id = validate_item_id(item_id)?;
        let (start, end) = bounded_range(range)?;
        let mut url = self.endpoint(&format!("Audio/{item_id}/stream"))?;
        url.query_pairs_mut()
            .append_pair("static", "true")
            .append_pair("UserId", &self.user_id);
        let response = self
            .apply_auth(http_client().get(url))
            .header(ACCEPT_ENCODING, "identity")
            .header(RANGE, format!("bytes={start}-{end}"))
            .send()
            .await
            .map_err(|_| "远程曲目暂时无法读取".to_string())?;
        if response.status() != reqwest::StatusCode::PARTIAL_CONTENT
            || response
                .content_length()
                .is_some_and(|length| length > MAX_STREAM_CHUNK_BYTES)
        {
            return Err("远程曲库未返回安全的分段音频".to_string());
        }
        let content_range = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|header| header.to_str().ok())
            .filter(|value| valid_content_range(value, start, end))
            .ok_or_else(|| "远程曲库未返回有效的音频分段".to_string())?
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
            return Err("远程曲库返回了空音频分段".to_string());
        }
        Ok(StreamChunk {
            content_type,
            content_range,
            body,
        })
    }

    pub async fn cover_art(&self, item_id: &str) -> Result<CoverArt, String> {
        let item_id = validate_item_id(item_id)?;
        let url = self.endpoint(&format!("Items/{item_id}/Images/Primary?maxWidth=384"))?;
        let response = self
            .apply_auth(http_client().get(url))
            .header("Accept", "image/png,image/jpeg")
            .header(ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|_| "远程曲目封面暂时无法读取".to_string())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_COVER_BYTES as u64)
        {
            return Err("远程曲库暂时无法提供封面".to_string());
        }
        let body = read_limited_body(response, MAX_COVER_BYTES).await?;
        let (content_type, mime_type) = if body.starts_with(b"\x89PNG\r\n\x1a\n") {
            ("image/png", lofty::picture::MimeType::Png)
        } else if body.starts_with(&[0xff, 0xd8, 0xff]) {
            ("image/jpeg", lofty::picture::MimeType::Jpeg)
        } else {
            return Err("远程曲库返回了不支持的封面格式".to_string());
        };
        crate::library::validate_remote_cover_dimensions(&body, &mime_type)
            .map_err(|_| "远程曲库返回的封面无效".to_string())?;
        Ok(CoverArt { content_type, body })
    }
}

fn validate_server_url(raw: &str) -> Result<Url, String> {
    if raw.trim().len() > 2048 {
        return Err("远程曲库服务器地址过长".to_string());
    }
    let mut url =
        Url::parse(raw.trim()).map_err(|_| "请输入有效的远程曲库服务器地址".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "请输入有效的远程曲库服务器地址".to_string())?;
    let secure = url.scheme() == "https";
    let local = is_private_host(host);
    if !(secure || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("公网远程曲库服务器必须使用 HTTPS；HTTP 仅允许本机或局域网地址".to_string());
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

fn is_private_host(host: &str) -> bool {
    let host = host.trim().trim_matches(['[', ']']).to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return true;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
        Ok(IpAddr::V6(ip)) => ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00,
        Err(_) => false,
    }
}

fn authorization_header(
    protocol: MediaServerProtocol,
    user_id: Option<&str>,
    device_id: &str,
    token: Option<&str>,
) -> String {
    match protocol {
        MediaServerProtocol::Jellyfin => {
            let token = token
                .map(|value| format!(", Token=\"{value}\""))
                .unwrap_or_default();
            format!(
                "MediaBrowser Client=\"{CLIENT_NAME}\", Device=\"{DEVICE_NAME}\", DeviceId=\"{device_id}\", Version=\"{}\"{token}",
                env!("CARGO_PKG_VERSION")
            )
        }
        MediaServerProtocol::Emby => {
            let user = user_id
                .map(|id| format!("UserId=\"{id}\", "))
                .unwrap_or_default();
            format!(
                "Emby {user}Client=\"{CLIENT_NAME}\", Device=\"{DEVICE_NAME}\", DeviceId=\"{device_id}\", Version=\"{}\"",
                env!("CARGO_PKG_VERSION")
            )
        }
    }
}

fn parse_song(raw: &Value) -> Option<JellyfinSongDto> {
    if raw.get("Type").and_then(Value::as_str) != Some("Audio")
        || raw.get("MediaType").and_then(Value::as_str) != Some("Audio")
    {
        return None;
    }
    let id = raw
        .get("Id")
        .and_then(Value::as_str)
        .filter(|id| valid_item_id(id))?;
    let title = clean_text(raw.get("Name"), 200)?;
    let artist = raw
        .get("Artists")
        .map(values_as_array)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| clean_text(Some(value), 120))
        .take(5)
        .collect::<Vec<_>>()
        .join("、");
    let album = clean_text(raw.get("Album"), 200).unwrap_or_default();
    let duration_seconds = raw
        .get("RunTimeTicks")
        .and_then(Value::as_u64)
        .map(|ticks| (ticks / 10_000_000).min(u32::MAX as u64) as u32)
        .unwrap_or_default();
    let cover_id = raw
        .get("ImageTags")
        .and_then(|tags| tags.get("Primary"))
        .and_then(Value::as_str)
        .filter(|tag| {
            !tag.is_empty() && tag.len() <= MAX_ID_BYTES && !tag.chars().any(char::is_control)
        })
        .map(|_| id.to_string());
    Some(JellyfinSongDto {
        id: id.to_string(),
        title,
        artist,
        album,
        duration_seconds,
        cover_id,
    })
}

fn parse_album_page(raw: &Value, offset: u32) -> JellyfinAlbumPageDto {
    let entries = json_field(raw, "Items", "items")
        .map(values_as_array)
        .unwrap_or_default();
    let raw_page_len = entries.len().min(ALBUM_PAGE_SIZE as usize);
    let albums = entries
        .iter()
        .take(ALBUM_PAGE_SIZE as usize)
        .filter_map(|item| parse_album(item))
        .collect::<Vec<_>>();
    let next_offset = offset.saturating_add(raw_page_len as u32);
    let observed_total = offset.saturating_add(entries.len().min(u32::MAX as usize) as u32);
    let total_count = response_total_count(raw, observed_total).max(observed_total);
    let has_more = entries.len() > ALBUM_PAGE_SIZE as usize || total_count > next_offset;
    JellyfinAlbumPageDto {
        albums,
        offset,
        next_offset,
        total_count,
        has_more,
    }
}

fn parse_album(raw: &Value) -> Option<JellyfinAlbumDto> {
    if json_field(raw, "Type", "type").and_then(Value::as_str) != Some("MusicAlbum") {
        return None;
    }
    let id = json_field(raw, "Id", "id")
        .and_then(Value::as_str)
        .filter(|id| valid_item_id(id))?;
    let name = clean_text(json_field(raw, "Name", "name"), 200)?;
    let artist = remote_item_artist(raw);
    let year = json_field(raw, "ProductionYear", "productionYear")
        .and_then(parse_u32)
        .filter(|year| (1000..=9999).contains(year));
    let song_count = json_field(raw, "ChildCount", "childCount")
        .or_else(|| json_field(raw, "RecursiveItemCount", "recursiveItemCount"))
        .and_then(parse_u32)
        .unwrap_or_default();
    let cover_id = has_primary_image(raw).then(|| id.to_string());
    Some(JellyfinAlbumDto {
        id: id.to_string(),
        name,
        artist,
        year,
        song_count,
        cover_id,
    })
}

fn parse_playlist_page(raw: &Value) -> JellyfinPlaylistPageDto {
    let entries = json_field(raw, "Items", "items")
        .map(values_as_array)
        .unwrap_or_default();
    let playlists = entries
        .iter()
        .filter_map(|item| parse_playlist(item))
        .take(MAX_REMOTE_PLAYLISTS)
        .collect::<Vec<_>>();
    let fallback = entries.len().min(u32::MAX as usize) as u32;
    let total_count = response_total_count(raw, fallback).max(fallback);
    JellyfinPlaylistPageDto {
        truncated: entries.len() > MAX_REMOTE_PLAYLISTS || total_count as usize > playlists.len(),
        playlists,
        total_count,
    }
}

fn parse_playlist(raw: &Value) -> Option<JellyfinPlaylistDto> {
    if json_field(raw, "Type", "type").and_then(Value::as_str) != Some("Playlist")
        || !json_field(raw, "MediaType", "mediaType")
            .and_then(Value::as_str)
            .is_some_and(|media_type| media_type.eq_ignore_ascii_case("Audio"))
    {
        return None;
    }
    let id = json_field(raw, "Id", "id")
        .and_then(Value::as_str)
        .filter(|id| valid_item_id(id))?;
    let name = clean_text(json_field(raw, "Name", "name"), 200)?;
    let song_count = json_field(raw, "ChildCount", "childCount")
        .or_else(|| json_field(raw, "RecursiveItemCount", "recursiveItemCount"))
        .and_then(parse_u32)
        .unwrap_or_default();
    Some(JellyfinPlaylistDto {
        id: id.to_string(),
        name,
        song_count,
    })
}

fn parse_track_page(raw: &Value, limit: usize) -> JellyfinTracksPageDto {
    let entries = json_field(raw, "Items", "items")
        .map(values_as_array)
        .unwrap_or_default();
    let tracks = entries
        .iter()
        .filter_map(|item| parse_song(item))
        .take(limit)
        .collect::<Vec<_>>();
    let fallback = entries.len().min(u32::MAX as usize) as u32;
    let total_count =
        response_total_count(raw, fallback).max(tracks.len().min(u32::MAX as usize) as u32);
    let truncated = entries.len() > limit || total_count as usize > tracks.len();
    JellyfinTracksPageDto {
        tracks,
        total_count,
        truncated,
    }
}

fn response_total_count(raw: &Value, fallback: u32) -> u32 {
    json_field(raw, "TotalRecordCount", "totalRecordCount")
        .and_then(parse_u32)
        .unwrap_or(fallback)
}

fn parse_u32(value: &Value) -> Option<u32> {
    value
        .as_u64()
        .or_else(|| value.as_str()?.parse::<u64>().ok())
        .map(|value| value.min(u32::MAX as u64) as u32)
}

fn remote_item_artist(raw: &Value) -> String {
    if let Some(artist) = clean_text(json_field(raw, "AlbumArtist", "albumArtist"), 160) {
        return artist;
    }
    for key in ["AlbumArtists", "Artists"] {
        if let Some(value) = json_field(raw, key, &key.to_ascii_lowercase()) {
            let names = values_as_array(value)
                .into_iter()
                .filter_map(|item| clean_text(json_field(item, "Name", "name").or(Some(item)), 120))
                .take(5)
                .collect::<Vec<_>>();
            if !names.is_empty() {
                return names.join("、");
            }
        }
    }
    "未知艺人".to_string()
}

fn has_primary_image(raw: &Value) -> bool {
    json_field(raw, "ImageTags", "imageTags")
        .and_then(|tags| json_field(tags, "Primary", "primary"))
        .and_then(Value::as_str)
        .is_some_and(|tag| {
            !tag.is_empty() && tag.len() <= MAX_ID_BYTES && !tag.chars().any(char::is_control)
        })
}

fn valid_item_id(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn validate_item_id(raw: &str) -> Result<&str, String> {
    if !valid_item_id(raw) {
        return Err("无法识别远程曲目".to_string());
    }
    Ok(raw)
}

fn json_field<'a>(raw: &'a Value, pascal: &str, camel: &str) -> Option<&'a Value> {
    raw.get(pascal).or_else(|| raw.get(camel))
}

fn json_tick(raw: &Value, pascal: &str, camel: &str) -> Option<u64> {
    let value = json_field(raw, pascal, camel)?;
    value.as_u64().or_else(|| {
        value
            .as_i64()
            .filter(|value| *value >= 0)
            .map(|value| value as u64)
    })
}

fn apply_lyric_offset(ticks: u64, offset_ticks: i128) -> Option<u64> {
    let shifted = (ticks as i128 + offset_ticks).max(0);
    (shifted <= MAX_LYRIC_TICKS as i128).then_some(shifted as u64)
}

fn format_lrc_timestamp(ticks: u64) -> String {
    let centiseconds = ticks.saturating_add(50_000) / 100_000;
    let minutes = centiseconds / 6000;
    let seconds = (centiseconds % 6000) / 100;
    let fraction = centiseconds % 100;
    format!("[{minutes:02}:{seconds:02}.{fraction:02}]")
}

fn format_yrc_time(ticks: u64) -> u64 {
    ticks.saturating_add(5_000) / 10_000
}

fn extract_utf16_range(text: &str, start: usize, end: usize) -> Option<String> {
    let length = text.encode_utf16().count();
    if start >= end || end > length {
        return None;
    }
    let mut result = String::new();
    let mut offset = 0;
    for character in text.chars() {
        let next = offset + character.len_utf16();
        if offset < end && start < next {
            if offset < start || next > end {
                return None;
            }
            result.push(character);
        }
        offset = next;
    }
    (!result.is_empty()).then_some(result)
}

fn parse_word_cues(raw_line: &Value, text: &str, offset_ticks: i128) -> Option<(String, u64)> {
    let cues = json_field(raw_line, "Cues", "cues")?.as_array()?;
    if cues.is_empty() || cues.len() > MAX_LYRIC_LINES {
        return None;
    }

    let mut parsed = Vec::with_capacity(cues.len());
    for cue in cues {
        let position = usize::try_from(json_tick(cue, "Position", "position")?).ok()?;
        let end_position = usize::try_from(json_tick(cue, "EndPosition", "endPosition")?).ok()?;
        let start_ticks = apply_lyric_offset(json_tick(cue, "Start", "start")?, offset_ticks)?;
        let end_ticks = apply_lyric_offset(json_tick(cue, "End", "end")?, offset_ticks)?;
        if end_ticks <= start_ticks {
            return None;
        }
        let cue_text = extract_utf16_range(text, position, end_position)?;
        if cue_text.contains(['(', ')']) {
            // The shared YRC parser uses parentheses as timing delimiters.
            return None;
        }
        parsed.push((position, end_position, start_ticks, end_ticks, cue_text));
    }

    parsed.sort_by_key(|cue| cue.0);
    let mut text_offset = 0;
    let mut previous_start = 0;
    let mut line_end = 0;
    let mut encoded = String::new();
    let mut joined = String::new();
    for (position, end_position, start_ticks, end_ticks, cue_text) in parsed {
        if position != text_offset || start_ticks < previous_start {
            return None;
        }
        text_offset = end_position;
        previous_start = start_ticks;
        line_end = line_end.max(end_ticks);
        joined.push_str(&cue_text);
        let start_ms = format_yrc_time(start_ticks);
        let duration_ms = format_yrc_time(end_ticks.saturating_sub(start_ticks));
        encoded.push_str(&format!("({start_ms},{duration_ms}){cue_text}"));
    }
    if text_offset != text.encode_utf16().count() || joined != text {
        return None;
    }
    Some((encoded, line_end))
}

fn clean_lyric_line(raw: &Value) -> Option<String> {
    let text = json_field(raw, "Text", "text")?.as_str()?.trim();
    if text.is_empty()
        || text.chars().count() > MAX_LYRIC_LINE_CHARS
        || text.chars().any(char::is_control)
    {
        return None;
    }
    Some(text.to_string())
}

fn parse_jellyfin_lyrics(raw: &Value) -> Option<JellyfinLyricsDto> {
    let lines = json_field(raw, "Lyrics", "lyrics")?.as_array()?;
    let offset_ticks = raw
        .get("Metadata")
        .or_else(|| raw.get("metadata"))
        .and_then(|metadata| json_field(metadata, "Offset", "offset"))
        .and_then(|offset| {
            offset
                .as_i64()
                .map(i128::from)
                .or_else(|| offset.as_u64().map(i128::from))
        })
        .unwrap_or_default();
    let mut timed = Vec::new();
    let mut plain = Vec::new();

    for line in lines.iter().take(MAX_LYRIC_LINES) {
        let Some(text) = clean_lyric_line(line) else {
            continue;
        };
        let Some(raw_start) = json_tick(line, "Start", "start") else {
            plain.push(text);
            continue;
        };
        let Some(start) = apply_lyric_offset(raw_start, offset_ticks) else {
            continue;
        };
        let cues = parse_word_cues(line, &text, offset_ticks);
        timed.push((start, text, cues));
    }

    if timed.is_empty() {
        if plain.is_empty() {
            return None;
        }
        return Some(JellyfinLyricsDto {
            lrc: String::new(),
            yrc: None,
            plain_lyrics: Some(plain.join("\n")),
        });
    }

    let lrc = timed
        .iter()
        .map(|(start, text, _)| format!("{}{text}", format_lrc_timestamp(*start)))
        .collect::<Vec<_>>()
        .join("\n");
    let yrc = timed
        .iter()
        .map(|(start, _, cues)| {
            let (encoded_cues, line_end) = cues.as_ref()?;
            if line_end <= start {
                return None;
            }
            Some(format!(
                "[{},{}]{encoded_cues}",
                format_yrc_time(*start),
                format_yrc_time(line_end.saturating_sub(*start))
            ))
        })
        .collect::<Option<Vec<_>>>()
        .map(|lines| lines.join("\n"));

    Some(JellyfinLyricsDto {
        lrc,
        yrc,
        plain_lyrics: None,
    })
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
        return Err("远程曲库返回内容超出大小限制".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取远程曲库返回内容失败".to_string())?
    {
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err("远程曲库返回内容超出大小限制".to_string());
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

#[tauri::command]
pub async fn jellyfin_connect(
    state: State<'_, crate::AppState>,
    server_url: String,
    username: String,
    password: String,
) -> Result<JellyfinStatus, String> {
    let session = RemoteMediaSession::authenticate(
        MediaServerProtocol::Jellyfin,
        &server_url,
        &username,
        &password,
    )
    .await?;
    let status = session.status();
    *state
        .jellyfin_session
        .lock()
        .map_err(|_| "Jellyfin 状态暂时不可用".to_string())? = Some(session);
    Ok(status)
}

#[tauri::command]
pub fn jellyfin_status(state: State<'_, crate::AppState>) -> JellyfinStatus {
    state
        .jellyfin_session
        .lock()
        .ok()
        .and_then(|session| session.as_ref().map(RemoteMediaSession::status))
        .unwrap_or(JellyfinStatus {
            connected: false,
            server_label: None,
        })
}

#[tauri::command]
pub fn jellyfin_disconnect(state: State<'_, crate::AppState>) -> Result<(), String> {
    *state
        .jellyfin_session
        .lock()
        .map_err(|_| "Jellyfin 状态暂时不可用".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn jellyfin_search(
    state: State<'_, crate::AppState>,
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<JellyfinSongDto>, String> {
    let session = state
        .jellyfin_session
        .lock()
        .map_err(|_| "Jellyfin 状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接 Jellyfin 曲库".to_string())?;
    session.search(&keywords, limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn jellyfin_lyrics(
    state: State<'_, crate::AppState>,
    item_id: String,
) -> Result<Option<JellyfinLyricsDto>, String> {
    let session = state
        .jellyfin_session
        .lock()
        .map_err(|_| "Jellyfin 状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接 Jellyfin 曲库".to_string())?;
    session.lyrics(&item_id).await
}

fn required_session(
    state: &crate::AppState,
    protocol: MediaServerProtocol,
) -> Result<RemoteMediaSession, String> {
    let (slot, label) = match protocol {
        MediaServerProtocol::Jellyfin => (&state.jellyfin_session, "Jellyfin"),
        MediaServerProtocol::Emby => (&state.emby_session, "Emby"),
    };
    slot.lock()
        .map_err(|_| format!("{label} 状态暂时不可用"))?
        .clone()
        .ok_or_else(|| format!("请先连接 {label} 曲库"))
}

#[tauri::command]
pub async fn jellyfin_albums(
    state: State<'_, crate::AppState>,
    offset: Option<u32>,
) -> Result<JellyfinAlbumPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Jellyfin)?
        .albums(offset.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn jellyfin_album_tracks(
    state: State<'_, crate::AppState>,
    album_id: String,
) -> Result<JellyfinTracksPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Jellyfin)?
        .album_tracks(&album_id)
        .await
}

#[tauri::command]
pub async fn jellyfin_playlists(
    state: State<'_, crate::AppState>,
) -> Result<JellyfinPlaylistPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Jellyfin)?
        .playlists()
        .await
}

#[tauri::command]
pub async fn jellyfin_playlist_tracks(
    state: State<'_, crate::AppState>,
    playlist_id: String,
) -> Result<JellyfinTracksPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Jellyfin)?
        .playlist_tracks(&playlist_id)
        .await
}

#[tauri::command]
pub async fn emby_connect(
    state: State<'_, crate::AppState>,
    server_url: String,
    username: String,
    password: String,
) -> Result<JellyfinStatus, String> {
    let session = RemoteMediaSession::authenticate(
        MediaServerProtocol::Emby,
        &server_url,
        &username,
        &password,
    )
    .await?;
    let status = session.status();
    *state
        .emby_session
        .lock()
        .map_err(|_| "Emby 状态暂时不可用".to_string())? = Some(session);
    Ok(status)
}

#[tauri::command]
pub fn emby_status(state: State<'_, crate::AppState>) -> JellyfinStatus {
    state
        .emby_session
        .lock()
        .ok()
        .and_then(|session| session.as_ref().map(RemoteMediaSession::status))
        .unwrap_or(JellyfinStatus {
            connected: false,
            server_label: None,
        })
}

#[tauri::command]
pub fn emby_disconnect(state: State<'_, crate::AppState>) -> Result<(), String> {
    *state
        .emby_session
        .lock()
        .map_err(|_| "Emby 状态暂时不可用".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn emby_search(
    state: State<'_, crate::AppState>,
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<JellyfinSongDto>, String> {
    let session = state
        .emby_session
        .lock()
        .map_err(|_| "Emby 状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接 Emby 曲库".to_string())?;
    session.search(&keywords, limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn emby_albums(
    state: State<'_, crate::AppState>,
    offset: Option<u32>,
) -> Result<JellyfinAlbumPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Emby)?
        .albums(offset.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn emby_album_tracks(
    state: State<'_, crate::AppState>,
    album_id: String,
) -> Result<JellyfinTracksPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Emby)?
        .album_tracks(&album_id)
        .await
}

#[tauri::command]
pub async fn emby_playlists(
    state: State<'_, crate::AppState>,
) -> Result<JellyfinPlaylistPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Emby)?
        .playlists()
        .await
}

#[tauri::command]
pub async fn emby_playlist_tracks(
    state: State<'_, crate::AppState>,
    playlist_id: String,
) -> Result<JellyfinTracksPageDto, String> {
    required_session(state.inner(), MediaServerProtocol::Emby)?
        .playlist_tracks(&playlist_id)
        .await
}

pub(crate) async fn stream_chunk(
    session: &RemoteMediaSession,
    item_id: &str,
    range: Option<&str>,
) -> Result<StreamChunk, String> {
    session.stream_chunk(item_id, range).await
}

pub(crate) async fn cover_art(
    session: &RemoteMediaSession,
    item_id: &str,
) -> Result<CoverArt, String> {
    session.cover_art(item_id).await
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

    fn request(listener: &TcpListener, body: &str, expected_method: &str) -> String {
        request_with_status(listener, body, expected_method, "200 OK")
    }

    fn request_with_status(
        listener: &TcpListener,
        body: &str,
        expected_method: &str,
        status: &str,
    ) -> String {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 1024];
        loop {
            let count = stream.read(&mut buffer).unwrap_or(0);
            if count == 0 {
                break;
            }
            bytes.extend_from_slice(&buffer[..count]);
            if bytes.windows(4).any(|part| part == b"\r\n\r\n") {
                let header = String::from_utf8_lossy(&bytes);
                if let Some(length) = header.lines().find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|n| n.parse::<usize>().ok())
                }) {
                    let header_len = bytes
                        .windows(4)
                        .position(|part| part == b"\r\n\r\n")
                        .unwrap()
                        + 4;
                    if bytes.len() >= header_len + length {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
        let raw = String::from_utf8_lossy(&bytes).to_string();
        assert!(raw.starts_with(expected_method));
        let response = reply(status, body);
        let _ = stream.write_all(response.as_bytes());
        raw
    }

    #[test]
    fn accepts_secure_and_private_http_but_rejects_public_plaintext_and_credentials() {
        assert!(validate_server_url("https://music.example.com/jellyfin").is_ok());
        assert!(validate_server_url("http://192.168.1.12:8096").is_ok());
        assert!(validate_server_url("http://[fd00::1]:8096").is_ok());
        assert!(validate_server_url("http://music.example.com").is_err());
        assert!(validate_server_url("https://user:secret@music.example.com").is_err());
        assert!(validate_server_url("https://music.example.com?token=x").is_err());
    }

    #[test]
    fn parser_limits_items_to_audio_and_bounds_metadata() {
        let song = parse_song(&serde_json::json!({
            "Id": "01234567-89ab-cdef-0123-456789abcdef",
            "Type": "Audio",
            "MediaType": "Audio",
            "Name": "  Evening  ",
            "Artists": ["Artist A", "Artist B"],
            "Album": "Album",
            "RunTimeTicks": 182_999_999,
            "ImageTags": { "Primary": "etag" }
        }))
        .unwrap();
        assert_eq!(song.title, "Evening");
        assert_eq!(song.artist, "Artist A、Artist B");
        assert_eq!(song.duration_seconds, 18);
        assert_eq!(
            song.cover_id.as_deref(),
            Some("01234567-89ab-cdef-0123-456789abcdef")
        );
        assert!(parse_song(&serde_json::json!({
            "Id": "01234567-89ab-cdef-0123-456789abcdef",
            "Type": "Movie",
            "MediaType": "Video",
            "Name": "Not audio"
        }))
        .is_none());
        assert!(validate_item_id("../secret").is_err());
    }

    #[test]
    fn remote_catalog_parsers_filter_media_and_keep_page_limits() {
        let items = (0..=ALBUM_PAGE_SIZE)
            .map(|index| {
                serde_json::json!({
                    "Id": format!("01234567-89ab-cdef-0123-{index:012x}"),
                    "Type": "MusicAlbum",
                    "Name": format!("Album {index}"),
                    "AlbumArtist": "Artist",
                    "ProductionYear": 2024,
                    "ChildCount": 9,
                    "ImageTags": { "Primary": "etag" }
                })
            })
            .collect::<Vec<_>>();
        let albums = parse_album_page(
            &serde_json::json!({ "Items": items, "TotalRecordCount": 80 }),
            24,
        );
        assert_eq!(albums.albums.len(), 24);
        assert_eq!(albums.offset, 24);
        assert_eq!(albums.next_offset, 48);
        assert_eq!(albums.total_count, 80);
        assert!(albums.has_more);
        assert_eq!(albums.albums[0].artist, "Artist");
        assert_eq!(albums.albums[0].year, Some(2024));
        assert_eq!(albums.albums[0].song_count, 9);
        assert_eq!(
            albums.albums[0].cover_id.as_deref(),
            Some("01234567-89ab-cdef-0123-000000000000")
        );

        let playlist_items = (0..=MAX_REMOTE_PLAYLISTS)
            .map(|index| {
                serde_json::json!({
                    "Id": format!("01234567-89ab-cdef-0123-{index:012x}"),
                    "Type": "Playlist",
                    "MediaType": "Audio",
                    "Name": format!("Playlist {index}"),
                    "ChildCount": 12
                })
            })
            .chain([serde_json::json!({
                "Id": "01234567-89ab-cdef-0123-ffffffffffff",
                "Type": "Playlist",
                "MediaType": "Video",
                "Name": "Video only"
            })])
            .collect::<Vec<_>>();
        let playlists = parse_playlist_page(
            &serde_json::json!({ "Items": playlist_items, "TotalRecordCount": 101 }),
        );
        assert_eq!(playlists.playlists.len(), MAX_REMOTE_PLAYLISTS);
        assert_eq!(playlists.total_count, 102);
        assert!(playlists.truncated);
        assert_eq!(playlists.playlists[0].song_count, 12);

        let tracks = (0..=MAX_REMOTE_TRACKS)
            .map(|index| {
                serde_json::json!({
                    "Id": format!("01234567-89ab-cdef-0123-{index:012x}"),
                    "Type": "Audio",
                    "MediaType": "Audio",
                    "Name": format!("Track {index}"),
                    "Artists": ["Artist"]
                })
            })
            .chain([serde_json::json!({
                "Id": "01234567-89ab-cdef-0123-ffffffffffff",
                "Type": "Movie",
                "MediaType": "Video",
                "Name": "Not audio"
            })])
            .collect::<Vec<_>>();
        let page = parse_track_page(
            &serde_json::json!({ "Items": tracks, "TotalRecordCount": 201 }),
            MAX_REMOTE_TRACKS,
        );
        assert_eq!(page.tracks.len(), MAX_REMOTE_TRACKS);
        assert_eq!(page.total_count, 201);
        assert!(page.truncated);
    }

    #[test]
    fn emby_catalog_reads_use_authenticated_paged_endpoints_without_token_urls() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let albums = request(
                &listener,
                r#"{"Items":[],"TotalRecordCount":0}"#,
                "GET /Items?",
            );
            let album_tracks = request(
                &listener,
                r#"{"Items":[],"TotalRecordCount":0}"#,
                "GET /Items?",
            );
            let playlists = request(
                &listener,
                r#"{"Items":[],"TotalRecordCount":0}"#,
                "GET /Items?",
            );
            let playlist_tracks = request(
                &listener,
                r#"{"Items":[],"TotalRecordCount":0}"#,
                "GET /Playlists/01234567-89ab-cdef-0123-456789abcdef/Items?",
            );
            (albums, album_tracks, playlists, playlist_tracks)
        });
        let (albums, album_tracks, playlists, playlist_tracks) =
            tauri::async_runtime::block_on(async {
                let session = RemoteMediaSession {
                    protocol: MediaServerProtocol::Emby,
                    base_url: validate_server_url(&format!("http://{address}")).unwrap(),
                    user_id: "01234567-89ab-cdef-0123-456789abcdef".to_string(),
                    access_token: "private-token".to_string(),
                    device_id: "device-123".to_string(),
                    server_label: address.ip().to_string(),
                };
                let albums = session.albums(u32::MAX).await.unwrap();
                let album_tracks = session
                    .album_tracks("01234567-89ab-cdef-0123-456789abcdef")
                    .await
                    .unwrap();
                let playlists = session.playlists().await.unwrap();
                let playlist_tracks = session
                    .playlist_tracks("01234567-89ab-cdef-0123-456789abcdef")
                    .await
                    .unwrap();
                (albums, album_tracks, playlists, playlist_tracks)
            });
        let requests = worker.join().unwrap();

        assert!(requests
            .0
            .to_ascii_lowercase()
            .contains("x-emby-token: private-token"));
        assert!(requests.0.contains("includeItemTypes=MusicAlbum"));
        assert!(requests.0.contains("startIndex=100000"));
        assert!(requests.0.contains("limit=25"));
        assert!(requests
            .1
            .contains("parentId=01234567-89ab-cdef-0123-456789abcdef"));
        assert!(requests.1.contains("includeItemTypes=Audio"));
        assert!(requests.2.contains("includeItemTypes=Playlist"));
        assert!(requests.2.contains("mediaTypes=Audio"));
        assert!(requests
            .3
            .contains("userId=01234567-89ab-cdef-0123-456789abcdef"));
        assert!(!requests.0.lines().next().unwrap().contains("private-token"));
        assert!(!requests.1.lines().next().unwrap().contains("private-token"));
        assert_eq!(albums.offset, MAX_ALBUM_OFFSET);
        assert!(album_tracks.tracks.is_empty());
        assert!(playlists.playlists.is_empty());
        assert!(playlist_tracks.tracks.is_empty());
    }

    #[test]
    fn parses_jellyfin_line_and_word_timing_and_applies_metadata_offset() {
        let lyrics = parse_jellyfin_lyrics(&serde_json::json!({
            "Metadata": { "Offset": 500_000 },
            "Lyrics": [{
                "Start": 10_000_000,
                "Text": "你好世界",
                "Cues": [
                    { "Start": 10_000_000, "End": 15_000_000, "Position": 0, "EndPosition": 2 },
                    { "Start": 15_000_000, "End": 20_000_000, "Position": 2, "EndPosition": 4 }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(lyrics.lrc, "[00:01.05]你好世界");
        assert_eq!(
            lyrics.yrc.as_deref(),
            Some("[1050,1000](1050,500)你好(1550,500)世界")
        );
        assert_eq!(lyrics.plain_lyrics, None);
    }

    #[test]
    fn maps_jellyfin_utf16_cue_positions_and_falls_back_to_line_lyrics_when_cues_are_invalid() {
        let with_surrogate_pair = parse_jellyfin_lyrics(&serde_json::json!({
            "lyrics": [{
                "start": 0,
                "text": "A😀B",
                "cues": [
                    { "start": 0, "end": 10_000_000, "position": 0, "endPosition": 1 },
                    { "start": 10_000_000, "end": 20_000_000, "position": 1, "endPosition": 3 },
                    { "start": 20_000_000, "end": 30_000_000, "position": 3, "endPosition": 4 }
                ]
            }]
        }))
        .unwrap();
        assert_eq!(
            with_surrogate_pair.yrc.as_deref(),
            Some("[0,3000](0,1000)A(1000,1000)😀(2000,1000)B")
        );

        let invalid_cues = parse_jellyfin_lyrics(&serde_json::json!({
            "Lyrics": [{
                "Start": 10_000_000,
                "Text": "完整主歌词",
                "Cues": [{ "Start": 10_000_000, "End": 11_000_000, "Position": 1, "EndPosition": 4 }]
            }]
        }))
        .unwrap();
        assert_eq!(invalid_cues.lrc, "[00:01.00]完整主歌词");
        assert_eq!(invalid_cues.yrc, None);
    }

    #[test]
    fn uses_plain_lyrics_when_jellyfin_lines_have_no_timestamps() {
        let lyrics = parse_jellyfin_lyrics(&serde_json::json!({
            "Lyrics": [
                { "Text": "第一行" },
                { "Text": "第二行" },
                { "Text": "  " },
                { "Text": "不显示\n控制字符" }
            ]
        }))
        .unwrap();
        assert_eq!(lyrics.lrc, "");
        assert_eq!(lyrics.yrc, None);
        assert_eq!(lyrics.plain_lyrics.as_deref(), Some("第一行\n第二行"));
    }

    #[test]
    fn authentication_keeps_credentials_out_of_query_and_returns_only_status() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            request(
                &listener,
                r#"{"AccessToken":"sensitive-token","User":{"Id":"01234567-89ab-cdef-0123-456789abcdef"}}"#,
                "POST /Users/AuthenticateByName",
            )
        });
        let status = tauri::async_runtime::block_on(async {
            let session = RemoteMediaSession::authenticate(
                MediaServerProtocol::Jellyfin,
                &format!("http://{address}"),
                "listener",
                "private-password",
            )
            .await
            .unwrap();
            assert_eq!(session.access_token, "sensitive-token");
            session.status()
        });
        let request = worker.join().unwrap();
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: mediabrowser client=\"ome music\""));
        assert!(request.contains("\"Username\":\"listener\""));
        assert!(request.contains("\"Pw\":\"private-password\""));
        assert!(!request.lines().next().unwrap().contains("private-password"));
        assert!(!request.lines().next().unwrap().contains("sensitive-token"));
        let expected_server_label = address.ip().to_string();
        assert_eq!(
            status.server_label.as_deref(),
            Some(expected_server_label.as_str())
        );
    }

    #[test]
    fn search_sends_bounded_audio_only_query_and_auth_in_header() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            request(
                &listener,
                r#"{"Items":[{"Id":"01234567-89ab-cdef-0123-456789abcdef","Type":"Audio","MediaType":"Audio","Name":"Track","Artists":["Artist"],"Album":"Album","RunTimeTicks":1200000000}]}"#,
                "GET /Items?",
            )
        });
        let (songs, session) = tauri::async_runtime::block_on(async {
            let session = RemoteMediaSession {
                protocol: MediaServerProtocol::Jellyfin,
                base_url: validate_server_url(&format!("http://{address}")).unwrap(),
                user_id: "01234567-89ab-cdef-0123-456789abcdef".to_string(),
                access_token: "sensitive-token".to_string(),
                device_id: "device-123".to_string(),
                server_label: address.ip().to_string(),
            };
            (session.search("hello world", 20).await.unwrap(), session)
        });
        let request = worker.join().unwrap();
        assert!(request.contains("searchTerm=hello+world"));
        assert!(request.contains("includeItemTypes=Audio"));
        assert!(request.contains("Token=\"sensitive-token\""));
        assert!(!request.lines().next().unwrap().contains("sensitive-token"));
        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0].duration_seconds, 120);
        assert!(session.status().connected);
    }

    #[test]
    fn jellyfin_lyrics_uses_the_authenticated_read_only_endpoint_and_treats_404_as_absent() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let missing = request_with_status(
                &listener,
                "{}",
                "GET /Audio/01234567-89ab-cdef-0123-456789abcdef/Lyrics",
                "404 Not Found",
            );
            let found = request(
                &listener,
                r#"{"Lyrics":[{"Start":10000000,"Text":"Jellyfin lyric"}]}"#,
                "GET /Audio/01234567-89ab-cdef-0123-456789abcdef/Lyrics",
            );
            (missing, found)
        });
        let result = tauri::async_runtime::block_on(async {
            let session = RemoteMediaSession {
                protocol: MediaServerProtocol::Jellyfin,
                base_url: validate_server_url(&format!("http://{address}")).unwrap(),
                user_id: "01234567-89ab-cdef-0123-456789abcdef".to_string(),
                access_token: "sensitive-token".to_string(),
                device_id: "device-123".to_string(),
                server_label: address.ip().to_string(),
            };
            assert_eq!(
                session
                    .lyrics("01234567-89ab-cdef-0123-456789abcdef")
                    .await
                    .unwrap(),
                None
            );
            session
                .lyrics("01234567-89ab-cdef-0123-456789abcdef")
                .await
                .unwrap()
                .unwrap()
        });
        let (missing, found) = worker.join().unwrap();
        assert!(missing
            .to_ascii_lowercase()
            .contains("authorization: mediabrowser"));
        assert!(found.contains("Token=\"sensitive-token\""));
        assert!(!found.lines().next().unwrap().contains("sensitive-token"));
        assert_eq!(result.lrc, "[00:01.00]Jellyfin lyric");
        assert_eq!(result.plain_lyrics, None);
    }

    #[test]
    fn emby_uses_emby_authorization_and_keeps_access_token_in_its_header() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let authentication = request(
                &listener,
                r#"{"AccessToken":"sensitive-token","User":{"Id":"01234567-89ab-cdef-0123-456789abcdef"}}"#,
                "POST /Users/AuthenticateByName",
            );
            let search = request(&listener, r#"{"Items":[]}"#, "GET /Items?");
            (authentication, search)
        });
        tauri::async_runtime::block_on(async {
            let session = RemoteMediaSession::authenticate(
                MediaServerProtocol::Emby,
                &format!("http://{address}"),
                "listener",
                "private-password",
            )
            .await
            .unwrap();
            assert!(session.search("ambient", 20).await.unwrap().is_empty());
        });
        let (authentication, search) = worker.join().unwrap();
        let authentication_lower = authentication.to_ascii_lowercase();
        assert!(authentication_lower.contains("authorization: emby client=\"ome music\""));
        assert!(authentication.contains("\"Pw\":\"private-password\""));
        assert!(!authentication
            .lines()
            .next()
            .unwrap()
            .contains("private-password"));

        let search_lower = search.to_ascii_lowercase();
        assert!(search_lower.contains("x-emby-token: sensitive-token"));
        assert!(search_lower
            .contains("authorization: emby userid=\"01234567-89ab-cdef-0123-456789abcdef\""));
        assert!(!search.lines().next().unwrap().contains("sensitive-token"));
        assert!(!search.lines().next().unwrap().contains("private-password"));
    }

    #[test]
    fn bounds_stream_ranges_and_validates_content_range() {
        assert_eq!(
            bounded_range(None).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert_eq!(
            bounded_range(Some("bytes=12-")).unwrap(),
            (12, 12 + MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert!(bounded_range(Some("bytes=0-1,4-5")).is_err());
        assert!(bounded_range(Some("bytes=-1024")).is_err());
        assert!(valid_content_range("bytes 0-4/8", 0, 4));
        assert!(!valid_content_range("bytes 0-4/4", 0, 4));
        assert!(!valid_content_range("bytes 0-99/100", 0, 4));
    }
}
