import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  NeteaseSong,
  Track,
  TrackMetadataCandidate,
  TrackMetadataProvider,
  TrackMetadataSources,
} from "../types/music";

export const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  const internals = (window as Window & {
    __TAURI_INTERNALS__?: { invoke?: unknown };
  }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === "function";
};

function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("此功能需要在 Ome Music 桌面应用中使用。"));
  }
  return tauriInvoke<T>(command, args);
}

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
  skipped: number;
  scanErrors: number;
}

export interface DataBackupPreview {
  backupId: string;
  folderName: string;
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  trackCount: number;
  playlistCount: number;
  databaseBytes: number;
  hasQueueSession: boolean;
  preferencesJson: string;
  queueSessionJson: string | null;
}

export interface DataBackupResult {
  folderName: string;
  trackCount: number;
  playlistCount: number;
  hasQueueSession: boolean;
}

export interface DataRestoreResult {
  preferencesJson: string;
  queueSessionJson: string | null;
  restoredTracks: number;
  restoredPlaylists: number;
}

export interface LibraryMoveCandidate {
  missingTrackId: string;
  candidateTrackId: string;
  title: string;
  artist: string;
  album: string;
  missingPath: string;
  candidatePath: string;
  durationSeconds: number;
  candidateDurationSeconds: number;
  reasons: string[];
  confidence: "low" | "high";
  ambiguous: boolean;
}

export interface QuickIdentityBackfillResult {
  examinedCount: number;
  updatedCount: number;
  skippedCount: number;
  remainingCount: number;
  nextCursor: string | null;
}

export type LyricsProvider = "netease" | "amll" | "lrclib" | "qqmusic" | "kugou" | "kuwo";

export interface LyricsProviderCandidate {
  source: Exclude<LyricsProvider, "netease">;
  id: string;
  name: string;
  artists: string;
  album: string;
  durationMs: number | null;
}

export interface LyricsProviderRaw {
  lrc: string;
  yrc?: string | null;
  plainLyrics?: string | null;
  ttml?: string | null;
  qrc?: string | null;
  tlyric?: string | null;
  rlyric?: string | null;
}

export type LyricsBackfillMode = "quick" | "complete";

export interface LyricsBackfillJob {
  id: string;
  mode: LyricsBackfillMode;
  threshold: number;
  status: "running" | "paused" | "cancelled" | "completed";
  total: number;
  processed: number;
  matched: number;
  noMatch: number;
  skipped: number;
  failed: number;
  currentTrackTitle: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LyricsBackfillTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
}

export interface AutoBackfillLyricsInput extends SaveTrackLyricsInput {
  score: number;
}

export interface SavedTrackLyrics {
  trackId: string;
  provider: LyricsProvider;
  providerId: string;
  title: string;
  artist: string;
  album: string | null;
  rawLyrics: LyricsProviderRaw;
  savedAt: string;
}

export interface SaveTrackLyricsInput {
  provider: LyricsProvider;
  providerId: string;
  title: string;
  artist: string;
  album: string | null;
  rawLyrics: LyricsProviderRaw;
}

export interface AuthorizedMusicDirectory {
  id: number;
  path: string;
  available: boolean;
  trackCount: number;
}

export interface LibraryDirectoryDiagnostics {
  path: string;
  available: boolean;
  indexedTrackCount: number;
}

export interface LibraryScanSummary {
  completedAt: string;
  added: number;
  updated: number;
  total: number;
  skipped: number;
  scanErrors: number;
}

export interface LibraryDiagnostics {
  checkedAt: string;
  totalIndexedTrackCount: number;
  localTrackCount: number;
  otherSourceTrackCount: number;
  excludedTrackCount: number;
  quickIdentityPendingTrackCount: number;
  accessibleTrackCount: number;
  unavailableTrackCount: number;
  offlineDirectoryTrackCount: number;
  outsideDirectoryTrackCount: number;
  artistCount: number;
  albumCount: number;
  playlistCount: number;
  playbackEventCount: number;
  integrityCheck: string;
  directories: LibraryDirectoryDiagnostics[];
  databasePath: string;
  databaseSizeBytes: number | null;
  coversPath: string;
  coversAvailable: boolean;
  coversFileCount: number;
  coversSizeBytes: number | null;
  lastScan: LibraryScanSummary | null;
}

export interface TrackMetadataUpdate {
  title: string;
  artist: string;
  album: string;
  metadataSources: TrackMetadataSources;
}

