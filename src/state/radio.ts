/* ============ 自动电台（Plan 3 Task 4）============
 * 歌曲播完 / 开机问候后自动挑下一首，说一句开场白再起播。
 * 选曲刻意纯本地画像评分（LLM 选曲易翻车，本轮不参与，只让 LLM 负责说词）；
 * DJ 未配置 / 接口失败 / TTS 关闭一律安静直放，绝不阻塞音乐。
 */

import { signal } from "@preact/signals";
import { djIntro, profileHourPreferences, type HourPreference } from "../lib/api";
import type { Track } from "../types/music";
import { djConfig } from "./dj";
import { refreshTracks, tracks } from "./library";
import { isPlaying, playWithRadioIntro, queue } from "./player";

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
}

export interface ScoreContext {
  hour: number;
  hourProfile: { hour: number; plays: number }[] | null;
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
  if (candidate.liked) score += 3;
  if (ctx.hourProfile && ctx.hourProfile.length > 0) {
    const bucket = ctx.hourProfile.find((item) => item.hour === ctx.hour);
    if (bucket && bucket.plays > averagePlays(ctx.hourProfile)) score += 2;
  }
  if (candidate.id !== undefined && ctx.recentSkipIds.includes(candidate.id)) score -= 4;
  if (candidate.playCount > 20) score -= 1;
  return score;
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

/** 本地画像选下一首：排除当前曲；曲库为空返回 null */
export async function pickNextLocal(currentId: string | null): Promise<Track | null> {
  const candidates = tracks.value.filter((track) => track.id !== currentId);
  if (candidates.length === 0) return null;
  const ctx: ScoreContext = {
    hour: new Date().getHours(),
    hourProfile: await loadHourProfile(),
    recentSkipIds: recentSkipIds(),
  };
  let best: Track | null = null;
  let bestScore = -Infinity;
  for (const track of candidates) {
    const score = scoreCandidate(
      {
        id: track.id,
        liked: track.liked,
        playCount: track.playCount,
        durationSeconds: track.durationSeconds,
      },
      ctx
    );
    if (score > bestScore) {
      bestScore = score;
      best = track;
    }
  }
  return best;
}

/**
 * 电台下一首：本地评分选曲，DJ 终选留到后续轮次；
 * 选不出（曲库空）返回 null，调用方按「播完即停」处理。
 */
export async function radioNext(currentId: string | null = null): Promise<Track | null> {
  return pickNextLocal(currentId);
}

/* ---- 开场白 ---- */

/** 歌前介绍词：DJ 未配置 / 接口失败 / 空台词 → null（安静直播） */
export async function introFor(track: Track): Promise<string | null> {
  if (!djConfig.value?.configured) return null;
  try {
    const { say } = await djIntro(track.id);
    return say && say.trim() ? say : null;
  } catch {
    return null;
  }
}

/* ---- 开机自动开播 ---- */

const idle = (): boolean => !isPlaying.value && queue.value.length === 0;

/** 开机问候后自动开播：曲库挑一首 + 开场白；条件不满足或被用户抢先则保持安静 */
export async function startRadioIfIdle(): Promise<void> {
  if (!radioEnabled.value || !djConfig.value?.configured) return;
  if (!idle()) return;
  await refreshTracks(); // 本地库读取，缓存安全；失败时 loadError 置位但不影响判断
  if (tracks.value.length === 0 || !idle()) return;
  const track = await radioNext(null);
  if (!track || !idle()) return; // 选曲期间用户手动开播了：不打扰
  queue.value = [track];
  await playWithRadioIntro(track, 0);
}
