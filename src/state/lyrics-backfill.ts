import { signal } from "@preact/signals";
import {
  cancelLyricsBackfill,
  completeLyricsBackfillTrack,
  getCurrentLyricsBackfill,
  isTauriRuntime,
  lyricsProviderCandidates,
  lyricsProviderLyric,
  localLyric,
  neteaseLyric,
  neteaseSearch,
  nextLyricsBackfillTrack,
  pauseLyricsBackfill,
  resumeLyricsBackfill,
  saveAutoBackfilledTrackLyrics,
  startLyricsBackfill,
  type LyricsBackfillJob,
  type LyricsBackfillMode,
  type LyricsBackfillTrack,
  type LyricsProvider,
  type LyricsProviderRaw,
} from "../lib/api";
import { assessLyricsCandidate } from "../lib/lyrics-match";
import { lyricsTextFromRaw, parseLocalLyricPayload, rememberLyricsCandidate } from "./lyrics";
import { playbackActive } from "./playback-status";

const DEFAULT_THRESHOLD = 88;
const THRESHOLD_KEY = "ome.lyrics.backfill.threshold";
const QUICK_PROVIDERS: LyricsProvider[] = ["netease", "lrclib", "qqmusic"];
const COMPLETE_PROVIDERS: LyricsProvider[] = ["netease", "lrclib", "qqmusic", "amll", "kugou", "kuwo"];
const MAX_LYRIC_FETCHES_PER_TRACK = 6;