export interface TrackAudioTagBackupStatus {
  available: boolean;
  sizeBytes: number | null;
}

export interface AlbumAudioTags {
  album: string;
  albumArtist: string;
  year: string | null;
  genre: string;
}

export interface TrackAudioTags {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string | null;
  genre: string;
  trackNumber: number | null;
  trackTotal: number | null;
  discNumber: number | null;
  discTotal: number | null;
  bpm: string | null;
  comment: string;
  commentTruncated: boolean;
}

export interface TrackAudioTagUpdates {
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  year: string | null;
  genre: string | null;
  trackNumber: string | null;
  discNumber: string | null;
  bpm: string | null;
  comment: string | null;
  syncLibraryMetadata: boolean;
}

export interface TrackMetadataRestoreResult {
  track: Track;
  source: "snapshot" | "fileTags";
}

export interface CatalogEntityRenameResult {
  id: string;
  previousName: string;
  name: string;
  tracks: Track[];
}

export interface CatalogEntitySplitResult {
  id: string;
  sourceName: string;
  name: string;
  tracks: Track[];
}

export interface CatalogAlbumMergePreview {
  sourceName: string;
  targetName: string;
  trackCount: number;
}

export interface CatalogEntityMergePreview {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  sourceTrackCount: number;
  targetTrackCount: number;
  consolidatedAlbums: CatalogAlbumMergePreview[];
}

export interface CatalogAlbumSplitPreview {
  name: string;
  trackCount: number;
}

export interface CatalogEntitySplitPreview {
  sourceId: string;
  sourceName: string;
  newName: string;
  selectedTrackCount: number;
  remainingTrackCount: number;
  reparentedAlbums: CatalogAlbumSplitPreview[];
  duplicatedAlbums: CatalogAlbumSplitPreview[];
}

export interface LibraryImportProgress {
  phase: "selecting" | "discovering" | "reading" | "complete";
  examinedEntries: number;
  discoveredFiles: number;
  processedFiles: number;
  totalFiles: number | null;
  added: number;
  updated: number;
  skipped: number;
  scanErrors: number;
}

export interface NeteaseStatus {
  loggedIn: boolean;
  nickname?: string;
}

export interface NeteaseQrKey {
  key: string;
  /** 完整 <svg>…</svg> 字符串（含 XML 声明），前端 innerHTML 渲染 */
  qrSvg: string;
}

/** 801 等待 / 802 已扫 / 803 成功 / 800 过期 */
export interface NeteaseQrCheck {
  code: number;
  nickname?: string;
}

/** 封面与音频走同一 ome-media 代理（Task 6 handler 已支持 png/jpg），零新协议 */
const PROXYABLE_COVER_SUFFIXES = ["126.net", "hdslb.com", "bilivideo.com", "bilivideo.cn", "akamaized.net"];
const METADATA_COVER_SUFFIXES = ["126.net", "gtimg.cn", "kugou.com"];

export function metadataCandidateCoverPreviewUrl(path?: string | null): string | null {
  if (!path || !isTauriRuntime()) return null;
  try {
    const url = new URL(path);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || !METADATA_COVER_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    ) return null;
    url.hash = "";
    return `http://ome-media.localhost/remote-cover?p=${encodeURIComponent(url.toString())}`;
  } catch {
    return null;
  }
}

export function coverUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    // 远程封面经媒体代理中转：绕防盗链 + 补 CORS，供唱片取色 canvas 采样
    if (isTauriRuntime()) {
      try {
        // 网易云 picUrl 常是 http 直链：代理只收 https，先升级
        const upgraded = path.replace(/^http:\/\//i, "https://");
        const host = new URL(upgraded).hostname.toLowerCase();
        if (PROXYABLE_COVER_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
          return `http://ome-media.localhost/remote?p=${encodeURIComponent(upgraded)}`;
        }
      } catch {
        /* URL 解析失败按原样返回 */
      }
    }
    return path;
  }
  if (!isTauriRuntime()) return path;
  return `http://ome-media.localhost/local?p=${encodeURIComponent(path)}`;
}

export function subsonicCoverUrl(coverArtId?: string | null): string | null {
  if (!coverArtId || coverArtId.length > 256 || /[\u0000-\u001f\u007f]/.test(coverArtId)) return null;
  if (!isTauriRuntime()) return null;
  return `http://ome-media.localhost/subsonic-cover?id=${encodeURIComponent(coverArtId)}`;
}

