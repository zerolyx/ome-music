//! Explicit local MV lookup constrained to authorized music directories.
//! Candidate paths remain in this process and are addressed from the WebView only by opaque IDs.

use rand::random;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const MAX_CANDIDATES: usize = 12;
const MAX_SESSION_CANDIDATES: usize = 256;
const MAX_FOLDER_SCAN_ENTRIES: usize = 500;
const MAX_VIDEO_RANGE_BYTES: u64 = 4 * 1024 * 1024;
const CANDIDATE_TTL: Duration = Duration::from_secs(12 * 60 * 60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVideoCandidateDto {
    pub id: String,
    pub title: String,
    pub size_bytes: u64,
    pub reasons: Vec<String>,
}

#[derive(Clone)]
struct CandidateEntry {
    track_id: String,
    path: PathBuf,
    size_bytes: u64,
    expires_at: Instant,
}

#[derive(Default)]
pub(crate) struct LocalVideoRegistry {
    entries: HashMap<String, CandidateEntry>,
}

impl LocalVideoRegistry {
    fn search(
        &mut self,
        context: crate::library::LocalVideoTrackContext,
    ) -> Vec<LocalVideoCandidateDto> {
        self.prune_expired();

        let mut candidates = discover_candidates(&context);
        candidates.sort_by(|left, right| {
            right
                .score
                .total_cmp(&left.score)
                .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
                .then_with(|| left.path.cmp(&right.path))
        });

        candidates
            .into_iter()
            .take(MAX_CANDIDATES)
            .map(|candidate| {
                self.make_room();
                let id = new_candidate_id();
                self.entries.insert(
                    id.clone(),
                    CandidateEntry {
                        track_id: context.track_id.clone(),
                        path: candidate.path,
                        size_bytes: candidate.size_bytes,
                        expires_at: Instant::now() + CANDIDATE_TTL,
                    },
                );
                LocalVideoCandidateDto {
                    id,
                    title: candidate.title,
                    size_bytes: candidate.size_bytes,
                    reasons: candidate.reasons,
                }
            })
            .collect()
    }

    fn candidate(&mut self, id: &str) -> Option<CandidateEntry> {
        self.prune_expired();
        let entry = self.entries.get_mut(id)?;
        entry.expires_at = Instant::now() + CANDIDATE_TTL;
        Some(entry.clone())
    }

    fn prune_expired(&mut self) {
        let now = Instant::now();
        self.entries.retain(|_, entry| entry.expires_at > now);
    }

    fn make_room(&mut self) {
        while self.entries.len() >= MAX_SESSION_CANDIDATES {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(id, _)| id.clone());
            let Some(oldest) = oldest else { break };
            self.entries.remove(&oldest);
        }
    }
}

struct ScoredCandidate {
    path: PathBuf,
    title: String,
    size_bytes: u64,
    score: f32,
    reasons: Vec<String>,
}

fn supported_video_content_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "mp4" | "m4v" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        _ => None,
    }
}

fn normalize_match_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut previous_space = true;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            output.push(character);
            previous_space = false;
        } else if !previous_space {
            output.push(' ');
            previous_space = true;
        }
    }
    output.trim().to_string()
}

fn score_candidate(
    context: &crate::library::LocalVideoTrackContext,
    path: &Path,
) -> Option<(f32, Vec<String>)> {
    let video_stem = path.file_stem()?.to_str()?;
    let audio_stem = context.audio_path.file_stem()?.to_str()?;
    let video = normalize_match_text(video_stem);
    let audio = normalize_match_text(audio_stem);
    let title = normalize_match_text(&context.title);
    let artist = normalize_match_text(&context.artist);
    if video.is_empty() {
        return None;
    }

    let mut reasons = Vec::new();
    let mut score: f32 = if video == audio {
        reasons.push("与音频文件同名".to_string());
        0.9
    } else if !title.is_empty()
        && !artist.is_empty()
        && (video == format!("{title} {artist}") || video == format!("{artist} {title}"))
    {
        reasons.push("曲名与艺人匹配".to_string());
        0.88
    } else if !title.is_empty()
        && video.contains(&title)
        && !artist.is_empty()
        && video.contains(&artist)
    {
        reasons.push("文件名包含曲名与艺人".to_string());
        0.82
    } else if !title.is_empty() && video.contains(&title) {
        reasons.push("文件名包含曲名".to_string());
        0.62
    } else {
        return None;
    };

    if path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            matches!(
                name.to_ascii_lowercase().as_str(),
                "mv" | "video" | "videos"
            )
        })
    {
        score += 0.06;
        reasons.push("位于 MV/video 子目录".to_string());
    }
    Some((score.min(1.0), reasons))
}

