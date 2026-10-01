//! Explicit online lyric lookup for the local metadata editor.
//!
//! Search results are mapped to metadata only. Lyrics are requested by ID when
//! the user previews a candidate, and every request uses a fixed HTTPS origin.

use base64::Engine as _;
use reqwest::header::{ACCEPT, RETRY_AFTER, USER_AGENT};
use reqwest::{RequestBuilder, Response, StatusCode};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;

const AMLL_SEARCH_URL: &str = "https://api.amll.dev/v1/lyrics/search";
const AMLL_GET_URL: &str = "https://api.amll.dev/v1/lyrics/get";
const LRCLIB_SEARCH_URL: &str = "https://lrclib.net/api/search";
const LRCLIB_GET_URL: &str = "https://lrclib.net/api/get";
const QQ_SEARCH_URL: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const QQ_LYRIC_URL: &str = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";
const KUGOU_SEARCH_URL: &str = "https://lyrics.kugou.com/search";
const KUGOU_GET_URL: &str = "https://lyrics.kugou.com/download";
const KUWO_SEARCH_URL: &str = "https://search.kuwo.cn/r.s";
const KUWO_LYRIC_URL: &str = "https://m.kuwo.cn/newh5/singles/songinfoandlrc";
const MAX_QUERY_CHARS: usize = 200;
const MAX_RESPONSE_BYTES: usize = 1_048_576;
const MAX_CANDIDATES: u32 = 8;
const MAX_SAFE_ID: u64 = 9_007_199_254_740_991;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const USER_AGENT_VALUE: &str = concat!(
    "Ome Music/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/zerolyx/ome-music)"
);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSourceCandidateDto {
    pub source: String,
    pub id: String,
    pub name: String,
    pub artists: String,
    pub album: String,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSourceRawDto {
    pub lrc: String,
    pub plain_lyrics: Option<String>,
    pub ttml: Option<String>,
    pub qrc: Option<String>,
    pub tlyric: Option<String>,
    pub rlyric: Option<String>,
}

#[tauri::command]
pub async fn lyrics_provider_candidates(
    source: String,
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let keywords = validate_keywords(&keywords)?;
    let limit = limit.unwrap_or(MAX_CANDIDATES);
    if !(1..=MAX_CANDIDATES).contains(&limit) {
        return Err("歌词候选数量必须在 1 到 8 项之间".into());
    }

    match source.as_str() {
        "amll" => search_amll(&keywords, limit).await,
        "lrclib" => search_lrclib(&keywords, limit).await,
        "qqmusic" => search_qqmusic(&keywords, limit).await,
        "kugou" => search_kugou(&keywords, limit).await,
        "kuwo" => search_kuwo(&keywords, limit).await,
        _ => Err("不支持的歌词来源".into()),
    }
}

#[tauri::command]
pub async fn lyrics_provider_lyric(
    source: String,
    id: String,
) -> Result<LyricsSourceRawDto, String> {
    let id = validate_provider_id(&source, &id)?;
    match source.as_str() {
        "amll" => get_amll_lyric(&id).await,
        "lrclib" => get_lrclib_lyric(&id).await,
        "qqmusic" => get_qqmusic_lyric(&id).await,
        "kugou" => get_kugou_lyric(&id).await,
        "kuwo" => get_kuwo_lyric(&id).await,
        _ => Err("不支持的歌词来源".into()),
    }
}

fn validate_keywords(keywords: &str) -> Result<String, String> {
    let keywords = keywords.trim();
    if keywords.is_empty() {
        return Err("请输入歌曲名或艺人名".into());
    }
    if keywords.chars().count() > MAX_QUERY_CHARS {
        return Err("搜索词不能超过 200 个字符".into());
    }
    Ok(keywords.to_owned())
}

fn validate_numeric_id(id: &str) -> Result<String, String> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("歌词候选编号无效".into());
    }
    let parsed = id
        .parse::<u64>()
        .map_err(|_| "歌词候选编号无效".to_string())?;
    if parsed == 0 || parsed > MAX_SAFE_ID {
        return Err("歌词候选编号超出支持范围".into());
    }
    Ok(parsed.to_string())
}

