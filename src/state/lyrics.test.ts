import { describe, expect, it, vi } from "vitest";
import { getSavedTrackLyrics, jellyfinLyrics, localLyric, neteaseSearch, subsonicLyrics } from "../lib/api";
import { clearJellyfinLyricCache, clearSubsonicLyricCache, decodeLrcBase64, lyricsTextFromRaw, lyricLines, lyricTrackId, loadLyricFor, parseLrc, parseLocalLyricPayload, rawLyricsFromSavedTrack, tlyricLines, yrcLines } from "./lyrics";

vi.mock("../lib/api", () => ({
  getSavedTrackLyrics: vi.fn(),
  jellyfinLyrics: vi.fn(),
  localLyric: vi.fn(),
  neteaseLyric: vi.fn(),
  neteaseSearch: vi.fn(),
  subsonicLyrics: vi.fn(),
}));

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

describe("parseLocalLyricPayload", () => {
  it("解码本地主歌词与 WebVTT 翻译 sidecar", () => {
    const payload = {
      lrc: toBase64(new TextEncoder().encode("[00:01.00]你好")),
      tlyric: toBase64(new TextEncoder().encode("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello")),
    };
    expect(parseLocalLyricPayload(payload)).toEqual({
      lrc: "[00:01.00]你好",
      tlyric: "[00:01.00]hello",
    });
  });

  it("拒绝无效主歌词并忽略无效翻译", () => {
    expect(parseLocalLyricPayload({
      lrc: toBase64(new TextEncoder().encode("没有时间轴")),
      tlyric: null,
    })).toBeNull();
    expect(parseLocalLyricPayload({
      lrc: toBase64(new TextEncoder().encode("[00:01.00]你好")),
      tlyric: toBase64(new TextEncoder().encode("空翻译")),
    })).toEqual({ lrc: "[00:01.00]你好", tlyric: null });
  });
});

describe("lyricsTextFromRaw", () => {
  it("keeps timed main lyrics and excludes translation and romanization", () => {
    expect(lyricsTextFromRaw({
      lrc: "[00:01.00]主歌词",
      tlyric: "[00:01.00]翻译",
      rlyric: "[00:01.00]romaji",
    })).toBe("[00:01.00]主歌词");
  });

  it("uses plain main lyrics when no timed main lyrics are available", () => {
    expect(lyricsTextFromRaw({ lrc: "", plainLyrics: "第一行\n第二行" })).toBe("第一行\n第二行");
  });

  it("normalizes AMLL TTML into the shared LRC lyric path", () => {
    expect(lyricsTextFromRaw({
      lrc: "",
      ttml: "<tt><body><div><p begin=\"00:00:01.230\" end=\"00:00:02.000\">AMLL 主歌词</p></div></body></tt>",
    })).toBe("[00:01.23]AMLL 主歌词");
  });

  it("normalizes QQ Music QRC into the shared LRC lyric path", () => {
    expect(lyricsTextFromRaw({
      lrc: "",
      qrc: "[1000,2000]<1000,500>QQ<1500,500> 主歌词",
      tlyric: "[00:01.00]翻译",
      rlyric: "[00:01.00]romaji",
    })).toBe("[00:01.00]QQ 主歌词");
  });
});

describe("rawLyricsFromSavedTrack", () => {
  it("restores saved provider formats and subtitles for the shared playback parser", () => {
    const raw = rawLyricsFromSavedTrack({
      trackId: "local:test",
      provider: "qqmusic",
      providerId: "123",
      title: "测试曲目",
      artist: "测试艺人",
      album: null,
      savedAt: "2026-09-25T00:00:00Z",
      rawLyrics: {
        lrc: "",
        qrc: "[1000,1000]<1000,1000>主歌词",
        tlyric: "[00:01.00]翻译",
        rlyric: "[00:01.00]romanization",
      },
    });
    expect(raw?.qrc).toBe("[1000,1000]<1000,1000>主歌词");
    expect(raw?.tlyric).toBe("[00:01.00]翻译");
    expect(raw?.rlyric).toBe("[00:01.00]romanization");
    expect(lyricsTextFromRaw(raw)).toBe("[00:01.00]主歌词");
  });

  it("ignores missing or empty saved lyric payloads", () => {
    expect(rawLyricsFromSavedTrack(null)).toBeNull();
    expect(rawLyricsFromSavedTrack({
      trackId: "local:test",
      provider: "lrclib",
      providerId: "123",
      title: "测试曲目",
      artist: "测试艺人",
      album: null,
      savedAt: "2026-09-25T00:00:00Z",
      rawLyrics: { lrc: "" },
    })).toBeNull();
  });
});