function readThreshold(): number {
  try {
    const value = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isInteger(value) && value >= 82 && value <= 95 ? value : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export const lyricsBackfillJob = signal<LyricsBackfillJob | null>(null);
export const lyricsBackfillBusy = signal(false);
export const lyricsBackfillThreshold = signal(readThreshold());
export const lyricsBackfillError = signal<string | null>(null);

let runnerJobId: string | null = null;
let runnerGeneration = 0;
const cancelledRunners = new Set<string>();

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const isRateLimit = (message: string) => /等待\s*\d+\s*秒|too many requests|rate.?limit/i.test(message);

async function waitWhilePlaying(shouldContinue: () => boolean): Promise<void> {
  while (playbackActive.value && shouldContinue()) await delay(1200);
}

function currentRunner(jobId: string, generation: number): boolean {
  return runnerJobId === jobId && runnerGeneration === generation && !cancelledRunners.has(jobId);
}

export function setLyricsBackfillThreshold(value: number): void {
  const threshold = Math.max(82, Math.min(95, Math.round(value)));
  lyricsBackfillThreshold.value = threshold;
  try {
    localStorage.setItem(THRESHOLD_KEY, String(threshold));
  } catch {
    /* 本机偏好不可用时只保留本次运行设置。 */
  }
}

export async function loadLyricsBackfillStatus(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    lyricsBackfillJob.value = await getCurrentLyricsBackfill();
    lyricsBackfillError.value = null;
  } catch (cause) {
    lyricsBackfillError.value = cause instanceof Error ? cause.message : "无法读取歌词回填进度。";
  }
}

export function isLyricsBackfillRunning(): boolean {
  return runnerJobId !== null;
}

async function searchProvider(
  provider: LyricsProvider,
  query: string,
): Promise<Array<{ provider: LyricsProvider; id: string; name: string; artists: string; album: string; durationMs: number | null }>> {
  if (provider === "netease") {
    const songs = await neteaseSearch(query, 5);
    return songs.map((song) => ({
      provider,
      id: String(song.id),
      name: song.name,
      artists: song.artists,
      album: song.album,
      durationMs: song.durationMs,
    }));
  }
  const songs = await lyricsProviderCandidates(provider, query, 5);
  return songs.map((song) => ({ ...song, provider }));
}

async function fetchLyrics(provider: LyricsProvider, id: string): Promise<LyricsProviderRaw> {
  if (provider === "netease") return neteaseLyric(Number(id));
  return lyricsProviderLyric(provider, id);
}

async function processTrack(
  job: LyricsBackfillJob,
  track: LyricsBackfillTrack,
  generation: number,
): Promise<LyricsBackfillJob | null> {
  const stillCurrent = () => currentRunner(job.id, generation);
  try {
    const local = await localLyric(track.trackId);
    if (local && parseLocalLyricPayload(local)) {
      return await completeLyricsBackfillTrack(job.id, track.trackId, "skipped", "曲目已有本地歌词");
    }
  } catch {
    return await completeLyricsBackfillTrack(job.id, track.trackId, "skipped", "本地音频当前不可访问");
  }
  if (!stillCurrent()) return null;

  // Playback remains responsive: wait between tracks while audio is active.
  await waitWhilePlaying(stillCurrent);
  if (!stillCurrent()) return null;

  const providers = job.mode === "quick" ? QUICK_PROVIDERS : COMPLETE_PROVIDERS;
  const query = `${track.title} ${track.artist}`.trim().slice(0, 200);
  const candidates: Array<{
    provider: LyricsProvider;
    id: string;
    name: string;
    artists: string;
    album: string;
    durationMs: number | null;
    score: number;
  }> = [];
  const errors: string[] = [];

  for (const provider of providers) {
    if (!stillCurrent()) return null;
    try {
      const found = await searchProvider(provider, query);
      for (const candidate of found) {
        const assessment = assessLyricsCandidate(track, candidate);
        if (assessment.score >= job.threshold && assessment.level === "high" && assessment.versionConflicts.length === 0) {
          candidates.push({ ...candidate, score: assessment.score });
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (isRateLimit(message)) {
        const paused = await pauseLyricsBackfill(job.id, message);
        lyricsBackfillJob.value = paused;
        return null;
      }
      errors.push(message);
    }
    await delay(180);
  }

  if (!stillCurrent()) return null;
  if (candidates.length === 0) {
    const allProvidersFailed = errors.length === providers.length;
    return await completeLyricsBackfillTrack(
      job.id,
      track.trackId,
      allProvidersFailed ? "failed" : "no_match",
      allProvidersFailed ? "当前歌词来源暂时都无法查询" : undefined,
    );
  }

  candidates.sort((left, right) => right.score - left.score);
  for (const candidate of candidates.slice(0, MAX_LYRIC_FETCHES_PER_TRACK)) {
    if (!stillCurrent()) return null;
    try {
      const rawLyrics = await fetchLyrics(candidate.provider, candidate.id);
      if (!lyricsTextFromRaw(rawLyrics)) continue;
      if (!stillCurrent()) return null;
      const saved = await saveAutoBackfilledTrackLyrics(job.id, track.trackId, {
        provider: candidate.provider,
        providerId: candidate.id,
        title: candidate.name,
        artist: candidate.artists,
        album: candidate.album || null,
        rawLyrics,
        score: candidate.score,
      });
      rememberLyricsCandidate(track.trackId, rawLyrics);
      return saved;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (isRateLimit(message)) {
        const paused = await pauseLyricsBackfill(job.id, message);
        lyricsBackfillJob.value = paused;
        return null;
      }
      errors.push(message);
    }
    await delay(180);
  }

  if (!stillCurrent()) return null;
  const localConflict = errors.some((message) =>
    /已有本地歌词|用户保存的歌词|已经有自动回填歌词|曲目不存在|已移除|不在当前有效授权范围/.test(message),
  );
  return await completeLyricsBackfillTrack(
    job.id,
    track.trackId,
    localConflict ? "skipped" : "no_match",
    localConflict ? "曲目内容已变化，未覆盖现有歌词" : undefined,
  );
}

async function runQueue(jobId: string): Promise<void> {
  const generation = ++runnerGeneration;
  runnerJobId = jobId;
  lyricsBackfillBusy.value = true;
  cancelledRunners.delete(jobId);
  try {
    for (;;) {
      if (!currentRunner(jobId, generation)) return;
      const track = await nextLyricsBackfillTrack(jobId);
      if (!currentRunner(jobId, generation)) return;
      if (!track) {
        await loadLyricsBackfillStatus();
        return;
      }
      const job = lyricsBackfillJob.value?.id === jobId
        ? lyricsBackfillJob.value
        : await getCurrentLyricsBackfill();
      if (!job) return;
      lyricsBackfillJob.value = { ...job, currentTrackTitle: track.title };
      try {
        const updated = await processTrack(job, track, generation);
        if (updated) lyricsBackfillJob.value = updated;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!currentRunner(jobId, generation)) return;
        try {
          lyricsBackfillJob.value = await completeLyricsBackfillTrack(jobId, track.trackId, "failed", message);
        } catch {
          await loadLyricsBackfillStatus();
          return;
        }
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    lyricsBackfillError.value = message;
    try {
      lyricsBackfillJob.value = await pauseLyricsBackfill(jobId, message);
    } catch {
      await loadLyricsBackfillStatus();
    }
  } finally {
    if (runnerJobId === jobId && runnerGeneration === generation) {
      runnerJobId = null;
      lyricsBackfillBusy.value = false;
    }
  }
}

export async function startLyricsBackfillJob(mode: LyricsBackfillMode): Promise<void> {
  if (!isTauriRuntime() || runnerJobId) return;
  lyricsBackfillBusy.value = true;
  lyricsBackfillError.value = null;
  try {
    const job = await startLyricsBackfill(mode, lyricsBackfillThreshold.value);
    lyricsBackfillJob.value = job;
    void runQueue(job.id);
  } catch (cause) {
    lyricsBackfillError.value = cause instanceof Error ? cause.message : "无法启动歌词回填。";
    lyricsBackfillBusy.value = false;
  }
}

export async function resumeLyricsBackfillJob(): Promise<void> {
  const existing = lyricsBackfillJob.value;
  if (!existing || runnerJobId || !isTauriRuntime()) return;
  lyricsBackfillBusy.value = true;
  lyricsBackfillError.value = null;
  try {
    const job = await resumeLyricsBackfill(existing.id);
    lyricsBackfillJob.value = job;
    void runQueue(job.id);
  } catch (cause) {
    lyricsBackfillError.value = cause instanceof Error ? cause.message : "无法继续歌词回填。";
    lyricsBackfillBusy.value = false;
  }
}

export async function cancelLyricsBackfillJob(): Promise<void> {
  const existing = lyricsBackfillJob.value;
  if (!existing) return;
  cancelledRunners.add(existing.id);
  if (runnerJobId === existing.id) runnerGeneration += 1;
  lyricsBackfillBusy.value = false;
  try {
    lyricsBackfillJob.value = await cancelLyricsBackfill(existing.id);
  } catch (cause) {
    lyricsBackfillError.value = cause instanceof Error ? cause.message : "无法停止歌词回填。";
  } finally {
    if (runnerJobId === existing.id) runnerJobId = null;
  }
}
