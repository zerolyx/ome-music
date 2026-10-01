import { describe, expect, it } from "vitest";
import {
  clampPreampDb,
  EQ_BANDS,
  eqCurvePoints,
  eqResponseDb,
  eqEnabled,
  eqGains,
  eqPreampDb,
  eqPreset,
  estimateEqPeakWithPreampDb,
  estimateEqResponsePeakDb,
  peakingResponseDb,
  registerEqPreamp,
  recommendedEqPreampDb,
  restoreEqSettings,
  setEqEnabled,
  setEqPreampDb,
} from "./equalizer";

describe("EQ 频响曲线数学（RBJ peaking）", () => {
  it("增益为 0 时全频段响应为 0", () => {
    expect(peakingResponseDb(1000, 1000, 0, 0.9)).toBe(0);
    expect(eqResponseDb(500, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });

  it("中心频点响应约等于设定增益", () => {
    expect(peakingResponseDb(1000, 1000, 6, 0.9)).toBeCloseTo(6, 1);
    expect(peakingResponseDb(100, 100, -8, 0.9)).toBeCloseTo(-8, 1);
  });

  it("远离中心频点时响应衰减", () => {
    const off = peakingResponseDb(8000, 1000, 12, 0.9);
    expect(off).toBeLessThan(1);
    expect(off).toBeGreaterThan(-1);
  });

  it("多频段响应线性叠加", () => {
    const gains = [6, -3, 0, 0, 0, 0, 0, 0, 0, 0];
    const expected = peakingResponseDb(62, 31, 6, 0.9) + peakingResponseDb(62, 62, -3, 0.9);
    expect(eqResponseDb(62, gains)).toBeCloseTo(expected, 6);
  });

  it("曲线采样数量正确且首尾对应 20Hz/20kHz", () => {
    const points = eqCurvePoints([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 48);
    expect(points).toHaveLength(48);
  });

  it("把前级衰减限制在 −12 到 0 dB 且按半 dB 步进", () => {
    expect(clampPreampDb(-99)).toBe(-12);
    expect(clampPreampDb(2)).toBe(0);
    expect(clampPreampDb(-3.26)).toBe(-3.5);
  });

  it("按全曲线估算正向峰值，并为提升型预设推荐衰减", () => {
    const bass = [6, 5, 3, 1, 0, 0, 0, 0, 0, 0];
    const peak = estimateEqResponsePeakDb(bass);
    const recommended = recommendedEqPreampDb(bass);
    expect(peak).toBeGreaterThan(5);
    expect(recommended).toBeLessThan(0);
    expect(estimateEqPeakWithPreampDb(bass, recommended, true)).toBeLessThanOrEqual(0.3);
    expect(estimateEqPeakWithPreampDb(bass, recommended, false)).toBe(0);
  });

  it("峰值超过可调衰减范围时保留残余估算", () => {
    const boosted = EQ_BANDS.map(() => 12);
    const recommended = recommendedEqPreampDb(boosted);
    expect(recommended).toBe(-12);
    expect(estimateEqPeakWithPreampDb(boosted, recommended, true)).toBeGreaterThan(0);
  });

  it("EQ 开启时应用前级线性增益，关闭时恢复单位增益旁路", () => {
    const initialEnabled = eqEnabled.value;
    const initialPreampDb = eqPreampDb.value;
    const node = { gain: { value: 1 } } as unknown as GainNode;
    registerEqPreamp(node);
    setEqEnabled(true);
    setEqPreampDb(-6);
    expect(node.gain.value).toBeCloseTo(Math.pow(10, -6 / 20));
    setEqEnabled(false);
    expect(node.gain.value).toBe(1);

    // Restore this module's initial preference state for other tests.
    setEqPreampDb(initialPreampDb);
    setEqEnabled(initialEnabled);
  });
});

describe("restoreEqSettings", () => {
  it("replaces the full EQ snapshot and persists it once as the active state", () => {
    const initial = {
      enabled: eqEnabled.value,
      gains: [...eqGains.value],
      preset: eqPreset.value,
      preampDb: eqPreampDb.value,
    };
    const restored = {
      enabled: true,
      gains: [1, 2, 0, -2, 3, 0, 0, 1, -1, 0],
      preset: "custom" as const,
      preampDb: -3.5,
    };

    expect(restoreEqSettings(restored)).toBe(true);
    expect(eqEnabled.value).toBe(true);
    expect(eqGains.value).toEqual(restored.gains);
    expect(eqPreset.value).toBe("custom");
    expect(eqPreampDb.value).toBe(-3.5);
    expect(JSON.parse(localStorage.getItem("ome.eq.gains") ?? "[]")).toEqual(restored.gains);

    expect(restoreEqSettings({ ...restored, gains: [1] })).toBe(false);
    expect(eqGains.value).toEqual(restored.gains);

    restoreEqSettings({
      enabled: initial.enabled,
      gains: initial.gains,
      preset: initial.preset as "flat" | "pop" | "rock" | "classical" | "vocal" | "bass" | "custom",
      preampDb: initial.preampDb,
    });
  });
});