fn validate_provider_id(source: &str, id: &str) -> Result<String, String> {
    match source {
        "amll" | "lrclib" => validate_numeric_id(id),
        "qqmusic" => validate_compact_id(id, 64).map(str::to_owned),
        "kugou" => {
            let (lyric_id, access_key) = id
                .split_once('~')
                .ok_or_else(|| "酷狗歌词候选编号无效".to_string())?;
            if lyric_id.is_empty()
                || lyric_id.len() > 32
                || !lyric_id.bytes().all(|byte| byte.is_ascii_digit())
                || access_key.is_empty()
                || validate_compact_id(access_key, 128).is_err()
            {
                return Err("酷狗歌词候选编号无效".into());
            }
            Ok(format!("{lyric_id}~{access_key}"))
        }
        "kuwo" => {
            let parsed = id
                .parse::<u64>()
                .map_err(|_| "酷我歌词候选编号无效".to_string())?;
            if parsed == 0 || id.len() > 20 || !id.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err("酷我歌词候选编号无效".into());
            }
            Ok(parsed.to_string())
        }
        _ => Err("不支持的歌词来源".into()),
    }
}

fn validate_compact_id(id: &str, max_len: usize) -> Result<&str, String> {
    if id.is_empty()
        || id.len() > max_len
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("歌词候选编号无效".into());
    }
    Ok(id)
}

async fn search_amll(keywords: &str, limit: u32) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let body = fetch_json(
        "AMLL",
        AMLL_SEARCH_URL,
        &[
            ("q", keywords.to_owned()),
            ("page", "1".to_owned()),
            ("pageSize", limit.to_string()),
        ],
    )
    .await?;
    parse_amll_candidates(&body, limit)
}

async fn search_lrclib(
    keywords: &str,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let body = fetch_json("LRCLIB", LRCLIB_SEARCH_URL, &[("q", keywords.to_owned())]).await?;
    parse_lrclib_candidates(&body, limit)
}

async fn get_amll_lyric(id: &str) -> Result<LyricsSourceRawDto, String> {
    let body = fetch_json("AMLL", AMLL_GET_URL, &[("id", id.to_owned())]).await?;
    let ttml = body
        .pointer("/data/lyrics")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "AMLL 没有返回可用歌词".to_string())?;
    Ok(LyricsSourceRawDto {
        lrc: String::new(),
        plain_lyrics: None,
        ttml: Some(ttml.to_owned()),
        qrc: None,
        tlyric: None,
        rlyric: None,
    })
}

async fn get_lrclib_lyric(id: &str) -> Result<LyricsSourceRawDto, String> {
    let url = format!("{LRCLIB_GET_URL}/{id}");
    let body = fetch_json("LRCLIB", &url, &[]).await?;
    Ok(LyricsSourceRawDto {
        lrc: first_long_text(&body, &["syncedLyrics"]).unwrap_or_default(),
        plain_lyrics: first_long_text(&body, &["plainLyrics"]),
        ttml: None,
        qrc: None,
        tlyric: None,
        rlyric: None,
    })
}

async fn search_qqmusic(
    keywords: &str,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let body = json!({
        "comm": { "ct": "19", "cv": "1859", "uin": "0" },
        "req_1": {
            "module": "music.search.SearchCgiService",
            "method": "DoSearchForQQMusicDesktop",
            "param": {
                "query": keywords,
                "page_num": 1,
                "num_per_page": limit,
                "search_type": 0
            }
        }
    });
    let body = fetch_json_post("QQ 音乐", QQ_SEARCH_URL, &body).await?;
    parse_qqmusic_candidates(&body, limit)
}

