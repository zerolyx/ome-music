import { describe, expect, it } from "vitest";
import {
  CROSSFADE_MAX_SECONDS,
  crossfadeDurationSeconds,
  crossfadeGainCurves,
  crossfadeGains,
  shouldStartAutomaticCrossfade,
} from "./crossfade";

describe("lightweight crossfade planning", () => {
  it("uses an equal-power curve with exact endpoints and a balanced midpoint", () => {
    const start = crossfadeGains(0);
    const middle = crossfadeGains(0.5);
    const end = crossfadeGains(1);

    expect(start.outgoing).toBe(1);
    expect(start.incoming).toBe(0);
    expect(middle.outgoing).toBeCloseTo(Math.SQRT1_2);
    expect(middle.incoming).toBeCloseTo(Math.SQRT1_2);
    expect(end.outgoing).toBeCloseTo(0);
    expect(end.incoming).toBeCloseTo(1);
  });

  it("caps duration at three seconds and at one quarter of short tracks", () => {
    expect(crossfadeDurationSeconds(180, 220)).toBe(CROSSFADE_MAX_SECONDS);
    expect(crossfadeDurationSeconds(8, 12)).toBe(2);
    expect(crossfadeDurationSeconds(2, 2)).toBe(0.5);
    expect(crossfadeDurationSeconds(0.2, 10)).toBe(0);
  });

  it("shortens the last transition to the remaining playable time", () => {
    expect(crossfadeDurationSeconds(60, 60, 1.4)).toBe(1.4);
    expect(crossfadeDurationSeconds(60, 60, 0.05)).toBe(0);
  });

  it("builds bounded, monotonic curves for Web Audio", () => {
    const curves = crossfadeGainCurves(5);

    expect(curves.outgoing[0]).toBe(1);
    expect(curves.incoming[0]).toBe(0);
    expect(curves.incoming[4]).toBe(1);
    for (let index = 1; index < 5; index += 1) {
      expect(curves.outgoing[index]).toBeLessThanOrEqual(curves.outgoing[index - 1]);
      expect(curves.incoming[index]).toBeGreaterThanOrEqual(curves.incoming[index - 1]);
    }
  });

  it("arms automatic transitions only near the end and inside the last 10%", () => {
    expect(shouldStartAutomaticCrossfade(56, 60)).toBe(false);
    expect(shouldStartAutomaticCrossfade(57, 60)).toBe(true);
    expect(shouldStartAutomaticCrossfade(9, 10)).toBe(true);
    expect(shouldStartAutomaticCrossfade(0, 0)).toBe(false);
    expect(shouldStartAutomaticCrossfade(Number.NaN, 10)).toBe(false);
  });
});
