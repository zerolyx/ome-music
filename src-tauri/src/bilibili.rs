//! Bilibili 音源：搜索（含 WBI 签名兜底）、取流、弹幕。
//!
//! 从旧单体 `68664a9:src-tauri/src/lib.rs` 移植（5616-6300 附近）。v1 为匿名访问：
//! 不读取/保存 cookie，登录态留待后续任务。前端拿到 stream url 后经
//! `ome-media` 协议的 `/remote` 路由代理播放（media.rs）。

use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;

/// API 域名（旧代码 BILIBILI_DEFAULT_BASE_URL）。
pub const BILIBILI_API_BASE: &str = "https://api.bilibili.com";
/// 浏览器 UA（旧代码 BILIBILI_BROWSER_USER_AGENT）。
pub const BILIBILI_BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/// 取流 Referer：B 站 CDN 校验必须带站内 Referer。
pub const BILIBILI_REFERER: &str = "https://www.bilibili.com";
/// 弹幕条数上限（v1 约定）。
pub const DANMAKU_LIMIT: usize = 200;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);

#[cfg(test)]
#[path = "bilibili_live_test.rs"]
mod live_tests;
#[cfg(test)]
#[path = "bilibili_test.rs"]
mod tests;

/// 搜索结果 DTO（camelCase 序列化）。id 形如 `bilibili-{bvid}[_page]`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilibiliSongDto {
    pub id: String,
    pub bvid: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: u64,
    pub cover_url: String,
    pub plain: bool,
}

/// 取流结果 DTO：前端用它拼 `/remote?p=…&r=…` 代理地址。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BilibiliStreamUrlDto {
    pub url: String,
    pub referer: String,
}

/// 弹幕 DTO。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DanmakuItemDto {
    pub time: f64,
    pub text: String,
    pub color: u32,
}

// ── 请求层（匿名，cookie: None）────────────────────────────────────────

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("构建 Bilibili HTTP 客户端失败")
    })
}

/// GET https://api.bilibili.com + path（或完整 URL），浏览器 UA + 站内 Referer。
async fn request_bilibili_text(path: &str, query: &[(&str, &str)]) -> Result<String, String> {
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!("{BILIBILI_API_BASE}{path}")
    };
    let is_search_request = path.contains("/search/");
    let mut request = http_client()
        .get(url)
        .query(query)
        .header("User-Agent", BILIBILI_BROWSER_UA)
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header(
            "Referer",
            if is_search_request {
                "https://search.bilibili.com/"
            } else {
                "https://www.bilibili.com/"
            },
        );
    if is_search_request {
        request = request
            .header("Origin", "https://search.bilibili.com")
            .header("Sec-Fetch-Dest", "empty")
            .header("Sec-Fetch-Mode", "cors")
            .header("Sec-Fetch-Site", "same-site");
    }
    let response = request.send().await.map_err(|error| {
        format!("Bilibili 请求失败：{error} / Bilibili request failed: {error}")
    })?;
    let status = response.status();
    if status.as_u16() == 412 {
        return Err(
            "Bilibili paused this search request. Please wait a moment and try again.".to_string(),
        );
    }
    if !status.is_success() {
        return Err(format!("Bilibili is unavailable just now ({status})."));
    }
    let text = response.text().await.map_err(|error| error.to_string())?;
    let trimmed = text.trim_start();
    if trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") {
        return Err(
            "Bilibili asked for web verification. Please wait a moment and search again."
                .to_string(),
        );
    }
    Ok(text)
}

async fn request_bilibili_json(
    path: &str,
    query: &[(&str, &str)],
) -> Result<serde_json::Value, String> {
    let text = request_bilibili_text(path, query).await?;
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|_| "Bilibili 响应解析失败 / Failed to parse Bilibili response".to_string())
}

fn json_code_error(value: &serde_json::Value) -> Option<String> {
    let code = value.get("code").and_then(|value| value.as_i64())?;
    if code == 0 {
        return None;
    }
    let message = value
        .get("message")
        .or_else(|| value.get("msg"))
        .and_then(|value| value.as_str())
        .unwrap_or("Please try again in a moment.");
    Some(format!("Bilibili is unavailable just now. {message}"))
}

// ── 搜索 ───────────────────────────────────────────────────────────────

