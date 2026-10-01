/* ============ 自动电台（Plan 3 Task 4）============
 * 歌曲播完 / 开机问候后自动挑下一首，说一句开场白再起播。
 * 选曲刻意纯本地画像评分（LLM 选曲易翻车，本轮不参与，只让 LLM 负责说词）；
 * DJ 未配置 / 接口失败 / TTS 关闭一律安静直放，绝不阻塞音乐。
 */

import { signal } from "@preact/signals";
import {
  djIntro,
  profileHourPreferences,
  type GenreHourPreference,
  type HourPreference,
} from "../lib/api";
import type { Track } from "../types/music";
import { djConfig, mood } from "./dj";
import { refreshTracks, tracks } from "./library";
import { isPlaying, playWithRadioIntro, queue, setPendingSeek, readLastPlayback } from "./player";

const RADIO_KEY = "ome.radio";

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(RADIO_KEY) !== "0";
  } catch {
    return true; // 存储不可用（隐私模式等）：默认开启
  }
}

/** 自动电台总开关；关 = 播完即停、无歌前介绍 */
export const radioEnabled = signal<boolean>(readStoredEnabled());

export function setRadioEnabled(value: boolean): void {
  radioEnabled.value = value;
  try {
    localStorage.setItem(RADIO_KEY, value ? "1" : "0");
  } catch {
    // 存储不可用：仅当前会话生效
  }
}

/* ---- 跳过记忆：近 20 分钟内手动跳过的曲目降权 ---- */

const SKIP_TTL_MS = 20 * 60 * 1000;
const skipHistory = new Map<string, number>();

/** 手动切歌时记一笔（内存时间戳，重启即清） */
export function recordSkip(trackId: string): void {
  skipHistory.set(trackId, Date.now());
}

function pruneSkips(now: number): void {
  for (const [id, ts] of skipHistory) {
    if (now - ts > SKIP_TTL_MS) skipHistory.delete(id);
  }
}

/** 近 20 分钟被跳过的曲目 id（导出便于测试与调试） */
export function recentSkipIds(): string[] {
  pruneSkips(Date.now());
  return [...skipHistory.keys()];
}

/* ---- 候选打分 ---- */

export interface ScoreCandidateInput {
  /** 跳过惩罚需要按 id 比对 recentSkipIds；可不传（视为无跳过记录） */
  id?: string;
  liked: boolean;
  playCount: number;
  durationSeconds: number;
  genres?: string[];
}

export interface ScoreContext {
  hour: number;
  hourProfile: { hour: number; plays: number; genrePreferences?: GenreHourPreference[] }[] | null;
  recentSkipIds: string[];
}

function averagePlays(profile: { plays: number }[]): number {
  if (profile.length === 0) return 0;
  return profile.reduce((sum, item) => sum + item.plays, 0) / profile.length;
}

/**
 * 纯逻辑：liked +3；当前时段播放高于平均 +2；
 * 近 20 分钟被跳过 −4；播放超过 20 次（听腻）−1。
 */
export function scoreCandidate(candidate: ScoreCandidateInput, ctx: ScoreContext): number {
  let score = 0;
  const hourBucket = ctx.hourProfile?.find((item) => item.hour === ctx.hour);
  if (candidate.liked) score += 3;
  if (ctx.hourProfile && ctx.hourProfile.length > 0) {
    if (hourBucket && hourBucket.plays > averagePlays(ctx.hourProfile)) score += 2;
  }
  score += genreAffinityScore(candidate.genres ?? [], hourBucket?.genrePreferences ?? []);
  if (candidate.id !== undefined && ctx.recentSkipIds.includes(candidate.id)) score -= 4;
  if (candidate.playCount > 20) score -= 1;
  return score;
}

/**
 * 时段曲风倾向：播放是轻度信号，听完/收藏加权，跳过/取消收藏降权；
 * 四条以内渐进建立置信度，避免单次播放就重排整台电台。
 */