export const getAppVersion = () => invoke<string>("get_app_version");
export const exportDataBackup = (preferencesJson: string, queueSessionJson: string | null) =>
  invoke<DataBackupResult>("export_data_backup_command", { preferencesJson, queueSessionJson });
export const inspectDataBackup = () => invoke<DataBackupPreview>("inspect_data_backup_command");
export const restoreDataBackup = (
  backupId: string,
  expectedPreferencesJson: string,
  expectedQueueSessionJson: string | null,
  currentPreferencesJson: string,
  currentQueueSessionJson: string | null,
) => invoke<DataRestoreResult>("restore_data_backup_command", {
  backupId,
  expectedPreferencesJson,
  expectedQueueSessionJson,
  currentPreferencesJson,
  currentQueueSessionJson,
});
export const hasLastRestorePoint = () => invoke<boolean>("has_last_restore_point_command");
export const restoreLastImport = () => invoke<DataRestoreResult>("restore_last_import_command");
export const listTracks = () => invoke<Track[]>("list_tracks");
export const listIgnoredTracks = () => invoke<Track[]>("list_ignored_tracks");
export const importMusicFolder = () => invoke<ImportResult>("import_music_folder");
export const rescanMusicFolders = () => invoke<ImportResult>("rescan_music_folders");
export const listAuthorizedMusicDirectories = () =>
  invoke<AuthorizedMusicDirectory[]>("list_authorized_music_directories_command");
export const getLibraryDiagnostics = () =>
  invoke<LibraryDiagnostics>("library_diagnostics_command");
export const listUnavailableLocalTracks = () =>
  invoke<Track[]>("list_unavailable_local_tracks_command");
export const listLibraryMoveCandidates = () =>
  invoke<LibraryMoveCandidate[]>("list_library_move_candidates_command");
export const backfillQuickIdentity = (afterTrackId: string | null) =>
  invoke<QuickIdentityBackfillResult>("backfill_quick_identity_command", { afterTrackId });
export const repairLocalTrackPath = (id: string) =>
  invoke<Track | null>("repair_local_track_path_command", { id });
export const rescanMusicDirectory = (directoryId: number) =>
  invoke<ImportResult>("rescan_music_directory", { directoryId });
export const revokeMusicDirectoryAuthorization = (directoryId: number) =>
  invoke<void>("revoke_music_directory_authorization", { directoryId });
export const setTrackLiked = (id: string, liked: boolean) =>
  invoke<void>("set_track_liked_command", { id, liked });
export const updateTrackMetadata = (id: string, payload: TrackMetadataUpdate) =>
  invoke<Track>("update_track_metadata_command", { id, ...payload });
export const trackAudioTagBackupStatus = (id: string) =>
  invoke<TrackAudioTagBackupStatus>("track_audio_tag_backup_status_command", { id });
export const readTrackAlbumAudioTags = (id: string) =>
  invoke<AlbumAudioTags>("read_track_album_audio_tags_command", { id });
export const readTrackAudioTags = (id: string) =>
  invoke<TrackAudioTags>("read_track_audio_tags_command", { id });
export const writeTrackAudioTagUpdates = (id: string, updates: TrackAudioTagUpdates) =>
  invoke<Track>("write_track_audio_tags_command", {
    id,
    payload: {
      ...updates,
      lyrics: null,
      cover: null,
      syncLibraryAlbum: false,
    },
  });
export const writeTrackAudioTags = (id: string, title: string, artist: string, album: string) =>
  invoke<Track>("write_track_audio_tags_command", {
    id,
    payload: { title, artist, album, lyrics: null },
  });
export const writeTrackAlbumAudioTags = (
  id: string,
  album: string,
  albumArtist: string,
  year: string,
  genre: string,
  syncLibraryAlbum = false,
) => invoke<Track>("write_track_audio_tags_command", {
  id,
  payload: {
    title: null,
    artist: null,
    album,
    lyrics: null,
    albumArtist,
    year,
    genre,
    syncLibraryAlbum,
  },
});
export const writeTrackEmbeddedLyrics = (id: string, lyrics: string) =>
  invoke<Track>("write_track_audio_tags_command", {
    id,
    payload: { title: null, artist: null, album: null, lyrics },
  });