fn candidate_folders(context: &crate::library::LocalVideoTrackContext) -> Vec<PathBuf> {
    let Some(song_folder) = context.audio_path.parent() else {
        return Vec::new();
    };
    let mut folders = vec![song_folder.to_path_buf()];
    folders.extend(["MV", "mv", "video", "videos"].map(|name| song_folder.join(name)));
    if let Some(parent) = song_folder.parent() {
        folders.push(parent.join("MV"));
        folders.push(parent.join("video"));
    }

    let mut seen = HashSet::new();
    folders
        .into_iter()
        .filter_map(|folder| {
            if !seen.insert(crate::library::normalized_path_key(&folder)) {
                return None;
            }
            let metadata = std::fs::symlink_metadata(&folder).ok()?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return None;
            }
            let canonical = folder.canonicalize().ok()?;
            if crate::library::normalized_path_key(&canonical)
                != crate::library::normalized_path_key(&folder)
                || !crate::library::path_is_within_directory(&canonical, &context.authorized_root)
            {
                return None;
            }
            Some(canonical)
        })
        .collect()
}

fn discover_candidates(context: &crate::library::LocalVideoTrackContext) -> Vec<ScoredCandidate> {
    let mut output = Vec::new();
    let mut seen_paths = HashSet::new();
    for folder in candidate_folders(context) {
        let Ok(entries) = std::fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.take(MAX_FOLDER_SCAN_ENTRIES) {
            let Ok(entry) = entry else { continue };
            let path = entry.path();
            if supported_video_content_type(&path).is_none() {
                continue;
            }
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.file_type().is_symlink()
                || !metadata.is_file()
                || metadata.len() == 0
                || !crate::library::is_regular_file_without_symlink_components(
                    &path,
                    &context.authorized_root,
                )
            {
                continue;
            }
            let Ok(canonical) = path.canonicalize() else {
                continue;
            };
            if !seen_paths.insert(crate::library::normalized_path_key(&canonical)) {
                continue;
            }
            let Some((score, reasons)) = score_candidate(context, &canonical) else {
                continue;
            };
            output.push(ScoredCandidate {
                title: canonical
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .chars()
                    .filter(|character| !character.is_control())
                    .take(255)
                    .collect(),
                path: canonical,
                size_bytes: metadata.len(),
                score,
                reasons,
            });
        }
    }
    output
}

fn new_candidate_id() -> String {
    format!("local-mv-{:032x}", random::<u128>())
}

#[tauri::command]
pub async fn list_local_music_video_candidates(
    app: AppHandle,
    track_id: String,
) -> Result<Vec<LocalVideoCandidateDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app
            .try_state::<crate::AppState>()
            .ok_or_else(|| "本地视频状态暂时不可用".to_string())?;
        let context = {
            let conn = state
                .db
                .lock()
                .map_err(|_| "曲库状态暂时不可用".to_string())?;
            crate::library::local_video_track_context(&conn, &track_id)?
        };
        let mut registry = state
            .local_video_candidates
            .lock()
            .map_err(|_| "本地视频候选暂时不可用".to_string())?;
        Ok(registry.search(context))
    })
    .await
    .map_err(|_| "本地视频查找任务失败".to_string())?
}

pub(crate) fn proxy_local_video(
    app: &AppHandle,
    query: &str,
    range: Option<&str>,
) -> Result<tauri::http::Response<Vec<u8>>, tauri::http::StatusCode> {
    let id = crate::media::query_param(query, "id").ok_or(tauri::http::StatusCode::BAD_REQUEST)?;
    let state = app
        .try_state::<crate::AppState>()
        .ok_or(tauri::http::StatusCode::SERVICE_UNAVAILABLE)?;
    let candidate = state
        .local_video_candidates
        .lock()
        .map_err(|_| tauri::http::StatusCode::SERVICE_UNAVAILABLE)?
        .candidate(&id)
        .ok_or(tauri::http::StatusCode::NOT_FOUND)?;
    let db = state
        .db
        .lock()
        .map_err(|_| tauri::http::StatusCode::SERVICE_UNAVAILABLE)?;
    if !crate::library::local_video_path_is_authorized(&db, &candidate.track_id, &candidate.path)
        .map_err(|_| tauri::http::StatusCode::FORBIDDEN)?
    {
        return Err(tauri::http::StatusCode::FORBIDDEN);
    }
    serve_local_video_chunk(&candidate, range)
}

