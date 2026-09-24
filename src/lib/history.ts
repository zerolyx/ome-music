/* ============ 播放历史统计与时间筛选（ECHO HistoryPage 思路） ============
 * 纯逻辑：HistoryEntry.playedAt 为后端 CURRENT_TIMESTAMP 文本
 * （"YYYY-MM-DD HH:MM:SS"，本地时区语义），new Date() 可解析。
 */

import type { Track } from "../types/music";

export interface HistoryEntry extends Track {
  playedAt: string;
}

export type HistoryRange = "all" | "today" | "7d" | "30d";

export const HISTORY_RANGES: ReadonlyArray<{ id: HistoryRange; label: string }> = [
  { id: "all", label: "全部" },
  { id: "today", label: "今天" },
  { id: "7d", label: "最近 7 天" },
  { id: "30d", label: "最近 30 天" },
];

/** 后端 played_at 是 SQLite CURRENT_TIMESTAMP（UTC，无时区后缀）；按 UTC 解析成 epoch */
function playedTime(entry: HistoryEntry): number {
  const raw = entry.playedAt.trim();
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const normalized = hasZone ? raw.replace(" ", "T") : `${raw.replace(" ", "T")}Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : 0;
}

export function filterHistory(
  entries: HistoryEntry[],
  range: HistoryRange,
  now: number,
): HistoryEntry[] {
  if (range === "all") return entries;
  const start =
    range === "today"
      ? new Date(now).setHours(0, 0, 0, 0)
      : now - (range === "7d" ? 7 : 30) * 24 * 3600 * 1000;
  return entries.filter((entry) => playedTime(entry) >= start);
}

export interface HistoryStats {
  /** 今天播放次数 */
  today: number;
  /** 最近 7 天播放次数 */
  week: number;
  /** 范围内播放次数 */
  plays: number;
  /** 范围内累计收听时长（分钟，向下取整） */
  minutes: number;
  /** 范围内不重复曲目数 */
  tracks: number;
}

export function historyStats(
  entries: HistoryEntry[],
  range: HistoryRange,
  now: number,
): HistoryStats {
  const inRange = filterHistory(entries, range, now);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const weekStart = now - 7 * 24 * 3600 * 1000;
  let today = 0;
  let week = 0;
  let seconds = 0;
  const unique = new Set<string>();
  for (const entry of inRange) {
    const time = playedTime(entry);
    if (time >= todayStart) today += 1;
    if (time >= weekStart) week += 1;
    seconds += entry.durationSeconds;
    unique.add(entry.id);
  }
  return {
    today,
    week,
    plays: inRange.length,
    minutes: Math.floor(seconds / 60),
    tracks: unique.size,
  };
}
