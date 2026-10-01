import { signal } from "@preact/signals";
import { listen } from "@tauri-apps/api/event";
import {
  importMusicFolder,
  isTauriRuntime,
  getLibraryDiagnostics,
  backfillQuickIdentity as backfillQuickIdentityCommand,
  listIgnoredTracks,
  listAuthorizedMusicDirectories,
  listUnavailableLocalTracks,
  listLibraryMoveCandidates as listLibraryMoveCandidatesCommand,
  listTracks,
  openLibraryAlbumFolder as openLibraryAlbumFolderCommand,
  renameLibraryAlbum as renameLibraryAlbumCommand,
  renameLibraryArtist as renameLibraryArtistCommand,
  previewLibraryAlbumMerge as previewLibraryAlbumMergeCommand,
  previewLibraryArtistMerge as previewLibraryArtistMergeCommand,
  mergeLibraryAlbum as mergeLibraryAlbumCommand,
  mergeLibraryArtist as mergeLibraryArtistCommand,
  previewLibraryAlbumSplit as previewLibraryAlbumSplitCommand,
  previewLibraryArtistSplit as previewLibraryArtistSplitCommand,
  splitLibraryAlbum as splitLibraryAlbumCommand,
  splitLibraryArtist as splitLibraryArtistCommand,
  repairLocalTrackPath as repairLocalTrackPathCommand,
  restoreTrackMetadata as restoreTrackMetadataCommand,
  rescanMusicDirectory as rescanMusicDirectoryCommand,
  rescanMusicFolders,
  revokeMusicDirectoryAuthorization,
  setTrackLiked,
  removeLocalTracks as removeLocalTracksCommand,
  clearTrackAudioTagBackup as clearTrackAudioTagBackupCommand,
  restoreTrackAudioTagBackup as restoreTrackAudioTagBackupCommand,
  trackAudioTagBackupStatus as trackAudioTagBackupStatusCommand,
  readTrackAlbumAudioTags as readTrackAlbumAudioTagsCommand,
  readTrackAudioTags as readTrackAudioTagsCommand,
  updateTrackMetadata as updateTrackMetadataCommand,
  writeTrackAlbumAudioTags as writeTrackAlbumAudioTagsCommand,
  writeTrackAudioTagUpdates as writeTrackAudioTagUpdatesCommand,
  writeTrackAudioTags as writeTrackAudioTagsCommand,
  writeTrackCoverArt as writeTrackCoverArtCommand,
  writeTrackEmbeddedLyrics as writeTrackEmbeddedLyricsCommand,
  type AuthorizedMusicDirectory,
  type LibraryDiagnostics,
  type LibraryMoveCandidate,
  type QuickIdentityBackfillResult,
  type CatalogEntityRenameResult,
  type CatalogEntitySplitResult,
  type CatalogEntityMergePreview,
  type CatalogEntitySplitPreview,
  type TrackMetadataUpdate,
  type TrackAudioTagBackupStatus,
  type AlbumAudioTags,
  type TrackAudioTags,
  type TrackAudioTagUpdates,
  type ImportResult,
  type LibraryImportProgress,
} from "../lib/api";
import type { Track } from "../types/music";
import {
  forgetLastPlayback,
  playTracks,
  queue,
  readLastPlayback,
  removeTracksFromQueue,
  reloadCurrentTrackSource,
  saveLastPlayback,
} from "./player";
import { activePlaylistId, activePlaylistTracks, loadPlaylists, openPlaylist } from "./playlists";

export const tracks = signal<Track[]>([]);
export const ignoredTracks = signal<Track[]>([]);
export const importing = signal(false);
export const backgroundLibraryRescanActive = signal(false);
export const importOperation = signal<"import" | "rescan" | null>(null);
export const importProgress = signal<LibraryImportProgress | null>(null);
export const importNotice = signal<string | null>(null);
export const loadError = signal<string | null>(null);
export const libraryChangeRevision = signal(0);
export const authorizedMusicDirectories = signal<AuthorizedMusicDirectory[]>([]);
export const authorizedMusicDirectoriesLoading = signal(false);
export const authorizedMusicDirectoriesError = signal<string | null>(null);
export const libraryDiagnostics = signal<LibraryDiagnostics | null>(null);
export const libraryDiagnosticsLoading = signal(false);
export const libraryDiagnosticsError = signal<string | null>(null);
export const unavailableLocalTracks = signal<Track[]>([]);
export const unavailableLocalTracksLoading = signal(false);
export const unavailableLocalTracksError = signal<string | null>(null);
export const unavailableLocalTracksNotice = signal<string | null>(null);
export const libraryMoveCandidates = signal<LibraryMoveCandidate[]>([]);
export const libraryMoveCandidatesLoading = signal(false);
export const libraryMoveCandidatesError = signal<string | null>(null);

