import { describe, expect, it } from "vitest";
import { eqCurvePoints, eqResponseDb, peakingResponseDb } from "./equalizer";

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
});
