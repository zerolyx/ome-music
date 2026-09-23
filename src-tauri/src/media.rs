//! ome-media 自定义协议：本地文件播放 + 远程媒体代理（Bilibili CDN）。
//!
//! `/local?p=<绝对路径>`：本地文件（含 Range 支持）。
//! `/remote?p=<encodeURIComponent(url)>&r=<referer-host>`：远程媒体代理，
//! 前端用 `bilibili_stream_url` 返回的 url/referer 拼接本路由播放。

use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use tauri::http::{header::CONTENT_RANGE, StatusCode};

use crate::bilibili::{BILIBILI_BROWSER_UA, BILIBILI_REFERER};

/// 远程媒体域后缀白名单（B 站 CDN 及其镜像/图床 + 网易云封面域），SSRF 防护。
const REMOTE_MEDIA_HOST_SUFFIXES: &[&str] = &[
    "bilivideo.com",
    "bilivideo.cn",
    "akamaized.net",
    "hdslb.com",
    "126.net",
];

/// 域名是否命中白名单（host == 后缀 或以 `.后缀` 结尾）。
pub fn remote_media_host_allowed(host: &str) -> bool {
    let host = host.trim().to_ascii_lowercase();
    host.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-'))
        && REMOTE_MEDIA_HOST_SUFFIXES
            .iter()
            .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
}

/// 上游 URL 校验：仅 https + 白名单域名（userinfo/@ 伪装会被 host_str() 识破）。
pub fn remote_media_url_allowed(url: &str) -> bool {
    reqwest::Url::parse(url)
        .map(|parsed| {
            parsed.scheme() == "https"
                && parsed
                    .host_str()
                    .map(remote_media_host_allowed)
                    .unwrap_or(false)
        })
        .unwrap_or(false)
}