function isLibraryRecoveryDemo(): boolean {
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "settings-diagnostics";
}

export async function refreshLibraryDiagnostics(): Promise<void> {
  if (!isTauriRuntime()) return;
  libraryDiagnosticsLoading.value = true;
  libraryDiagnosticsError.value = null;
  try {
    libraryDiagnostics.value = await getLibraryDiagnostics();
  } catch (error) {
    libraryDiagnosticsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    libraryDiagnosticsLoading.value = false;
  }
}

export async function backfillLibraryQuickIdentity(
  afterTrackId: string | null,
): Promise<QuickIdentityBackfillResult> {
  if (isTauriRuntime()) return backfillQuickIdentityCommand(afterTrackId);
  if (isLibraryRecoveryDemo()) {
    const pending = libraryDiagnostics.value?.quickIdentityPendingTrackCount ?? 0;
    const examinedCount = Math.min(100, pending);
    const updatedCount = Math.min(5, examinedCount);
    const remainingCount = Math.max(0, pending - examinedCount);
    if (libraryDiagnostics.value) {
      libraryDiagnostics.value = {
        ...libraryDiagnostics.value,
        quickIdentityPendingTrackCount: Math.max(0, pending - updatedCount),
      };
    }
    return {
      examinedCount,
      updatedCount,
      skippedCount: examinedCount - updatedCount,
      remainingCount,
      nextCursor: remainingCount > 0 ? "demo-quick-identity-cursor" : null,
    };
  }
  throw new Error("快速摘要补建需要在 Ome 桌面版中操作");
}

export async function loadUnavailableLocalTracks(): Promise<void> {
  unavailableLocalTracksLoading.value = true;
  unavailableLocalTracksError.value = null;
  unavailableLocalTracksNotice.value = null;
  try {
    if (!isTauriRuntime()) {
      if (isLibraryRecoveryDemo()) return;
      throw new Error("失联曲目列表需要在桌面版中读取");
    }
    unavailableLocalTracks.value = await listUnavailableLocalTracks();
  } catch (error) {
    unavailableLocalTracksError.value = error instanceof Error ? error.message : String(error);
  } finally {
    unavailableLocalTracksLoading.value = false;
  }
}

export async function loadLibraryMoveCandidates(): Promise<number> {
  libraryMoveCandidatesLoading.value = true;
  libraryMoveCandidatesError.value = null;
  libraryMoveCandidates.value = [];
  try {
    if (isTauriRuntime()) {
      libraryMoveCandidates.value = await listLibraryMoveCandidatesCommand();
    } else if (isLibraryRecoveryDemo()) {
      libraryMoveCandidates.value = [
        {
          missingTrackId: "unavailable-1",
          candidateTrackId: "moved-1",
          title: "漂流",
          artist: "落日飞车",
          album: "CASSA NOVA",
          missingPath: "D:/Music/华语收藏/旧位置/漂流.flac",
          candidatePath: "D:/Music/华语收藏/新位置/漂流.flac",
          durationSeconds: 254,
          candidateDurationSeconds: 254,
          reasons: ["曲名与艺人资料一致", "专辑资料一致", "曲目时长相差 0 秒", "移动前后音频快速摘要一致"],
          confidence: "low",
          ambiguous: false,
        },
        {
          missingTrackId: "unavailable-2",
          candidateTrackId: "moved-2a",
          title: "夜港",
          artist: "白昼邮差",
          album: "潮汐录",
          missingPath: "D:/Music/华语收藏/旧位置/夜港.flac",
          candidatePath: "D:/Music/华语收藏/归档/夜港.flac",
          durationSeconds: 231,
          candidateDurationSeconds: 231,
          reasons: ["曲名与艺人资料一致", "专辑资料一致", "曲目时长相差 0 秒", "移动前后音频快速摘要一致"],
          confidence: "low",
          ambiguous: true,
        },
        {
          missingTrackId: "unavailable-2",
          candidateTrackId: "moved-2b",
          title: "夜港",
          artist: "白昼邮差",
          album: "潮汐录",
          missingPath: "D:/Music/华语收藏/旧位置/夜港.flac",
          candidatePath: "D:/Music/华语收藏/现场/夜港.flac",
          durationSeconds: 231,
          candidateDurationSeconds: 231,
          reasons: ["曲名与艺人资料一致", "专辑资料一致", "曲目时长相差 0 秒", "移动前后音频快速摘要一致"],
          confidence: "low",
          ambiguous: true,
        },
      ];
    } else {
      throw new Error("文件移动候选检查需要在 Ome 桌面版中运行");
    }
    return libraryMoveCandidates.value.length;
  } catch (error) {
    libraryMoveCandidatesError.value = error instanceof Error ? error.message : String(error);
    return 0;
  } finally {
    libraryMoveCandidatesLoading.value = false;
  }
}

