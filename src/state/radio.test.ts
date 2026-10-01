import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { Track } from "../types/music";
import { tracks } from "./library";
import * as library from "./library";
import * as player from "./player";
import { djConfig } from "./dj";
import { isPlaying, queue, queueIndexFor } from "./player";
import { SettingsView } from "../views/Settings";
import {
  pickNextLocal,
  radioEnabled,
  recordSkip,
  recentSkipIds,
  scoreCandidate,
  genreAffinityScore,
  canStartRadioFromHome,
  startRadioIfIdle,
  setRadioEnabled,
  type ScoreContext,
} from "./radio";

const baseCtx = (overrides: Partial<ScoreContext> = {}): ScoreContext => ({
  hour: 9,
  hourProfile: null,
  recentSkipIds: [],
  ...overrides,
});

describe("scoreCandidate", () => {
  const plain = { id: "a", liked: false, playCount: 0, durationSeconds: 200 };

  it("红心 +3", () => {
    expect(scoreCandidate(plain, baseCtx())).toBe(0);
    expect(scoreCandidate({ ...plain, liked: true }, baseCtx())).toBe(3);
  });

  it("当前时段播放高于平均 +2，低于平均不加分", () => {
    const profile = [
      { hour: 8, plays: 2 },
      { hour: 9, plays: 10 },
    ];
    expect(scoreCandidate(plain, baseCtx({ hourProfile: profile, hour: 9 }))).toBe(2);
    expect(scoreCandidate(plain, baseCtx({ hourProfile: profile, hour: 8 }))).toBe(0);
  });

  it("无时段画像或空画像不加分", () => {
    expect(scoreCandidate(plain, baseCtx({ hourProfile: [{ hour: 9, plays: 5 }], hour: 9 }))).toBe(0);
  });

  it("近 20 分钟被跳过 −4（按 id 比对）", () => {
    expect(scoreCandidate(plain, baseCtx({ recentSkipIds: ["a"] }))).toBe(-4);
    expect(scoreCandidate(plain, baseCtx({ recentSkipIds: ["b"] }))).toBe(0);
    expect(scoreCandidate({ ...plain, id: undefined }, baseCtx({ recentSkipIds: ["a"] }))).toBe(0);
  });

  it("播放超过 20 次 −1（听腻），恰好 20 次不扣", () => {
    expect(scoreCandidate({ ...plain, playCount: 20 }, baseCtx())).toBe(0);
    expect(scoreCandidate({ ...plain, playCount: 21 }, baseCtx())).toBe(-1);
  });

  it("多因子叠加：红心 + 时段 + 跳过 + 听腻", () => {
    const profile = [{ hour: 9, plays: 9 }, { hour: 8, plays: 1 }];
    const score = scoreCandidate(
      { id: "a", liked: true, playCount: 30, durationSeconds: 200 },
      baseCtx({ hourProfile: profile, recentSkipIds: ["a"] })
    );
    expect(score).toBe(3 + 2 - 4 - 1);
  });
});

describe("时段 × 曲风画像", () => {
  const preferences = [
    { genre: "Ambient", plays: 8, completions: 4, skips: 0, likes: 1, unlikes: 0 },
    { genre: "Metal", plays: 8, completions: 0, skips: 5, likes: 0, unlikes: 0 },
  ];

  it("归一化标签后提升常听且常听完的风格、降低常跳过的风格", () => {
    expect(genreAffinityScore([" ambient "], preferences)).toBeGreaterThan(1);
    expect(genreAffinityScore(["METAL"], preferences)).toBeLessThan(0);
    expect(genreAffinityScore(["未知风格"], preferences)).toBe(0);
  });

  it("历史很少时渐进加权，并且只使用当前小时的风格画像", () => {
    const sparse = [{ genre: "Ambient", plays: 1, completions: 0, skips: 0, likes: 0, unlikes: 0 }];
    const sparseScore = genreAffinityScore(["ambient"], sparse);
    expect(sparseScore).toBeGreaterThan(0);
    expect(sparseScore).toBeLessThan(0.3);
    expect(scoreCandidate(
      { id: "a", liked: false, playCount: 0, durationSeconds: 180, genres: ["ambient"] },
      baseCtx({ hourProfile: [{ hour: 8, plays: 0, genrePreferences: preferences }] }),
    )).toBe(0);
  });
});

describe("跳过记忆", () => {
  it("记录后能在 recentSkipIds 中查到", () => {
    recordSkip("t1");
    expect(recentSkipIds()).toContain("t1");
    expect(recentSkipIds()).not.toContain("t2");
  });
});

