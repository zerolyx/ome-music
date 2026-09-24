import { describe, expect, it } from "vitest";
import { filterHistory, historyStats, type HistoryEntry } from "./history";

// 相对 now 构造，避开时区与午夜边界造成的偶发失败
const NOW = Date.now();
const DAY = 24 * 3600 * 1000;
const todayStart = new Date(NOW).setHours(0, 0, 0, 0);
/** 本地时间毫秒 → 模拟后端 UTC 文本（ISO 去尾） */
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

const entry = (id: string, playedAtMs: number, durationSeconds = 200): HistoryEntry => ({
  id,
  title: id,
  artist: "a",
  album: "",
  durationSeconds,
  filePath: "",
  source: "local",
  liked: false,
  playCount: 0,
  playedAt: iso(playedAtMs),
});

const ENTRIES = [
  entry("刚刚", NOW - 5 * 60 * 1000),
  entry("今天早些", todayStart + 3600 * 1000),
  entry("昨天", todayStart - 3600 * 1000),
  entry("三天前", NOW - 3 * DAY),
  entry("十天前", NOW - 10 * DAY),
  entry("四十天前", NOW - 40 * DAY, 600),
];

describe("filterHistory（历史时间筛选）", () => {
  it("全部不筛", () => {
    expect(filterHistory(ENTRIES, "all", NOW)).toHaveLength(6);
  });

  it("今天：只含本地今天 0 点之后", () => {
    expect(filterHistory(ENTRIES, "today", NOW).map((e) => e.id)).toEqual([
      "刚刚",
      "今天早些",
    ]);
  });

  it("最近 7 天", () => {
    expect(filterHistory(ENTRIES, "7d", NOW).map((e) => e.id)).toEqual([
      "刚刚",
      "今天早些",
      "昨天",
      "三天前",
    ]);
  });

  it("最近 30 天", () => {
    expect(filterHistory(ENTRIES, "30d", NOW).map((e) => e.id)).toEqual([
      "刚刚",
      "今天早些",
      "昨天",
      "三天前",
      "十天前",
    ]);
  });
});

describe("historyStats（历史统计摘要）", () => {
  it("次数/不重复曲目/累计时长（分钟）", () => {
    const stats = historyStats(ENTRIES, "all", NOW);
    expect(stats.plays).toBe(6);
    expect(stats.today).toBe(2);
    expect(stats.week).toBe(4);
    expect(stats.tracks).toBe(6);
    // 200s * 5 + 600s = 1600s ≈ 26 分钟
    expect(stats.minutes).toBe(26);
  });

  it("范围收窄后统计随之收窄", () => {
    const stats = historyStats(ENTRIES, "30d", NOW);
    expect(stats.plays).toBe(5);
    expect(stats.minutes).toBe(16); // 200 * 5 = 1000s
  });
});
