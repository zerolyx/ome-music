//! 业务端点命令：搜索 / 取流 / 歌词 / 红心。
//!
//! payload 与 Global Constraints 一致；薄命令 + 可测内部函数。

use serde::Serialize;
use serde_json::{json, Value};

use super::request;

/// 前端搜索结果 DTO（camelCase 序列化）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseSongDto {
    pub id: u64,
    pub name: String,
    /// 多歌手用「、」连接。
    pub artists: String,
    pub album: String,
    pub duration_ms: i64,
    pub fee: i64,
    /// fee 0（免费）/ 8（低音质免费）可播。
    pub plain: bool,
}

#[cfg(test)]
#[path = "api_test.rs"]
mod api_test;

pub(crate) fn parse_song(raw: &Value) -> Option<NeteaseSongDto> {
    let id = raw["id"].as_u64()?;
    let artists = raw["ar"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|artist| artist["name"].as_str())
                .collect::<Vec<_>>()
                .join("、")
        })
        .unwrap_or_default();
    Some(NeteaseSongDto {
        id,
        name: raw["name"].as_str().unwrap_or_default().to_string(),
        artists,
        album: raw["al"]["name"].as_str().unwrap_or_default().to_string(),
        duration_ms: raw["dt"].as_i64().unwrap_or_default(),
        fee: raw["fee"].as_i64().unwrap_or_default(),
        plain: matches!(raw["fee"].as_i64(), None | Some(0) | Some(8)),
    })
}

pub async fn search_songs(keywords: &str, limit: u32) -> Result<Vec<NeteaseSongDto>, String> {
    let body = request::eapi_post(
        "/api/cloudsearch/pc",
        &json!({
            "s": keywords,
            "type": 1,
            "limit": limit,
            "offset": 0,
            "total": true,
            "e_r": false
        }),
        None,
    )
    .await?;
    let songs = body["result"]["songs"].as_array();
    Ok(songs
        .map(|list| list.iter().filter_map(parse_song).collect())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn netease_search(
    keywords: String,
    limit: Option<u32>,
) -> Result<Vec<NeteaseSongDto>, String> {
    search_songs(&keywords, limit.unwrap_or(30)).await
}

pub async fn fetch_stream_url(id: u64) -> Result<String, String> {
    let body = request::eapi_post(
        "/api/song/enhance/player/url/v1",
        &json!({
            "ids": format!("[{id}]"),
            "level": "standard",
            "encodeType": "flac",
            "e_r": false
        }),
        None,
    )
    .await?;
    body["data"][0]["url"]
        .as_str()
        .filter(|url| !url.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "该歌曲需要 VIP 或无版权".to_string())
}

#[tauri::command]
pub async fn netease_stream_url(id: u64) -> Result<String, String> {
    fetch_stream_url(id).await
}

pub async fn fetch_lyric(id: u64) -> Result<String, String> {
    let body = request::eapi_post(
        "/api/song/lyric/v1",
        &json!({
            "id": id,
            "cp": false,
            "tv": 0,
            "lv": 0,
            "rv": 0,
            "kv": 0,
            "yv": 0,
            "ytv": 0,
            "yrv": 0,
            "e_r": false
        }),
        None,
    )
    .await?;
    Ok(body["lrc"]["lyric"]
        .as_str()
        .unwrap_or_default()
        .to_string())
}

#[tauri::command]
pub async fn netease_lyric(id: u64) -> Result<Value, String> {
    Ok(json!({ "lrc": fetch_lyric(id).await? }))
}

#[tauri::command]
pub async fn netease_like(app: tauri::AppHandle, id: u64, like: bool) -> Result<(), String> {
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))?;
    let cookie = request::load_cookie(&data_dir).ok_or("未登录")?;
    if request::cookie_value(&cookie, "MUSIC_U").is_none() {
        return Err("未登录".to_string());
    }
    let body = request::weapi_post(
        "/api/radio/like",
        &json!({
            "alg": "itembased",
            "trackId": id,
            "like": like,
            "time": "3"
        }),
        Some(&cookie),
    )
    .await?;
    match body["code"].as_i64() {
        Some(200) => Ok(()),
        Some(code) => {
            let message = body["message"]
                .as_str()
                .or_else(|| body["msg"].as_str())
                .unwrap_or("");
            Err(format!("红心失败({code}){message}"))
        }
        None => Err(format!("红心失败: {body}")),
    }
}
