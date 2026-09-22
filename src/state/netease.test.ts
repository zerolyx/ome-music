import { describe, expect, it } from "vitest";
import type { NeteaseSong, Track } from "../types/music";
import { neteaseNumericId, neteaseSongToTrack, qrPhaseFromCode } from "./netease";

describe("qrPhaseFromCode", () => {
  it("801 → 等待扫描", () => {
    expect(qrPhaseFromCode(801)).toBe("waiting");
  });

  it("802 → 已扫描", () => {
    expect(qrPhaseFromCode(802)).toBe("scanned");
  });

  it("803 → 成功", () => {
    expect(qrPhaseFromCode(803)).toBe("success");
  });

  it("800 → 已过期", () => {
    expect(qrPhaseFromCode(800)).toBe("expired");
  });

  it("未知 code → 视为等待", () => {
    expect(qrPhaseFromCode(999)).toBe("waiting");
  });
});

describe("neteaseSongToTrack", () => {
  const song: NeteaseSong = {
    id: 186016,
    name: "晴天",
    artists: "周杰伦",
    album: "叶惠美",
    durationMs: 269000,
    fee: 8,
    plain: true,
  };

  it("映射为 netease 源的 Track（id 加前缀防碰撞，时长换算秒）", () => {
    expect(neteaseSongToTrack(song)).toEqual({
      id: "netease-186016",
      title: "晴天",
      artist: "周杰伦",
      album: "叶惠美",
      durationSeconds: 269,
      filePath: "",
      source: "netease",
      sourceId: "186016",
      unavailableReason: null,
      coverPath: null,
      liked: false,
      playCount: 0,
    });
  });

  it("非 plain（VIP）标记 unavailableReason 供 UI 展示角标", () => {
    const track = neteaseSongToTrack({ ...song, fee: 1, plain: false });
    expect(track.unavailableReason).toBe("vip");
  });
});

describe("neteaseNumericId", () => {
  it("从 netease- 前缀 id 提取数字 id", () => {
    expect(neteaseNumericId({ id: "netease-186016" } as Track)).toBe(186016);
  });

  it("非 netease id 返回 NaN", () => {
    expect(Number.isNaN(neteaseNumericId({ id: "local-1" } as Track))).toBe(true);
  });
});
