import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { Track } from "../types/music";
import { tracks } from "./library";
import { queueIndexFor } from "./player";
import { SettingsView } from "../views/Settings";
import {
  pickNextLocal,
  radioEnabled,
  recordSkip,
  recentSkipIds,
  scoreCandidate,
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

  it("点击「关」关闭电台并持久化，点击「开」恢复", () => {
    render(h(SettingsView, null));
    const group = screen.getByRole("radiogroup", { name: "自动电台" });
    fireEvent.click(within(group).getByRole("radio", { name: "关" }));
    expect(radioEnabled.value).toBe(false);
    expect(localStorage.getItem("ome.radio")).toBe("0");
    fireEvent.click(within(group).getByRole("radio", { name: "开" }));
    expect(radioEnabled.value).toBe(true);
    expect(localStorage.getItem("ome.radio")).toBe("1");
  });
});
