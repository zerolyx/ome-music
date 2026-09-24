import { describe, expect, it } from "vitest";
import {
  parseQrc,
  parseTtml,
  parseTtmlClock,
  qrcToRaw,
  sniffLyricText,
  ttmlToRaw,
  toLrcTimestamp,
} from "./lyricfmt";

describe("sniffLyricText（本地歌词格式嗅探）", () => {
  it("lrc 内容直通", () => {
    expect(sniffLyricText("[00:01.00]你好")).toEqual({ lrc: "[00:01.00]你好" });
  });

  it("qrc 形态（[ms,ms] 行头）走 qrc 解析", () => {
    const qrc = "[1200,3000]<1200,300>你<1500,500>好";
    const parsed = sniffLyricText(qrc);
    expect(parsed.yrc).toContain("(1200,300)你");
    expect(parsed.lrc).toContain("[00:01.20]你好");
  });

  it("TTML 内容走 TTML 解析", () => {
    const ttml = `<?xml version="1.0"?><tt><body><p begin="00:00:01.200">你好</p></body></tt>`;
    const parsed = sniffLyricText(ttml);
    expect(parsed.lrc).toContain("[00:01.20]你好");
  });
});

describe("parseQrc / qrcToRaw", () => {
  const qrc = [
    "[offset:0]",
    "[1200,3000]<1200,300>你<1500,500>好",
    "[5000,2000]<5000,2000>世界",
  ].join("\n");

  it("解析字级时间轴并过滤元数据行", () => {
    const lines = parseQrc(qrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].start).toBeCloseTo(1.2);
    expect(lines[0].end).toBeCloseTo(4.2);
    expect(lines[0].words).toEqual([
      { start: 1.2, end: 1.5, text: "你" },
      { start: 1.5, end: 2.0, text: "好" },
    ]);
  });

  it("合成标准 lrc 文本；yrc 兼容网易云括号风格", () => {
    const raw = qrcToRaw(qrc);
    expect(raw.lrc).toBe("[00:01.20]你好\n[00:05.00]世界");
    expect(raw.yrc).toContain("[1200,3000](1200,300)你");
    expect(raw.yrc).not.toContain("<");
  });
});

describe("parseTtml / ttmlToRaw", () => {
  const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.200" end="00:00:04.200">
        <span begin="00:00:01.200" end="00:00:01.500">你</span>
        <span begin="00:00:01.500" end="00:00:02.000">好</span>
      </p>
      <p begin="6.5s" end="8.5s">纯文本行</p>
    </div>
  </body>
</tt>`;

  it("解析词级 span 与整行时间", () => {
    const { lines, yrc } = parseTtml(ttml);
    expect(lines).toHaveLength(2);
    expect(yrc).toHaveLength(1);
    expect(yrc[0].words).toEqual([
      { start: 1.2, end: 1.5, text: "你" },
      { start: 1.5, end: 2.0, text: "好" },
    ]);
    expect(lines[1]).toEqual({ time: 6.5, text: "纯文本行" });
  });

  it("合成 lrc + yrc 文本", () => {
    const raw = ttmlToRaw(ttml);
    expect(raw.lrc).toBe("[00:01.20]你好\n[00:06.50]纯文本行");
    expect(raw.yrc).toBe("[1200,3000](1200,300)你(1500,500)好");
  });

  it("无词级 span 的 TTML 只出行级（yrc 为 null）", () => {
    const plain = `<tt><body><p begin="00:00:03.000">只有整行</p></body></tt>`;
    const raw = ttmlToRaw(plain);
    expect(raw.lrc).toBe("[00:03.00]只有整行");
    expect(raw.yrc).toBeNull();
  });
});

describe("parseTtmlClock / toLrcTimestamp", () => {
  it("支持 HH:MM:SS.ms / M:SS.ms / 秒后缀", () => {
    expect(parseTtmlClock("00:01:02.500")).toBeCloseTo(62.5);
    expect(parseTtmlClock("01:02.5")).toBeCloseTo(62.5);
    expect(parseTtmlClock("6.5s")).toBeCloseTo(6.5);
    expect(parseTtmlClock(null)).toBeNull();
    expect(parseTtmlClock("abc")).toBeNull();
  });

  it("秒 → [mm:ss.xx]，负数钳为 0", () => {
    expect(toLrcTimestamp(62.5)).toBe("[01:02.50]");
    expect(toLrcTimestamp(0)).toBe("[00:00.00]");
    expect(toLrcTimestamp(-3)).toBe("[00:00.00]");
  });
});
