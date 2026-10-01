import { describe, expect, it } from "vitest";
import { assessLyricsCandidate } from "./lyrics-match";

const track = {
  title: "远处的灯",
  artist: "林桥",
  album: "夜行",
  durationSeconds: 202,
};

describe("lyrics candidate assessment", () => {
  it("scores matching title, artist, album, and duration highly", () => {
    const result = assessLyricsCandidate(track, {
      name: "远处的灯",
      artists: "林桥",
      album: "夜行",
      durationMs: 202_000,
    });

    expect(result.score).toBe(100);
    expect(result.level).toBe("high");
    expect(result.reasons).toEqual(expect.arrayContaining(["曲名一致", "艺人一致", "专辑相近", "时长接近"]));
  });

  it("uses punctuation-insensitive matching and neutral missing album data", () => {
    const result = assessLyricsCandidate(track, {
      name: "远处的灯！",
      artists: "林桥",
      album: "",
      durationMs: 203_000,
    });

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("high");
    expect(result.durationDifferenceSeconds).toBe(1);
  });

  it("flags a live version even when title, artist, and duration otherwise match", () => {
    const result = assessLyricsCandidate(track, {
      name: "远处的灯（Live 现场版）",
      artists: "林桥",
      album: "夜行",
      durationMs: 202_000,
    });

    expect(result.versionConflicts).toContain("现场版");
    expect(result.level).toBe("caution");
    expect(result.reasons[0]).toContain("版本标记不同");
  });

  it("does not treat an unknown local artist as a verified artist match", () => {
    const result = assessLyricsCandidate({ ...track, artist: "未知艺人" }, {
      name: track.title,
      artists: "另一位艺人",
      album: "",
      durationMs: 202_000,
    });

    expect(result.score).toBeLessThanOrEqual(74);
    expect(result.level).toBe("review");
    expect(result.reasons).toContain("艺人待核对");
  });

  it("handles missing duration and unrelated candidates without NaN", () => {
    const result = assessLyricsCandidate(track, {
      name: "完全不同的歌曲",
      artists: "无关艺人",
      album: "另一个专辑",
      durationMs: null,
    });

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeLessThan(55);
    expect(result.level).toBe("caution");
    expect(result.durationDifferenceSeconds).toBeNull();
  });
});