export async function repairUnavailableLocalTrack(trackId: string, title?: string): Promise<boolean> {
  let updated: Track | null;
  if (isTauriRuntime()) {
    updated = await repairLocalTrackPathCommand(trackId);
  } else if (isLibraryRecoveryDemo()) {
    const candidate = unavailableLocalTracks.value.find((track) => track.id === trackId);
    updated = candidate
      ? { ...candidate, filePath: `D:/Demo Music/已恢复/${trackId}.flac` }
      : null;
  } else {
    throw new Error("曲目路径修复需要在 Ome 桌面版中操作");
  }
  if (!updated) return false;

  unavailableLocalTracksNotice.value = title
    ? `「${title}」已重新关联；曲目、歌单和播放历史都保留。`
    : "曲目已重新关联；曲目、歌单和播放历史都保留。";

  const wasInLibrary = tracks.value.some((track) => track.id === trackId);
  tracks.value = wasInLibrary
    ? tracks.value.map((track) => track.id === trackId ? updated! : track)
    : [...tracks.value, updated];
  queue.value = queue.value.map((track) => track.id === trackId ? updated! : track);
  const lastPlayback = readLastPlayback();
  if (lastPlayback?.track.id === trackId) saveLastPlayback(updated, lastPlayback.position);
  reloadCurrentTrackSource(trackId);
  const playlistId = activePlaylistId.value;
  if (playlistId) await openPlaylist(playlistId);

  unavailableLocalTracks.value = unavailableLocalTracks.value.filter((track) => track.id !== trackId);
  unavailableLocalTracksError.value = null;
  if (libraryDiagnostics.value) {
    libraryDiagnostics.value = {
      ...libraryDiagnostics.value,
      accessibleTrackCount: libraryDiagnostics.value.accessibleTrackCount + 1,
      unavailableTrackCount: Math.max(0, libraryDiagnostics.value.unavailableTrackCount - 1),
    };
  }
  libraryChangeRevision.value += 1;

  if (isTauriRuntime()) await refreshLibraryDiagnostics();
  return true;
}

export async function refreshAuthorizedMusicDirectories(): Promise<void> {
  if (!isTauriRuntime()) {
    authorizedMusicDirectories.value = [];
    authorizedMusicDirectoriesError.value = null;
    authorizedMusicDirectoriesLoading.value = false;
    return;
  }
  authorizedMusicDirectoriesLoading.value = true;
  try {
    authorizedMusicDirectories.value = await listAuthorizedMusicDirectories();
    authorizedMusicDirectoriesError.value = null;
  } catch (error) {
    authorizedMusicDirectoriesError.value = error instanceof Error ? error.message : String(error);
  } finally {
    authorizedMusicDirectoriesLoading.value = false;
  }
}

export async function refreshTracks(): Promise<void> {
  try {
    const [libraryTracks, excludedTracks] = await Promise.all([listTracks(), listIgnoredTracks()]);
    tracks.value = libraryTracks;
    ignoredTracks.value = excludedTracks;
    loadError.value = null;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  }
}

async function runLibraryOperation(
  operation: () => Promise<ImportResult>,
  kind: "import" | "rescan",
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  if (importing.value) return false;
  const quiet = options.quiet === true;
  importing.value = true;
  backgroundLibraryRescanActive.value = quiet && kind === "rescan";
  importOperation.value = kind;
  if (!quiet) importNotice.value = null;
  importProgress.value = {
    phase: kind === "import" ? "selecting" : "discovering",
    examinedEntries: 0,
    discoveredFiles: 0,
    processedFiles: 0,
    totalFiles: null,
    added: 0,
    updated: 0,
    skipped: 0,
    scanErrors: 0,
  };
  let unlisten: (() => void) | undefined;
  let completed = false;
  try {
    if (isTauriRuntime()) {
      try {
        unlisten = await listen<LibraryImportProgress>("library-import-progress", (event) => {
          importProgress.value = event.payload;
        });
      } catch {
        // Progress reporting is optional; the import command still returns its final summary.
        importProgress.value = null;
      }
    }
    const result = await operation();
    const scanErrors = result.scanErrors > 0 ? `，${result.scanErrors} 处目录读取失败` : "";
    const summary = `新增 ${result.added} 首，更新 ${result.updated} 首，共 ${result.total} 首，跳过 ${result.skipped} 首${scanErrors}`;
    if (!quiet) importNotice.value = kind === "rescan" ? `重扫完成，${summary}` : summary;
    await refreshTracks();
    completed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!quiet) importNotice.value = message.includes("未选择文件夹") ? null : message;
  } finally {
    unlisten?.();
    importProgress.value = null;
    importing.value = false;
    backgroundLibraryRescanActive.value = false;
    importOperation.value = null;
  }
  return completed;
}