async fn get_qqmusic_lyric(id: &str) -> Result<LyricsSourceRawDto, String> {
    let params = [
        ("songmid", id.to_owned()),
        ("g_tk", "5381".to_owned()),
        ("loginUin", "0".to_owned()),
        ("hostUin", "0".to_owned()),
        ("format", "json".to_owned()),
        ("inCharset", "utf8".to_owned()),
        ("outCharset", "utf-8".to_owned()),
        ("notice", "0".to_owned()),
        ("platform", "yqq".to_owned()),
        ("needNewCode", "0".to_owned()),
        ("nobase64", "1".to_owned()),
    ];
    let body = fetch_json("QQ 音乐", QQ_LYRIC_URL, &params).await?;
    let lyric = decoded_provider_text(&body, "lyric");
    let qrc = decoded_provider_text(&body, "qrc");
    let (lrc, plain_lyrics, qrc) = split_primary_lyric(lyric, qrc);
    if lrc.is_empty() && plain_lyrics.is_none() && qrc.is_none() {
        return Err("QQ 音乐没有返回可用歌词".into());
    }
    Ok(LyricsSourceRawDto {
        lrc,
        plain_lyrics,
        ttml: None,
        qrc,
        tlyric: decoded_provider_text(&body, "trans"),
        rlyric: decoded_provider_text(&body, "roma"),
    })
}

async fn search_kugou(keywords: &str, limit: u32) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let params = [
        ("ver", "1".to_owned()),
        ("man", "yes".to_owned()),
        ("client", "pc".to_owned()),
        ("keyword", keywords.to_owned()),
        ("duration", String::new()),
    ];
    let body = fetch_json("酷狗音乐", KUGOU_SEARCH_URL, &params).await?;
    parse_kugou_candidates(&body, limit)
}

async fn get_kugou_lyric(id: &str) -> Result<LyricsSourceRawDto, String> {
    let (lyric_id, access_key) = id
        .split_once('~')
        .ok_or_else(|| "酷狗歌词候选编号无效".to_string())?;
    let params = [
        ("ver", "1".to_owned()),
        ("client", "pc".to_owned()),
        ("id", lyric_id.to_owned()),
        ("accesskey", access_key.to_owned()),
        ("fmt", "lrc".to_owned()),
        ("charset", "utf8".to_owned()),
    ];
    let body = fetch_json("酷狗音乐", KUGOU_GET_URL, &params).await?;
    let content = first_long_text(&body, &["content"])
        .map(|value| decode_kugou_content(&value))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "酷狗音乐没有返回可用歌词".to_string())?;
    let (lrc, plain_lyrics, qrc) = split_primary_lyric(Some(content), None);
    Ok(LyricsSourceRawDto {
        lrc,
        plain_lyrics,
        ttml: None,
        qrc,
        tlyric: None,
        rlyric: None,
    })
}

async fn search_kuwo(keywords: &str, limit: u32) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let params = [
        ("all", keywords.to_owned()),
        ("ft", "music".to_owned()),
        ("itemset", "web_2013".to_owned()),
        ("client", "kt".to_owned()),
        ("pn", "0".to_owned()),
        ("rn", limit.to_string()),
        ("rformat", "json".to_owned()),
        ("encoding", "utf8".to_owned()),
    ];
    let text = fetch_text("酷我音乐", KUWO_SEARCH_URL, &params).await?;
    let body = parse_kuwo_json(&text)?;
    parse_kuwo_candidates(&body, limit)
}

async fn get_kuwo_lyric(id: &str) -> Result<LyricsSourceRawDto, String> {
    let body = fetch_json("酷我音乐", KUWO_LYRIC_URL, &[("musicId", id.to_owned())]).await?;
    let payload = &body["data"];
    let lrc = kuwo_lrc(&payload["lrclist"]);
    let plain_lyrics = first_long_text(payload, &["lyrics"]);
    if lrc.is_empty() && plain_lyrics.is_none() {
        return Err("酷我音乐没有返回可用歌词".into());
    }
    Ok(LyricsSourceRawDto {
        lrc,
        plain_lyrics,
        ttml: None,
        qrc: None,
        tlyric: None,
        rlyric: None,
    })
}