/// 搜索：先走明文端点，失败或风控时回退 WBI 签名端点。
pub async fn search_songs(keywords: &str, limit: u32) -> Result<Vec<BilibiliSongDto>, String> {
    let page_size = limit.clamp(1, 50).to_string();
    // 直接给 BV/av 号时按详情返回单曲（旧代码行为，DJ 工具链依赖）。
    if let Some(id) = extract_bilibili_id(keywords) {
        return fetch_song_dto(&id).await.map(|song| vec![song]);
    }

    let mut primary_error = match request_bilibili_json(
        "/x/web-interface/search/type",
        &[
            ("search_type", "video"),
            ("keyword", keywords),
            ("page", "1"),
            ("page_size", page_size.as_str()),
        ],
    )
    .await
    {
        Ok(value) if json_code_error(&value).is_none() => {
            return Ok(parse_search_results(&value));
        }
        Ok(value) => json_code_error(&value).unwrap_or_default(),
        Err(error) => error,
    };

    match request_bilibili_wbi_search(keywords, limit).await {
        Ok(value) if json_code_error(&value).is_none() => Ok(parse_search_results(&value)),
        Ok(value) => Err(format!(
            "{primary_error} {}",
            json_code_error(&value).unwrap_or_default()
        )),
        Err(fallback_error) => {
            primary_error.push(' ');
            primary_error.push_str(&fallback_error);
            Err(primary_error)
        }
    }
}

fn parse_search_results(value: &serde_json::Value) -> Vec<BilibiliSongDto> {
    value
        .pointer("/data/result")
        .and_then(|result| result.as_array())
        .map(|results| results.iter().filter_map(song_from_search_json).collect())
        .unwrap_or_default()
}

fn song_from_search_json(value: &serde_json::Value) -> Option<BilibiliSongDto> {
    let bvid = json_text(value.get("bvid")).unwrap_or_else(|| json_id(value.get("aid")));
    if bvid.is_empty() {
        return None;
    }
    let name = json_text(value.get("title")).unwrap_or_else(|| "Bilibili Track".to_string());
    Some(BilibiliSongDto {
        id: format!("bilibili-{bvid}"),
        bvid: bvid.clone(),
        name: clean_bilibili_title(&name),
        artist: json_text(value.get("author")).unwrap_or_else(|| "Bilibili".to_string()),
        album: "Bilibili".to_string(),
        duration_seconds: parse_bilibili_duration(value.get("duration")).unwrap_or(0),
        cover_url: normalize_bilibili_image_url(json_text(value.get("pic")).unwrap_or_default()),
        plain: true,
    })
}

// ── WBI 签名兜底（逐字移植，仅依赖 md5）───────────────────────────────

async fn request_bilibili_wbi_search(
    keyword: &str,
    page_size: u32,
) -> Result<serde_json::Value, String> {
    let nav = request_bilibili_json("/x/web-interface/nav", &[]).await?;
    let wbi_img = nav
        .get("data")
        .and_then(|data| data.get("wbi_img"))
        .ok_or_else(|| "Bilibili search verification is unavailable just now.".to_string())?;
    let img_key = wbi_key_from_url(json_text(wbi_img.get("img_url")).as_deref())
        .ok_or_else(|| "Bilibili search verification is unavailable just now.".to_string())?;
    let sub_key = wbi_key_from_url(json_text(wbi_img.get("sub_url")).as_deref())
        .ok_or_else(|| "Bilibili search verification is unavailable just now.".to_string())?;
    let mixin_key = bilibili_mixin_key(&format!("{img_key}{sub_key}"));
    let wts = current_timestamp_secs().to_string();
    let query = wbi_search_query(keyword, page_size, &wts, &mixin_key);
    let url = format!("{BILIBILI_API_BASE}/x/web-interface/wbi/search/type?{query}");
    request_bilibili_json(&url, &[]).await
}

/// 纯函数：keyword 清洗 + 固定字段序 + md5(mixin_key) 签名，输出完整 query。
fn wbi_search_query(keyword: &str, page_size: u32, wts: &str, mixin_key: &str) -> String {
    let sanitized_keyword = keyword.replace(['!', '\'', '(', ')', '*'], "");
    let query = format!(
        "keyword={}&page=1&page_size={page_size}&search_type=video&wts={wts}",
        encode_url_component(&sanitized_keyword),
    );
    let w_rid = format!("{:x}", md5::compute(format!("{query}{mixin_key}")));
    format!("{query}&w_rid={w_rid}")
}