export async function importFolder(): Promise<void> {
  await runLibraryOperation(importMusicFolder, "import");
  await refreshAuthorizedMusicDirectories();
}

export async function rescanLibrary(options: { quiet?: boolean } = {}): Promise<boolean> {
  const completed = await runLibraryOperation(rescanMusicFolders, "rescan", options);
  await refreshAuthorizedMusicDirectories();
  return completed;
}

export async function rescanAuthorizedMusicDirectory(
  directoryId: number,
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  const completed = await runLibraryOperation(
    () => rescanMusicDirectoryCommand(directoryId),
    "rescan",
    options,
  );
  await refreshAuthorizedMusicDirectories();
  return completed;
}

export async function revokeAuthorizedMusicDirectory(directoryId: number): Promise<void> {
  await revokeMusicDirectoryAuthorization(directoryId);
  authorizedMusicDirectories.value = authorizedMusicDirectories.value.filter(
    (directory) => directory.id !== directoryId,
  );
}

export function playFromLibrary(index: number): void {
  playTracks(tracks.value, index);
}

export async function toggleLiked(track: Track): Promise<void> {
  const nextLiked = !track.liked;
  tracks.value = tracks.value.map((item) =>
    item.id === track.id ? { ...item, liked: nextLiked } : item
  );
  try {
    await setTrackLiked(track.id, nextLiked);
  } catch {
    tracks.value = tracks.value.map((item) =>
      item.id === track.id ? { ...item, liked: track.liked } : item
    );
  }
}

export async function updateLibraryTrackMetadata(
  trackId: string,
  payload: TrackMetadataUpdate,
): Promise<Track> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能修正曲库中的本地曲目");

  const updated = isTauriRuntime()
    ? await updateTrackMetadataCommand(trackId, payload)
    : { ...existing, ...payload, hasMetadataOverride: true, metadataSnapshotAvailable: true };

  storeUpdatedLocalTrack(updated);
  return updated;
}

export async function getLibraryTrackAudioTagBackupStatus(trackId: string): Promise<TrackAudioTagBackupStatus> {
  if (!isTauriRuntime()) return { available: false, sizeBytes: 0 };
  return trackAudioTagBackupStatusCommand(trackId);
}

export async function writeLibraryTrackAudioTags(
  trackId: string,
  title: string,
  artist: string,
  album: string,
): Promise<Track> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能写入曲库中的本地曲目");
  if (!isTauriRuntime()) throw new Error("音频标签写入需在 Ome 桌面版中进行");
  const updated = await writeTrackAudioTagsCommand(trackId, title, artist, album);
  storeUpdatedLocalTrack(updated);
  return updated;
}

export async function writeLibraryTrackEmbeddedLyrics(trackId: string, lyrics: string): Promise<void> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能向曲库中的本地曲目写入歌词");
  if (!isTauriRuntime()) throw new Error("内嵌歌词写入需在 Ome 桌面版中进行");
  await writeTrackEmbeddedLyricsCommand(trackId, lyrics);
}

export async function revealLibraryAlbumFolder(albumId: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("打开专辑文件夹需在 Ome 桌面版中进行");
  const hasLocalTrack = tracks.value.some(
    (track) => track.albumId === albumId && track.source === "local",
  );
  if (!hasLocalTrack) throw new Error("专辑中没有可访问的本地曲目");
  await openLibraryAlbumFolderCommand(albumId);
}

export async function readLibraryTrackAlbumAudioTags(trackId: string): Promise<AlbumAudioTags> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能读取曲库中本地曲目的专辑标签");
  if (!isTauriRuntime()) throw new Error("内嵌标签读取需在 Ome 桌面版中进行");
  return readTrackAlbumAudioTagsCommand(trackId);
}

export async function readLibraryTrackAudioTags(trackId: string): Promise<TrackAudioTags> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能读取曲库中本地曲目的内嵌标签");
  if (!isTauriRuntime()) throw new Error("内嵌标签读取需在 Ome 桌面版中进行");
  return readTrackAudioTagsCommand(trackId);
}

export async function writeLibraryTrackAudioTagUpdates(
  trackId: string,
  updates: TrackAudioTagUpdates,
): Promise<Track> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能写入曲库中本地曲目的内嵌标签");
  if (!isTauriRuntime()) throw new Error("音频标签写入需在 Ome 桌面版中进行");
  const updated = await writeTrackAudioTagUpdatesCommand(trackId, updates);
  storeUpdatedLocalTrack(updated);
  return updated;
}

export async function writeLibraryTrackAlbumAudioTags(
  trackId: string,
  album: string,
  albumArtist: string,
  year: string,
  genre: string,
  syncLibraryAlbum = false,
): Promise<void> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能写入曲库中本地曲目的专辑标签");
  if (!isTauriRuntime()) throw new Error("音频标签写入需在 Ome 桌面版中进行");
  const updated = await writeTrackAlbumAudioTagsCommand(trackId, album, albumArtist, year, genre, syncLibraryAlbum);
  storeUpdatedLocalTrack(updated);
}

