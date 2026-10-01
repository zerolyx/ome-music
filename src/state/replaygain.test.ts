import { describe, expect, it } from "vitest";
import type { Track } from "../types/music";
import {
  registerReplayGainNode,
  replayGainLinearGain,
  setActiveReplayGainDeck,
  setReplayGainEnabled,
  setReplayGainNodeTrack,
  type ReplayGainSettings,
} from "./replaygain";

const settings = (overrides: Partial<ReplayGainSettings> = {}): ReplayGainSettings => ({
  enabled: true,
  mode: "track",
  preventClipping: true,
  preampDb: 0,
  ...overrides,
});

const track = (overrides: Partial<Track> = {}): Track => ({
  id: "local-track",
  title: "Track",
  artist: "Artist",
  album: "Album",
  durationSeconds: 180,
  filePath: "track.flac",
  source: "local",
  liked: false,
  playCount: 0,
  ...overrides,
});

describe("ReplayGain 播放增益", () => {
  it("关闭时、本地标签缺失时和在线曲目保持单位增益（前级仍可手动调整）", () => {
    expect(replayGainLinearGain(track({ replayGainTrackGainDb: 8 }), settings({ enabled: false }))).toBe(1);
    expect(replayGainLinearGain(track(), settings())).toBe(1);
    expect(replayGainLinearGain(track({
      source: "netease",
      replayGainTrackGainDb: 8,
    }), settings())).toBe(1);
    expect(replayGainLinearGain(track(), settings({ preampDb: 3 }))).toBeCloseTo(10 ** (3 / 20));
  });

  it("选择曲目或专辑增益，专辑缺失时回退到曲目增益", () => {
    const tagged = track({ replayGainTrackGainDb: -4, replayGainAlbumGainDb: -8 });
    expect(replayGainLinearGain(tagged, settings())).toBeCloseTo(10 ** (-4 / 20));
    expect(replayGainLinearGain(tagged, settings({ mode: "album" }))).toBeCloseTo(10 ** (-8 / 20));
    expect(replayGainLinearGain(track({ replayGainTrackGainDb: -4 }), settings({ mode: "album" })))
      .toBeCloseTo(10 ** (-4 / 20));
  });

  it("应用前级并根据对应峰值标签限制输出", () => {
    const tagged = track({
      replayGainTrackGainDb: 9,
      replayGainAlbumGainDb: 3,
      replayGainTrackPeak: 0.5,
      replayGainAlbumPeak: 0.25,
    });
    expect(replayGainLinearGain(tagged, settings({ preampDb: 2 }))).toBeCloseTo(10 ** (6 / 20));
    expect(replayGainLinearGain(tagged, settings({
      mode: "album",
      preampDb: 12,
    }))).toBeCloseTo(4);
    expect(replayGainLinearGain(tagged, settings({ preampDb: 12, preventClipping: false })))
      .toBeCloseTo(10 ** (21 / 20));
  });

  it("双 deck 淡变期间分别保留各自曲目的响度增益", () => {
    const primary = { gain: { value: 1 } } as unknown as GainNode;
    const secondary = { gain: { value: 1 } } as unknown as GainNode;
    registerReplayGainNode(primary, "primary");
    registerReplayGainNode(secondary, "secondary");
    setReplayGainEnabled(true);
    setReplayGainNodeTrack("primary", track({ replayGainTrackGainDb: -6 }));
    setReplayGainNodeTrack("secondary", track({ replayGainTrackGainDb: 6 }));

    expect(primary.gain.value).toBeCloseTo(10 ** (-6 / 20));
    expect(secondary.gain.value).toBeCloseTo(10 ** (6 / 20));

    setActiveReplayGainDeck("secondary");
    setReplayGainNodeTrack("secondary", track({ replayGainTrackGainDb: -3 }));
    expect(primary.gain.value).toBeCloseTo(10 ** (-6 / 20));
    expect(secondary.gain.value).toBeCloseTo(10 ** (-3 / 20));

    setReplayGainEnabled(false);
  });
});