export const writeTrackCoverArt = (
  id: string,
  imageBase64: string,
  mimeType: "image/png" | "image/jpeg",
) => invoke<Track>("write_track_audio_tags_command", {
  id,
  payload: {
    title: null,
    artist: null,
    album: null,
    lyrics: null,
    cover: { imageBase64, mimeType },
  },
});
export const restoreTrackAudioTagBackup = (id: string) =>
  invoke<Track>("restore_track_audio_tag_backup_command", { id });
export const clearTrackAudioTagBackup = (id: string) =>
  invoke<void>("clear_track_audio_tag_backup_command", { id });
export const trackMetadataCandidates = (
  source: TrackMetadataProvider,
  keywords: string,
  limit?: number,
) => invoke<TrackMetadataCandidate[]>("track_metadata_candidates", { source, keywords, limit });
export const restoreTrackMetadata = (id: string) =>
  invoke<TrackMetadataRestoreResult>("restore_track_metadata_command", { id });
export const renameLibraryArtist = (id: string, name: string) =>
  invoke<CatalogEntityRenameResult>("rename_library_artist_command", { id, name });
export const renameLibraryAlbum = (id: string, name: string) =>
  invoke<CatalogEntityRenameResult>("rename_library_album_command", { id, name });
export const openLibraryAlbumFolder = (albumId: string) =>
  invoke<void>("open_library_album_folder_command", { albumId });
export const previewLibraryArtistMerge = (sourceId: string, targetId: string) =>
  invoke<CatalogEntityMergePreview>("preview_library_artist_merge_command", { sourceId, targetId });
export const mergeLibraryArtist = (sourceId: string, targetId: string) =>
  invoke<CatalogEntityRenameResult>("merge_library_artist_command", { sourceId, targetId });
export const previewLibraryAlbumMerge = (sourceId: string, targetId: string) =>
  invoke<CatalogEntityMergePreview>("preview_library_album_merge_command", { sourceId, targetId });
export const mergeLibraryAlbum = (sourceId: string, targetId: string) =>
  invoke<CatalogEntityRenameResult>("merge_library_album_command", { sourceId, targetId });
export const previewLibraryArtistSplit = (sourceId: string, newName: string, selectedTrackIds: string[]) =>
  invoke<CatalogEntitySplitPreview>("preview_library_artist_split_command", { sourceId, newName, selectedTrackIds });
export const splitLibraryArtist = (sourceId: string, newName: string, selectedTrackIds: string[]) =>
  invoke<CatalogEntitySplitResult>("split_library_artist_command", { sourceId, newName, selectedTrackIds });
export const previewLibraryAlbumSplit = (sourceId: string, newName: string, selectedTrackIds: string[]) =>
  invoke<CatalogEntitySplitPreview>("preview_library_album_split_command", { sourceId, newName, selectedTrackIds });
export const splitLibraryAlbum = (sourceId: string, newName: string, selectedTrackIds: string[]) =>
  invoke<CatalogEntitySplitResult>("split_library_album_command", { sourceId, newName, selectedTrackIds });
export const removeLocalTrack = (id: string) =>
  invoke<void>("remove_local_track_command", { id });
export const removeLocalTracks = (ids: string[]) =>
  invoke<void>("remove_local_tracks_command", { ids });
export const recordPlaybackEvent = (
  trackId: string,
  eventType: "play" | "skip" | "completed",
  positionSeconds: number
) => invoke<void>("record_playback_event_command", { trackId, eventType, positionSeconds });

/* ============ 网易云（Plan 2 Task 3，命令名与 src-tauri 注册一致） ============ */

export const neteaseStatus = () => invoke<NeteaseStatus>("netease_status");
export const neteaseQrKey = () => invoke<NeteaseQrKey>("netease_qr_key");
export const neteaseQrCheck = (key: string) => invoke<NeteaseQrCheck>("netease_qr_check", { key });
export const neteaseSearch = (keywords: string, limit?: number) =>
  invoke<NeteaseSong[]>("netease_search", { keywords, limit });
export const neteaseStreamUrl = (id: number) => invoke<string>("netease_stream_url", { id });
export const neteaseLyric = (id: number) =>
  invoke<{ lrc: string; yrc?: string | null; tlyric?: string | null; rlyric?: string | null }>("netease_lyric", { id });