fn wbi_key_from_url(url: Option<&str>) -> Option<String> {
    url?.rsplit('/')
        .next()?
        .split('.')
        .next()
        .map(ToString::to_string)
        .filter(|value| !value.is_empty())
}

fn bilibili_mixin_key(raw_key: &str) -> String {
    const MIXIN_KEY_ENC_TAB: &[usize] = &[
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
        29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
        22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
    ];
    let chars = raw_key.chars().collect::<Vec<_>>();
    MIXIN_KEY_ENC_TAB
        .iter()
        .filter_map(|index| chars.get(*index))
        .take(32)
        .collect()
}

fn encode_url_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn current_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

// ── 详情 / 取流 ────────────────────────────────────────────────────────

/// `bilibili-{bvid}[_page]`（也容忍裸 bvid / av 号）→ (核心 id, 分 P 序号)。
fn bilibili_song_id_parts(song_id: &str) -> (String, Option<u64>) {
    let trimmed = song_id.trim();
    let core = trimmed.strip_prefix("bilibili-").unwrap_or(trimmed);
    let (core, page) = match core.rsplit_once('_') {
        Some((left, right)) if !right.is_empty() && right.chars().all(|ch| ch.is_ascii_digit()) => {
            (left, right.parse::<u64>().ok())
        }
        _ => (core, None),
    };
    (core.to_string(), page.filter(|page| *page > 0))
}

fn extract_bilibili_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    for token in trimmed.split(|ch: char| ch.is_whitespace() || ch == '/' || ch == '?' || ch == '&')
    {
        if token.starts_with("BV") && token.len() >= 10 {
            return Some(
                token
                    .trim_matches(|ch: char| !ch.is_ascii_alphanumeric())
                    .to_string(),
            );
        }
        if token.starts_with("av")
            && token.len() > 2
            && token[2..].chars().all(|ch| ch.is_ascii_digit())
        {
            return Some(token.to_string());
        }
    }
    None
}

/// view API 的 id 参数：av 号（或纯数字）走 aid，其余按 bvid。
fn view_query_parts(core_id: &str) -> (String, String) {
    if core_id.len() > 2 && core_id[..2].eq_ignore_ascii_case("av") {
        ("aid".to_string(), core_id[2..].to_string())
    } else if core_id.chars().all(|ch| ch.is_ascii_digit()) {
        ("aid".to_string(), core_id.to_string())
    } else {
        ("bvid".to_string(), core_id.to_string())
    }
}

async fn fetch_video_data(core_id: &str) -> Result<serde_json::Value, String> {
    let (key, id) = view_query_parts(core_id);
    let value =
        request_bilibili_json("/x/web-interface/view", &[(key.as_str(), id.as_str())]).await?;
    if json_code_error(&value).is_some() {
        return Err("This Bilibili track is unavailable from the current source.".to_string());
    }
    value
        .get("data")
        .cloned()
        .ok_or_else(|| "This Bilibili track is unavailable from the current source.".to_string())
}

/// 视图 API 取 cid（多 P 按 page 序号取，缺省第一个分 P）。
async fn fetch_video_cid(core_id: &str, page: Option<u64>) -> Result<String, String> {
    let data = fetch_video_data(core_id).await?;
    let pages = data.get("pages").and_then(|pages| pages.as_array());
    let selected = match page {
        Some(page) => pages
            .and_then(|pages| pages.get(page.saturating_sub(1) as usize))
            .or_else(|| pages.and_then(|pages| pages.first())),
        None => pages.and_then(|pages| pages.first()),
    };
    selected
        .and_then(|item| non_empty_json_id(item.get("cid")))
        .or_else(|| non_empty_json_id(data.get("cid")))
        .ok_or_else(|| "audio_stream_missing".to_string())
}

/// 单曲详情（供搜索直达 BV/av 号时复用），id 仍是 `bilibili-{bvid}`。
async fn fetch_song_dto(core_id: &str) -> Result<BilibiliSongDto, String> {
    let data = fetch_video_data(core_id).await?;
    let bvid = json_text(data.get("bvid"))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| bilibili_song_id_parts(core_id).0);
    let name = json_text(data.get("title")).unwrap_or_else(|| "Bilibili Track".to_string());
    let artist = data
        .pointer("/owner/name")
        .and_then(|value| value.as_str())
        .unwrap_or("Bilibili")
        .to_string();
    let duration = parse_bilibili_duration(data.get("duration"))
        .or_else(|| parse_bilibili_duration(data.pointer("/pages/0/duration")))
        .unwrap_or(0);
    Ok(BilibiliSongDto {
        id: format!("bilibili-{bvid}"),
        bvid,
        name: clean_bilibili_title(&name),
        artist,
        album: "Bilibili".to_string(),
        duration_seconds: duration,
        cover_url: normalize_bilibili_image_url(json_text(data.get("pic")).unwrap_or_default()),
        plain: true,
    })
}