describe("loadLyricFor saved local lyric fallback", () => {
  it("uses a saved candidate after local files and before online rematching", async () => {
    vi.mocked(localLyric).mockResolvedValue(null);
    vi.mocked(getSavedTrackLyrics).mockResolvedValue({
      trackId: "local:saved",
      provider: "lrclib",
      providerId: "123",
      title: "已保存曲目",
      artist: "本地艺人",
      album: null,
      rawLyrics: { lrc: "[00:02.00]数据库歌词" },
      savedAt: "2026-09-25T00:00:00Z",
    });
    await loadLyricFor({
      id: "local:saved",
      title: "已保存曲目",
      artist: "本地艺人",
      album: "",
      durationSeconds: 120,
      filePath: "D:/Music/saved.mp3",
      source: "local",
      liked: false,
      playCount: 0,
    });

    expect(localLyric).toHaveBeenCalledWith("local:saved");
    expect(getSavedTrackLyrics).toHaveBeenCalledWith("local:saved");
    expect(neteaseSearch).not.toHaveBeenCalled();
    expect(lyricLines.value).toEqual([{ time: 2, text: "数据库歌词" }]);
  });
});

describe("loadLyricFor Subsonic lyrics", () => {
  const remoteTrack = {
    id: "subsonic:server-track-lyrics",
    sourceId: "server-track-lyrics",
    title: "远程曲目",
    artist: "远程艺人",
    album: "远程专辑",
    durationSeconds: 180,
    filePath: "",
    source: "subsonic" as const,
    liked: false,
    playCount: 0,
  };

  it("uses server lyrics, translation, pronunciation and karaoke timing before NetEase matching", async () => {
    vi.mocked(subsonicLyrics).mockResolvedValue({
      lrc: "[00:01.250]远程服务器歌词",
      yrc: "[1250,1000](1250,500)远程(1750,500)歌词",
      tlyric: "[00:01.250]server lyrics",
      rlyric: "[00:01.250]yuan cheng",
      plainLyrics: null,
    });

    await loadLyricFor(remoteTrack);

    expect(subsonicLyrics).toHaveBeenCalledWith("server-track-lyrics");
    expect(neteaseSearch).not.toHaveBeenCalled();
    expect(lyricTrackId.value).toBe(remoteTrack.id);
    expect(lyricLines.value).toEqual([{ time: 1.25, text: "远程服务器歌词" }]);
    expect(yrcLines.value[0].words.map(({ text }) => text)).toEqual(["远程", "歌词"]);
    expect(tlyricLines.value).toEqual([{ time: 1.25, text: "server lyrics" }]);
  });

  it("falls back to the existing online match when a server has no songLyrics response", async () => {
    vi.mocked(subsonicLyrics).mockResolvedValue(null);
    vi.mocked(neteaseSearch).mockResolvedValue([]);

    await loadLyricFor({ ...remoteTrack, id: "subsonic:missing-lyrics" });

    expect(subsonicLyrics).toHaveBeenCalledWith("server-track-lyrics");
    expect(neteaseSearch).toHaveBeenCalledWith("远程曲目 远程艺人", 5);
    expect(lyricTrackId.value).toBeNull();
  });

  it("ignores a late server response after playback moves away", async () => {
    let resolveLyrics: ((lyrics: Awaited<ReturnType<typeof subsonicLyrics>>) => void) | undefined;
    vi.mocked(subsonicLyrics).mockImplementation(() => new Promise((resolve) => {
      resolveLyrics = resolve;
    }));
    const pending = loadLyricFor({ ...remoteTrack, id: "subsonic:late-response" });
    await loadLyricFor(null);
    resolveLyrics?.({ lrc: "[00:01.000]旧曲歌词", yrc: null, tlyric: null, rlyric: null, plainLyrics: null });
    await pending;

    expect(lyricTrackId.value).toBeNull();
    expect(lyricLines.value).toEqual([]);
  });

  it("does not retain an in-flight response after the remote server session changes", async () => {
    vi.clearAllMocks();
    let resolveOldSession: ((lyrics: Awaited<ReturnType<typeof subsonicLyrics>>) => void) | undefined;
    vi.mocked(subsonicLyrics).mockImplementationOnce(() => new Promise((resolve) => {
      resolveOldSession = resolve;
    }));
    const track = { ...remoteTrack, id: "subsonic:session-change" };
    const pending = loadLyricFor(track);
    clearSubsonicLyricCache();
    resolveOldSession?.({ lrc: "[00:01.000]旧服务器歌词", yrc: null, tlyric: null, rlyric: null, plainLyrics: null });
    await pending;

    vi.mocked(subsonicLyrics).mockResolvedValue({
      lrc: "[00:02.000]新服务器歌词",
      yrc: null,
      tlyric: null,
      rlyric: null,
      plainLyrics: null,
    });
    await loadLyricFor(track);

    expect(subsonicLyrics).toHaveBeenCalledTimes(2);
    expect(lyricLines.value).toEqual([{ time: 2, text: "新服务器歌词" }]);
  });
});

