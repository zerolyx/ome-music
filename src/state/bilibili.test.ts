import { describe, expect, it } from "vitest";
import type { BilibiliSongDto, DanmakuItemDto } from "../lib/api";
import { bilibiliSongToTrack } from "./bilibili";
import { shuffleCap } from "./danmaku";
import { danmakuColor } from "../components/DanmakuLayer";

describe("bilibiliSongToTrack", () => {
  const song: BilibiliSongDto = {
    id: "bilibili-BV1GK411Ds7u",
    bvid: "BV1GK411Ds7u",
    name: "【洛天依】普通 DISCO",
    artist: "洛天依",
    album: "单曲",
    durationSeconds: 212,
    coverUrl: "https://i0.hdslb.com/cover.jpg",
    plain: true,
  };

  it("映射为 bilibili 源的 Track（id 保留 bilibili- 前缀，sourceId 用干净 bvid）", () => {
    expect(bilibiliSongToTrack(song)).toEqual({
      id: "bilibili-BV1GK411Ds7u",
      title: song.name,
      artist: "洛天依",
      album: "单曲",
      durationSeconds: 212,
      filePath: "",
      source: "bilibili",
      sourceId: "BV1GK411Ds7u",
      unavailableReason: null,
      coverPath: "https://i0.hdslb.com/cover.jpg",
      liked: false,
      playCount: 0,
    });
  });

  it("时长原样透传（后端已给秒）与封面原样透传", () => {
    const track = bilibiliSongToTrack({ ...song, durationSeconds: 305 });
    expect(track.durationSeconds).toBe(305);
    expect(track.coverPath).toBe(song.coverUrl);
  });

  it("封面为空（空串/null）→ coverPath 归一为 null", () => {
    expect(bilibiliSongToTrack({ ...song, coverUrl: "" }).coverPath).toBeNull();
    expect(bilibiliSongToTrack({ ...song, coverUrl: null }).coverPath).toBeNull();
  });

  it("B站曲目全部可播：不产生 VIP 角标", () => {
    const track = bilibiliSongToTrack({ ...song, plain: false });
    expect(track.unavailableReason).toBeNull();
  });
});

describe("shuffleCap", () => {
  const list: DanmakuItemDto[] = Array.from({ length: 150 }, (_, i) => ({
    time: i,
    text: `弹幕${i}`,
    color: 0xffffff,
  }));

  it("超过上限时截断到 120 条", () => {
    expect(shuffleCap(list)).toHaveLength(120);
  });

  it("打乱只换顺序不丢内容（截断集合是原子集）", () => {
    const out = shuffleCap(list);
    const texts = new Set(out.map((item) => item.text));
    expect(texts.size).toBe(120);
    for (const item of out) expect(list.map((d) => d.text)).toContain(item.text);
  });

  it("短于上限时原样保留条数", () => {
    expect(shuffleCap(list.slice(0, 7))).toHaveLength(7);
  });
});

describe("danmakuColor", () => {
  it("0xRRGGBB 整数 → rgb() 字符串", () => {
    expect(danmakuColor(0xffffff)).toBe("rgb(255, 255, 255)");
    expect(danmakuColor(0xff6699)).toBe("rgb(255, 102, 153)");
    expect(danmakuColor(0)).toBe("rgb(0, 0, 0)");
  });

  it("越界 / 非法值回退白色", () => {
    expect(danmakuColor(-5)).toBe("rgb(255, 255, 255)");
    expect(danmakuColor(Number.NaN)).toBe("rgb(255, 255, 255)");
  });
});