export const lyricsProviderCandidates = (
  source: Exclude<LyricsProvider, "netease">,
  keywords: string,
  limit?: number,
) => invoke<LyricsProviderCandidate[]>("lyrics_provider_candidates", { source, keywords, limit });
export const lyricsProviderLyric = (
  source: Exclude<LyricsProvider, "netease">,
  id: string,
) => invoke<LyricsProviderRaw>("lyrics_provider_lyric", { source, id });
export const saveTrackLyricsCandidate = (id: string, input: SaveTrackLyricsInput) => {
  const { rawLyrics, ...metadata } = input;
  return invoke<SavedTrackLyrics>("save_track_lyrics_command", {
    id,
    request: { ...metadata, rawLyricsJson: JSON.stringify(rawLyrics) },
  });
};
export const getSavedTrackLyrics = (id: string) =>
  invoke<SavedTrackLyrics | null>("get_saved_track_lyrics_command", { id });
export const deleteSavedTrackLyrics = (id: string) =>
  invoke<boolean>("delete_saved_track_lyrics_command", { id });
export const getAutoBackfilledTrackLyrics = (id: string) =>
  invoke<SavedTrackLyrics | null>("get_auto_backfilled_track_lyrics_command", { id });
export const startLyricsBackfill = (mode: LyricsBackfillMode, threshold: number) =>
  invoke<LyricsBackfillJob>("start_lyrics_backfill_command", { mode, threshold });
export const getCurrentLyricsBackfill = () =>
  invoke<LyricsBackfillJob | null>("get_current_lyrics_backfill_command");
export const resumeLyricsBackfill = (id: string) =>
  invoke<LyricsBackfillJob>("resume_lyrics_backfill_command", { id });
export const nextLyricsBackfillTrack = (id: string) =>
  invoke<LyricsBackfillTrack | null>("next_lyrics_backfill_track_command", { id });
export const completeLyricsBackfillTrack = (
  jobId: string,
  trackId: string,
  result: "no_match" | "skipped" | "failed",
  message?: string,
) => invoke<LyricsBackfillJob>("complete_lyrics_backfill_track_command", {
  jobId,
  trackId,
  result,
  provider: null,
  score: null,
  message: message ?? null,
});
export const saveAutoBackfilledTrackLyrics = (
  jobId: string,
  trackId: string,
  input: AutoBackfillLyricsInput,
) => {
  const { rawLyrics, score, ...metadata } = input;
  return invoke<LyricsBackfillJob>("save_auto_backfilled_track_lyrics_command", {
    jobId,
    trackId,
    request: { ...metadata, rawLyricsJson: JSON.stringify(rawLyrics), score },
  });
};
export const pauseLyricsBackfill = (id: string, note: string) =>
  invoke<LyricsBackfillJob>("pause_lyrics_backfill_command", { id, note });
export const cancelLyricsBackfill = (id: string) =>
  invoke<LyricsBackfillJob>("cancel_lyrics_backfill_command", { id });
export const neteaseLike = (id: number, like: boolean) =>
  invoke<void>("netease_like", { id, like });
export const neteaseLogout = () => invoke<void>("netease_logout");

/* ============ 私人远程曲库：Navidrome / Subsonic（凭据仅保留在本次运行内） ============ */

export interface SubsonicStatus {
  connected: boolean;
  serverLabel: string | null;
}

export interface SubsonicSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  songCount: number;
}

export interface SubsonicPlaylistPage {
  playlists: SubsonicPlaylist[];
  totalCount: number;
  truncated: boolean;
}

export interface SubsonicPlaylistTracks {
  playlistId: string;
  name: string;
  totalSongs: number;
  tracks: SubsonicSong[];
  truncated: boolean;
}

export interface SubsonicAlbum {
  id: string;
  name: string;
  artist: string;
  year: number | null;
  songCount: number;
  coverArtId: string | null;
}

export interface SubsonicAlbumPage {
  albums: SubsonicAlbum[];
  offset: number;
  hasMore: boolean;
}

export interface SubsonicAlbumTracks {
  album: SubsonicAlbum;
  tracks: SubsonicSong[];
  truncated: boolean;
}

export interface SubsonicLyrics {
  lrc: string;
  yrc: string | null;
  tlyric: string | null;
  rlyric: string | null;
  plainLyrics: string | null;
}

export const subsonicConnect = (serverUrl: string, username: string, password: string) =>
  invoke<SubsonicStatus>("subsonic_connect", { serverUrl, username, password });