describe("loadLyricFor Jellyfin lyrics", () => {
  const remoteTrack = {
    id: "jellyfin:01234567-89ab-cdef-0123-456789abcdef",
    sourceId: "01234567-89ab-cdef-0123-456789abcdef",
    title: "Jellyfin 曲目",
    artist: "远程艺人",
    album: "远程专辑",
    durationSeconds: 180,
    filePath: "",
    source: "jellyfin" as const,
    liked: false,
    playCount: 0,
  };

  it("uses the server's synced and word-level lyrics before online matching", async () => {
    vi.mocked(jellyfinLyrics).mockResolvedValue({
      lrc: "[00:01.00]Jellyfin 主歌词",
      yrc: "[1000,1000](1000,500)Jellyfin (1500,500)主歌词",
      plainLyrics: null,
    });

    await loadLyricFor(remoteTrack);

    expect(jellyfinLyrics).toHaveBeenCalledWith(remoteTrack.sourceId);
    expect(neteaseSearch).not.toHaveBeenCalled();
    expect(lyricTrackId.value).toBe(remoteTrack.id);
    expect(lyricLines.value).toEqual([{ time: 1, text: "Jellyfin 主歌词" }]);
    expect(yrcLines.value[0].words.map(({ text }) => text)).toEqual(["Jellyfin ", "主歌词"]);
  });

  it("falls back to online matching when the server has no native lyrics", async () => {
    vi.mocked(jellyfinLyrics).mockResolvedValue(null);
    vi.mocked(neteaseSearch).mockResolvedValue([]);

    await loadLyricFor({ ...remoteTrack, id: "jellyfin:no-lyrics" });

    expect(jellyfinLyrics).toHaveBeenCalledWith(remoteTrack.sourceId);
    expect(neteaseSearch).toHaveBeenCalledWith("Jellyfin 曲目 远程艺人", 5);
    expect(lyricTrackId.value).toBeNull();
  });

  it("ignores late lyrics from a previous Jellyfin session", async () => {
    vi.clearAllMocks();
    let resolveLyrics: ((lyrics: Awaited<ReturnType<typeof jellyfinLyrics>>) => void) | undefined;
    vi.mocked(jellyfinLyrics).mockImplementationOnce(() => new Promise((resolve) => {
      resolveLyrics = resolve;
    }));
    const track = { ...remoteTrack, id: "jellyfin:session-change" };
    const pending = loadLyricFor(track);
    clearJellyfinLyricCache();
    resolveLyrics?.({ lrc: "[00:01.00]旧会话歌词", yrc: null, plainLyrics: null });
    await pending;

    vi.mocked(jellyfinLyrics).mockResolvedValue({
      lrc: "[00:02.00]新会话歌词",
      yrc: null,
      plainLyrics: null,
    });
    await loadLyricFor(track);

    expect(jellyfinLyrics).toHaveBeenCalledTimes(2);
    expect(lyricLines.value).toEqual([{ time: 2, text: "新会话歌词" }]);
  });
});
