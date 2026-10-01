import { signal } from "@preact/signals";
import {
  bilibiliProxySrc,
  bilibiliSearch,
  bilibiliStreamUrl,
  isTauriRuntime,
  listLocalMusicVideoCandidates,
  localMusicVideoSrc,
  type BilibiliMvQuality,
  type BilibiliSongDto,
  type LocalMusicVideoCandidate,
} from "../lib/api";
import type { Track } from "../types/music";
import { currentTrack } from "./player";

const MV_RESULT_LIMIT = 12;

export const musicVideoCandidates = signal<BilibiliSongDto[]>([]);
export const localMusicVideoCandidates = signal<LocalMusicVideoCandidate[]>([]);
export const musicVideoSelected = signal<BilibiliSongDto | null>(null);
export const localMusicVideoSelected = signal<LocalMusicVideoCandidate | null>(null);
export const musicVideoProvider = signal<"bilibili" | "local" | null>(null);
export const musicVideoLookupSource = signal<"bilibili" | "local">("bilibili");
export const musicVideoSrc = signal<string | null>(null);
export const musicVideoLoading = signal(false);
export const musicVideoError = signal<string | null>(null);
export const musicVideoQuality = signal<BilibiliMvQuality>(64);
export const musicVideoResolvedQuality = signal<string | null>(null);

let ownerTrackId: string | null = null;
let requestSequence = 0;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCurrentRequest(sequence: number, trackId: string): boolean {
  return requestSequence === sequence
    && ownerTrackId === trackId
    && currentTrack.value?.id === trackId;
}

/** A music video belongs to the current stage session and is never persisted. */
export function resetMusicVideo(trackId: string | null): void {
  if (ownerTrackId === trackId) return;
  requestSequence += 1;
  ownerTrackId = trackId;
  musicVideoCandidates.value = [];
  localMusicVideoCandidates.value = [];
  musicVideoSelected.value = null;
  localMusicVideoSelected.value = null;
  musicVideoProvider.value = null;
  musicVideoLookupSource.value = "bilibili";
  musicVideoSrc.value = null;
  musicVideoLoading.value = false;
  musicVideoError.value = null;
  musicVideoResolvedQuality.value = null;
}

/** Called only from the explicit “搜索 B 站” action; it never auto-runs. */
export async function searchMusicVideo(track: Track): Promise<void> {
  if (!isTauriRuntime()) {
    musicVideoError.value = "MV 搜索需要在 Ome Music 桌面版中使用。";
    return;
  }
  if (ownerTrackId !== track.id) resetMusicVideo(track.id);
  const sequence = ++requestSequence;
  musicVideoLookupSource.value = "bilibili";
  localMusicVideoCandidates.value = [];
  const query = `${track.title} ${track.artist}`.trim().slice(0, 160);
  if (!query) {
    musicVideoError.value = "这首歌曲缺少可搜索的曲名。";
    return;
  }

  musicVideoLoading.value = true;
  musicVideoError.value = null;
  try {
    const results = await bilibiliSearch(query, MV_RESULT_LIMIT);
    if (!isCurrentRequest(sequence, track.id)) return;
    musicVideoCandidates.value = results.slice(0, MV_RESULT_LIMIT);
  } catch (error) {
    if (isCurrentRequest(sequence, track.id)) musicVideoError.value = message(error);
  } finally {
    if (isCurrentRequest(sequence, track.id)) musicVideoLoading.value = false;
  }
}

/** Search only the current local track's authorized neighboring folders, on user request. */
export async function searchLocalMusicVideo(track: Track): Promise<void> {
  if (!isTauriRuntime()) {
    musicVideoError.value = "本地视频查找需要在 Ome Music 桌面版中使用。";
    return;
  }
  if (track.source !== "local") {
    musicVideoError.value = "本地视频候选仅适用于本地曲目。";
    return;
  }
  if (ownerTrackId !== track.id) resetMusicVideo(track.id);
  const sequence = ++requestSequence;
  musicVideoLookupSource.value = "local";
  musicVideoCandidates.value = [];
  musicVideoLoading.value = true;
  musicVideoError.value = null;
  try {
    const results = await listLocalMusicVideoCandidates(track.id);
    if (!isCurrentRequest(sequence, track.id)) return;
    localMusicVideoCandidates.value = results.slice(0, MV_RESULT_LIMIT);
  } catch (error) {
    if (isCurrentRequest(sequence, track.id)) musicVideoError.value = message(error);
  } finally {
    if (isCurrentRequest(sequence, track.id)) musicVideoLoading.value = false;
  }
}

