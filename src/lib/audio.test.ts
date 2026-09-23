import { describe, expect, it } from "vitest";
import { proxyableRemoteHost, proxyableRemoteUrl } from "./audio";

describe("proxyableRemoteHost", () => {
  it("命中白名单后缀", () => {
    expect(proxyableRemoteHost("m701.music.126.net")).toBe(true);
    expect(proxyableRemoteHost("music.126.net")).toBe(true);
    expect(proxyableRemoteHost("upos-sz-mirror08c.bilivideo.com")).toBe(true);
    expect(proxyableRemoteHost("i0.hdslb.com")).toBe(true);
  });

  it("拒绝相似域 / 伪装域 / 空串", () => {
    expect(proxyableRemoteHost("evil126.net")).toBe(false);
    expect(proxyableRemoteHost("bilivideo.com.evil.com")).toBe(false);
    expect(proxyableRemoteHost("api.bilibili.com")).toBe(false);
    expect(proxyableRemoteHost("")).toBe(false);
  });
});

describe("proxyableRemoteUrl", () => {
  it("仅允许 https 白名单", () => {
    expect(proxyableRemoteUrl("https://m8.music.126.net/a.mp3")).toBe(true);
    expect(proxyableRemoteUrl("http://m8.music.126.net/a.mp3")).toBe(false);
    expect(proxyableRemoteUrl("https://evil.com/a.mp3")).toBe(false);
    expect(proxyableRemoteUrl("not a url")).toBe(false);
  });
});