export const subsonicStatus = () => invoke<SubsonicStatus>("subsonic_status");
export const subsonicDisconnect = () => invoke<void>("subsonic_disconnect");
export const subsonicSearch = (keywords: string, limit = 20) =>
  invoke<SubsonicSong[]>("subsonic_search", { keywords, limit });
export const subsonicPlaylists = () => invoke<SubsonicPlaylistPage>("subsonic_playlists");
export const subsonicPlaylistTracks = (playlistId: string) =>
  invoke<SubsonicPlaylistTracks>("subsonic_playlist_tracks", { playlistId });
export const subsonicAlbums = (offset = 0) =>
  invoke<SubsonicAlbumPage>("subsonic_albums", { offset });
export const subsonicAlbumTracks = (albumId: string) =>
  invoke<SubsonicAlbumTracks>("subsonic_album_tracks", { albumId });
export const subsonicLyrics = (songId: string) =>
  invoke<SubsonicLyrics | null>("subsonic_lyrics", { songId });

/* ============ Jellyfin 远程曲库：账号令牌仅留在 Rust 本次运行内存 ============ */

export interface JellyfinStatus {
  connected: boolean;
  serverLabel: string | null;
}

export interface JellyfinSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverId: string | null;
}

export interface MediaServerAlbum {
  id: string;
  name: string;
  artist: string;
  year: number | null;
  songCount: number;
  coverId: string | null;
}

export interface MediaServerAlbumPage {
  albums: MediaServerAlbum[];
  offset: number;
  nextOffset: number;
  totalCount: number;
  hasMore: boolean;
}

export interface MediaServerPlaylist {
  id: string;
  name: string;
  songCount: number;
}

export interface MediaServerPlaylistPage {
  playlists: MediaServerPlaylist[];
  totalCount: number;
  truncated: boolean;
}

export interface MediaServerTracksPage {
  tracks: JellyfinSong[];
  totalCount: number;
  truncated: boolean;
}

export type EmbyAlbum = MediaServerAlbum;
export type EmbyAlbumPage = MediaServerAlbumPage;
export type EmbyPlaylist = MediaServerPlaylist;
export type EmbyPlaylistPage = MediaServerPlaylistPage;
export type EmbyTracksPage = MediaServerTracksPage;

export interface JellyfinLyrics {
  lrc: string;
  yrc: string | null;
  plainLyrics: string | null;
}

export type EmbyStatus = JellyfinStatus;
export type EmbySong = JellyfinSong;

export const jellyfinConnect = (serverUrl: string, username: string, password: string) =>
  invoke<JellyfinStatus>("jellyfin_connect", { serverUrl, username, password });
export const jellyfinStatus = () => invoke<JellyfinStatus>("jellyfin_status");
export const jellyfinDisconnect = () => invoke<void>("jellyfin_disconnect");
export const jellyfinSearch = (keywords: string, limit = 20) =>
  invoke<JellyfinSong[]>("jellyfin_search", { keywords, limit });
export const jellyfinAlbums = (offset = 0) =>
  invoke<MediaServerAlbumPage>("jellyfin_albums", { offset });
export const jellyfinAlbumTracks = (albumId: string) =>
  invoke<MediaServerTracksPage>("jellyfin_album_tracks", { albumId });
export const jellyfinPlaylists = () =>
  invoke<MediaServerPlaylistPage>("jellyfin_playlists");
export const jellyfinPlaylistTracks = (playlistId: string) =>
  invoke<MediaServerTracksPage>("jellyfin_playlist_tracks", { playlistId });
export const jellyfinLyrics = (itemId: string) =>
  invoke<JellyfinLyrics | null>("jellyfin_lyrics", { itemId });

export function jellyfinCoverUrl(itemId?: string | null): string | null {
  if (!itemId || !isTauriRuntime()) return null;
  return `http://ome-media.localhost/jellyfin-cover?id=${encodeURIComponent(itemId)}`;
}

export const embyConnect = (serverUrl: string, username: string, password: string) =>
  invoke<EmbyStatus>("emby_connect", { serverUrl, username, password });
export const embyStatus = () => invoke<EmbyStatus>("emby_status");
export const embyDisconnect = () => invoke<void>("emby_disconnect");
export const embySearch = (keywords: string, limit = 20) =>
  invoke<EmbySong[]>("emby_search", { keywords, limit });
export const embyAlbums = (offset = 0) =>
  invoke<EmbyAlbumPage>("emby_albums", { offset });
