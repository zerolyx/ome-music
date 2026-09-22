//! 请求层：URL 拼接、eapi/weapi POST 封装、设备头、Cookie 持久化。
//!
//! 对齐 NeteaseCloudMusicApi@4.32.0 util/request.js（Global Constraints 为准）。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rand::Rng;
use reqwest::header::{CONTENT_TYPE, COOKIE, REFERER, SET_COOKIE, USER_AGENT};
use serde_json::{Map, Value};

use super::crypto;

/// eapi 域名（Global Constraints）。
pub const EAPI_DOMAIN: &str = "https://interface3.music.163.com";
/// weapi 域名（Global Constraints）。
pub const WEAPI_DOMAIN: &str = "https://music.163.com";
/// chooseUserAgent('api', 'iphone') 输出，逐字取自 util/request.js userAgentMap.api.iphone。
pub const IPHONE_UA: &str = "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";
/// chooseUserAgent('weapi') 默认 UA（userAgentMap.weapi.pc）。
const WEAPI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";

const OSVER: &str = "Microsoft-Windows-10-Professional-build-19045-64bit";
const APPVER: &str = "3.1.17.204416";
const CHANNEL: &str = "netease";
const VERSION_CODE: &str = "140";
const RESOLUTION: &str = "1920x1080";
const COOKIE_FILE_NAME: &str = "netease-cookie.txt";
const PROFILE_FILE_NAME: &str = "netease-profile.txt";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[cfg(test)]
#[path = "request_test.rs"]
mod request_test;

pub fn eapi_url(uri: &str) -> String {
    format!("{EAPI_DOMAIN}/eapi/{}", uri.trim_start_matches("/api/"))
}

pub fn weapi_url(uri: &str) -> String {
    format!("{WEAPI_DOMAIN}/weapi/{}", uri.trim_start_matches("/api/"))
}

/// 从 `k=v; k2=v2` 形式的 cookie 串取值（Set-Cookie 属性行为兼容：按第一个 `;` 已在上游剥离）。
pub fn cookie_value(cookie: &str, name: &str) -> Option<String> {
    cookie
        .split(';')
        .filter_map(|pair| pair.split_once('='))
        .find(|(k, _)| k.trim() == name)
        .map(|(_, v)| v.trim().to_string())
}

/// 把响应 Set-Cookie 头数组折叠成 `k=v; k2=v2`（丢弃 Path/Domain 等属性，对齐参考实现）。
pub fn set_cookies_to_cookie_string(set_cookies: &[String]) -> String {
    set_cookies
        .iter()
        .filter_map(|header| header.split(';').next())
        .map(str::trim)
        .filter(|pair| !pair.is_empty() && pair.contains('='))
        .collect::<Vec<_>>()
        .join("; ")
}

/// eapi 设备头：同时进入请求体 `header` 字段与 Cookie（Global Constraints 字段表）。
pub fn build_eapi_header(music_u: Option<&str>, csrf: Option<&str>) -> Vec<(String, String)> {
    let mut header: Vec<(String, String)> = Vec::with_capacity(10);
    let mut push = |key: &str, value: String| header.push((key.to_string(), value));
    push("osver", OSVER.to_string());
    push("os", "pc".to_string());
    push("appver", APPVER.to_string());
    push("versioncode", VERSION_CODE.to_string());
    push("buildver", today_buildver());
    push("resolution", RESOLUTION.to_string());
    if let Some(csrf) = csrf.filter(|value| !value.is_empty()) {
        push("__csrf", csrf.to_string());
    }
    push("channel", CHANNEL.to_string());
    push("requestId", new_request_id());
    if let Some(music_u) = music_u.filter(|value| !value.is_empty()) {
        push("MUSIC_U", music_u.to_string());
    }
    header
}

/// Cookie 头串：`encodeURIComponent(k)=encodeURIComponent(v)` 以 `; ` 连接（createHeaderCookie）。
pub fn header_cookie_string(header: &[(String, String)]) -> String {
    header
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                urlencoding::encode(key),
                urlencoding::encode(value)
            )
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// 当日 `yyyyMMdd`（UTC）。
pub fn today_buildver() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    buildver_from_days_since_epoch(secs.div_euclid(86_400))
}

/// 自 Unix 纪元天数 → `yyyyMMdd`（Howard Hinnant civil_from_days 算法，UTC）。
pub fn buildver_from_days_since_epoch(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = era * 400 + yoe as i64 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}{month:02}{day:02}")
}

/// `requestId = 毫秒时间戳_4位随机`（generateRequestId）。
pub fn new_request_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let rand4: u16 = rand::thread_rng().gen_range(0..1000);
    format!("{millis}_{rand4:04}")
}