export async function writeLibraryTrackCoverArt(
  trackId: string,
  imageBase64: string,
  mimeType: "image/png" | "image/jpeg",
): Promise<Track> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能向曲库中的本地曲目写入封面");
  if (!isTauriRuntime()) throw new Error("音频封面写入需在 Ome 桌面版中进行");
  const updated = await writeTrackCoverArtCommand(trackId, imageBase64, mimeType);
  storeUpdatedLocalTrack(updated);
  return updated;
}

export async function restoreLibraryTrackAudioTagBackup(trackId: string): Promise<Track> {
  if (!isTauriRuntime()) throw new Error("音频文件恢复需在 Ome 桌面版中进行");
  const updated = await restoreTrackAudioTagBackupCommand(trackId);
  storeUpdatedLocalTrack(updated);
  return updated;
}

export async function clearLibraryTrackAudioTagBackup(trackId: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("音频标签备份需在 Ome 桌面版中管理");
  await clearTrackAudioTagBackupCommand(trackId);
}

function storeUpdatedLocalTrack(updated: Track): void {
  const trackId = updated.id;
  const updateList = (items: Track[]) => items.map((track) => track.id === trackId ? updated : track);
  tracks.value = updateList(tracks.value);
  ignoredTracks.value = updateList(ignoredTracks.value);
  queue.value = updateList(queue.value);
  if (activePlaylistTracks.value) activePlaylistTracks.value = updateList(activePlaylistTracks.value);
  unavailableLocalTracks.value = updateList(unavailableLocalTracks.value);
  const lastPlayback = readLastPlayback();
  if (lastPlayback?.track.id === trackId) {
    saveLastPlayback(updated, lastPlayback.position);
  }
  libraryChangeRevision.value += 1;
}

export type CatalogEntityKind = "artist" | "album";

export interface CatalogEntityOption {
  id: string;
  name: string;
  trackCount: number;
  artist?: string;
}

function catalogEntityMatches(track: Track, kind: CatalogEntityKind, entity: CatalogEntityOption): boolean {
  if (track.source !== "local") return false;
  if (kind === "artist") return track.artistId === entity.id || track.artist === entity.name;
  return track.albumId === entity.id || (track.album === entity.name && (!entity.artist || track.artist === entity.artist));
}

function catalogTracksSnapshot(): Track[] {
  const unique = new Map<string, Track>();
  for (const item of [
    ...tracks.value,
    ...ignoredTracks.value,
    ...queue.value,
    ...(activePlaylistTracks.value ?? []),
    ...unavailableLocalTracks.value,
  ]) {
    unique.set(item.id, item);
  }
  return [...unique.values()];
}

export async function previewCatalogEntityMerge(
  kind: CatalogEntityKind,
  source: CatalogEntityOption,
  target: CatalogEntityOption,
): Promise<CatalogEntityMergePreview> {
  if (isTauriRuntime()) {
    return kind === "artist"
      ? previewLibraryArtistMergeCommand(source.id, target.id)
      : previewLibraryAlbumMergeCommand(source.id, target.id);
  }
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("demo")) {
    throw new Error("实体合并需要在 Ome 桌面版中操作");
  }

  const local = catalogTracksSnapshot().filter((track) => track.source === "local");
  const sourceTracks = local.filter((track) => catalogEntityMatches(track, kind, source));
  const targetTracks = local.filter((track) => catalogEntityMatches(track, kind, target));
  if (!sourceTracks.length || !targetTracks.length) throw new Error("找不到可合并的本地曲目");
  const sourceAlbumNames = [...new Set(
    sourceTracks.map((track) => track.album?.trim()).filter((album): album is string => Boolean(album)),
  )];
  const consolidatedAlbums = kind === "artist"
    ? sourceAlbumNames
      .filter((album) => targetTracks.some((track) => track.album?.trim() === album))
      .map((album) => ({
        sourceName: album,
        targetName: album,
        trackCount: sourceTracks.filter((track) => track.album?.trim() === album).length,
      }))
    : [];
  return {
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    sourceTrackCount: sourceTracks.length,
    targetTrackCount: targetTracks.length,
    consolidatedAlbums,
  };
}