fn parse_qqmusic_candidates(
    body: &Value,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let items = body
        .pointer("/req_1/data/body/song/list")
        .and_then(Value::as_array)
        .ok_or_else(|| "无法识别 QQ 音乐返回的歌词候选".to_string())?;
    Ok(items
        .iter()
        .take(limit as usize)
        .filter_map(|item| {
            let id = first_text(item, &["mid", "songmid", "songMid", "songMID"])?;
            let name = first_text(item, &["name", "title", "songname", "songorig"])?;
            let artists = item["singer"]
                .as_array()
                .map(|singers| {
                    singers
                        .iter()
                        .filter_map(|singer| first_text(singer, &["name"]))
                        .take(8)
                        .collect::<Vec<_>>()
                        .join("、")
                })
                .filter(|value| !value.is_empty())
                .or_else(|| first_text(item, &["artist", "singername"]))
                .unwrap_or_default();
            let album = first_text(&item["album"], &["name", "title"])
                .or_else(|| first_text(item, &["albumname", "albumtitle"]))
                .unwrap_or_default();
            Some(LyricsSourceCandidateDto {
                source: "qqmusic".into(),
                id,
                name,
                artists,
                album,
                duration_ms: duration_from_value(
                    item.get("interval").or_else(|| item.get("duration")),
                ),
            })
        })
        .collect())
}

fn parse_kugou_candidates(
    body: &Value,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let values = body
        .pointer("/data/candidates")
        .or_else(|| body.get("candidates"))
        .and_then(Value::as_array)
        .ok_or_else(|| "无法识别酷狗返回的歌词候选".to_string())?;
    Ok(values
        .iter()
        .take(limit as usize)
        .filter_map(|candidate| {
            let lyric_id = value_text(&candidate["id"])?;
            let access_key = first_text(candidate, &["accesskey", "accessKey"])?;
            if lyric_id.len() > 32 || !lyric_id.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            validate_compact_id(&access_key, 128).ok()?;
            let name = first_text(candidate, &["song", "title", "filename"])?;
            Some(LyricsSourceCandidateDto {
                source: "kugou".into(),
                id: format!("{lyric_id}~{access_key}"),
                name,
                artists: first_text(candidate, &["singer", "artist"]).unwrap_or_default(),
                album: String::new(),
                duration_ms: duration_from_value(candidate.get("duration")),
            })
        })
        .collect())
}

fn parse_kuwo_candidates(
    body: &Value,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let values = body
        .get("abslist")
        .and_then(Value::as_array)
        .ok_or_else(|| "无法识别酷我返回的歌词候选".to_string())?;
    Ok(values
        .iter()
        .take(limit as usize)
        .filter_map(|song| {
            let raw_id = first_text(song, &["MUSICRID", "musicrid", "rid"])?;
            let id = normalize_kuwo_id(&raw_id)?;
            let name = first_text(song, &["SONGNAME", "songname", "name"])?;
            Some(LyricsSourceCandidateDto {
                source: "kuwo".into(),
                id,
                name,
                artists: first_text(song, &["ARTIST", "artist"]).unwrap_or_default(),
                album: first_text(song, &["ALBUM", "album"]).unwrap_or_default(),
                duration_ms: duration_from_value(
                    song.get("DURATION").or_else(|| song.get("duration")),
                ),
            })
        })
        .collect())
}

fn normalize_kuwo_id(value: &str) -> Option<String> {
    let digits = value.strip_prefix("MUSIC_").unwrap_or(value);
    if digits.is_empty()
        || digits.len() > 20
        || !digits.bytes().all(|byte| byte.is_ascii_digit())
        || digits.parse::<u64>().ok().filter(|id| *id > 0).is_none()
    {
        return None;
    }
    Some(digits.to_owned())
}

fn duration_from_value(value: Option<&Value>) -> Option<i64> {
    let raw = value
        .and_then(Value::as_f64)
        .or_else(|| value.and_then(Value::as_str)?.parse::<f64>().ok())?;
    if !raw.is_finite() || raw <= 0.0 {
        return None;
    }
    let seconds = if raw > 1_000.0 { raw / 1_000.0 } else { raw };
    (seconds <= 86_400.0).then(|| (seconds * 1_000.0).round() as i64)
}

fn value_text(value: &Value) -> Option<String> {
    let text = value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|number| number.to_string()))?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.chars().take(MAX_QUERY_CHARS).collect())
}

