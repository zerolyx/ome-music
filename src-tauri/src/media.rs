use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::http::{header::CONTENT_RANGE, StatusCode};

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
            .body(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

pub fn handle(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let handled = (|| -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
        let uri = request.uri().to_string();
        // 形如 http://ome-media.localhost/local?p=%2FD%3A%2Fmusic%2Fa.mp3（或 ome-media://local?p=...）
        let query = uri.split_once('?').map(|(_, query)| query).unwrap_or("");
        let mut requested_path = None;
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            if parts.next() == Some("p") {
                requested_path = parts
                    .next()
                    .and_then(|value| urlencoding::decode(value).ok().map(|value| value.to_string()));
            }
        }
        let path = requested_path.ok_or(StatusCode::BAD_REQUEST)?;
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
}