fn non_empty_json_id(value: Option<&serde_json::Value>) -> Option<String> {
    let id = json_id(value);
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

/// 取流：view → cid → playurl(qn=64, fnval=0) → durl[0].url（音频向 mp4）。
pub async fn fetch_stream_url(song_id: &str) -> Result<BilibiliStreamUrlDto, String> {
    let (core_id, page) = bilibili_song_id_parts(song_id);
    if core_id.is_empty() {
        return Err("audio_stream_missing".to_string());
    }
    let cid = fetch_video_cid(&core_id, page).await?;
    let (key, id) = view_query_parts(&core_id);
    // B 站网页播放器端点为 /x/player/playurl（/x/web-interface/playurl 已 404）。
    // fnval=0 强制返回 mp4 durl（音频向），无需 DASH 解封装。
    let value = request_bilibili_json(
        "/x/player/playurl",
        &[
            (key.as_str(), id.as_str()),
            ("cid", cid.as_str()),
            ("qn", "64"),
            ("fnval", "0"),
        ],
    )
    .await
    .map_err(|error| format!("playurl_failed: {error}"))?;
    if let Some(reason) = classify_playurl_reason(&value) {
        return Err(reason.to_string());
    }
    let url = value
        .pointer("/data/durl/0/url")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("audio_stream_missing")?;
    Ok(BilibiliStreamUrlDto {
        url: url.to_string(),
        referer: BILIBILI_REFERER.to_string(),
    })
}

fn classify_playurl_reason(value: &serde_json::Value) -> Option<&'static str> {
    json_code_error(value)?;
    let message = value
        .get("message")
        .or_else(|| value.get("msg"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_lowercase();
    let reason = if message.contains("login") || message.contains("登录") {
        "not_logged_in"
    } else if message.contains("vip") || message.contains("会员") || message.contains("付费") {
        "vip_required"
    } else if message.contains("copyright") || message.contains("版权") {
        "no_copyright"
    } else if message.contains("region") || message.contains("地区") {
        "region_restricted"
    } else if message.contains("不存在") || message.contains("下架") {
        "video_removed"
    } else {
        "playurl_failed"
    };
    Some(reason)
}

// ── 弹幕 ───────────────────────────────────────────────────────────────

/// 弹幕：view → cid → list.so XML（失败回退 comment.bilibili.com），上限 200 条。
pub async fn fetch_danmaku(song_id: &str) -> Result<Vec<DanmakuItemDto>, String> {
    let (core_id, page) = bilibili_song_id_parts(song_id);
    if core_id.is_empty() {
        return Err("No danmaku was returned for this video.".to_string());
    }
    let cid = fetch_video_cid(&core_id, page).await?;
    let primary_xml =
        request_bilibili_danmaku_xml(&format!("{BILIBILI_API_BASE}/x/v1/dm/list.so?oid={cid}"))
            .await;
    let mut items = match primary_xml {
        Ok(xml) => parse_bilibili_danmaku_xml(&xml),
        Err(_) => Vec::new(),
    };
    if items.is_empty() {
        let xml = request_bilibili_danmaku_xml(&format!("https://comment.bilibili.com/{cid}.xml"))
            .await?;
        items = parse_bilibili_danmaku_xml(&xml);
    }
    if items.is_empty() {
        return Err("No danmaku was returned for this video.".to_string());
    }
    items.truncate(DANMAKU_LIMIT);
    Ok(items)
}

/// B 站把原始 DEFLATE 流标成 deflate（且非 zlib 包裹），需关闭 reqwest 自动解压手动处理。
async fn request_bilibili_danmaku_xml(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .header("User-Agent", BILIBILI_BROWSER_UA)
        .header("Accept", "application/xml,text/xml,*/*")
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|error| format!("弹幕请求失败：{error} / Danmaku request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Bilibili danmaku is unavailable just now ({status})."
        ));
    }
    let encoding = response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let decoded = if encoding.contains("deflate") {
        decode_deflate_payload(&bytes)?
    } else {
        bytes.to_vec()
    };
    Ok(String::from_utf8_lossy(&decoded).into_owned())
}

