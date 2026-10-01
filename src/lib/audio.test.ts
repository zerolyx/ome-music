import { afterEach, describe, expect, it } from "vitest";
import { proxyableRemoteHost, proxyableRemoteUrl, toPlayableSrc } from "./audio";

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

describe("remote library playback source", () => {
  afterEach(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));

  it("uses an opaque local proxy URL", () => {
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke: () => undefined });
    expect(toPlayableSrc({
      id: "subsonic:track-1",
      source: "subsonic",
      sourceId: "track/1 ?",
      title: "Track",
      artist: "Artist",
      album: "Album",
      durationSeconds: 180,
      filePath: "",
      liked: false,
      playCount: 0,
    })).toBe("http://ome-media.localhost/subsonic?id=track%2F1%20%3F");
  });

  it("keeps Emby audio behind the authenticated local media proxy", () => {
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke: () => undefined });
    expect(toPlayableSrc({
      id: "emby:01234567-89ab-cdef-0123-456789abcdef",
      source: "emby",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Track",
      artist: "Artist",
      album: "Album",
      durationSeconds: 180,
      filePath: "",
      liked: false,
      playCount: 0,
    })).toBe("http://ome-media.localhost/emby?id=01234567-89ab-cdef-0123-456789abcdef");
  });

  it("routes WebDAV playback through an opaque native media id", () => {
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke: () => undefined });
    expect(toPlayableSrc({
      id: "webdav:opaque-entry",
      source: "webdav",
      sourceId: "opaque-entry",
      title: "Track",
      artist: "",
      album: "Album",
      durationSeconds: 0,
      filePath: "",
      liked: false,
      playCount: 0,
    })).toBe("http://ome-media.localhost/webdav?id=opaque-entry");
  });

  it("routes SMB playback through an opaque native media id", () => {
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke: () => undefined });
    expect(toPlayableSrc({
      id: "smb:opaque-entry",
      source: "smb",
      sourceId: "opaque-entry",
      title: "Track",
      artist: "",
      album: "Album",
      durationSeconds: 0,
      filePath: "",
      liked: false,
      playCount: 0,
    })).toBe("http://ome-media.localhost/smb?id=opaque-entry");
  });
});
