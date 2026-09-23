import { describe, expect, it } from "vitest";
import { decodeLrcBase64, parseLrc } from "./lyrics";

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

describe("decodeLrcBase64", () => {
  it("UTF-8 中文歌词原样解码", () => {
    const lrc = "[00:01.00]你好，世界";
    expect(decodeLrcBase64(toBase64(new TextEncoder().encode(lrc)))).toBe(lrc);
  });

  it("GBK 编码歌词回退解码", () => {
    // "你好" 的 GBK 双字节
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
    expect(decodeLrcBase64(toBase64(gbk))).toBe("你好");
  });

  it("解码结果可直接进 LRC 解析器", () => {
    const decoded = decodeLrcBase64(toBase64(new TextEncoder().encode("[00:12.50]第一句")));
    const lines = parseLrc(decoded);
    expect(lines).toHaveLength(1);
    expect(lines[0].time).toBeCloseTo(12.5);
    expect(lines[0].text).toBe("第一句");
  });
});