export function genreAffinityScore(
  trackGenres: readonly string[],
  preferences: readonly GenreHourPreference[],
): number {
  if (trackGenres.length === 0 || preferences.length === 0) return 0;
  const candidateGenres = new Set(
    trackGenres.map((genre) => genre.normalize("NFKC").trim().toLowerCase()).filter(Boolean),
  );
  const matched = preferences.filter((preference) =>
    candidateGenres.has(preference.genre.normalize("NFKC").trim().toLowerCase()),
  );
  if (matched.length === 0) return 0;

  const scores = matched.map((preference) => {
    const evidence = preference.plays + preference.completions + preference.skips + preference.likes + preference.unlikes;
    if (evidence === 0) return 0;
    const positive = preference.plays * 0.25 + preference.completions * 1.5 + preference.likes * 2;
    const negative = preference.skips * 1.5 + preference.unlikes * 2;
    const confidence = Math.min(1, evidence / 4);
    return Math.max(-2, Math.min(2, ((positive - negative) / evidence) * 3 * confidence));
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

/* ---- 选曲 ---- */

async function loadHourProfile(): Promise<HourPreference[] | null> {
  try {
    const profile = await profileHourPreferences();
    return profile.length > 0 ? profile : null;
  } catch {
    return null; // 非 Tauri 环境 / 读取失败：无时段画像照样能选
  }
}

/** 近期播放历史（内存，重启清零）：避免短期内重复出现同一首 */
const recentPlayHistory: string[] = [];
const RECENT_PLAY_LIMIT = 10;

/** 记录刚播过的曲目 id（供 pickNextLocal 去重；由 player 调用） */
export function recordRecentPlay(trackId: string): void {
  // 去重：若已在历史中则先移出
  const existing = recentPlayHistory.indexOf(trackId);
  if (existing !== -1) recentPlayHistory.splice(existing, 1);
  recentPlayHistory.push(trackId);
  if (recentPlayHistory.length > RECENT_PLAY_LIMIT) recentPlayHistory.shift();
}

/**
 * softmax 加权随机选曲：相邻分数候选各有机会，不固定选最高分。
 * temperature 越高越随机（1.5 = 较强随机性，分数差异仍有影响）。
 */
function weightedRandomPick<T>(items: T[], scores: number[], temperature = 1.5): T {
  if (items.length === 1) return items[0];
  const exp = scores.map((s) => Math.exp(s / temperature));
  const total = exp.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= exp[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 本地画像选下一首：排除当前曲和近期播放历史；曲库为空返回 null */
export async function pickNextLocal(currentId: string | null): Promise<Track | null> {
  // 排除当前曲和近 RECENT_PLAY_LIMIT 首，保留至少 1 个候选
  let candidates = tracks.value.filter(
    (track) => track.id !== currentId && !recentPlayHistory.includes(track.id),
  );
  // 若过滤后没有候选（曲库太小），只排除当前曲
  if (candidates.length === 0) {
    candidates = tracks.value.filter((track) => track.id !== currentId);
  }
  if (candidates.length === 0) return null;

  const ctx: ScoreContext = {
    hour: new Date().getHours(),
    hourProfile: await loadHourProfile(),
    recentSkipIds: recentSkipIds(),
  };

  const scored = candidates.map((track) => ({
    track,
    score: scoreCandidate(
      {
        id: track.id,
        liked: track.liked,
        playCount: track.playCount,
        durationSeconds: track.durationSeconds,
        genres: track.genres,
      },
      ctx,
    ),
  }));

  const items = scored.map((s) => s.track);
  const scores = scored.map((s) => s.score);
  return weightedRandomPick(items, scores);
}

/**
 * 电台下一首：本地评分加权随机选曲；
 * 选不出（曲库空）返回 null，调用方按「播完即停」处理。
 */
export async function radioNext(currentId: string | null = null): Promise<Track | null> {
  return pickNextLocal(currentId);
}

/* ---- 开场白 ---- */

/** 歌前介绍词：DJ 未配置 / 接口失败 / 空台词 → null（安静直播） */
export async function introFor(
  track: Track,
  event?: "skip" | "ended" | "boot" | "resume"
): Promise<string | null> {
  if (!djConfig.value?.configured) return null;
  try {
    const currentMood = mood.value ?? undefined;
    const { say } = await djIntro(track.id, event, currentMood);
    return say && say.trim() ? say : null;
  } catch {
    return null;
  }
}

/* ---- 开机自动开播 ---- */

const idle = (): boolean => !isPlaying.value && queue.value.length === 0;

/** 电台启动不依赖 LLM；离线时由本地画像直接选曲。 */
export function canStartRadioFromHome(
  enabled: boolean,
  hasTracks: boolean,
  playing: boolean,
  queueLength: number,
): boolean {
  return enabled && hasTracks && !playing && queueLength === 0;
}

/** 开机问候后自动开播：曲库挑一首 + 开场白；条件不满足或被用户抢先则保持安静 */
export async function startRadioIfIdle(): Promise<void> {
  if (!radioEnabled.value || !idle()) return;

  // 优先续播上次：从上一次播放的曲目与进度继续，之后交给 onEnded 的今日推荐
  const last = readLastPlayback();
  if (last) {
    queue.value = [last.track];
    setPendingSeek(
      last.position > 0 && last.position < last.track.durationSeconds - 15 ? last.position : null
    );
    await playWithRadioIntro(last.track, 0, "resume");
    return;
  }

  await refreshTracks(); // 本地库读取，缓存安全；失败时 loadError 置位但不影响判断
  if (tracks.value.length === 0 || !idle()) return;
  const track = await radioNext(null);
  if (!track || !idle()) return; // 选曲期间用户手动开播了：不打扰
  queue.value = [track];
  await playWithRadioIntro(track, 0);
}