describe("radioEnabled 持久化", () => {
  it("写入 localStorage「ome.radio」，默认开", () => {
    expect(radioEnabled.value).toBe(true);
    setRadioEnabled(false);
    expect(radioEnabled.value).toBe(false);
    expect(localStorage.getItem("ome.radio")).toBe("0");
    setRadioEnabled(true);
    expect(radioEnabled.value).toBe(true);
    expect(localStorage.getItem("ome.radio")).toBe("1");
  });
});

describe("DJ 离线时的本地电台", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queue.value = [];
    tracks.value = [];
    isPlaying.value = false;
    djConfig.value = null;
    radioEnabled.value = true;
  });

  it("首页入口只在电台开启、有曲目且播放器空闲时出现", () => {
    expect(canStartRadioFromHome(true, true, false, 0)).toBe(true);
    expect(canStartRadioFromHome(false, true, false, 0)).toBe(false);
    expect(canStartRadioFromHome(true, false, false, 0)).toBe(false);
    expect(canStartRadioFromHome(true, true, true, 0)).toBe(false);
    expect(canStartRadioFromHome(true, true, false, 1)).toBe(false);
  });

  it("没有配置 DJ 时仍能从本地曲库启动画像电台", async () => {
    const track = makeTrack("offline-radio");
    tracks.value = [track];
    djConfig.value = {
      configured: false,
      providerName: "",
      baseUrl: "",
      model: "",
      maskedKey: "",
    };
    vi.spyOn(library, "refreshTracks").mockResolvedValue(undefined);
    vi.spyOn(player, "readLastPlayback").mockReturnValue(null);
    const play = vi.spyOn(player, "playWithRadioIntro").mockResolvedValue(undefined);

    await startRadioIfIdle();

    expect(queue.value).toEqual([track]);
    expect(play).toHaveBeenCalledWith(track, 0);
  });
});

const makeTrack = (id: string, over: Partial<Track> = {}): Track => ({
  id,
  title: `曲目${id}`,
  artist: "歌手",
  album: "专辑",
  durationSeconds: 200,
  filePath: `${id}.mp3`,
  source: "local",
  liked: false,
  playCount: 0,
  ...over,
});

describe("pickNextLocal", () => {
  beforeEach(() => {
    tracks.value = [];
  });

  it("曲库为空返回 null", async () => {
    await expect(pickNextLocal(null)).resolves.toBeNull();
  });

  it("只剩当前曲目时返回 null", async () => {
    tracks.value = [makeTrack("a")];
    await expect(pickNextLocal("a")).resolves.toBeNull();
  });

  it("排除当前播放曲目", async () => {
    tracks.value = [makeTrack("a"), makeTrack("b")];
    await expect(pickNextLocal("a")).resolves.toMatchObject({ id: "b" });
  });

  it("优先红心曲目", async () => {
    tracks.value = [makeTrack("a"), makeTrack("b", { liked: true })];
    await expect(pickNextLocal(null)).resolves.toMatchObject({ id: "b" });
  });

  it("刚被跳过的曲目降权", async () => {
    tracks.value = [makeTrack("a"), makeTrack("b")];
    recordSkip("a");
    await expect(pickNextLocal(null)).resolves.toMatchObject({ id: "b" });
  });
});

describe("queueIndexFor", () => {
  const queueTracks = [makeTrack("a"), makeTrack("b")];

  it("已在队列返回原下标", () => {
    expect(queueIndexFor(queueTracks, makeTrack("a"))).toBe(0);
    expect(queueIndexFor(queueTracks, makeTrack("b"))).toBe(1);
  });

  it("不在队列返回追加后的队尾下标", () => {
    expect(queueIndexFor(queueTracks, makeTrack("c"))).toBe(2);
  });
});

describe("设置页 · 自动电台开关", () => {
  afterEach(cleanup);

  it("播放区开关切换电台并持久化", () => {
    render(h(SettingsView, null));
    // 自动电台已收拢到「播放」分区：播放卡默认展开
    const toggle = screen.getByRole("switch", { name: "自动电台" });
    fireEvent.click(toggle);
    expect(radioEnabled.value).toBe(false);
    expect(localStorage.getItem("ome.radio")).toBe("0");
    fireEvent.click(screen.getByRole("switch", { name: "自动电台" }));
    expect(radioEnabled.value).toBe(true);
    expect(localStorage.getItem("ome.radio")).toBe("1");
  });
});