export async function mergeCatalogEntity(
  kind: CatalogEntityKind,
  source: CatalogEntityOption,
  target: CatalogEntityOption,
): Promise<CatalogEntityRenameResult> {
  let result: CatalogEntityRenameResult;
  if (isTauriRuntime()) {
    result = kind === "artist"
      ? await mergeLibraryArtistCommand(source.id, target.id)
      : await mergeLibraryAlbumCommand(source.id, target.id);
  } else if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
    const local = catalogTracksSnapshot().filter((track) => track.source === "local");
    const sourceTracks = local.filter((track) => catalogEntityMatches(track, kind, source));
    const targetTracks = local.filter((track) => catalogEntityMatches(track, kind, target));
    if (!sourceTracks.length || !targetTracks.length) throw new Error("找不到可合并的本地曲目");
    const targetAlbumIds = new Map<string, string>();
    if (kind === "artist") {
      for (const track of targetTracks) {
        if (track.album?.trim()) {
          targetAlbumIds.set(track.album.trim(), track.albumId ?? targetAlbumIds.get(track.album.trim()) ?? "");
        }
      }
    }
    const movedTracks = sourceTracks.map((track) => {
      if (kind === "artist") {
        const album = track.album?.trim();
        const targetAlbumId = album ? targetAlbumIds.get(album) : undefined;
        return {
          ...track,
          artistId: target.id,
          artist: target.name,
          ...(targetAlbumId ? { albumId: targetAlbumId } : {}),
        };
      }
      return { ...track, albumId: target.id, album: target.name };
    });
    result = { id: target.id, previousName: source.name, name: target.name, tracks: movedTracks };
  } else {
    throw new Error("实体合并需要在 Ome 桌面版中操作");
  }

  const updatedById = new Map(result.tracks.map((track) => [track.id, track]));
  const updateList = (items: Track[]) => items.map((item) => updatedById.get(item.id) ?? item);
  tracks.value = updateList(tracks.value);
  ignoredTracks.value = updateList(ignoredTracks.value);
  queue.value = updateList(queue.value);
  if (activePlaylistTracks.value) activePlaylistTracks.value = updateList(activePlaylistTracks.value);
  unavailableLocalTracks.value = updateList(unavailableLocalTracks.value);
  const lastPlayback = readLastPlayback();
  const savedTrack = lastPlayback && updatedById.get(lastPlayback.track.id);
  if (lastPlayback && savedTrack) saveLastPlayback(savedTrack, lastPlayback.position);
  libraryChangeRevision.value += 1;
  return result;
}

function splitSourceTracks(kind: CatalogEntityKind, entity: CatalogEntityOption): Track[] {
  return catalogTracksSnapshot().filter((track) => {
    if (track.source !== "local") return false;
    if (entity.id.startsWith("demo-")) {
      return kind === "artist"
        ? track.artist === entity.name
        : track.album === entity.name && (!entity.artist || track.artist === entity.artist);
    }
    return kind === "artist" ? track.artistId === entity.id : track.albumId === entity.id;
  });
}

function validateDemoSplit(
  kind: CatalogEntityKind,
  source: CatalogEntityOption,
  newName: string,
  selectedTrackIds: string[],
): { sourceTracks: Track[]; selectedTracks: Track[]; remainingTracks: Track[] } {
  const name = newName.trim();
  if (!name) throw new Error(kind === "artist" ? "艺人名不能为空" : "专辑名不能为空");
  if (name.length > 200) throw new Error("名称不能超过 200 个字符");
  const sourceTracks = splitSourceTracks(kind, source);
  const selectedSet = new Set(selectedTrackIds);
  if (selectedSet.size !== selectedTrackIds.length) throw new Error("拆分曲目列表包含重复项，请重新选择");
  const selectedTracks = sourceTracks.filter((track) => selectedSet.has(track.id));
  if (selectedTrackIds.length === 0) throw new Error("请至少选择一首要拆出的本地曲目");
  if (selectedTracks.length !== selectedTrackIds.length) throw new Error("所选曲目已不属于当前实体，请刷新后重试");
  if (selectedTracks.length >= sourceTracks.length) throw new Error("拆分后至少要为原实体保留一首本地曲目");
  if (name === source.name || catalogTracksSnapshot().some((track) => {
    if (track.source !== "local") return false;
    if (kind === "artist") return track.artist === name;
    return track.artist === source.artist && track.album === name;
  })) {
    throw new Error(kind === "artist" ? "曲库中已存在同名艺人" : "同一艺人名下已存在同名专辑");
  }
  return {
    sourceTracks,
    selectedTracks,
    remainingTracks: sourceTracks.filter((track) => !selectedSet.has(track.id)),
  };
}