fn decode_deflate_payload(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut raw = flate2::read::DeflateDecoder::new(bytes);
    let mut decoded = Vec::new();
    if raw.read_to_end(&mut decoded).is_ok() {
        return Ok(decoded);
    }
    let mut zlib = flate2::read::ZlibDecoder::new(bytes);
    let mut decoded = Vec::new();
    zlib.read_to_end(&mut decoded)
        .map_err(|error| format!("Could not decode danmaku: {error}"))?;
    Ok(decoded)
}

/// 扫描 `<d p="time,mode,size,color,...">text</d>`（简单字符串扫描，足够 list.so 格式）。
fn parse_bilibili_danmaku_xml(xml: &str) -> Vec<DanmakuItemDto> {
    let mut items = Vec::new();
    let mut cursor = 0_usize;
    while let Some(start_rel) = xml[cursor..].find("<d p=\"") {
        let start = cursor + start_rel + 6;
        let Some(end_attr_rel) = xml[start..].find('"') else {
            break;
        };
        let attr = &xml[start..start + end_attr_rel];
        let text_start = start + end_attr_rel + 2;
        let Some(text_end_rel) = xml[text_start..].find("</d>") else {
            break;
        };
        let raw_text = &xml[text_start..text_start + text_end_rel];
        cursor = text_start + text_end_rel + 4;

        let parts = attr.split(',').collect::<Vec<_>>();
        let text = decode_xml_text(raw_text);
        if text.trim().is_empty() || text.chars().count() > 42 {
            continue;
        }
        let time = parts
            .first()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0);
        let color = parts
            .get(3)
            .and_then(|value| value.trim().parse::<u32>().ok())
            .unwrap_or(0x00FF_FFFF);
        items.push(DanmakuItemDto { time, text, color });
    }
    items.sort_by(|left, right| {
        left.time
            .partial_cmp(&right.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut seen = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(format!("{}:{:.0}", item.text, item.time)))
        .collect()
}

fn decode_xml_text(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
        .trim()
        .to_string()
}

// ── 字段小工具 ─────────────────────────────────────────────────────────

fn json_text(value: Option<&serde_json::Value>) -> Option<String> {
    value
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn json_id(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(|value| {
            value
                .as_str()
                .map(ToString::to_string)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
                .or_else(|| value.as_u64().map(|number| number.to_string()))
        })
        .unwrap_or_default()
}

/// `"5:30"` → 330；`"1:02:03"` → 3723；数字原样（秒）。
fn parse_bilibili_duration(value: Option<&serde_json::Value>) -> Option<u64> {
    match value? {
        serde_json::Value::Number(number) => number.as_u64(),
        serde_json::Value::String(text) => {
            let parts = text
                .split(':')
                .filter_map(|part| part.parse::<u64>().ok())
                .collect::<Vec<_>>();
            match parts.as_slice() {
                [minutes, seconds] => Some(minutes * 60 + seconds),
                [hours, minutes, seconds] => Some(hours * 3600 + minutes * 60 + seconds),
                _ => None,
            }
        }
        _ => None,
    }
}

/// 搜索结果标题清洗：去掉高亮 em 标签与 HTML 实体。
fn clean_bilibili_title(title: &str) -> String {
    title
        .replace("<em class=\"keyword\">", "")
        .replace("</em>", "")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .trim()
        .to_string()
}

/// 封面地址归一：协议相对与 http:// 都转 https。
fn normalize_bilibili_image_url(value: String) -> String {
    let normalized = value.replace("\\u002F", "/").trim().to_string();
    if normalized.starts_with("//") {
        format!("https:{normalized}")
    } else if normalized.starts_with("http://") {
        normalized.replacen("http://", "https://", 1)
    } else {
        normalized
    }
}

// ── Tauri 命令 ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn bilibili_search(
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<BilibiliSongDto>, String> {
    search_songs(&keywords, limit.unwrap_or(12)).await
}

#[tauri::command]
pub async fn bilibili_stream_url(id: String) -> Result<BilibiliStreamUrlDto, String> {
    fetch_stream_url(&id).await
}

#[tauri::command]
pub async fn bilibili_danmaku(id: String) -> Result<Vec<DanmakuItemDto>, String> {
    fetch_danmaku(&id).await
}