fn decoded_provider_text(body: &Value, key: &str) -> Option<String> {
    let raw = first_long_text(body, &[key])?;
    if raw.contains('[')
        || raw.contains('\n')
        || raw
            .chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    {
        return Some(raw);
    }
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(raw.trim()) {
        let decoded = String::from_utf8_lossy(&bytes).trim().to_owned();
        if !decoded.is_empty() {
            return Some(decoded);
        }
    }
    Some(raw)
}

fn decode_kugou_content(raw: &str) -> String {
    let raw = raw.trim();
    if raw.contains('\n')
        || looks_like_lrc(raw)
        || looks_like_qrc(raw)
        || raw
            .chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    {
        return raw.to_owned();
    }
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_owned())
        .unwrap_or_else(|_| raw.to_owned())
}

fn split_primary_lyric(
    synced_or_plain: Option<String>,
    qrc: Option<String>,
) -> (String, Option<String>, Option<String>) {
    let mut qrc_value = qrc.filter(|value| looks_like_qrc(value));
    let Some(text) = synced_or_plain
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    else {
        return (String::new(), None, qrc_value);
    };
    if looks_like_qrc(&text) {
        qrc_value = Some(text);
        return (String::new(), None, qrc_value);
    }
    if looks_like_lrc(&text) {
        (text, None, qrc_value)
    } else {
        (String::new(), Some(text), qrc_value)
    }
}

fn looks_like_lrc(text: &str) -> bool {
    text.lines().any(|line| {
        let Some((timestamp, _)) = line
            .trim_start()
            .strip_prefix('[')
            .and_then(|line| line.split_once(']'))
        else {
            return false;
        };
        let Some((minutes, seconds)) = timestamp.split_once(':') else {
            return false;
        };
        !minutes.is_empty()
            && minutes.bytes().all(|byte| byte.is_ascii_digit())
            && seconds
                .split_once('.')
                .map(|(whole, fraction)| {
                    !whole.is_empty()
                        && whole.bytes().all(|byte| byte.is_ascii_digit())
                        && !fraction.is_empty()
                        && fraction.bytes().all(|byte| byte.is_ascii_digit())
                })
                .unwrap_or_else(|| {
                    !seconds.is_empty() && seconds.bytes().all(|byte| byte.is_ascii_digit())
                })
    })
}

fn looks_like_qrc(text: &str) -> bool {
    text.lines().any(|line| {
        let Some((header, _)) = line
            .trim_start()
            .strip_prefix('[')
            .and_then(|line| line.split_once(']'))
        else {
            return false;
        };
        let Some((start, duration)) = header.split_once(',') else {
            return false;
        };
        !start.is_empty()
            && !duration.is_empty()
            && start.bytes().all(|byte| byte.is_ascii_digit())
            && duration.bytes().all(|byte| byte.is_ascii_digit())
    })
}

fn parse_kuwo_json(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim();
    let payload = if let Some(start) = trimmed.find('(').filter(|_| trimmed.ends_with(')')) {
        &trimmed[start + 1..trimmed.len() - 1]
    } else {
        trimmed
    };
    let normalized = normalize_single_quoted_json(payload);
    serde_json::from_str(&normalized).map_err(|_| "无法识别酷我返回的搜索结果".to_string())
}

