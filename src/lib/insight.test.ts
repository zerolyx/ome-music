import { describe, expect, it } from "vitest";
import { bandOf, profileInsights, type HourStat } from "./insight";

describe("bandOf", () => {
  it("与后端 dj.rs time_band 口径一致", () => {
    const cases: Array<[number, string]> = [
      [4, "深夜"],
      [5, "清晨"],
      [10, "清晨"],
      [11, "午后"],
      [13, "午后"],
      [14, "傍晚"],
      [17, "傍晚"],
      [18, "夜晚"],
      [22, "夜晚"],
      [23, "深夜"],
      [0, "深夜"],
      [3, "深夜"],
    ];
    for (const [hour, band] of cases) {
      expect(bandOf(hour), `hour=${hour}`).toBe(band);
    }
  });
});

const stat = (hour: number, plays: number, completions: number, skips: number): HourStat => ({
  hour,
  plays,
  completions,
  skips,
});

describe("profileInsights", () => {
  it("总播放为 0 时返回空", () => {
    expect(profileInsights([])).toEqual([]);
    expect(profileInsights([stat(21, 0, 0, 0)])).toEqual([]);
  });

  it("指出峰值小时", () => {
    const prefs = [stat(9, 2, 1, 1), stat(21, 8, 5, 1), stat(22, 3, 2, 0)];
    expect(profileInsights(prefs)).toContain("21 点是你最常听歌的时段");
  });

  it("指出完播率最高的时段（按时段聚合）", () => {
    // 深夜 3 小时共 6 次播放 5 次完播；夜晚只有 3 次播放
    const prefs = [
      stat(0, 2, 2, 0),
      stat(1, 2, 2, 0),
      stat(2, 2, 1, 0),
      stat(20, 3, 1, 1),
    ];
    expect(profileInsights(prefs)).toContain("你在深夜最常把歌听完");
  });

  it("样本不足的时段不参与完播判断", () => {
    const prefs = [stat(21, 2, 2, 0), stat(14, 1, 0, 1)];
    expect(profileInsights(prefs).some((s) => s.includes("最常把歌听完"))).toBe(false);
  });

  it("跳过率高的时段给出换风格提醒（最多一条）", () => {
    const prefs = [
      stat(11, 3, 1, 2),
      stat(12, 3, 1, 2),
      stat(21, 6, 5, 0),
    ];
    const insights = profileInsights(prefs);
    expect(insights).toContain("午后你常跳过歌曲，也许该换个风格");
    expect(insights.filter((s) => s.includes("跳过"))).toHaveLength(1);
  });

  it("跳过提醒要求 skip 次数 >= 2", () => {
    const prefs = [stat(11, 3, 2, 1), stat(21, 5, 4, 0)];
    expect(profileInsights(prefs).some((s) => s.includes("跳过"))).toBe(false);
  });
});