export async function previewCatalogEntitySplit(
  kind: CatalogEntityKind,
  source: CatalogEntityOption,
  newName: string,
  selectedTrackIds: string[],
): Promise<CatalogEntitySplitPreview> {
  const name = newName.trim();
  if (isTauriRuntime()) {
    return kind === "artist"
      ? previewLibraryArtistSplitCommand(source.id, name, selectedTrackIds)
      : previewLibraryAlbumSplitCommand(source.id, name, selectedTrackIds);
  }
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("demo")) {
    throw new Error("实体拆分需要在 Ome 桌面版中操作");
  }
  const { sourceTracks, selectedTracks, remainingTracks } = validateDemoSplit(kind, source, name, selectedTrackIds);
  const reparentedAlbums: CatalogEntitySplitPreview["reparentedAlbums"] = [];
  const duplicatedAlbums: CatalogEntitySplitPreview["duplicatedAlbums"] = [];
  if (kind === "artist") {
    const albumGroups = new Map<string, { name: string; selected: number }>();
    for (const track of selectedTracks) {
      const albumName = track.album.trim();
      if (!albumName) continue;
      const key = track.albumId ?? albumName;
      const group = albumGroups.get(key) ?? { name: albumName, selected: 0 };
      group.selected += 1;
      albumGroups.set(key, group);
    }
    for (const [key, group] of albumGroups) {
      const remainingCount = remainingTracks.filter((track) => (track.albumId ?? track.album) === key).length;
      (remainingCount === 0 ? reparentedAlbums : duplicatedAlbums).push({
        name: group.name,
        trackCount: group.selected,
      });
    }
  }
  return {
    sourceId: source.id,
    sourceName: source.name,
    newName: name,
    selectedTrackCount: selectedTracks.length,
    remainingTrackCount: sourceTracks.length - selectedTracks.length,
    reparentedAlbums,
    duplicatedAlbums,
  };
}

export async function splitCatalogEntity(
  kind: CatalogEntityKind,
  source: CatalogEntityOption,
  newName: string,
  selectedTrackIds: string[],
): Promise<CatalogEntitySplitResult> {
  let result: CatalogEntitySplitResult;
  if (isTauriRuntime()) {
    result = kind === "artist"
      ? await splitLibraryArtistCommand(source.id, newName.trim(), selectedTrackIds)
      : await splitLibraryAlbumCommand(source.id, newName.trim(), selectedTrackIds);
  } else if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
    const { selectedTracks } = validateDemoSplit(kind, source, newName, selectedTrackIds);
    const name = newName.trim();
    const artistId = kind === "artist" ? `demo-artist:${name}` : null;
    const albumIdByGroup = new Map<string, string>();
    const movedTracks = selectedTracks.map((track) => {
      if (kind === "artist") {
        const oldAlbumKey = track.albumId ?? track.album;
        const splitAlbumId = track.album.trim()
          ? albumIdByGroup.get(oldAlbumKey) ?? `demo-album:${track.album}␟${name}`
          : track.albumId;
        if (track.album.trim()) albumIdByGroup.set(oldAlbumKey, splitAlbumId!);
        return {
          ...track,
          artistId,
          artist: name,
          albumId: splitAlbumId,
          hasMetadataOverride: true,
          metadataSnapshotAvailable: true,
        };
      }
      return {
        ...track,
        albumId: `demo-album:${name}␟${track.artist}`,
        album: name,
        hasMetadataOverride: true,
        metadataSnapshotAvailable: true,
      };
    });
    result = {
      id: kind === "artist" ? artistId! : `demo-album:${name}␟${source.artist ?? ""}`,
      sourceName: source.name,
      name,
      tracks: movedTracks,
    };
  } else {
    throw new Error("实体拆分需要在 Ome 桌面版中操作");
  }

  const updatedById = new Map(result.tracks.map((track) => [track.id, track]));
  const updateList = (items: Track[]) => items.map((item) => updatedById.get(item.id) ?? item);
  tracks.value = updateList(tracks.value);
  ignoredTracks.value = updateList(ignoredTracks.value);
  queue.value = updateList(queue.value);
  if (activePlaylistTracks.value) activePlaylistTracks.value = updateList(activePlaylistTracks.value);
  unavailableLocalTracks.value = updateList(unavailableLocalTracks.value);
  const lastPlayback = readLastPlayback();
  const savedTrack = lastPlayback && updatedById.get(lastPlayback.track.id);
  if (lastPlayback && savedTrack) saveLastPlayback(savedTrack, lastPlayback.position);
  libraryChangeRevision.value += 1;
  return result;
}