fn normalize_single_quoted_json(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for character in raw.chars() {
        if let Some(delimiter) = quote {
            if escaped {
                match character {
                    '\\' => output.push_str("\\\\"),
                    value if value == delimiter => {
                        output.push(if delimiter == '\'' { '\'' } else { '"' })
                    }
                    '"' if delimiter == '\'' => output.push_str("\\\""),
                    value => {
                        output.push('\\');
                        output.push(value);
                    }
                }
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == delimiter {
                output.push('"');
                quote = None;
            } else if character == '"' && delimiter == '\'' {
                output.push_str("\\\"");
            } else {
                output.push(character);
            }
        } else if character == '\'' {
            output.push('"');
            quote = Some('\'');
        } else {
            output.push(character);
        }
    }
    if escaped {
        output.push('\\');
    }
    output
}

fn kuwo_lrc(value: &Value) -> String {
    let Some(lines) = value.as_array() else {
        return String::new();
    };
    lines
        .iter()
        .filter_map(|line| {
            let seconds = line["time"]
                .as_f64()
                .or_else(|| line["time"].as_str()?.parse::<f64>().ok())?;
            if !seconds.is_finite() || !(0.0..=86_400.0).contains(&seconds) {
                return None;
            }
            let text = first_long_text(line, &["lineLyric", "lyric", "text"])?;
            let text = strip_html(&text);
            (!text.is_empty()).then(|| format!("{}{}", lrc_timestamp(seconds), text))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn lrc_timestamp(seconds: f64) -> String {
    let centiseconds = (seconds * 100.0).round().max(0.0) as u64;
    let minutes = centiseconds / 6_000;
    let remaining = centiseconds % 6_000;
    format!(
        "[{minutes:02}:{:02}.{:02}]",
        remaining / 100,
        remaining % 100
    )
}

fn strip_html(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut inside_tag = false;
    for character in raw.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            value if !inside_tag => output.push(value),
            _ => {}
        }
    }
    output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .trim()
        .to_owned()
}

fn parse_amll_candidates(
    body: &Value,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let items = body
        .pointer("/data/items")
        .and_then(Value::as_array)
        .ok_or_else(|| "无法识别 AMLL 返回的歌词候选".to_string())?;
    Ok(items
        .iter()
        .take(limit as usize)
        .filter_map(|item| {
            let id = numeric_id(&item["id"])?;
            let name = first_array_text(&item["musicNames"])?;
            let artists = joined_array_text(&item["artistNames"]);
            let album = first_array_text(&item["albumNames"]).unwrap_or_default();
            Some(LyricsSourceCandidateDto {
                source: "amll".into(),
                id,
                name,
                artists,
                album,
                duration_ms: duration_ms(item),
            })
        })
        .collect())
}

fn parse_lrclib_candidates(
    body: &Value,
    limit: u32,
) -> Result<Vec<LyricsSourceCandidateDto>, String> {
    let items = body
        .as_array()
        .ok_or_else(|| "无法识别 LRCLIB 返回的歌词候选".to_string())?;
    Ok(items
        .iter()
        .take(limit as usize)
        .filter_map(|item| {
            let id = numeric_id(&item["id"])?;
            let name = first_text(item, &["trackName", "name"])?;
            Some(LyricsSourceCandidateDto {
                source: "lrclib".into(),
                id,
                name,
                artists: first_text(item, &["artistName"]).unwrap_or_default(),
                album: first_text(item, &["albumName"]).unwrap_or_default(),
                duration_ms: duration_ms(item),
            })
        })
        .collect())
}

fn duration_ms(value: &Value) -> Option<i64> {
    value
        .get("durationMs")
        .and_then(Value::as_i64)
        .filter(|duration| *duration > 0)
        .or_else(|| {
            value
                .get("duration")
                .and_then(Value::as_f64)
                .filter(|duration| duration.is_finite() && *duration > 0.0 && *duration <= 86_400.0)
                .map(|duration| (duration * 1000.0).round() as i64)
        })
}

fn numeric_id(value: &Value) -> Option<String> {
    let id = value
        .as_u64()
        .or_else(|| value.as_str()?.parse::<u64>().ok())?;
    (id > 0 && id <= MAX_SAFE_ID).then(|| id.to_string())
}

fn first_array_text(value: &Value) -> Option<String> {
    value
        .as_array()?
        .iter()
        .find_map(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.chars().take(MAX_QUERY_CHARS).collect())
}

fn joined_array_text(value: &Value) -> String {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .take(8)
        .map(|item| item.chars().take(MAX_QUERY_CHARS).collect::<String>())
        .collect::<Vec<_>>()
        .join("、")
}

fn first_text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value[*key]
            .as_str()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| item.chars().take(MAX_QUERY_CHARS).collect())
    })
}

fn first_long_text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value[*key]
            .as_str()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
    })
}

async fn fetch_json(
    provider_name: &str,
    url: &str,
    params: &[(&str, String)],
) -> Result<Value, String> {
    let response = add_provider_headers(http_client().get(url).query(params), provider_name)
        .send()
        .await
        .map_err(|_| format!("{provider_name}暂时无法连接，请稍后再试"))?;
    read_json_response(provider_name, response).await
}