/** Fetch a video stream only after the user chooses a visible candidate. */
export async function selectMusicVideo(track: Track, candidate: BilibiliSongDto): Promise<void> {
  if (!isTauriRuntime()) {
    musicVideoError.value = "MV 播放需要在 Ome Music 桌面版中使用。";
    return;
  }
  if (ownerTrackId !== track.id) resetMusicVideo(track.id);
  const sequence = ++requestSequence;
  musicVideoLoading.value = true;
  musicVideoError.value = null;
  try {
    const stream = await bilibiliStreamUrl(candidate.bvid, musicVideoQuality.value);
    if (!isCurrentRequest(sequence, track.id)) return;
    musicVideoSelected.value = candidate;
    localMusicVideoSelected.value = null;
    musicVideoProvider.value = "bilibili";
    musicVideoSrc.value = bilibiliProxySrc(stream.url, stream.referer);
    musicVideoResolvedQuality.value = stream.qualityLabel;
  } catch (error) {
    if (isCurrentRequest(sequence, track.id)) musicVideoError.value = message(error);
  } finally {
    if (isCurrentRequest(sequence, track.id)) musicVideoLoading.value = false;
  }
}

/** Start a chosen local sidecar video through Rust's opaque-ID, bounded-range route. */
export async function selectLocalMusicVideo(
  track: Track,
  candidate: LocalMusicVideoCandidate,
): Promise<void> {
  if (!isTauriRuntime()) {
    musicVideoError.value = "本地视频播放需要在 Ome Music 桌面版中使用。";
    return;
  }
  if (track.source !== "local") {
    musicVideoError.value = "本地视频候选仅适用于本地曲目。";
    return;
  }
  if (ownerTrackId !== track.id) resetMusicVideo(track.id);
  const sequence = ++requestSequence;
  musicVideoLoading.value = true;
  musicVideoError.value = null;
  try {
    const src = localMusicVideoSrc(candidate.id);
    if (!isCurrentRequest(sequence, track.id)) return;
    localMusicVideoSelected.value = candidate;
    musicVideoSelected.value = null;
    musicVideoProvider.value = "local";
    musicVideoSrc.value = src;
    musicVideoResolvedQuality.value = null;
  } catch (error) {
    if (isCurrentRequest(sequence, track.id)) musicVideoError.value = message(error);
  } finally {
    if (isCurrentRequest(sequence, track.id)) musicVideoLoading.value = false;
  }
}

/** Change the session’s maximum video tier; re-resolve an already selected MV. */
export async function setMusicVideoQuality(value: number): Promise<void> {
  if (value !== 16 && value !== 32 && value !== 64) return;
  musicVideoQuality.value = value;
  const selected = musicVideoSelected.value;
  const track = currentTrack.value;
  if (selected && musicVideoProvider.value === "bilibili" && track && ownerTrackId === track.id) {
    await selectMusicVideo(track, selected);
  }
}

/** Stop the selected video while keeping this song’s visible search results. */
export function stopMusicVideo(): void {
  requestSequence += 1;
  musicVideoSelected.value = null;
  localMusicVideoSelected.value = null;
  musicVideoProvider.value = null;
  musicVideoSrc.value = null;
  musicVideoLoading.value = false;
  musicVideoError.value = null;
  musicVideoResolvedQuality.value = null;
}

export function reportMusicVideoPlaybackFailure(): void {
  requestSequence += 1;
  musicVideoSelected.value = null;
  localMusicVideoSelected.value = null;
  musicVideoProvider.value = null;
  musicVideoSrc.value = null;
  musicVideoLoading.value = false;
  musicVideoResolvedQuality.value = null;
  musicVideoError.value = "这段视频暂时无法播放，音乐仍会继续。";
}

