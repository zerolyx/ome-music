/* ============ 时段画像洞察（纯函数） ============
 * 时段口径与 src-tauri/src/dj.rs 的 time_band 保持一致，改了那边要同步这边。
 */

export type TimeBand = "清晨" | "午后" | "傍晚" | "夜晚" | "深夜";

export interface HourStat {
  hour: number;
  plays: number;
  completions: number;
  skips: number;
}

/** 时段词：5-10 清晨 / 11-13 午后 / 14-17 傍晚 / 18-22 夜晚 / 其余深夜（与 dj.rs 一致） */
export function bandOf(hour: number): TimeBand {
  if (hour >= 5 && hour <= 10) return "清晨";
  if (hour >= 11 && hour <= 13) return "午后";
  if (hour >= 14 && hour <= 17) return "傍晚";
  if (hour >= 18 && hour <= 22) return "夜晚";
  return "深夜";
}

const BAND_ORDER: TimeBand[] = ["清晨", "午后", "傍晚", "夜晚", "深夜"];

interface BandAgg {
  plays: number;
  completions: number;
  skips: number;
}

function aggregateByBand(prefs: HourStat[]): Map<TimeBand, BandAgg> {
  const map = new Map<TimeBand, BandAgg>();
  for (const band of BAND_ORDER) map.set(band, { plays: 0, completions: 0, skips: 0 });
  for (const stat of prefs) {
    const agg = map.get(bandOf(stat.hour));
    if (!agg) continue;
    agg.plays += Math.max(0, stat.plays);
    agg.completions += Math.max(0, stat.completions);
    agg.skips += Math.max(0, stat.skips);
  }
  return map;
}

/** 从 24 小时播放画像里提炼几条自然语言洞察；数据不足时返回空数组 */
export function profileInsights(prefs: HourStat[]): string[] {
  const totalPlays = prefs.reduce((sum, s) => sum + Math.max(0, s.plays), 0);
  if (totalPlays === 0) return [];

  const insights: string[] = [];

  // 峰值小时
  const peak = prefs.reduce((best, s) => (s.plays > best.plays ? s : best), prefs[0]);
  if (peak.plays > 0) insights.push(`${peak.hour} 点是你最常听歌的时段`);

  // 分时段完播率最高：把歌听完的时段
  const byBand = aggregateByBand(prefs);
  let bestBand: TimeBand | null = null;
  let bestRate = -1;
  for (const band of BAND_ORDER) {
    const agg = byBand.get(band)!;
    if (agg.plays < 3) continue; // 样本太少不做判断
    const rate = agg.completions / agg.plays;
    if (rate > bestRate) {
      bestRate = rate;
      bestBand = band;
    }
  }
  if (bestBand) insights.push(`你在${bestBand}最常把歌听完`);

  // 跳过率偏高的时段提醒
  for (const band of BAND_ORDER) {
    const agg = byBand.get(band)!;
    if (agg.plays < 3) continue;
    if (agg.skips / agg.plays >= 0.5 && agg.skips >= 2) {
      insights.push(`${band}你常跳过歌曲，也许该换个风格`);
      break; // 只挑最明显的一条，避免刷屏
    }
  }

  return insights;
}
