use crate::netease::api::search_songs;
use reqwest::header::{ACCEPT, REFERER, USER_AGENT};
use serde::Serialize;
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

const MAX_QUERY_CHARS: usize = 200;
const MAX_RESPONSE_BYTES: usize = 1_048_576;
const SEARCH_TIMEOUT: Duration = Duration::from_secs(8);
const QQ_SEARCH_URL: &str = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp";
const KUGOU_SEARCH_URL: &str = "https://mobiles.kugou.com/api/v3/search/song";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadataCandidateDto {
    pub source: String,
    pub id: String,
    pub name: String,
    pub artists: String,
    pub album: String,
    pub duration_ms: i64,
    pub cover_url: Option<String>,
}

#[tauri::command]
pub async fn track_metadata_candidates(
    source: String,
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<TrackMetadataCandidateDto>, String> {
    let keywords = keywords.trim();
    if keywords.is_empty() {
        return Err("请输入歌曲名或艺人名".into());
    }
    if keywords.chars().count() > MAX_QUERY_CHARS {
        return Err("搜索词不能超过 200 个字符".into());
    }
    let limit = limit.unwrap_or(10);
    if !(1..=10).contains(&limit) {
        return Err("候选数量必须在 1 到 10 项之间".into());
    }

    match source.as_str() {
        "netease" => search_songs(keywords, limit).await.map(|songs| {
            songs
                .into_iter()
                .map(|song| TrackMetadataCandidateDto {
                    source: "netease".into(),
                    id: format!("netease:{}", song.id),
                    name: song.name,
                    artists: song.artists,
                    album: song.album,
                    duration_ms: song.duration_ms,
                    cover_url: song
                        .cover_url
                        .as_deref()
                        .and_then(crate::media::normalize_metadata_cover_url),
                })
                .collect()
        }),
        "qq" => search_qq(keywords, limit).await,
        "kugou" => search_kugou(keywords, limit).await,
        _ => Err("不支持的曲目信息来源".into()),
    }
}

async fn search_qq(keywords: &str, limit: u32) -> Result<Vec<TrackMetadataCandidateDto>, String> {
    let params = vec![
        ("ct", "24".to_string()),
        ("qqmusic_ver", "1298".to_string()),
        ("new_json", "1".to_string()),
        ("remoteplace", "txt.yqq.song".to_string()),
        ("t", "0".to_string()),
        ("aggr", "1".to_string()),
        ("cr", "1".to_string()),
        ("catZhida", "1".to_string()),
        ("lossless", "0".to_string()),
        ("flag_qc", "0".to_string()),
        ("p", "1".to_string()),
        ("n", limit.to_string()),
        ("w", keywords.to_string()),
        ("format", "json".to_string()),
    ];
    let body = fetch_json("QQ 音乐", QQ_SEARCH_URL, &params, "https://y.qq.com/").await?;
    let songs = body
        .pointer("/data/song/list")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(songs
        .iter()
        .take(limit as usize)
        .enumerate()
        .filter_map(|(index, song)| {
            let name = first_text(song, &["name", "title"])?;
            let artists = song["singer"]
                .as_array()
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|singer| plain_text(&singer["name"]))
                        .collect::<Vec<_>>()
                        .join("、")
                })
                .unwrap_or_default();
            let album = first_text(&song["album"], &["name", "title"]).unwrap_or_default();
            let id = first_text(song, &["mid"])
                .or_else(|| first_text(song, &["id"]))
                .unwrap_or_else(|| format!("result-{index}"));
            let duration_ms = positive_number(&song["interval"])
                .unwrap_or_default()
                .saturating_mul(1000);
            let album_mid = first_text(&song["album"], &["mid", "pmid"])
                .or_else(|| first_text(song, &["albummid"]))
                .filter(|value| {
                    value.len() <= 128 && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
                });
            let cover_url = album_mid
                .map(|mid| format!("https://y.gtimg.cn/music/photo_new/T002R500x500M000{mid}.jpg"))
                .and_then(|url| crate::media::normalize_metadata_cover_url(&url));

            Some(TrackMetadataCandidateDto {
                source: "qq".into(),
                id: format!("qq:{id}"),
                name,
                artists,
                album,
                duration_ms,
                cover_url,
            })
        })
        .collect())
}