export const embyAlbumTracks = (albumId: string) =>
  invoke<EmbyTracksPage>("emby_album_tracks", { albumId });
export const embyPlaylists = () =>
  invoke<EmbyPlaylistPage>("emby_playlists");
export const embyPlaylistTracks = (playlistId: string) =>
  invoke<EmbyTracksPage>("emby_playlist_tracks", { playlistId });

export function embyCoverUrl(itemId?: string | null): string | null {
  if (!itemId || !isTauriRuntime()) return null;
  return `http://ome-media.localhost/emby-cover?id=${encodeURIComponent(itemId)}`;
}

/* ============ WebDAV 只读曲库：凭据与服务器路径仅保存在 Rust 本次运行内存 ============ */

export interface WebDavStatus {
  connected: boolean;
  serverLabel: string | null;
}

export interface WebDavBreadcrumb {
  id: string;
  name: string;
}

export interface WebDavEntry {
  id: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number | null;
  lastModified: string | null;
}

export interface WebDavDirectory {
  breadcrumbs: WebDavBreadcrumb[];
  entries: WebDavEntry[];
}

export const webdavConnect = (serverUrl: string, username?: string, password?: string) =>
  invoke<WebDavStatus>("webdav_connect", {
    serverUrl,
    username: username?.trim() || null,
    password: password || null,
  });
export const webdavStatus = () => invoke<WebDavStatus>("webdav_status");
export const webdavDisconnect = () => invoke<void>("webdav_disconnect");
export const webdavListDirectory = (directoryId?: string | null) =>
  invoke<WebDavDirectory>("webdav_list_directory", { directoryId: directoryId ?? null });

/* ============ SMB 只读曲库：共享地址与凭据仅保存在 Rust 本次运行内存 ============ */

export interface SmbStatus {
  connected: boolean;
  serverLabel: string | null;
  rootId: string | null;
}

export interface SmbBreadcrumb {
  id: string;
  name: string;
}

export interface SmbEntry {
  id: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number | null;
}

export interface SmbDirectory {
  breadcrumbs: SmbBreadcrumb[];
  entries: SmbEntry[];
}

export const smbConnect = (host: string, share: string, subPath: string | undefined, username: string, password: string) =>
  invoke<SmbStatus>("smb_connect", { host, share, subPath: subPath || null, username, password });
export const smbStatus = () => invoke<SmbStatus>("smb_status");
export const smbDisconnect = () => invoke<void>("smb_disconnect");
export const smbListDirectory = (directoryId?: string | null) =>
  invoke<SmbDirectory>("smb_list_directory", { directoryId: directoryId ?? null });

/* ============ B站（Plan 4 Task 2，命令名与 src-tauri/src/bilibili.rs 注册一致） ============ */

/** B站搜索结果 DTO（后端 serde camelCase）；id 形如 `bilibili-{bvid}[_page]` */
export interface BilibiliSongDto {
  id: string;
  bvid: string;
  name: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverUrl: string | null;
  plain: boolean;
}

/** 取流结果：url 为 B站 CDN 真实直链，有 Referer 防盗链，须经媒体代理播放 */
export interface BilibiliStream {
  url: string;
  referer: string;
  qualityLabel: string;
}

export type BilibiliMvQuality = 16 | 32 | 64;

export interface LocalMusicVideoCandidate {
  id: string;
  title: string;
  sizeBytes: number;
  reasons: string[];
}

export const listLocalMusicVideoCandidates = (trackId: string) =>
  invoke<LocalMusicVideoCandidate[]>("list_local_music_video_candidates", { trackId });

/** The path is resolved only by Rust from a short-lived candidate ID. */
export const localMusicVideoSrc = (candidateId: string) =>
  `http://ome-media.localhost/local-video?id=${encodeURIComponent(candidateId)}`;

/** 弹幕条目；color 为 0xRRGGBB 整数 */
export interface DanmakuItemDto {
  time: number;
  text: string;
  color: number;
}

export const bilibiliSearch = (keywords: string, limit?: number) =>
  invoke<BilibiliSongDto[]>("bilibili_search", { keywords, limit });
export const bilibiliStreamUrl = (id: string, quality?: BilibiliMvQuality) =>
  invoke<BilibiliStream>("bilibili_stream_url", quality === undefined ? { id } : { id, quality });