pub fn cookie_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(COOKIE_FILE_NAME)
}

pub fn profile_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(PROFILE_FILE_NAME)
}

pub fn load_cookie(data_dir: &Path) -> Option<String> {
    read_trimmed(&cookie_file_path(data_dir))
}

pub fn save_cookie(data_dir: &Path, cookie: &str) -> Result<(), String> {
    write_trimmed(data_dir, &cookie_file_path(data_dir), cookie)
}

pub fn load_profile_nickname(data_dir: &Path) -> Option<String> {
    read_trimmed(&profile_file_path(data_dir))
}

pub fn save_profile_nickname(data_dir: &Path, nickname: &str) -> Result<(), String> {
    write_trimmed(data_dir, &profile_file_path(data_dir), nickname)
}

/// 登出 = 清除 cookie 与昵称。
pub fn clear_login_state(data_dir: &Path) {
    let _ = std::fs::remove_file(cookie_file_path(data_dir));
    let _ = std::fs::remove_file(profile_file_path(data_dir));
}

fn read_trimmed(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
}

fn write_trimmed(data_dir: &Path, path: &Path, content: &str) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    std::fs::write(path, content.trim()).map_err(|e| format!("写入文件失败: {e}"))
}

/// eapi POST：返回响应 JSON 与原始 Set-Cookie 列表（QR 登录要从中取 MUSIC_U）。
pub async fn eapi_post_with_cookies(
    uri: &str,
    data: &Value,
    cookie: Option<&str>,
) -> Result<(Value, Vec<String>), String> {
    let music_u = cookie.and_then(|value| cookie_value(value, "MUSIC_U"));
    let csrf = cookie.and_then(|value| cookie_value(value, "__csrf"));
    let header = build_eapi_header(music_u.as_deref(), csrf.as_deref());

    let mut payload = data
        .as_object()
        .cloned()
        .ok_or("eapi 请求体必须是 JSON 对象")?;
    payload.insert("header".to_string(), header_to_value(&header));

    let params = crypto::eapi(uri, &Value::Object(payload));
    let form = format!("params={}", urlencoding::encode(&params));

    let response = http_client()
        .post(eapi_url(uri))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(USER_AGENT, IPHONE_UA)
        .header(COOKIE, header_cookie_string(&header))
        .body(form)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;

    let set_cookies: Vec<String> = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .map(str::to_string)
        .collect();
    let body = parse_json_body(response).await?;
    Ok((body, set_cookies))
}

pub async fn eapi_post(uri: &str, data: &Value, cookie: Option<&str>) -> Result<Value, String> {
    eapi_post_with_cookies(uri, data, cookie)
        .await
        .map(|(body, _)| body)
}

/// weapi POST：csrf_token 自动从 cookie 注入请求体；未登录时携带默认匿名 cookie。
pub async fn weapi_post(uri: &str, data: &Value, cookie: Option<&str>) -> Result<Value, String> {
    let csrf = cookie
        .and_then(|value| cookie_value(value, "__csrf"))
        .unwrap_or_default();
    let mut payload = data
        .as_object()
        .cloned()
        .ok_or("weapi 请求体必须是 JSON 对象")?;
    payload.insert("csrf_token".to_string(), Value::String(csrf));

    let (params, enc_sec_key) = crypto::weapi(&Value::Object(payload));
    let form = format!(
        "params={}&encSecKey={}",
        urlencoding::encode(&params),
        urlencoding::encode(&enc_sec_key)
    );
    let cookie_header = cookie
        .map(str::to_string)
        .unwrap_or_else(default_weapi_cookie);

    let response = http_client()
        .post(weapi_url(uri))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(USER_AGENT, WEAPI_UA)
        .header(REFERER, WEAPI_DOMAIN)
        .header(COOKIE, cookie_header)
        .body(form)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;
    parse_json_body(response).await
}

fn header_to_value(header: &[(String, String)]) -> Value {
    let mut map = Map::new();
    for (key, value) in header {
        map.insert(key.clone(), Value::String(value.clone()));
    }
    Value::Object(map)
}

fn default_weapi_cookie() -> String {
    format!("osver={OSVER}; os=pc; appver={APPVER}; channel={CHANNEL}; versioncode={VERSION_CODE}; __remember_me=true")
}

async fn parse_json_body(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    serde_json::from_str(&text).map_err(|e| {
        let preview: String = text.chars().take(160).collect();
        format!("响应解析失败 (HTTP {status}): {e}: {preview}")
    })
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("构建 HTTP 客户端失败")
    })
}
