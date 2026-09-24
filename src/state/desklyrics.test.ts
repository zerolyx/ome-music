import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDeskSnapshot,
  cycleDeskSize,
  deskLineProgress,
  deskPositionAt,
  deskSizeFor,
  readDeskRect,
  readDeskSizeId,
  saveDeskSizeId,
  deskLyricsOpen,
  toggleDeskLyrics,
  type DeskSnapshotInput,
} from "./desklyrics";
import type { LyricLine, YrcLine } from "./lyrics";

const lrcLines: LyricLine[] = [
  { time: 10, text: "第一句" },
  { time: 20, text: "第二句" },
  { time: 30, text: "第三句" },
];
const tlyricLines: LyricLine[] = [{ time: 20, text: "second line" }];
const yrcData: YrcLine[] = [
  {
    start: 10,
    end: 15,
    words: [
      { start: 10, end: 12, text: "你好" },
      { start: 12, end: 15, text: "世界" },
    ],
  },
  { start: 20, end: 25, words: [{ start: 20, end: 25, text: "再见" }] },
];

function makeInput(overrides: Partial<DeskSnapshotInput> = {}): DeskSnapshotInput {
  return {
    track: { id: "t1", title: "测试歌", artist: "测试者" },
    lyricTrackId: "t1",
    lyricLines: lrcLines,
    yrcLines: [],
    tlyricLines: tlyricLines,
    playing: true,
    position: 21,
    now: 1000,
    ...overrides,
  };
}

describe("buildDeskSnapshot（主窗→歌词窗跨窗协议）", () => {
  it("无曲目：track 为 null，无行", () => {
    const snap = buildDeskSnapshot(makeInput({ track: null }));
    expect(snap.track).toBeNull();
    expect(snap.line).toBeNull();
    expect(snap.next).toBeNull();
  });

  it("lrc：当前行 + 翻译 + 下一行；行尾取下一行时间", () => {
    const snap = buildDeskSnapshot(makeInput());
    expect(snap.line).toEqual({ text: "第二句", start: 20, end: 30 });
    expect(snap.translation).toBe("second line");
    expect(snap.next).toBe("第三句");
    expect(snap.words).toBeNull();
  });

  it("前奏期：无当前行，预览第一句", () => {
    const snap = buildDeskSnapshot(makeInput({ position: 5 }));
    expect(snap.line).toBeNull();
    expect(snap.next).toBe("第一句");
  });

  it("最后一行：行尾按 +8s 估算，不再预览下一行", () => {
    const snap = buildDeskSnapshot(makeInput({ position: 35 }));
    expect(snap.line).toEqual({ text: "第三句", start: 30, end: 38 });
    expect(snap.next).toBeNull();
  });

  it("yrc：行文本拼字 + 字级时间轴透传", () => {
    const snap = buildDeskSnapshot(
      makeInput({ position: 21, lyricLines: [], yrcLines: yrcData }),
    );
    expect(snap.line).toEqual({ text: "再见", start: 20, end: 25 });
    expect(snap.words).toEqual([{ text: "再见", start: 20, end: 25 }]);
    expect(snap.next).toBeNull();
  });

  it("yrc 前奏期：预览首句拼字", () => {
    const snap = buildDeskSnapshot(
      makeInput({ position: 5, lyricLines: [], yrcLines: yrcData }),
    );
    expect(snap.line).toBeNull();
    expect(snap.next).toBe("你好世界");
  });

  it("歌词还挂在上个曲目：pending 加载态", () => {
    const snap = buildDeskSnapshot(makeInput({ lyricTrackId: "other" }));
    expect(snap.pending).toBe(true);
    expect(snap.line).toBeNull();
  });

  it("无任何歌词：无 pending，无行", () => {
    const snap = buildDeskSnapshot(
      makeInput({ lyricLines: [], tlyricLines: [] }),
    );
    expect(snap.pending).toBe(false);
    expect(snap.line).toBeNull();
  });

  it("暂停帧：sentAt 恒 0，同参数快照字节级一致（发布去重依据）", () => {
    const a = buildDeskSnapshot(makeInput({ playing: false }));
    const b = buildDeskSnapshot(makeInput({ playing: false, now: 9999 }));
    expect(a.sentAt).toBe(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("deskPositionAt / deskLineProgress（歌词窗本地插值）", () => {
  it("播放中按墙钟差插值", () => {
    const snap = buildDeskSnapshot(makeInput({ position: 20, now: 1000 }));
    expect(deskPositionAt(snap, 2500)).toBeCloseTo(21.5);
  });

  it("暂停不漂移", () => {
    const snap = buildDeskSnapshot(makeInput({ playing: false, position: 20 }));
    expect(deskPositionAt(snap, Date.now())).toBe(20);
  });

  it("行进度钳制在 0-1；行时长过短按 0.5s 兜底", () => {
    expect(deskLineProgress({ text: "x", start: 20, end: 30 }, 25)).toBe(0.5);
    expect(deskLineProgress({ text: "x", start: 20, end: 30 }, 5)).toBe(0);
    expect(deskLineProgress({ text: "x", start: 20, end: 30 }, 99)).toBe(1);
    expect(deskLineProgress({ text: "x", start: 0, end: 0.2 }, 0.1)).toBe(0.2);
  });
});

describe("字号与窗口位置记忆", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("字号循环 s→m→l→s；非法存储回退中档", () => {
    expect(cycleDeskSize("s")).toBe("m");
    expect(cycleDeskSize("m")).toBe("l");
    expect(cycleDeskSize("l")).toBe("s");
    localStorage.setItem("ome.desklyrics.size", "bogus");
    expect(readDeskSizeId()).toBe("m");
    saveDeskSizeId("l");
    expect(readDeskSizeId()).toBe("l");
    expect(deskSizeFor("l").label).toBe("大");
  });

  it("位置记忆：合法存取，坏数据丢弃", () => {
    expect(readDeskRect()).toBeNull();
    localStorage.setItem("ome.desklyrics.rect", JSON.stringify({ x: 100, y: 200 }));
    expect(readDeskRect()).toEqual({ x: 100, y: 200 });
    localStorage.setItem("ome.desklyrics.rect", JSON.stringify({ x: "a", y: null }));
    expect(readDeskRect()).toBeNull();
    localStorage.setItem("ome.desklyrics.rect", "{broken");
    expect(readDeskRect()).toBeNull();
  });
});

describe("开关守卫", () => {
  it("非 Tauri 环境（测试/浏览器）不创建窗口、状态不翻转", () => {
    localStorage.removeItem("ome.desklyrics.on");
    deskLyricsOpen.value = false;
    toggleDeskLyrics();
    expect(deskLyricsOpen.value).toBe(false);
    expect(localStorage.getItem("ome.desklyrics.on")).toBeNull();
  });
});
