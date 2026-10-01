//! Session-only, read-only WebDAV music source.
//!
//! Credentials and the mapping from opaque item IDs to server URLs stay in Rust
//! memory. The webview can browse one directory at a time and can only request
//! media through the managed `ome-media` protocol.

use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use quick_xml::events::Event;
use quick_xml::name::{Namespace, ResolveResult};
use quick_xml::reader::NsReader;
use rand::distributions::Alphanumeric;
use rand::Rng;
use reqwest::header::{
    ACCEPT, ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use reqwest::{Method, RequestBuilder, Url};
use serde::Serialize;
use tauri::State;

const MAX_SERVER_URL_BYTES: usize = 2048;
const MAX_USERNAME_BYTES: usize = 256;
const MAX_PASSWORD_BYTES: usize = 1024;
const MAX_XML_BYTES: usize = 2 * 1024 * 1024;
const MAX_DIRECTORY_ITEMS: usize = 500;
const MAX_SESSION_ITEMS: usize = 5000;
const MAX_XML_EVENTS: usize = 20_000;
const MAX_XML_DEPTH: usize = 32;
const MAX_HREF_BYTES: usize = 2048;
const MAX_NAME_CHARS: usize = 240;
pub(crate) const MAX_STREAM_CHUNK_BYTES: u64 = 4 * 1024 * 1024;
const DAV_NAMESPACE: &[u8] = b"DAV:";
const PROPFIND_BODY: &str = concat!(
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<d:propfind xmlns:d=\"DAV:\"><d:prop>",
    "<d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:displayname/>",
    "</d:prop></d:propfind>"
);

#[derive(Clone)]
pub struct WebDavSession {
    root_url: Url,
    server_label: String,
    username: Option<Arc<str>>,
    password: Option<Arc<str>>,
    items: Arc<Mutex<HashMap<String, ItemRef>>>,
    root_id: String,
    active: Arc<AtomicBool>,
}

#[derive(Clone)]
enum ItemRef {
    Directory {
        url: Url,
        parent_id: Option<String>,
        name: String,
    },
    Audio {
        url: Url,
        content_type: &'static str,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavStatus {
    pub connected: bool,
    pub server_label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavBreadcrumbDto {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavEntryDto {
    pub id: String,
    pub name: String,
    pub is_directory: bool,
    pub size_bytes: Option<u64>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavDirectoryDto {
    pub breadcrumbs: Vec<WebDavBreadcrumbDto>,
    pub entries: Vec<WebDavEntryDto>,
}

struct RawEntry {
    href: String,
    props: EntryProps,
}

#[derive(Default)]
struct EntryProps {
    is_collection: bool,
    display_name: Option<String>,
    size_bytes: Option<u64>,
    last_modified: Option<String>,
}

#[derive(Default)]
struct Propstat {
    success: bool,
    props: EntryProps,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TextField {
    Href,
    Status,
    DisplayName,
    ContentLength,
    LastModified,
}

struct CapturedText {
    field: TextField,
    value: String,
    element_depth: usize,
}

#[derive(Clone)]
struct ElementFrame {
    local_name: Vec<u8>,
    is_dav: bool,
}

impl WebDavSession {
    async fn connect(
        server_url: &str,
        username: Option<String>,
        password: Option<String>,
    ) -> Result<Self, String> {
        let root_url = validate_server_url(server_url)?;
        let (username, password) = validate_credentials(username, password)?;
        let server_label = root_url.host_str().unwrap_or("WebDAV 曲库").to_string();
        let root_id = new_item_id();
        let mut items = HashMap::new();
        items.insert(
            root_id.clone(),
            ItemRef::Directory {
                url: root_url.clone(),
                parent_id: None,
                name: "曲库根目录".to_string(),
            },
        );
        let session = Self {
            root_url,
            server_label,
            username: username.map(Arc::<str>::from),
            password: password.map(Arc::<str>::from),
            items: Arc::new(Mutex::new(items)),
            root_id,
            active: Arc::new(AtomicBool::new(true)),
        };
        let xml = session.propfind(&session.root_url).await?;
        for entry in parse_multistatus(&xml)? {
            validate_href(&entry.href, &session.root_url, &session.root_url)?;
        }
        Ok(session)
    }

    fn status(&self) -> WebDavStatus {
        WebDavStatus {
            connected: self.is_active(),
            server_label: self.is_active().then(|| self.server_label.clone()),
        }
    }

    fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
        if let Ok(mut items) = self.items.lock() {
            items.clear();
        }
    }

    fn authenticated(&self, request: RequestBuilder) -> RequestBuilder {
        match (&self.username, &self.password) {
            (Some(username), Some(password)) => {
                request.basic_auth(username.as_ref(), Some(password.as_ref()))
            }
            _ => request,
        }
    }

    async fn propfind(&self, url: &Url) -> Result<Vec<u8>, String> {
        if !self.is_active() {
            return Err("WebDAV 连接已断开".to_string());
        }
        let response = self
            .authenticated(
                http_client()
                    .request(
                        Method::from_bytes(b"PROPFIND").expect("PROPFIND 是有效方法"),
                        url.clone(),
                    )
                    .header("Depth", "1")
                    .header(ACCEPT, "application/xml, text/xml")
                    .header(CONTENT_TYPE, "application/xml; charset=utf-8")
                    .header(ACCEPT_ENCODING, "identity")
                    .body(PROPFIND_BODY),
            )
            .send()
            .await
            .map_err(|_| "WebDAV 服务器暂时无法连接".to_string())?;
        if response.status().as_u16() != 207
            || response
                .content_length()
                .is_some_and(|length| length > MAX_XML_BYTES as u64)
            || !response
                .headers()
                .get(CONTENT_TYPE)
                .is_some_and(is_xml_content_type)
        {
            return Err("WebDAV 服务器没有返回有效的目录响应".to_string());
        }
        let body = read_limited_body(response, MAX_XML_BYTES).await?;
        if !self.is_active() {
            return Err("WebDAV 连接已断开".to_string());
        }
        Ok(body)
    }

    async fn list_directory(
        &self,
        directory_id: Option<&str>,
    ) -> Result<WebDavDirectoryDto, String> {
        if !self.is_active() {
            return Err("请先连接 WebDAV 曲库".to_string());
        }
        let directory_id = directory_id.unwrap_or(&self.root_id);
        if !valid_item_id(directory_id) {
            return Err("WebDAV 目录标识无效".to_string());
        }
        let directory_url = {
            let items = self
                .items
                .lock()
                .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?;
            match items.get(directory_id) {
                Some(ItemRef::Directory { url, .. }) => url.clone(),
                Some(ItemRef::Audio { .. }) => return Err("无法打开音频文件夹".to_string()),
                None => return Err("这个 WebDAV 目录已失效，请返回曲库根目录".to_string()),
            }
        };
        let xml = self.propfind(&directory_url).await?;
        let raw_entries = parse_multistatus(&xml)?;
        let mut seen_hrefs = HashSet::new();
        let mut pending_items = Vec::new();
        let mut response_items = Vec::new();
        let mut listed_count = 0usize;

        for raw in raw_entries {
            let href = validate_href(&raw.href, &directory_url, &self.root_url)?;
            if href == directory_url {
                continue;
            }
            if !seen_hrefs.insert(href.as_str().to_string()) {
                continue;
            }
            listed_count += 1;
            if listed_count > MAX_DIRECTORY_ITEMS {
                return Err("WebDAV 目录超过 500 项，请缩小服务器端目录范围".to_string());
            }

            let is_collection = raw.props.is_collection;
            let (name, content_type) = if is_collection {
                let name = safe_display_name(
                    raw.props.display_name.as_deref(),
                    last_path_segment(&href)
                        .as_deref()
                        .unwrap_or("未命名文件夹"),
                );
                (name, None)
            } else {
                let Some((name, content_type)) =
                    audio_name_and_type(&href, raw.props.display_name.as_deref())
                else {
                    continue;
                };
                (name, Some(content_type))
            };
            if !self.is_active() {
                return Err("WebDAV 连接已断开".to_string());
            }
            let id = new_item_id();
            let item = if let Some(content_type) = content_type {
                ItemRef::Audio {
                    url: href,
                    content_type,
                }
            } else {
                ItemRef::Directory {
                    url: href,
                    parent_id: Some(directory_id.to_string()),
                    name: name.clone(),
                }
            };
            let dto = WebDavEntryDto {
                id,
                name,
                is_directory: content_type.is_none(),
                size_bytes: raw.props.size_bytes,
                last_modified: raw.props.last_modified.and_then(safe_last_modified),
            };
            pending_items.push((dto.id.clone(), item));
            response_items.push(dto);
        }

        response_items.sort_by(|left, right| {
            right
                .is_directory
                .cmp(&left.is_directory)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });

        let breadcrumbs = {
            let mut items = self
                .items
                .lock()
                .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?;
            if !self.is_active() {
                return Err("WebDAV 连接已断开".to_string());
            }
            if items.len().saturating_add(pending_items.len()) > MAX_SESSION_ITEMS {
                return Err("本次连接浏览的项目过多，请重新连接以清理临时目录映射".to_string());
            }
            for (id, item) in pending_items {
                items.insert(id, item);
            }
            build_breadcrumbs(&items, directory_id)?
        };

        Ok(WebDavDirectoryDto {
            breadcrumbs,
            entries: response_items,
        })
    }

    async fn stream_chunk(
        &self,
        item_id: &str,
        range: Option<&str>,
    ) -> Result<StreamChunk, String> {
        if !self.is_active() {
            return Err("WebDAV 连接已断开".to_string());
        }
        if !valid_item_id(item_id) {
            return Err("WebDAV 曲目标识无效".to_string());
        }
        let (url, content_type) = {
            let items = self
                .items
                .lock()
                .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?;
            match items.get(item_id) {
                Some(ItemRef::Audio { url, content_type }) => (url.clone(), *content_type),
                Some(ItemRef::Directory { .. }) => return Err("无法播放 WebDAV 文件夹".to_string()),
                None => return Err("WebDAV 曲目已失效，请重新打开目录".to_string()),
            }
        };
        let (start, end) = bounded_range(range)?;
        let response = self
            .authenticated(
                http_client()
                    .get(url)
                    .header(RANGE, format!("bytes={start}-{end}"))
                    .header(ACCEPT_ENCODING, "identity"),
            )
            .send()
            .await
            .map_err(|_| "WebDAV 音频暂时无法读取".to_string())?;
        if response.status().as_u16() != 206 {
            return Err("WebDAV 服务器不支持安全的分段音频读取".to_string());
        }
        let content_range = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| valid_content_range(value, start, end))
            .ok_or_else(|| "WebDAV 服务器返回了无效的音频分段".to_string())?
            .to_string();
        if !supports_audio_response_type(response.headers().get(CONTENT_TYPE)) {
            return Err("WebDAV 服务器返回的内容不是受支持的音频类型".to_string());
        }
        if response
            .headers()
            .get(CONTENT_ENCODING)
            .is_some_and(|value| {
                value
                    .to_str()
                    .map(|value| !value.eq_ignore_ascii_case("identity"))
                    .unwrap_or(true)
            })
        {
            return Err("WebDAV 服务器返回了不支持的压缩音频分段".to_string());
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_STREAM_CHUNK_BYTES)
        {
            return Err("WebDAV 音频分段超过大小限制".to_string());
        }
        let body = read_limited_body(response, MAX_STREAM_CHUNK_BYTES as usize).await?;
        let expected_length = parse_content_range(&content_range)
            .map(|(range_start, range_end)| range_end - range_start + 1)
            .unwrap_or_default();
        if body.is_empty() {
            return Err("WebDAV 音频分段为空".to_string());
        }
        if body.len() as u64 != expected_length {
            return Err("WebDAV 服务器返回的音频分段长度不匹配".to_string());
        }
        if !self.is_active() {
            return Err("WebDAV 连接已断开".to_string());
        }
        Ok(StreamChunk {
            content_type: content_type.to_string(),
            content_range,
            body,
        })
    }
}

pub struct StreamChunk {
    pub content_type: String,
    pub content_range: String,
    pub body: Vec<u8>,
}

#[tauri::command]
pub async fn webdav_connect(
    state: State<'_, crate::AppState>,
    server_url: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<WebDavStatus, String> {
    let generation = state
        .webdav_generation
        .fetch_add(1, Ordering::AcqRel)
        .wrapping_add(1);
    let session = WebDavSession::connect(&server_url, username, password).await?;
    if state.webdav_generation.load(Ordering::Acquire) != generation {
        session.deactivate();
        return Err("WebDAV 连接操作已取消".to_string());
    }
    let status = session.status();
    let mut current = state
        .webdav_session
        .lock()
        .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?;
    if state.webdav_generation.load(Ordering::Acquire) != generation {
        session.deactivate();
        return Err("WebDAV 连接操作已取消".to_string());
    }
    if let Some(previous) = current.as_ref() {
        previous.deactivate();
    }
    *current = Some(session);
    Ok(status)
}

#[tauri::command]
pub fn webdav_status(state: State<'_, crate::AppState>) -> WebDavStatus {
    state
        .webdav_session
        .lock()
        .ok()
        .and_then(|session| session.as_ref().map(WebDavSession::status))
        .unwrap_or(WebDavStatus {
            connected: false,
            server_label: None,
        })
}

#[tauri::command]
pub fn webdav_disconnect(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.webdav_generation.fetch_add(1, Ordering::AcqRel);
    let mut current = state
        .webdav_session
        .lock()
        .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?;
    if let Some(session) = current.take() {
        session.deactivate();
    }
    Ok(())
}

#[tauri::command]
pub async fn webdav_list_directory(
    state: State<'_, crate::AppState>,
    directory_id: Option<String>,
) -> Result<WebDavDirectoryDto, String> {
    let session = state
        .webdav_session
        .lock()
        .map_err(|_| "WebDAV 曲库状态暂时不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先连接 WebDAV 曲库".to_string())?;
    session.list_directory(directory_id.as_deref()).await
}

pub(crate) async fn stream_chunk(
    session: &WebDavSession,
    item_id: &str,
    range: Option<&str>,
) -> Result<StreamChunk, String> {
    session.stream_chunk(item_id, range).await
}

fn validate_credentials(
    username: Option<String>,
    password: Option<String>,
) -> Result<(Option<String>, Option<String>), String> {
    let username = username
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let password = password.filter(|value| !value.is_empty());
    match (username, password) {
        (None, None) => Ok((None, None)),
        (Some(username), Some(password))
            if username.len() <= MAX_USERNAME_BYTES
                && password.len() <= MAX_PASSWORD_BYTES
                && !username.chars().any(char::is_control)
                && !password.chars().any(char::is_control) =>
        {
            Ok((Some(username), Some(password)))
        }
        _ => Err("请同时填写有效的 WebDAV 用户名和密码，或都留空使用匿名访问".to_string()),
    }
}

fn validate_server_url(raw: &str) -> Result<Url, String> {
    if raw.trim().is_empty()
        || raw.trim().len() > MAX_SERVER_URL_BYTES
        || raw.chars().any(char::is_control)
    {
        return Err("请输入有效的 WebDAV 服务器地址".to_string());
    }
    let mut url =
        Url::parse(raw.trim()).map_err(|_| "请输入有效的 WebDAV 服务器地址".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "请输入有效的 WebDAV 服务器地址".to_string())?;
    let local = is_private_or_local_host(host);
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || has_unsafe_path_segments(url.path())
    {
        return Err(
            "公网 WebDAV 服务器必须使用 HTTPS；地址不能包含账号、查询参数或片段".to_string(),
        );
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

fn validate_href(raw: &str, requested_directory: &Url, root: &Url) -> Result<Url, String> {
    if raw.len() > MAX_HREF_BYTES
        || raw.trim().is_empty()
        || raw.chars().any(char::is_control)
        || raw.contains('\\')
    {
        return Err("WebDAV 目录中包含无效路径".to_string());
    }
    let href = requested_directory
        .join(raw.trim())
        .map_err(|_| "WebDAV 目录中包含无效路径".to_string())?;
    if href.scheme() != root.scheme()
        || !href
            .host_str()
            .zip(root.host_str())
            .is_some_and(|(left, right)| left.eq_ignore_ascii_case(right))
        || href.port_or_known_default() != root.port_or_known_default()
        || !href.username().is_empty()
        || href.password().is_some()
        || href.query().is_some()
        || href.fragment().is_some()
        || !href.path().starts_with(root.path())
        || has_unsafe_path_segments(href.path())
    {
        return Err("WebDAV 服务器返回了超出已连接目录范围的路径".to_string());
    }
    Ok(href)
}

fn has_unsafe_path_segments(path: &str) -> bool {
    path.split('/').any(|segment| {
        if segment.is_empty() {
            return false;
        }
        let mut current = segment.to_string();
        for _ in 0..8 {
            if current == "."
                || current == ".."
                || current.contains('/')
                || current.contains('\\')
                || current.chars().any(char::is_control)
            {
                return true;
            }
            let Some(decoded) = percent_decode_segment(&current) else {
                return true;
            };
            if decoded == current {
                break;
            }
            current = decoded;
        }
        if !matches!(percent_decode_segment(&current), Some(decoded) if decoded == current) {
            return true;
        }
        current == "."
            || current == ".."
            || current.contains('/')
            || current.contains('\\')
            || current.chars().any(char::is_control)
    })
}

fn percent_decode_segment(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = *bytes.get(index + 1)?;
            let low = *bytes.get(index + 2)?;
            decoded.push((hex_value(high)? << 4) | hex_value(low)?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn parse_multistatus(xml: &[u8]) -> Result<Vec<RawEntry>, String> {
    if xml.is_empty() || xml.len() > MAX_XML_BYTES {
        return Err("WebDAV 目录响应为空或超过大小限制".to_string());
    }
    let source =
        std::str::from_utf8(xml).map_err(|_| "WebDAV 目录响应不是有效的 UTF-8 XML".to_string())?;
    let mut reader = NsReader::from_str(source);
    reader.config_mut().enable_all_checks(true);
    let mut buf = Vec::new();
    let mut stack: Vec<ElementFrame> = Vec::new();
    let mut captured: Option<CapturedText> = None;
    let mut current_entry: Option<RawEntry> = None;
    let mut current_propstat: Option<Propstat> = None;
    let mut entries = Vec::new();
    let mut events = 0usize;
    let mut root_seen = false;

    loop {
        events += 1;
        if events > MAX_XML_EVENTS {
            return Err("WebDAV 目录响应结构过于复杂".to_string());
        }
        let (namespace, event) = reader
            .read_resolved_event_into(&mut buf)
            .map_err(|_| "无法解析 WebDAV 目录 XML".to_string())?;
        match event {
            Event::Eof => break,
            Event::DocType(_) => {
                return Err("WebDAV XML 不允许 DTD 或自定义实体".to_string());
            }
            Event::Start(element) => {
                if stack.len() >= MAX_XML_DEPTH {
                    return Err("WebDAV 目录 XML 嵌套过深".to_string());
                }
                let name = element.name();
                let local_name = name.local_name().as_ref().to_vec();
                let is_dav = matches!(&namespace, ResolveResult::Bound(Namespace(value)) if *value == DAV_NAMESPACE);
                if !root_seen {
                    if local_name != b"multistatus" || !is_dav {
                        return Err("WebDAV 服务器没有返回 DAV 多状态目录".to_string());
                    }
                    root_seen = true;
                }
                stack.push(ElementFrame {
                    local_name: local_name.clone(),
                    is_dav,
                });
                if is_dav && inside_response(&stack) {
                    if local_name == b"response" {
                        if current_entry.is_some() {
                            return Err("WebDAV 目录 XML 结构无效".to_string());
                        }
                        current_entry = Some(RawEntry {
                            href: String::new(),
                            props: EntryProps::default(),
                        });
                    } else if local_name == b"propstat" {
                        current_propstat = Some(Propstat::default());
                    } else if local_name == b"href" && is_direct_response_child(&stack, b"href") {
                        captured = Some(CapturedText {
                            field: TextField::Href,
                            value: String::new(),
                            element_depth: stack.len(),
                        });
                    } else if local_name == b"status" && is_direct_propstat_child(&stack, b"status")
                    {
                        captured = Some(CapturedText {
                            field: TextField::Status,
                            value: String::new(),
                            element_depth: stack.len(),
                        });
                    } else if local_name == b"displayname" && inside_prop(&stack, b"displayname") {
                        captured = Some(CapturedText {
                            field: TextField::DisplayName,
                            value: String::new(),
                            element_depth: stack.len(),
                        });
                    } else if local_name == b"getcontentlength"
                        && inside_prop(&stack, b"getcontentlength")
                    {
                        captured = Some(CapturedText {
                            field: TextField::ContentLength,
                            value: String::new(),
                            element_depth: stack.len(),
                        });
                    } else if local_name == b"getlastmodified"
                        && inside_prop(&stack, b"getlastmodified")
                    {
                        captured = Some(CapturedText {
                            field: TextField::LastModified,
                            value: String::new(),
                            element_depth: stack.len(),
                        });
                    }
                }
            }
            Event::Empty(element) => {
                let name = element.name();
                let local_name = name.local_name();
                let is_dav = matches!(&namespace, ResolveResult::Bound(Namespace(value)) if *value == DAV_NAMESPACE);
                if !root_seen {
                    if local_name.as_ref() != b"multistatus" || !is_dav {
                        return Err("WebDAV 服务器没有返回 DAV 多状态目录".to_string());
                    }
                    root_seen = true;
                }
                if is_dav && local_name.as_ref() == b"collection" && inside_resource_type(&stack) {
                    if let Some(propstat) = current_propstat.as_mut() {
                        propstat.props.is_collection = true;
                    }
                }
            }
            Event::Text(text) => {
                if let Some(captured) = captured.as_mut() {
                    let decoded = text
                        .xml_content()
                        .map_err(|_| "WebDAV 目录 XML 文本无效".to_string())?;
                    if captured.value.len().saturating_add(decoded.len()) > MAX_HREF_BYTES {
                        return Err("WebDAV 目录 XML 字段超过大小限制".to_string());
                    }
                    if decoded
                        .chars()
                        .any(|ch| ch.is_control() && !matches!(ch, '\t' | '\n' | '\r'))
                    {
                        return Err("WebDAV 目录 XML 含有无效控制字符".to_string());
                    }
                    captured.value.push_str(&decoded);
                }
            }
            Event::CData(text) => {
                if let Some(captured) = captured.as_mut() {
                    let decoded = text
                        .decode()
                        .map_err(|_| "WebDAV 目录 XML 文本无效".to_string())?;
                    if captured.value.len().saturating_add(decoded.len()) > MAX_HREF_BYTES {
                        return Err("WebDAV 目录 XML 字段超过大小限制".to_string());
                    }
                    if decoded
                        .chars()
                        .any(|ch| ch.is_control() && !matches!(ch, '\t' | '\n' | '\r'))
                    {
                        return Err("WebDAV 目录 XML 含有无效控制字符".to_string());
                    }
                    captured.value.push_str(&decoded);
                }
            }
            Event::GeneralRef(reference) => {
                let name = reference
                    .decode()
                    .map_err(|_| "WebDAV 目录 XML 字符引用无效".to_string())?;
                let decoded = if let Some(value) = reference
                    .resolve_char_ref()
                    .map_err(|_| "WebDAV 目录 XML 字符引用无效".to_string())?
                {
                    value
                } else {
                    match name.as_ref() {
                        "amp" => '&',
                        "lt" => '<',
                        "gt" => '>',
                        "apos" => '\'',
                        "quot" => '"',
                        _ => return Err("WebDAV XML 不允许 DTD 或自定义实体".to_string()),
                    }
                };
                if decoded.is_control() && !matches!(decoded, '\t' | '\n' | '\r') {
                    return Err("WebDAV 目录 XML 含有无效控制字符".to_string());
                }
                if let Some(captured) = captured.as_mut() {
                    if captured.value.len().saturating_add(decoded.len_utf8()) > MAX_HREF_BYTES {
                        return Err("WebDAV 目录 XML 字段超过大小限制".to_string());
                    }
                    captured.value.push(decoded);
                }
            }
            Event::End(element) => {
                let local_name = element.name().local_name().as_ref().to_vec();
                let is_dav = matches!(&namespace, ResolveResult::Bound(Namespace(value)) if *value == DAV_NAMESPACE);
                if let Some(captured_text) =
                    captured.take_if(|field| field.element_depth == stack.len())
                {
                    store_captured_text(captured_text, &mut current_entry, &mut current_propstat)?;
                }
                if is_dav && local_name == b"propstat" {
                    let propstat = current_propstat
                        .take()
                        .ok_or_else(|| "WebDAV 目录 XML 结构无效".to_string())?;
                    if propstat.success {
                        if let Some(entry) = current_entry.as_mut() {
                            merge_props(&mut entry.props, propstat.props);
                        }
                    }
                } else if is_dav && local_name == b"response" {
                    let entry = current_entry
                        .take()
                        .ok_or_else(|| "WebDAV 目录 XML 结构无效".to_string())?;
                    if entry.href.trim().is_empty() {
                        return Err("WebDAV 目录响应缺少路径".to_string());
                    }
                    if entries.len() > MAX_DIRECTORY_ITEMS {
                        return Err("WebDAV 目录超过 500 项".to_string());
                    }
                    entries.push(entry);
                }
                stack.pop();
            }
            Event::Decl(_) | Event::Comment(_) | Event::PI(_) => {}
        }
        buf.clear();
    }
    if !root_seen
        || !stack.is_empty()
        || current_entry.is_some()
        || current_propstat.is_some()
        || captured.is_some()
    {
        return Err("WebDAV 目录 XML 不完整".to_string());
    }
    Ok(entries)
}

fn inside_response(stack: &[ElementFrame]) -> bool {
    stack
        .iter()
        .any(|frame| frame.is_dav && frame.local_name == b"response")
}

fn is_direct_response_child(stack: &[ElementFrame], name: &[u8]) -> bool {
    stack.len() >= 2
        && stack[stack.len() - 1].is_dav
        && stack[stack.len() - 1].local_name == name
        && stack[stack.len() - 2].is_dav
        && stack[stack.len() - 2].local_name == b"response"
}

fn is_direct_propstat_child(stack: &[ElementFrame], name: &[u8]) -> bool {
    stack.len() >= 2
        && stack[stack.len() - 1].is_dav
        && stack[stack.len() - 1].local_name == name
        && stack[stack.len() - 2].is_dav
        && stack[stack.len() - 2].local_name == b"propstat"
}

fn inside_prop(stack: &[ElementFrame], name: &[u8]) -> bool {
    stack
        .last()
        .is_some_and(|frame| frame.is_dav && frame.local_name == name)
        && stack
            .iter()
            .rev()
            .skip(1)
            .take(3)
            .any(|frame| frame.is_dav && frame.local_name == b"prop")
        && stack
            .iter()
            .any(|frame| frame.is_dav && frame.local_name == b"propstat")
}

fn inside_resource_type(stack: &[ElementFrame]) -> bool {
    stack.len() >= 2
        && stack
            .last()
            .is_some_and(|frame| frame.is_dav && frame.local_name == b"resourcetype")
        && stack
            .iter()
            .any(|frame| frame.is_dav && frame.local_name == b"prop")
}

fn store_captured_text(
    captured: CapturedText,
    current_entry: &mut Option<RawEntry>,
    current_propstat: &mut Option<Propstat>,
) -> Result<(), String> {
    let value = captured.value.trim();
    match captured.field {
        TextField::Href => {
            let entry = current_entry
                .as_mut()
                .ok_or_else(|| "WebDAV 目录 XML 结构无效".to_string())?;
            if value.len() > MAX_HREF_BYTES || value.chars().any(char::is_control) {
                return Err("WebDAV 目录路径无效".to_string());
            }
            entry.href = value.to_string();
        }
        TextField::Status => {
            let status_code = value
                .split_whitespace()
                .nth(1)
                .and_then(|part| part.parse::<u16>().ok());
            if let Some(propstat) = current_propstat.as_mut() {
                propstat.success = status_code.is_some_and(|code| (200..300).contains(&code));
            }
        }
        TextField::DisplayName => {
            if let Some(propstat) = current_propstat.as_mut() {
                propstat.props.display_name = Some(
                    value
                        .chars()
                        .filter(|ch| !ch.is_control())
                        .take(MAX_NAME_CHARS)
                        .collect(),
                );
            }
        }
        TextField::ContentLength => {
            if let Some(propstat) = current_propstat.as_mut() {
                propstat.props.size_bytes = value.parse::<u64>().ok();
            }
        }
        TextField::LastModified => {
            if let Some(propstat) = current_propstat.as_mut() {
                propstat.props.last_modified = Some(value.to_string());
            }
        }
    }
    Ok(())
}

fn merge_props(target: &mut EntryProps, source: EntryProps) {
    target.is_collection |= source.is_collection;
    if source.display_name.is_some() {
        target.display_name = source.display_name;
    }
    target.size_bytes = source.size_bytes.or(target.size_bytes);
    if source.last_modified.is_some() {
        target.last_modified = source.last_modified;
    }
}

fn build_breadcrumbs(
    items: &HashMap<String, ItemRef>,
    current_id: &str,
) -> Result<Vec<WebDavBreadcrumbDto>, String> {
    let mut result = Vec::new();
    let mut cursor = Some(current_id.to_string());
    let mut visited = HashSet::new();
    while let Some(id) = cursor {
        if !visited.insert(id.clone()) || result.len() > 32 {
            return Err("WebDAV 目录路径无效".to_string());
        }
        match items.get(&id) {
            Some(ItemRef::Directory {
                parent_id, name, ..
            }) => {
                result.push(WebDavBreadcrumbDto {
                    id,
                    name: name.clone(),
                });
                cursor = parent_id.clone();
            }
            _ => return Err("WebDAV 目录路径已失效".to_string()),
        }
    }
    result.reverse();
    Ok(result)
}

fn safe_display_name(display_name: Option<&str>, fallback: &str) -> String {
    let name = display_name.unwrap_or_default().trim();
    let name: String = name
        .chars()
        .filter(|ch| !ch.is_control())
        .take(MAX_NAME_CHARS)
        .collect();
    if name.is_empty() {
        fallback
            .chars()
            .filter(|ch| !ch.is_control())
            .take(MAX_NAME_CHARS)
            .collect()
    } else {
        name
    }
}

fn safe_last_modified(value: String) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control))
        .then(|| value.to_string())
}

fn last_path_segment(url: &Url) -> Option<String> {
    let segment = url.path_segments()?.rfind(|value| !value.is_empty())?;
    let decoded = percent_decode_segment(segment)?;
    Some(decoded.trim_end_matches('/').to_string())
}

fn audio_name_and_type(url: &Url, display_name: Option<&str>) -> Option<(String, &'static str)> {
    let fallback = last_path_segment(url)?;
    let name = safe_display_name(display_name, &fallback);
    let extension = fallback.rsplit_once('.')?.1.to_ascii_lowercase();
    let content_type = match extension.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" | "wave" => "audio/wav",
        "m4a" | "mp4" | "alac" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "aif" | "aiff" => "audio/aiff",
        "wma" => "audio/x-ms-wma",
        "ape" => "audio/ape",
        "weba" => "audio/webm",
        "mka" => "audio/x-matroska",
        _ => return None,
    };
    Some((name, content_type))
}

fn is_xml_content_type(value: &reqwest::header::HeaderValue) -> bool {
    value.to_str().ok().is_some_and(|value| {
        let media_type = value
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        media_type == "application/xml" || media_type == "text/xml" || media_type.ends_with("+xml")
    })
}

fn bounded_range(raw: Option<&str>) -> Result<(u64, u64), String> {
    let Some(raw) = raw else {
        return Ok((0, MAX_STREAM_CHUNK_BYTES - 1));
    };
    let spec = raw
        .trim()
        .strip_prefix("bytes=")
        .ok_or_else(|| "无效的 WebDAV 音频分段请求".to_string())?;
    if spec.contains(',') {
        return Err("不支持多段 WebDAV 音频请求".to_string());
    }
    let (start, end) = spec
        .split_once('-')
        .ok_or_else(|| "无效的 WebDAV 音频分段请求".to_string())?;
    let start = start
        .parse::<u64>()
        .map_err(|_| "无效的 WebDAV 音频分段请求".to_string())?;
    let end = if end.is_empty() {
        start.saturating_add(MAX_STREAM_CHUNK_BYTES - 1)
    } else {
        end.parse::<u64>()
            .map_err(|_| "无效的 WebDAV 音频分段请求".to_string())?
            .min(start.saturating_add(MAX_STREAM_CHUNK_BYTES - 1))
    };
    if end < start {
        return Err("无效的 WebDAV 音频分段请求".to_string());
    }
    Ok((start, end))
}

fn valid_content_range(value: &str, requested_start: u64, requested_end: u64) -> bool {
    let Some((start, end)) = parse_content_range(value) else {
        return false;
    };
    start == requested_start && end <= requested_end
}

fn parse_content_range(value: &str) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes ")?;
    let (actual, total) = spec.split_once('/')?;
    let (start, end) = actual.split_once('-')?;
    let (Ok(start), Ok(end)) = (start.parse::<u64>(), end.parse::<u64>()) else {
        return None;
    };
    let total_ok = total == "*" || total.parse::<u64>().is_ok_and(|length| length > end);
    (end >= start && total_ok).then_some((start, end))
}

fn supports_audio_response_type(value: Option<&reqwest::header::HeaderValue>) -> bool {
    let Some(value) = value else {
        return true;
    };
    let Ok(value) = value.to_str() else {
        return false;
    };
    let media_type = value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    media_type.starts_with("audio/")
        || matches!(
            media_type.as_str(),
            "application/octet-stream" | "application/ogg" | "application/mp4"
        )
}

async fn read_limited_body(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("WebDAV 服务器返回内容超过大小限制".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取 WebDAV 服务器响应失败".to_string())?
    {
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err("WebDAV 服务器返回内容超过大小限制".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn new_item_id() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

fn valid_item_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn is_private_or_local_host(host: &str) -> bool {
    let host = host.trim().trim_matches(['[', ']']).to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return true;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
        Ok(IpAddr::V6(ip)) => {
            ip.is_loopback()
                || (ip.segments()[0] & 0xfe00) == 0xfc00
                || (ip.segments()[0] & 0xffc0) == 0xfe80
        }
        Err(_) => false,
    }
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("构建 WebDAV 客户端失败")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;
    use std::time::Duration as TestDuration;

    const ROOT_XML: &str = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/music/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:displayname>曲库</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/music/夏夜%20mix.flac</d:href><d:propstat><d:prop><d:getcontentlength>2048</d:getcontentlength><d:getlastmodified>Sun, 06 Nov 1994 08:49:37 GMT</d:getlastmodified><d:displayname>夏夜 mix.flac</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/music/readme.txt</d:href><d:propstat><d:prop><d:getcontentlength>10</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>"#;

    #[test]
    fn parses_namespaced_multistatus_and_filters_to_audio_later() {
        let parsed = parse_multistatus(ROOT_XML.as_bytes()).unwrap();
        assert_eq!(parsed.len(), 3);
        assert!(parsed[0].props.is_collection);
        assert_eq!(parsed[1].props.size_bytes, Some(2048));
        assert_eq!(
            parsed[1].props.display_name.as_deref(),
            Some("夏夜 mix.flac")
        );
        assert_eq!(parsed[2].props.size_bytes, Some(10));
    }

    #[test]
    fn parses_default_and_alternate_dav_namespaces() {
        let default_ns = r#"<multistatus xmlns="DAV:"><response><href>/music/</href><propstat><prop/><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>"#;
        let alternate = r#"<x:multistatus xmlns:x="DAV:"><x:response><x:href>/music/</x:href><x:propstat><x:prop/><x:status>HTTP/1.1 200 OK</x:status></x:propstat></x:response></x:multistatus>"#;
        assert_eq!(parse_multistatus(default_ns.as_bytes()).unwrap().len(), 1);
        assert_eq!(parse_multistatus(alternate.as_bytes()).unwrap().len(), 1);
    }

    #[test]
    fn supports_only_predefined_and_numeric_xml_references() {
        let escaped = r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/music/a&amp;b.mp3</d:href><d:propstat><d:prop><d:displayname>A &amp; B.mp3</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
        let parsed = parse_multistatus(escaped.as_bytes()).unwrap();
        assert_eq!(parsed[0].href, "/music/a&b.mp3");
        assert_eq!(parsed[0].props.display_name.as_deref(), Some("A & B.mp3"));
    }

    #[test]
    fn rejects_doctype_and_custom_entities() {
        let doctype = r#"<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///secret">]><d:multistatus xmlns:d="DAV:"/>"#;
        let entity = r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>&custom;</d:href></d:response></d:multistatus>"#;
        assert!(parse_multistatus(doctype.as_bytes()).is_err());
        assert!(parse_multistatus(entity.as_bytes()).is_err());
    }

    #[test]
    fn validates_remote_path_scope_and_encoded_traversal() {
        let root = validate_server_url("https://music.example/dav").unwrap();
        assert!(validate_href("/dav/sub/song.mp3", &root, &root).is_ok());
        assert!(validate_href("https://evil.example/dav/song.mp3", &root, &root).is_err());
        assert!(validate_href("/other/song.mp3", &root, &root).is_err());
        assert!(validate_href("/dav/%252e%252e/secret.mp3", &root, &root).is_err());
        assert!(validate_href("/dav/a%2Fb/song.mp3", &root, &root).is_err());
        assert!(validate_href("/dav/song.mp3?token=secret", &root, &root).is_err());
    }

    #[test]
    fn limits_credentials_and_requires_a_complete_pair() {
        assert!(validate_credentials(None, None).is_ok());
        assert!(validate_credentials(Some("listener".to_string()), None).is_err());
        assert!(
            validate_credentials(Some("listener".to_string()), Some("secret".to_string())).is_ok()
        );
    }

    #[test]
    fn rejects_public_http_and_urls_with_credentials_or_queries() {
        assert!(validate_server_url("http://music.example/dav").is_err());
        assert!(validate_server_url("https://user:pass@music.example/dav").is_err());
        assert!(validate_server_url("https://music.example/dav?token=x").is_err());
        assert!(validate_server_url("http://127.0.0.1:8080/dav").is_ok());
    }

    #[test]
    fn bounds_ranges_and_checks_content_range() {
        assert_eq!(
            bounded_range(None).unwrap(),
            (0, MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert_eq!(
            bounded_range(Some("bytes=9-")).unwrap(),
            (9, 9 + MAX_STREAM_CHUNK_BYTES - 1)
        );
        assert!(bounded_range(Some("bytes=0-1,4-5")).is_err());
        assert!(valid_content_range("bytes 0-1023/2048", 0, 2048));
        assert!(!valid_content_range("bytes 1-1023/2048", 0, 2048));
        assert_eq!(parse_content_range("bytes 0-3/8"), Some((0, 3)));
        assert!(parse_content_range("bytes 0-8/8").is_none());
    }

    #[test]
    fn rejects_non_audio_upstream_content_types() {
        assert!(supports_audio_response_type(None));
        assert!(supports_audio_response_type(Some(
            &reqwest::header::HeaderValue::from_static("audio/mpeg")
        )));
        assert!(supports_audio_response_type(Some(
            &reqwest::header::HeaderValue::from_static("application/octet-stream")
        )));
        assert!(!supports_audio_response_type(Some(
            &reqwest::header::HeaderValue::from_static("text/html; charset=utf-8")
        )));
    }

    #[test]
    fn maps_only_supported_audio_extensions() {
        let mp3 = Url::parse("https://music.example/dav/song.mp3").unwrap();
        let html = Url::parse("https://music.example/dav/index.html").unwrap();
        assert_eq!(audio_name_and_type(&mp3, None).unwrap().1, "audio/mpeg");
        assert!(audio_name_and_type(&html, None).is_none());
    }

    fn read_http_request(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(TestDuration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let read = stream.read(&mut chunk).unwrap();
            assert!(read > 0, "client closed before sending a full request");
            request.extend_from_slice(&chunk[..read]);
            if let Some(header_end) = request.windows(4).position(|value| value == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..header_end]).to_ascii_lowercase();
                let content_length = headers
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length:"))
                    .and_then(|value| value.trim().parse::<usize>().ok())
                    .unwrap_or_default();
                if request.len() >= header_end + 4 + content_length {
                    return String::from_utf8(request).unwrap();
                }
            }
        }
    }

    fn write_http_response(
        stream: &mut TcpStream,
        status: &str,
        content_type: &str,
        extra_headers: &str,
        body: &[u8],
    ) {
        write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\n{extra_headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .unwrap();
        stream.write_all(body).unwrap();
        stream.flush().unwrap();
    }

    #[test]
    fn protocol_mock_keeps_auth_and_directory_urls_in_rust_and_streams_one_range() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let root_xml = r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
            let list_xml = r#"<d:multistatus xmlns:d="DAV:">
                <d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
                <d:response><d:href>/dav/song.mp3</d:href><d:propstat><d:prop><d:getcontentlength>8</d:getcontentlength><d:displayname>song.mp3</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            </d:multistatus>"#;

            for (index, body) in [root_xml.as_bytes(), list_xml.as_bytes()]
                .into_iter()
                .enumerate()
            {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_http_request(&mut stream).to_ascii_lowercase();
                assert!(request.starts_with("propfind /dav/ "));
                assert!(request.contains("depth: 1"));
                assert!(request.contains("authorization: basic bglzdgvuzxi6c2vjcmv0"));
                if index == 0 {
                    assert!(request.contains("<d:propfind"));
                }
                write_http_response(
                    &mut stream,
                    "207 Multi-Status",
                    "application/xml; charset=utf-8",
                    "",
                    body,
                );
            }

            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream).to_ascii_lowercase();
            assert!(request.starts_with("get /dav/song.mp3 "));
            assert!(request.contains("range: bytes=0-3"));
            assert!(request.contains("authorization: basic bglzdgvuzxi6c2vjcmv0"));
            write_http_response(
                &mut stream,
                "206 Partial Content",
                "audio/mpeg",
                "Content-Range: bytes 0-3/8\r\n",
                b"TEST",
            );
        });

        let base_url = format!("http://{address}/dav");
        let result = tauri::async_runtime::block_on(async {
            let session = WebDavSession::connect(
                &base_url,
                Some("listener".to_string()),
                Some("secret".to_string()),
            )
            .await?;
            let directory = session.list_directory(None).await?;
            let song = directory
                .entries
                .iter()
                .find(|entry| entry.name == "song.mp3")
                .unwrap();
            session.stream_chunk(&song.id, Some("bytes=0-3")).await
        });

        server.join().unwrap();
        let chunk = result.expect("valid bounded range should stream");
        assert_eq!(chunk.body, b"TEST");
    }
}