pub fn parse_range(header: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let header = header?;
    let spec = header.strip_prefix("bytes=")?;
    let (start_raw, end_raw) = spec.split_once('-')?;
    let start: u64 = start_raw.trim().parse().ok()?;
    if start >= size {
        return None;
    }
    let end: u64 = if end_raw.trim().is_empty() {
        size - 1
    } else {
        end_raw.trim().parse::<u64>().ok()?.min(size - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

pub fn content_type_for(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "m4a" | "aac" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn serve_file(
    path: PathBuf,
    range_header: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
    let mut file = std::fs::File::open(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file.metadata().map_err(|_| StatusCode::NOT_FOUND)?.len();
    let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    let content_type = content_type_for(ext);

    if let Some((start, end)) = parse_range(range_header.as_deref(), size) {
        let length = end - start + 1;
        let mut buffer = vec![0u8; length as usize];
        file.seek(SeekFrom::Start(start))
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        file.read_exact(&mut buffer)
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        tauri::http::Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Type", content_type)
            .header("Accept-Ranges", "bytes")
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
            .header("Content-Length", length)
            .header("Access-Control-Allow-Origin", "*")
            .body(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        tauri::http::Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", content_type)
            .header("Accept-Ranges", "bytes")
            .header("Content-Length", size)
            .header("Access-Control-Allow-Origin", "*")
            .body(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

/// 代理客户端：跟随重定向时逐跳校验白名单，防止 302 绕过 SSRF 防护。
fn remote_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 {
                    return attempt.stop();
                }
                if remote_media_url_allowed(attempt.url().as_str()) {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .expect("构建远程媒体代理客户端失败")
    })
}

async fn fetch_remote_media(url: &str, range: Option<&str>) -> Result<reqwest::Response, String> {
    let mut request = remote_client()
        .get(url)
        .header("User-Agent", BILIBILI_BROWSER_UA)
        .header("Referer", BILIBILI_REFERER);
    if let Some(range) = range.filter(|range| !range.trim().is_empty()) {
        request = request.header("Range", range);
    }
    request.send().await.map_err(|error| error.to_string())
}

fn proxy_remote(
    query: &str,
    range_header: Option<String>,
) -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
    let url = query_param(query, "p").ok_or(StatusCode::BAD_REQUEST)?;
    if !remote_media_url_allowed(&url) {
        return Err(StatusCode::FORBIDDEN);
    }
    let upstream =
        tauri::async_runtime::block_on(fetch_remote_media(&url, range_header.as_deref()))
            .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let status = upstream.status();
    let mut builder = tauri::http::Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY))
        .header("Access-Control-Allow-Origin", "*");
    for header in ["Content-Type", "Content-Range", "Accept-Ranges"] {
        if let Some(value) = upstream
            .headers()
            .get(header)
            .and_then(|value| value.to_str().ok())
        {
            builder = builder.header(header, value);
        }
    }
    let body = tauri::async_runtime::block_on(async {
        upstream.bytes().await.map(|bytes| bytes.to_vec())
    })
    .map_err(|_| StatusCode::BAD_GATEWAY)?;
    builder
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// 从 query 串取单个参数并做百分号解码。
fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if parts.next() == Some(key) {
            return parts.next().and_then(|value| {
                urlencoding::decode(value)
                    .ok()
                    .map(|value| value.to_string())
            });
        }
    }
    None
}

pub fn handle(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let handled = (|| -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
        let uri = request.uri();
        let path = uri.path();
        let query = uri.query().unwrap_or("");
        if path == "/remote" {
            let range = request
                .headers()
                .get("range")
                .and_then(|value| value.to_str().ok())
                .map(|value| value.to_string());
            return proxy_remote(query, range);
        }
        // 形如 http://ome-media.localhost/local?p=%2FD%3A%2Fmusic%2Fa.mp3（或 ome-media://local?p=...）
        let path = query_param(query, "p").ok_or(StatusCode::BAD_REQUEST)?;
        if !std::path::Path::new(&path).is_absolute() {
            return Err(StatusCode::BAD_REQUEST);
        }
        let range = request
            .headers()
            .get("range")
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        serve_file(PathBuf::from(path), range)
    })();

    match handled {
        Ok(response) => response,
        Err(status) => tauri::http::Response::builder()
            .status(status)
            .body(Vec::new())
            .unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_range_full_suffix() {
        assert_eq!(parse_range(Some("bytes=0-"), 100), Some((0, 99)));
        assert_eq!(parse_range(Some("bytes=10-"), 100), Some((10, 99)));
    }

    #[test]
    fn parse_range_explicit_end_clamps_to_size() {
        assert_eq!(parse_range(Some("bytes=0-49"), 100), Some((0, 49)));
        assert_eq!(parse_range(Some("bytes=90-999"), 100), Some((90, 99)));
    }

    #[test]
    fn parse_range_invalid() {
        assert_eq!(parse_range(None, 100), None);
        assert_eq!(parse_range(Some("bytes=200-300"), 100), None);
        assert_eq!(parse_range(Some("apples"), 100), None);
    }

    #[test]
    fn content_type_by_extension() {
        assert_eq!(content_type_for("mp3"), "audio/mpeg");
        assert_eq!(content_type_for("FLAC"), "audio/flac");
        assert_eq!(content_type_for("xyz"), "application/octet-stream");
    }

    #[test]
    fn remote_host_allow_list() {
        assert!(remote_media_host_allowed("upos-sz-mirror08c.bilivideo.com"));
        assert!(remote_media_host_allowed("bilivideo.com"));
        assert!(remote_media_host_allowed(
            "upos-hz-mirrorakam.akamaized.net"
        ));
        assert!(remote_media_host_allowed("i0.hdslb.com"));
        assert!(remote_media_host_allowed("p1.music.126.net"));
        assert!(!remote_media_host_allowed("evil126.net"));
        assert!(remote_media_host_allowed("BILIVIDEO.COM"));
        assert!(remote_media_host_allowed("www.bilivideo.cn"));
        // 后缀伪装 / 相似域 / 非白名单域名一律拒绝。
        assert!(!remote_media_host_allowed("evil.com"));
        assert!(!remote_media_host_allowed("bilivideo.com.evil.com"));
        assert!(!remote_media_host_allowed("notbilivideo.com"));
        assert!(!remote_media_host_allowed("api.bilibili.com"));
        assert!(!remote_media_host_allowed(""));
    }

    #[test]
    fn remote_url_allows_only_https_on_allow_list() {
        assert!(remote_media_url_allowed(
            "https://upos-sz-mirror08c.bilivideo.com/medias/a.mp4"
        ));
        assert!(!remote_media_url_allowed(
            "http://upos-sz-mirror08c.bilivideo.com/medias/a.mp4"
        ));
        assert!(!remote_media_url_allowed("https://evil.com/a.mp4"));
        // userinfo 伪装：host 实际是 evil.com。
        assert!(!remote_media_url_allowed(
            "https://bilivideo.com@evil.com/a.mp4"
        ));
        assert!(!remote_media_url_allowed("not a url"));
    }

    #[test]
    fn query_param_decodes_named_value() {
        assert_eq!(
            query_param(
                "p=https%3A%2F%2Fup.bilivideo.com%2Fa.mp4&r=www.bilibili.com",
                "p"
            ),
            Some("https://up.bilivideo.com/a.mp4".to_string())
        );
        assert_eq!(query_param("p=1", "r"), None);
    }

    #[cfg(test)]
    mod live_tests {
        use super::*;

        /// 端到端：bilibili 取流 → /remote 代理取回媒体字节。
        #[test]
        #[ignore = "live network: real bilibili CDN through /remote proxy"]
        fn live_remote_proxy_fetches_media_bytes() {
            let songs = tauri::async_runtime::block_on(crate::bilibili::search_songs("晴天", 12))
                .expect("search failed");
            let stream =
                tauri::async_runtime::block_on(crate::bilibili::fetch_stream_url(&songs[0].id))
                    .expect("stream url failed");
            let proxy_uri = format!(
                "http://ome-media.localhost/remote?p={}&r=www.bilibili.com",
                urlencoding::encode(&stream.url)
            );
            let request = tauri::http::Request::builder()
                .uri(proxy_uri)
                .header("Range", "bytes=0-1023")
                .body(Vec::new())
                .unwrap();
            let response = handle(request);
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.body().len(), 1024);
            assert_eq!(
                response
                    .headers()
                    .get("Content-Type")
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or(""),
                "video/mp4"
            );
            // 非白名单域名必须被拒。
            let request = tauri::http::Request::builder()
                .uri(format!(
                    "http://ome-media.localhost/remote?p={}",
                    urlencoding::encode("https://evil.com/a.mp4")
                ))
                .body(Vec::new())
                .unwrap();
            assert_eq!(handle(request).status(), StatusCode::FORBIDDEN);
        }
    }
}