fn serve_local_video_chunk(
    candidate: &CandidateEntry,
    range: Option<&str>,
) -> Result<tauri::http::Response<Vec<u8>>, tauri::http::StatusCode> {
    use tauri::http::{header::CONTENT_RANGE, StatusCode};

    let content_type =
        supported_video_content_type(&candidate.path).ok_or(StatusCode::UNSUPPORTED_MEDIA_TYPE)?;
    let mut file = std::fs::File::open(&candidate.path).map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file.metadata().map_err(|_| StatusCode::NOT_FOUND)?.len();
    if size == 0 || size != candidate.size_bytes {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let (start, requested_end) = match range.filter(|value| !value.trim().is_empty()) {
        Some(header) => crate::media::parse_range(Some(header), size)
            .ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?,
        None => (0, size.saturating_sub(1)),
    };
    let end = requested_end.min(start.saturating_add(MAX_VIDEO_RANGE_BYTES - 1));
    if end < start {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let length = end - start + 1;
    let buffer_length = usize::try_from(length).map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
    if length > MAX_VIDEO_RANGE_BYTES {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let mut body = vec![0; buffer_length];
    file.seek(SeekFrom::Start(start))
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    file.read_exact(&mut body)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    tauri::http::Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes")
        .header(CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
        .header("Content-Length", body.len())
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_video_candidates_are_limited_to_supported_browsable_types() {
        assert_eq!(
            supported_video_content_type(Path::new("clip.MP4")),
            Some("video/mp4")
        );
        assert_eq!(
            supported_video_content_type(Path::new("clip.webm")),
            Some("video/webm")
        );
        assert_eq!(supported_video_content_type(Path::new("clip.mkv")), None);
        assert_eq!(supported_video_content_type(Path::new("clip.mp3")), None);
    }

    #[test]
    fn local_video_matching_prefers_shared_title_and_skips_unrelated_files() {
        let context = crate::library::LocalVideoTrackContext {
            track_id: "local-track".into(),
            title: "夜航".into(),
            artist: "林桥".into(),
            audio_path: PathBuf::from("C:/Music/夜航.mp3"),
            authorized_root: PathBuf::from("C:/Music"),
        };
        let (score, reasons) = score_candidate(
            &context,
            Path::new("C:/Music/MV/林桥 - 夜航 (Official MV).mp4"),
        )
        .unwrap();
        assert!(score >= 0.82);
        assert!(reasons
            .iter()
            .any(|reason| reason == "位于 MV/video 子目录"));
        assert!(score_candidate(&context, Path::new("C:/Music/MV/另一首歌.webm")).is_none());
    }

    #[test]
    fn local_video_registry_expires_ids_and_stays_within_its_capacity() {
        let now = Instant::now();
        let mut registry = LocalVideoRegistry::default();
        registry.entries.insert(
            "expired".into(),
            CandidateEntry {
                track_id: "track".into(),
                path: PathBuf::from("expired.mp4"),
                size_bytes: 1,
                expires_at: now - Duration::from_secs(1),
            },
        );
        assert!(registry.candidate("expired").is_none());

        for index in 0..MAX_SESSION_CANDIDATES {
            registry.entries.insert(
                format!("candidate-{index}"),
                CandidateEntry {
                    track_id: "track".into(),
                    path: PathBuf::from(format!("{index}.mp4")),
                    size_bytes: 1,
                    expires_at: now + Duration::from_secs(index as u64 + 1),
                },
            );
        }
        registry.make_room();
        registry.entries.insert(
            "new-candidate".into(),
            CandidateEntry {
                track_id: "track".into(),
                path: PathBuf::from("new.mp4"),
                size_bytes: 1,
                expires_at: now + CANDIDATE_TTL,
            },
        );

        assert_eq!(registry.entries.len(), MAX_SESSION_CANDIDATES);
        assert!(!registry.entries.contains_key("candidate-0"));
    }

    #[test]
    fn local_video_media_is_range_limited_and_reports_mime_and_content_range() {
        let path = std::env::temp_dir().join(format!(
            "ome-local-video-{}-{}.mp4",
            std::process::id(),
            random::<u64>()
        ));
        let bytes = vec![0x42; (MAX_VIDEO_RANGE_BYTES + 128) as usize];
        std::fs::write(&path, &bytes).unwrap();
        let candidate = CandidateEntry {
            track_id: "track".into(),
            path: path.clone(),
            size_bytes: bytes.len() as u64,
            expires_at: Instant::now() + CANDIDATE_TTL,
        };

        let response = serve_local_video_chunk(&candidate, Some("bytes=64-")).unwrap();
        assert_eq!(response.status(), tauri::http::StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().len() as u64, MAX_VIDEO_RANGE_BYTES);
        assert_eq!(response.headers().get("content-type").unwrap(), "video/mp4");
        assert_eq!(
            response
                .headers()
                .get("content-range")
                .unwrap()
                .to_str()
                .unwrap(),
            format!(
                "bytes 64-{}/{}",
                64 + MAX_VIDEO_RANGE_BYTES - 1,
                bytes.len()
            )
        );

        let _ = std::fs::remove_file(path);
    }
}
