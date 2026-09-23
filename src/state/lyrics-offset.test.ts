import { describe, expect, it } from "vitest";
import {
  applyOffset,
  getTrackOffset,
  readOffsets,
  setTrackOffset,
  translationFor,
  type LyricLine,
} from "./lyrics";

const line = (time: number, text = ""): LyricLine => ({ time, text });

describe("applyOffset", () => {
  it("正偏移整体后移，负偏移钳到 0", () => {
    expect(applyOffset([line(1), line(3)], 0.5).map((l) => l.time)).toEqual([1.5, 3.5]);
    expect(applyOffset([line(1), line(3)], -2).map((l) => l.time)).toEqual([0, 1]);
  });

  it("零偏移原样返回（引用不变）", () => {
    const lines = [line(1)];
    expect(applyOffset(lines, 0)).toBe(lines);
  });
});

describe("按歌曲记忆的偏移", () => {
  it("set/get/readOffsets 往返；归零自动清键", () => {
    localStorage.removeItem("ome.lyric.offsets");
    expect(getTrackOffset("t1")).toBe(0);
    setTrackOffset("t1", 1.5);
    expect(getTrackOffset("t1")).toBe(1.5);
    setTrackOffset("t2", -2);
    expect(readOffsets()).toEqual({ t1: 1.5, t2: -2 });
    setTrackOffset("t1", 0);
    expect(readOffsets()).toEqual({ t2: -2 });
  });

  it("单向超限被钳制在 ±20s", () => {
    setTrackOffset("t3", 999);
    expect(getTrackOffset("t3")).toBe(20);
    setTrackOffset("t3", -999);
    expect(getTrackOffset("t3")).toBe(-20);
  });

  it("坏 JSON 容错为空表", () => {
    localStorage.setItem("ome.lyric.offsets", "{bad");
    expect(readOffsets()).toEqual({});
  });
});

describe("translationFor", () => {
  const translations = [line(3.9, "hello"), line(8.2, "world")];

  it("取时间戳最近的翻译行", () => {
    expect(translationFor(line(4, "你好"), translations)?.text).toBe("hello");
    expect(translationFor(line(8, "世界"), translations)?.text).toBe("world");
  });

  it("对不齐（>0.6s）返回 null", () => {
    expect(translationFor(line(10), translations)).toBeNull();
  });
});