async fn fetch_json_post(provider_name: &str, url: &str, body: &Value) -> Result<Value, String> {
    let response = add_provider_headers(http_client().post(url).json(body), provider_name)
        .send()
        .await
        .map_err(|_| format!("{provider_name}暂时无法连接，请稍后再试"))?;
    read_json_response(provider_name, response).await
}

async fn fetch_text(
    provider_name: &str,
    url: &str,
    params: &[(&str, String)],
) -> Result<String, String> {
    let response = add_provider_headers(http_client().get(url).query(params), provider_name)
        .send()
        .await
        .map_err(|_| format!("{provider_name}暂时无法连接，请稍后再试"))?;
    let bytes = read_response_bytes(provider_name, response).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn add_provider_headers(mut request: RequestBuilder, provider_name: &str) -> RequestBuilder {
    request = request
        .header(ACCEPT, "application/json,text/plain,*/*")
        .header(USER_AGENT, USER_AGENT_VALUE);
    match provider_name {
        "QQ 音乐" => {
            request = request
                .header("Referer", "https://y.qq.com/")
                .header("Origin", "https://y.qq.com");
        }
        "酷狗音乐" => request = request.header("Referer", "https://www.kugou.com/"),
        "酷我音乐" => request = request.header("Referer", "https://www.kuwo.cn/"),
        _ => {}
    }
    request
}

async fn read_json_response(provider_name: &str, response: Response) -> Result<Value, String> {
    let bytes = read_response_bytes(provider_name, response).await?;
    serde_json::from_slice(&bytes).map_err(|_| format!("无法识别{provider_name}返回的歌词资料"))
}

async fn read_response_bytes(
    provider_name: &str,
    mut response: Response,
) -> Result<Vec<u8>, String> {
    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        return Err(retry_after.map_or_else(
            || format!("{provider_name}请求过于频繁，请稍后再试"),
            |seconds| format!("{provider_name}请求过于频繁，请等待 {seconds} 秒后再试"),
        ));
    }
    if !response.status().is_success() {
        return Err(format!("{provider_name}暂时无法提供歌词候选"));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(format!("{provider_name}返回的歌词资料超出大小限制"));
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| format!("读取{provider_name}歌词资料失败"))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(format!("{provider_name}返回的歌词资料超出大小限制"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("构建歌词查询客户端失败")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_amll_ttml_candidates_without_lyrics() {
        let body = json!({
            "status": 200,
            "data": {
                "items": [{
                    "id": 8713122671638320_u64,
                    "musicNames": ["ME!"],
                    "artistNames": ["Taylor Swift", "Brendon Urie"],
                    "albumNames": ["Lover"]
                }]
            }
        });

        let candidates = parse_amll_candidates(&body, 8).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].source, "amll");
        assert_eq!(candidates[0].id, "8713122671638320");
        assert_eq!(candidates[0].artists, "Taylor Swift、Brendon Urie");
        assert_eq!(candidates[0].duration_ms, None);
    }

    #[test]
    fn parses_lrclib_candidates_and_converts_duration() {
        let body = json!([{
            "id": 3396226,
            "trackName": "I Want to Live",
            "artistName": "Borislav Slavov",
            "albumName": "Baldur's Gate 3",
            "duration": 233.4,
            "plainLyrics": "not included in candidate DTO",
            "syncedLyrics": "not included in candidate DTO"
        }]);

        let candidates = parse_lrclib_candidates(&body, 8).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "3396226");
        assert_eq!(candidates[0].name, "I Want to Live");
        assert_eq!(candidates[0].duration_ms, Some(233_400));
    }

    #[test]
    fn rejects_malformed_and_unsafe_ids() {
        assert!(validate_numeric_id("../../etc/passwd").is_err());
        assert!(validate_numeric_id("9007199254740992").is_err());
        assert_eq!(validate_numeric_id("3396226").unwrap(), "3396226");
    }

    #[test]
    fn parses_qqmusic_song_candidates_without_lyrics() {
        let body = json!({
            "req_1": { "data": { "body": { "song": { "list": [{
                "mid": "003abcDEF",
                "name": "Echo Song",
                "interval": 198,
                "singer": [{ "name": "Echo Artist" }, { "name": "Guest" }],
                "album": { "name": "Echo Album" },
                "lyric": "must not be included"
            }] } } } }
        });
        let candidates = parse_qqmusic_candidates(&body, 8).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "003abcDEF");
        assert_eq!(candidates[0].artists, "Echo Artist、Guest");
        assert_eq!(candidates[0].duration_ms, Some(198_000));
    }

    #[test]
    fn parses_kugou_candidates_and_keeps_access_key_in_validated_id() {
        let body = json!({
            "data": { "candidates": [{
                "id": 8123,
                "accesskey": "a1b2c3",
                "song": "Echo Song",
                "singer": "Echo Artist",
                "duration": 180
            }, {
                "id": "8124",
                "accesskey": "bad/key",
                "song": "Unsafe Candidate"
            }] }
        });
        let candidates = parse_kugou_candidates(&body, 8).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "8123~a1b2c3");
        assert_eq!(candidates[0].duration_ms, Some(180_000));
        assert!(validate_provider_id("kugou", &candidates[0].id).is_ok());
        assert!(validate_provider_id("kugou", "8123~../../etc").is_err());
    }

    #[test]
    fn parses_kuwo_single_quoted_search_response_and_duration() {
        let body = parse_kuwo_json(
            r#"{"abslist":[{'MUSICRID':'MUSIC_1234','SONGNAME':'Echo Song','ARTIST':'Echo Artist','ALBUM':'Echo Album','DURATION':'180'}]}"#,
        )
        .unwrap();
        let candidates = parse_kuwo_candidates(&body, 8).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "1234");
        assert_eq!(candidates[0].name, "Echo Song");
        assert_eq!(candidates[0].duration_ms, Some(180_000));
        assert!(validate_provider_id("kuwo", "1234").is_ok());
        assert!(validate_provider_id("kuwo", "1234/../5").is_err());
    }

    #[test]
    fn parses_kuwo_synced_lyrics_and_decodes_safe_inline_markup() {
        let lyrics = kuwo_lrc(&json!([
            { "time": "1.25", "lineLyric": "<em>First</em> &amp; line" },
            { "time": 4, "lineLyric": "Second" },
            { "time": -1, "lineLyric": "ignored" }
        ]));
        assert_eq!(lyrics, "[00:01.25]First & line\n[00:04.00]Second");
    }

    #[test]
    fn recognizes_qrc_and_plain_or_synced_text_from_provider() {
        let qrc = "[1000,2000]<1000,500>Echo<1500,500> line".to_owned();
        assert_eq!(
            split_primary_lyric(Some(qrc.clone()), None),
            (String::new(), None, Some(qrc))
        );
        assert_eq!(
            split_primary_lyric(Some("[00:01.00]line".into()), None).0,
            "[00:01.00]line"
        );
        assert_eq!(
            split_primary_lyric(Some("plain line".into()), None)
                .1
                .as_deref(),
            Some("plain line")
        );
    }

    #[test]
    fn validates_provider_ids_as_data_not_urls_or_paths() {
        assert!(validate_provider_id("qqmusic", "003abc_DEF-1").is_ok());
        assert!(validate_provider_id("qqmusic", "https://example.com").is_err());
        assert!(validate_provider_id("amll", "../../etc/passwd").is_err());
        assert!(validate_provider_id("lrclib", "9007199254740992").is_err());
    }

    #[test]
    fn lyric_text_is_not_truncated_to_the_short_metadata_field_limit() {
        let lyric = "歌词".repeat(150);
        let body = json!({ "syncedLyrics": lyric });
        assert_eq!(
            first_long_text(&body, &["syncedLyrics"])
                .unwrap()
                .chars()
                .count(),
            300
        );
        assert_eq!(
            first_text(&body, &["syncedLyrics"])
                .unwrap()
                .chars()
                .count(),
            200
        );
    }
}