export async function renameCatalogEntity(
  kind: CatalogEntityKind,
  id: string,
  previousName: string,
  requestedName: string,
): Promise<CatalogEntityRenameResult> {
  const name = requestedName.trim();
  if (!name) throw new Error(kind === "artist" ? "艺人名不能为空" : "专辑名不能为空");
  if (name.length > 200) throw new Error("名称不能超过 200 个字符");

  let result: CatalogEntityRenameResult;
  if (isTauriRuntime()) {
    result = kind === "artist"
      ? await renameLibraryArtistCommand(id, name)
      : await renameLibraryAlbumCommand(id, name);
  } else if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
    const matches = new Map<string, Track>();
    for (const item of [
      ...tracks.value,
      ...ignoredTracks.value,
      ...queue.value,
      ...(activePlaylistTracks.value ?? []),
      ...unavailableLocalTracks.value,
    ]) {
      const current = kind === "artist" ? item.artist : item.album;
      if (item.source === "local" && current === previousName) matches.set(item.id, item);
    }
    const updatedTracks = [...matches.values()].map((item) =>
      kind === "artist" ? { ...item, artist: name } : { ...item, album: name }
    );
    if (updatedTracks.length === 0) throw new Error("演示曲库中找不到可编辑的本地曲目");
    result = { id, previousName, name, tracks: updatedTracks };
  } else {
    throw new Error("艺人和专辑资料修改需要在 Ome 桌面版中操作");
  }

  const updatedById = new Map(result.tracks.map((track) => [track.id, track]));
  const updateList = (items: Track[]) => items.map((item) => updatedById.get(item.id) ?? item);
  tracks.value = updateList(tracks.value);
  ignoredTracks.value = updateList(ignoredTracks.value);
  queue.value = updateList(queue.value);
  if (activePlaylistTracks.value) activePlaylistTracks.value = updateList(activePlaylistTracks.value);
  unavailableLocalTracks.value = updateList(unavailableLocalTracks.value);
  const lastPlayback = readLastPlayback();
  const savedTrack = lastPlayback && updatedById.get(lastPlayback.track.id);
  if (lastPlayback && savedTrack) saveLastPlayback(savedTrack, lastPlayback.position);
  libraryChangeRevision.value += 1;
  return result;
}

export async function restoreLibraryTrackMetadata(trackId: string): Promise<{
  track: Track;
  source: "snapshot" | "fileTags";
}> {
  const existing = tracks.value.find((track) => track.id === trackId)
    ?? queue.value.find((track) => track.id === trackId);
  if (!existing || existing.source !== "local") throw new Error("只能恢复曲库中的本地曲目资料");
  if (!existing.hasMetadataOverride) throw new Error("这首曲目没有人工资料覆盖，无需恢复");

  let result: { track: Track; source: "snapshot" | "fileTags" };
  if (isTauriRuntime()) {
    result = await restoreTrackMetadataCommand(trackId);
  } else if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
    if (trackId !== "d7") throw new Error("此演示曲目没有可恢复的资料快照");
    result = {
      track: {
        ...existing,
        title: "Demo 单曲",
        artist: "未知艺术家",
        album: "",
        hasMetadataOverride: false,
        metadataSnapshotAvailable: false,
        metadataSources: {
          title: "fileTags",
          artist: "fileTags",
          album: "fileTags",
        },
      },
      source: "snapshot",
    };
  } else {
    throw new Error("恢复本地曲库资料需要在 Ome 桌面版中操作");
  }

  storeUpdatedLocalTrack(result.track);
  return result;
}

const MAX_LIBRARY_REMOVAL_BATCH = 10_000;

/** 仅从曲库索引批量移除本地曲目，并一次刷新关联状态；不会删除磁盘文件。 */
export async function removeTracksFromLibrary(trackIds: string[]): Promise<void> {
  const ids = [...new Set(trackIds)];
  if (ids.length === 0) throw new Error("至少选择一首本地曲目");
  if (ids.length > MAX_LIBRARY_REMOVAL_BATCH) throw new Error("一次最多移除 10000 首曲目");

  const localTrackIds = new Set(
    [...tracks.value, ...ignoredTracks.value]
      .filter((track) => track.source === "local")
      .map((track) => track.id),
  );
  if (ids.some((id) => !localTrackIds.has(id))) {
    throw new Error("只能从曲库移除已索引的本地曲目");
  }

  if (isTauriRuntime()) {
    await removeLocalTracksCommand(ids);
  } else if (
    typeof window === "undefined" ||
    !new URLSearchParams(window.location.search).has("demo")
  ) {
    throw new Error("请在 Ome 桌面版中移除曲库曲目");
  }

  const removedIds = new Set(ids);
  tracks.value = tracks.value.filter((item) => !removedIds.has(item.id));
  ignoredTracks.value = ignoredTracks.value.filter((item) => !removedIds.has(item.id));
  removeTracksFromQueue(ids);
  for (const id of ids) forgetLastPlayback(id);
  libraryDiagnostics.value = null;
  libraryChangeRevision.value += 1;

  if (isTauriRuntime()) {
    const playlistId = activePlaylistId.value;
    await Promise.all([
      loadPlaylists(),
      playlistId ? openPlaylist(playlistId) : Promise.resolve(),
    ]);
  }
}

/** 单曲入口兼容现有曲目行与演示操作。 */
export function removeTrackFromLibrary(trackId: string): Promise<void> {
  return removeTracksFromLibrary([trackId]);
}