async fn search_kugou(
    keywords: &str,
    limit: u32,
) -> Result<Vec<TrackMetadataCandidateDto>, String> {
    let params = vec![
        ("format", "json".to_string()),
        ("keyword", keywords.to_string()),
        ("page", "1".to_string()),
        ("pagesize", limit.to_string()),
        ("showtype", "1".to_string()),
    ];
    let body = fetch_json(
        "酷狗音乐",
        KUGOU_SEARCH_URL,
        &params,
        "https://www.kugou.com/",
    )
    .await?;
    let songs = body
        .pointer("/data/info")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(songs
        .iter()
        .take(limit as usize)
        .enumerate()
        .filter_map(|(index, song)| {
            let name = first_text(song, &["songname", "SongName", "song_name", "FileName"])?;
            let artists = first_text(
                song,
                &["singername", "SingerName", "singer_name", "author_name"],
            )
            .unwrap_or_default();
            let album = first_text(song, &["AlbumName", "album_name", "albumname", "albumName"])
                .unwrap_or_default();
            let id = first_text(
                song,
                &["hash", "Hash", "FileHash", "SQFileHash", "HQFileHash"],
            )
            .unwrap_or_else(|| format!("result-{index}"));
            let duration = positive_number(&song["duration"])
                .or_else(|| positive_number(&song["Duration"]))
                .unwrap_or_default();
            let duration_ms = if duration > 1000 {
                duration
            } else {
                duration.saturating_mul(1000)
            };
            let cover_url = first_text(song, &["imgurl", "image", "cover"])
                .map(|url| url.replace("{size}", "300"))
                .and_then(|url| crate::media::normalize_metadata_cover_url(&url));

            Some(TrackMetadataCandidateDto {
                source: "kugou".into(),
                id: format!("kugou:{id}"),
                name,
                artists,
                album,
                duration_ms,
                cover_url,
            })
        })
        .collect())
}

async fn fetch_json(
    provider_name: &str,
    url: &str,
    params: &[(&str, String)],
    referer: &str,
) -> Result<Value, String> {
    let mut response = http_client()
        .get(url)
        .query(params)
        .header(ACCEPT, "application/json,text/plain,*/*")
        .header(REFERER, referer)
        .header(USER_AGENT, concat!("Ome Music/", env!("CARGO_PKG_VERSION")))
        .send()
        .await
        .map_err(|_| format!("{provider_name}暂时无法连接，请稍后再试"))?;

    if !response.status().is_success() {
        return Err(format!("{provider_name}暂时无法提供候选资料"));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(format!("{provider_name}返回的资料超出大小限制"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| format!("读取{provider_name}候选资料失败"))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(format!("{provider_name}返回的资料超出大小限制"));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8_lossy(&bytes);
    parse_json_or_jsonp(&body).ok_or_else(|| format!("无法识别{provider_name}返回的资料"))
}

fn parse_json_or_jsonp(body: &str) -> Option<Value> {
    let body = body.trim();
    serde_json::from_str(body).ok().or_else(|| {
        let open = body.find('(')?;
        let close = body.rfind(')')?;
        if close <= open {
            return None;
        }
        serde_json::from_str(body[open + 1..close].trim()).ok()
    })
}

fn first_text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| plain_text(&value[*key]))
}

fn plain_text(value: &Value) -> Option<String> {
    let raw = value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_i64().map(|number| number.to_string()))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(200).collect())
}

fn positive_number(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str()?.parse::<i64>().ok())
        .filter(|number| *number > 0)
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(SEARCH_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("构建曲目信息搜索客户端失败")
    })
}