export const bilibiliDanmaku = (id: string) => invoke<DanmakuItemDto[]>("bilibili_danmaku", { id });

/** B站音频一律经 ome-media `/remote` 代理中转（后端代带 Referer，绕过防盗链） */
export function bilibiliProxySrc(url: string, referer: string): string {
  return `http://ome-media.localhost/remote?p=${encodeURIComponent(url)}&r=${referer}`;
}

/* ============ 私人 DJ（后端命令已提交于 src-tauri/src/dj.rs，serde camelCase） ============ */

export interface DjAction {
  type: "play" | "queue" | "search_and_play" | "mood" | "none";
  query?: string | null;
  mood?: string | null;
}

export interface DjReply {
  say: string;
  actions: DjAction[];
}

export interface DjConfigState {
  configured: boolean;
  providerName: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
}

export interface DjSaveConfigPayload {
  providerName: string;
  baseUrl: string;
  model: string;
  /** 空字符串 = 保持旧密钥不变 */
  apiKey: string;
}

export interface DjMemoryFact {
  id: string;
  kind: string;
  content: string;
  weight: number;
  updatedAt: string;
}

export const djGetConfig = () => invoke<DjConfigState>("dj_config");
export const djSaveConfig = (payload: DjSaveConfigPayload) =>
  invoke<DjConfigState>("dj_save_config", { payload });
export const djChat = (text: string) => invoke<DjReply>("dj_chat", { text });
export const djGreeting = () => invoke<{ say: string }>("dj_greeting");
export const djIntro = (trackId: string, event?: "skip" | "ended" | "boot" | "resume", mood?: string) =>
  invoke<{ say: string }>("dj_intro", { trackId, event, mood });
export const djMemoryList = () => invoke<DjMemoryFact[]>("dj_memory_list");
export const djMemoryDelete = (id: string) => invoke<void>("dj_memory_delete", { id });

/** 时段播放画像（口味画像，无 LLM 也可用），对应 dj.rs HourPreferenceDto */
export interface GenreHourPreference {
  genre: string;
  plays: number;
  completions: number;
  skips: number;
  likes: number;
  unlikes: number;
}

export interface HourPreference {
  hour: number;
  plays: number;
  completions: number;
  skips: number;
  genrePreferences: GenreHourPreference[];
}
export const profileHourPreferences = () => invoke<HourPreference[]>("profile_hour_preferences");
export const playbackHistory = (limit?: number) => invoke<Track[]>("playback_history_command", { limit });
/** 历史条目：每次播放一条 + playedAt（历史页统计/筛选用），结构见 lib/history.ts */
export const playbackHistoryEntries = (limit?: number) =>
  invoke<import("./history").HistoryEntry[]>("playback_history_entries_command", { limit });

/** 本地歌词、翻译/罗马音 sidecar 与内嵌标签歌词：base64 字节由前端探测编码。 */
export interface LocalLyricPayload {
  lrc: string;
  tlyric: string | null;
  rlyric?: string | null;
  embeddedLrc?: string | null;
}
export const localLyric = (id: string) => invoke<LocalLyricPayload | null>("local_lyric", { id });

/* ============ 播放列表（001 迁移已有 playlists/playlist_tracks 表，serde camelCase） ============ */

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  createdAt: string;
}

export interface PlaylistM3uImportResult {
  playlist: Playlist | null;
  imported: number;
  skipped: number;
}

export interface PlaylistM3uExportResult {
  exported: number;
  skipped: number;
}

export const playlistList = () => invoke<Playlist[]>("playlist_list");
export const playlistCreate = (name: string) => invoke<Playlist>("playlist_create", { name });
export const playlistRename = (id: string, name: string) => invoke<void>("playlist_rename", { id, name });
export const playlistDelete = (id: string) => invoke<void>("playlist_delete", { id });
export const playlistTracks = (id: string) => invoke<Track[]>("playlist_tracks_command", { id });
export const playlistAdd = (id: string, trackIds: string[]) =>
  invoke<number>("playlist_add_command", { id, trackIds });
export const playlistRemove = (id: string, trackId: string) =>
  invoke<void>("playlist_remove_command", { id, trackId });
export const playlistImportM3u = () =>
  invoke<PlaylistM3uImportResult | null>("playlist_import_m3u");
export const playlistExportM3u = (id: string) =>
  invoke<PlaylistM3uExportResult | null>("playlist_export_m3u", { id });
