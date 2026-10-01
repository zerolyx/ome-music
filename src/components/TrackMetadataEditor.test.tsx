import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types/music";
import type { NeteaseSong } from "../types/music";
import {
  deleteSavedTrackLyrics,
  getSavedTrackLyrics,
  isTauriRuntime,
  lyricsProviderCandidates,
  lyricsProviderLyric,
  neteaseLyric,
  neteaseSearch,
  type TrackAudioTags,
  saveTrackLyricsCandidate,
  trackMetadataCandidates,
} from "../lib/api";
import {
  getLibraryTrackAudioTagBackupStatus,
  readLibraryTrackAudioTags,
  restoreLibraryTrackMetadata,
  updateLibraryTrackMetadata,
  writeLibraryTrackAudioTagUpdates,
  writeLibraryTrackEmbeddedLyrics,
} from "../state/library";
import { editingTrack } from "../state/metadata-editor";
import { TrackMetadataEditor } from "./TrackMetadataEditor";

vi.mock("../lib/api", () => ({
  deleteSavedTrackLyrics: vi.fn(),
  getSavedTrackLyrics: vi.fn(),
  isTauriRuntime: vi.fn(),
  lyricsProviderCandidates: vi.fn(),
  lyricsProviderLyric: vi.fn(),
  neteaseLyric: vi.fn(),
  neteaseSearch: vi.fn(),
  saveTrackLyricsCandidate: vi.fn(),
  trackMetadataCandidates: vi.fn(),
}));

vi.mock("../state/library", () => ({
  getLibraryTrackAudioTagBackupStatus: vi.fn(),
  readLibraryTrackAudioTags: vi.fn(),
  restoreLibraryTrackMetadata: vi.fn(),
  updateLibraryTrackMetadata: vi.fn(),
  writeLibraryTrackAudioTagUpdates: vi.fn(),
  writeLibraryTrackEmbeddedLyrics: vi.fn(),
}));

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
});

afterAll(() => vi.unstubAllGlobals());

const localTrack: Track = {
  id: "local:demo-song",
  title: "远处的灯（本地文件名）",
  artist: "未知艺人",
  album: "",
  durationSeconds: 202,
  filePath: "D:/Music/demo.mp3",
  source: "local",
  liked: false,
  playCount: 0,
  hasMetadataOverride: true,
  metadataSnapshotAvailable: true,
};

const candidate: NeteaseSong = {
  id: 186016,
  name: "远处的灯",
  artists: "林桥",
  album: "夜行",
  durationMs: 202_000,
  coverUrl: null,
  fee: 0,
  plain: true,
};

beforeEach(() => {
  editingTrack.value = localTrack;
  vi.mocked(isTauriRuntime).mockReturnValue(true);
  vi.mocked(getSavedTrackLyrics).mockResolvedValue(null);
  vi.mocked(saveTrackLyricsCandidate).mockResolvedValue({
    trackId: localTrack.id,
    provider: "netease",
    providerId: String(candidate.id),
    title: candidate.name,
    artist: candidate.artists,
    album: candidate.album,
    rawLyrics: { lrc: "[00:01.00]候选主歌词", tlyric: "[00:01.00]翻译" },
    savedAt: "2026-09-25T00:00:00Z",
  });
  vi.mocked(deleteSavedTrackLyrics).mockResolvedValue(true);
  vi.mocked(lyricsProviderCandidates).mockResolvedValue([]);
  vi.mocked(lyricsProviderLyric).mockResolvedValue({ lrc: "[00:01.00]其他来源主歌词" });
  vi.mocked(neteaseSearch).mockResolvedValue([candidate]);
  vi.mocked(neteaseLyric).mockResolvedValue({ lrc: "[00:01.00]候选主歌词", tlyric: "[00:01.00]翻译" });
  vi.mocked(trackMetadataCandidates).mockResolvedValue([{
    source: "netease",
    id: "netease:186016",
    name: candidate.name,
    artists: candidate.artists,
    album: candidate.album,
    durationMs: candidate.durationMs,
    coverUrl: null,
  }]);
  vi.mocked(getLibraryTrackAudioTagBackupStatus).mockResolvedValue({ available: false, sizeBytes: 0 });
  vi.mocked(readLibraryTrackAudioTags).mockResolvedValue({
    title: "远处的灯",
    artist: "林桥",
    album: "夜行",
    albumArtist: "林桥",
    year: "2024",
    genre: "Dream pop",
    trackNumber: 3,
    trackTotal: 12,
    discNumber: 1,
    discTotal: 2,
    bpm: "120",
    comment: "旧备注",
    commentTruncated: false,
  });
  vi.mocked(writeLibraryTrackAudioTagUpdates).mockResolvedValue(localTrack);
  vi.mocked(writeLibraryTrackEmbeddedLyrics).mockResolvedValue();
  vi.mocked(updateLibraryTrackMetadata).mockResolvedValue({ ...localTrack, ...{
    title: candidate.name,
    artist: candidate.artists,
    album: candidate.album,
  } });
  vi.mocked(restoreLibraryTrackMetadata).mockResolvedValue({
    track: { ...localTrack, title: "导入时曲名", artist: "原始艺人", album: "原始专辑", hasMetadataOverride: false, metadataSnapshotAvailable: false },
    source: "snapshot",
  });
});

afterEach(() => {
  cleanup();
  editingTrack.value = null;
  vi.clearAllMocks();
});

describe("TrackMetadataEditor online candidates", () => {
  it("requires confirmation before restoring the original metadata snapshot", async () => {
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "恢复原始资料" }));
    expect(screen.getByText(/首次手动修正前的导入资料/)).toBeTruthy();
    expect(restoreLibraryTrackMetadata).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "已恢复首次人工修改前的导入资料。");
    expect(restoreLibraryTrackMetadata).toHaveBeenCalledWith(localTrack.id);
    expect(screen.getByLabelText(/曲名/)).toHaveProperty("value", "导入时曲名");
    expect(screen.getByLabelText(/艺人/)).toHaveProperty("value", "原始艺人");
    expect(screen.getByLabelText(/专辑/)).toHaveProperty("value", "原始专辑");
    expect(screen.getByRole("button", { name: "完成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "从网易云查找候选" })).toHaveProperty("disabled", true);
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps search disabled outside the desktop runtime", () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "从网易云查找候选" }));

    expect(screen.getByRole("searchbox", { name: "网易云搜索关键词" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "搜索" })).toHaveProperty("disabled", true);
    expect(screen.getByText("网易云搜索需在 Ome 桌面版中使用。")).toBeTruthy();
    expect(trackMetadataCandidates).not.toHaveBeenCalled();
  });

  it("searches only on request, previews a candidate, and saves only after confirmation", async () => {
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "从网易云查找候选" }));
    expect(screen.getByRole("searchbox", { name: "网易云搜索关键词" })).toHaveProperty(
      "value",
      "远处的灯（本地文件名） 未知艺人",
    );
    expect(trackMetadataCandidates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByRole("button", { name: "预览候选：远处的灯 · 林桥" });
    expect(trackMetadataCandidates).toHaveBeenCalledWith("netease", "远处的灯（本地文件名） 未知艺人", 10);

    fireEvent.click(screen.getByRole("button", { name: "预览候选：远处的灯 · 林桥" }));
    fireEvent.click(screen.getByRole("button", { name: "填入全部" }));

    expect(screen.getByLabelText(/曲名/)).toHaveProperty("value", "远处的灯");
    expect(screen.getByLabelText(/艺人/)).toHaveProperty("value", "林桥");
    expect(screen.getByLabelText(/专辑/)).toHaveProperty("value", "夜行");
    expect(screen.getByRole("status").textContent).toContain("点击“保存资料”更新曲库");
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();

    fireEvent.input(screen.getByLabelText(/曲名/), { target: { value: "远处的灯（手动确认）" } });
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(updateLibraryTrackMetadata).toHaveBeenCalledWith(localTrack.id, {
      title: "远处的灯（手动确认）",
      artist: "林桥",
      album: "夜行",
      metadataSources: { title: "manual", artist: "netease", album: "netease" },
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  });

  it("searches lyric candidates on request and requires a second confirmation before embedding", async () => {
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    expect(neteaseSearch).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "歌词搜索关键词" })).toHaveProperty(
      "value",
      "远处的灯（本地文件名） 未知艺人",
    );

    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));
    await screen.findByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" });
    expect(neteaseSearch).toHaveBeenCalledWith("远处的灯（本地文件名） 未知艺人", 8);
    expect(neteaseLyric).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" }));
    expect(await screen.findByText("[00:01.00]候选主歌词", { exact: false })).toBeTruthy();
    expect(neteaseLyric).toHaveBeenCalledWith(candidate.id);
    expect(writeLibraryTrackEmbeddedLyrics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "选为待嵌入歌词" }));
    fireEvent.click(screen.getByRole("button", { name: "嵌入选定的候选歌词" }));
    expect(screen.getByText(/将选定的网易云候选歌词作为 1 行/)).toBeTruthy();
    expect(writeLibraryTrackEmbeddedLyrics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认嵌入候选歌词" }));
    await waitFor(() => expect(writeLibraryTrackEmbeddedLyrics).toHaveBeenCalledWith(
      localTrack.id,
      "[00:01.00]候选主歌词",
    ));
  });

  it("saves a previewed lyric to the persistent local library without embedding it", async () => {
    render(<TrackMetadataEditor />);
    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));
    fireEvent.click(await screen.findByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" }));
    await screen.findByText(/候选主歌词/);

    fireEvent.click(screen.getByRole("button", { name: "保存到歌词库" }));
    await waitFor(() => expect(saveTrackLyricsCandidate).toHaveBeenCalledWith(localTrack.id, {
      provider: "netease",
      providerId: String(candidate.id),
      title: candidate.name,
      artist: candidate.artists,
      album: candidate.album,
      rawLyrics: { lrc: "[00:01.00]候选主歌词", tlyric: "[00:01.00]翻译" },
    }));
    expect(await screen.findByText(/已保存到本地歌词库/)).toBeTruthy();
    expect(writeLibraryTrackEmbeddedLyrics).not.toHaveBeenCalled();
  });

  it("requires confirmation before removing a saved lyric library record", async () => {
    vi.mocked(getSavedTrackLyrics).mockResolvedValue({
      trackId: localTrack.id,
      provider: "netease",
      providerId: String(candidate.id),
      title: candidate.name,
      artist: candidate.artists,
      album: candidate.album,
      rawLyrics: { lrc: "[00:01.00]候选主歌词" },
      savedAt: "2026-09-25T00:00:00Z",
    });
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    expect(await screen.findByText(/已保存：网易云 · 远处的灯 · 林桥/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移除歌词库记录" }));
    expect(screen.getByRole("button", { name: "确认移除" })).toBeTruthy();
    expect(deleteSavedTrackLyrics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
    await waitFor(() => expect(deleteSavedTrackLyrics).toHaveBeenCalledWith(localTrack.id));
    expect(await screen.findByText(/已从本地歌词库移除/)).toBeTruthy();
  });

  it("searches AMLL metadata first and only requests TTML when a candidate is previewed", async () => {
    vi.mocked(lyricsProviderCandidates).mockResolvedValue([{
      source: "amll",
      id: "8713122671638320",
      name: "远处的灯",
      artists: "林桥",
      album: "夜行",
      durationMs: null,
    }]);
    vi.mocked(lyricsProviderLyric).mockResolvedValue({
      lrc: "",
      ttml: "<tt><body><div><p begin=\"00:00:01.000\" end=\"00:00:02.000\">AMLL 主歌词</p></div></body></tt>",
    });
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: "AMLL" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));
    await screen.findByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" });

    expect(lyricsProviderCandidates).toHaveBeenCalledWith(
      "amll",
      "远处的灯（本地文件名） 未知艺人",
      8,
    );
    expect(lyricsProviderLyric).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" }));
    expect(await screen.findByText(/AMLL 主歌词/)).toBeTruthy();
    expect(lyricsProviderLyric).toHaveBeenCalledWith("amll", "8713122671638320");
    expect(neteaseSearch).not.toHaveBeenCalled();
  });

  it("uses the selected LRCLIB ID for preview without putting lyric text in search candidates", async () => {
    vi.mocked(lyricsProviderCandidates).mockResolvedValue([{
      source: "lrclib",
      id: "3396226",
      name: "I Want to Live",
      artists: "Borislav Slavov",
      album: "Baldur's Gate 3",
      durationMs: 233_000,
    }]);
    vi.mocked(lyricsProviderLyric).mockResolvedValue({
      lrc: "[00:17.12]LRCLIB 主歌词",
      plainLyrics: "LRCLIB 主歌词",
    });
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: "LRCLIB" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));
    await screen.findByRole("button", { name: "预览歌词候选：I Want to Live · Borislav Slavov" });
    expect(lyricsProviderCandidates).toHaveBeenCalledWith(
      "lrclib",
      "远处的灯（本地文件名） 未知艺人",
      8,
    );
    expect(lyricsProviderLyric).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "预览歌词候选：I Want to Live · Borislav Slavov" }));
    expect(await screen.findByText(/LRCLIB 主歌词/)).toBeTruthy();
    expect(lyricsProviderLyric).toHaveBeenCalledWith("lrclib", "3396226");
  });

  it.each([
    { label: "QQ 音乐", provider: "qqmusic" as const, id: "songMid123" },
    { label: "酷狗音乐", provider: "kugou" as const, id: "12345~accessKey" },
    { label: "酷我音乐", provider: "kuwo" as const, id: "12345" },
  ])("searches and previews the selected $label lyric source", async ({ label, provider, id }) => {
    vi.mocked(lyricsProviderCandidates).mockResolvedValueOnce([{
      source: provider,
      id,
      name: "远处的灯",
      artists: "林桥",
      album: "夜行",
      durationMs: 202_000,
    }]);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));
    await screen.findByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" });

    expect(lyricsProviderCandidates).toHaveBeenCalledWith(
      provider,
      "远处的灯（本地文件名） 未知艺人",
      8,
    );
    expect(lyricsProviderLyric).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "预览歌词候选：远处的灯 · 林桥" }));
    expect(await screen.findByText("其他来源主歌词", { exact: false })).toBeTruthy();
    expect(lyricsProviderLyric).toHaveBeenCalledWith(provider, id);
    expect(neteaseSearch).not.toHaveBeenCalled();
  });

  it("shows an estimated score and a version warning without previewing or applying a candidate", async () => {
    vi.mocked(neteaseSearch).mockResolvedValueOnce([{
      ...candidate,
      name: "远处的灯（Live 现场版）",
    }]);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索歌词" }));

    expect(await screen.findByText(/版本标记不同：现场版/)).toBeTruthy();
    expect(screen.getByText("匹配估算参考曲名、艺人、专辑、时长和版本标记；不是概率，仍需手动预览确认。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "预览歌词候选：远处的灯（Live 现场版） · 林桥" })).toBeTruthy();
    expect(lyricsProviderLyric).not.toHaveBeenCalled();
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();
  });

  it("searches all lyric sources only after an explicit request and ranks the merged results locally", async () => {
    vi.mocked(neteaseSearch).mockResolvedValueOnce([{
      ...candidate,
      name: "远处的灯（Live 现场版）",
      durationMs: 245_000,
    }]);
    vi.mocked(lyricsProviderCandidates).mockImplementation(async (provider) => provider === "amll" ? [{
      source: "amll",
      id: "amll-exact",
      name: "远处的灯",
      artists: "林桥",
      album: "夜行",
      durationMs: 202_000,
    }] : []);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    expect(neteaseSearch).not.toHaveBeenCalled();
    expect(lyricsProviderCandidates).not.toHaveBeenCalled();

    fireEvent.input(screen.getByLabelText(/曲名/), { target: { value: "远处的灯" } });
    fireEvent.input(screen.getByLabelText(/艺人/), { target: { value: "林桥" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索全部来源" }));

    const amlCandidateButton = await screen.findByRole("button", {
      name: "预览歌词候选：远处的灯 · 林桥（AMLL）",
    });
    expect(screen.getByRole("list", { name: "全部来源歌词候选" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "预览歌词候选：远处的灯（Live 现场版） · 林桥（网易云）" })).toBeTruthy();
    expect(lyricsProviderCandidates).toHaveBeenCalledWith("amll", "远处的灯（本地文件名） 未知艺人", 8);
    expect(lyricsProviderCandidates).toHaveBeenCalledWith("lrclib", "远处的灯（本地文件名） 未知艺人", 8);
    expect(lyricsProviderCandidates).toHaveBeenCalledWith("qqmusic", "远处的灯（本地文件名） 未知艺人", 8);
    expect(lyricsProviderCandidates).toHaveBeenCalledWith("kugou", "远处的灯（本地文件名） 未知艺人", 8);
    expect(lyricsProviderCandidates).toHaveBeenCalledWith("kuwo", "远处的灯（本地文件名） 未知艺人", 8);
    expect(neteaseSearch).toHaveBeenCalledWith("远处的灯（本地文件名） 未知艺人", 8);
    expect(screen.getByText(/本次搜索已将关键词发送给六个歌词服务/)).toBeTruthy();
    expect(lyricsProviderLyric).not.toHaveBeenCalled();

    fireEvent.click(amlCandidateButton);
    await screen.findByText(/其他来源主歌词/);
    expect(lyricsProviderLyric).toHaveBeenCalledWith("amll", "amll-exact");
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();
    expect(writeLibraryTrackEmbeddedLyrics).not.toHaveBeenCalled();
  });

  it("keeps successful candidates available when one source fails during aggregate search", async () => {
    vi.mocked(lyricsProviderCandidates).mockImplementation(async (provider) => {
      if (provider === "lrclib") throw new Error("offline");
      return [];
    });
    render(<TrackMetadataEditor />);
    fireEvent.click(screen.getByRole("button", { name: "搜索在线歌词候选" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索全部来源" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "部分来源暂时不可用：LRCLIB；其余候选仍可预览。",
    );
    expect(screen.getByRole("button", { name: "预览歌词候选：远处的灯 · 林桥（网易云）" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "全部来源歌词候选" })).toBeTruthy();
  });
});

describe("TrackMetadataEditor embedded audio tags", () => {
  const originalTags: TrackAudioTags = {
    title: "远处的灯",
    artist: "林桥",
    album: "夜行",
    albumArtist: "林桥",
    year: "2024",
    genre: "Dream pop",
    trackNumber: 3,
    trackTotal: 12,
    discNumber: 1,
    discTotal: 2,
    bpm: "120",
    comment: "旧备注",
    commentTruncated: false,
  };

  it("reads fields and writes only changed tags after a second confirmation", async () => {
    vi.mocked(readLibraryTrackAudioTags).mockResolvedValue(originalTags);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "写入或恢复音频文件标签" }));
    fireEvent.click(await screen.findByRole("button", { name: "读取内嵌标签" }));
    expect(await screen.findByLabelText("内嵌 BPM")).toHaveProperty("value", "120");
    expect(screen.getByText("总数 12")).toBeTruthy();
    expect(screen.getByText("总数 2")).toBeTruthy();

    fireEvent.input(screen.getByLabelText("内嵌 BPM"), { target: { value: "128" } });
    fireEvent.click(screen.getByRole("button", { name: "准备写入：BPM" }));
    expect(screen.getByRole("group", { name: "确认写入单曲内嵌标签" })).toBeTruthy();
    expect(writeLibraryTrackAudioTagUpdates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认写入所选标签" }));
    await waitFor(() => expect(writeLibraryTrackAudioTagUpdates).toHaveBeenCalledWith(localTrack.id, {
      title: null,
      artist: null,
      album: null,
      albumArtist: null,
      year: null,
      genre: null,
      trackNumber: null,
      discNumber: null,
      bpm: "128",
      comment: null,
      syncLibraryMetadata: false,
    }));
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();
    expect(await screen.findByText(/曲库资料保持不变/)).toBeTruthy();
  });

  it("sends the complete core metadata group when any core tag changes", async () => {
    vi.mocked(readLibraryTrackAudioTags).mockResolvedValue(originalTags);
    vi.mocked(writeLibraryTrackAudioTagUpdates).mockResolvedValue({
      ...localTrack,
      title: "新歌名",
      artist: originalTags.artist,
      album: originalTags.album,
    });
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "写入或恢复音频文件标签" }));
    fireEvent.click(await screen.findByRole("button", { name: "读取内嵌标签" }));
    fireEvent.input(await screen.findByLabelText("内嵌曲名"), { target: { value: "新歌名" } });
    fireEvent.click(screen.getByRole("button", { name: "准备写入：曲名、艺人、专辑" }));
    fireEvent.click(screen.getByRole("button", { name: "确认写入所选标签" }));

    await waitFor(() => expect(writeLibraryTrackAudioTagUpdates).toHaveBeenCalledWith(localTrack.id, expect.objectContaining({
      title: "新歌名",
      artist: originalTags.artist,
      album: originalTags.album,
      syncLibraryMetadata: true,
    })));
  });

  it("shows demo tags in browser mode but keeps audio writes disabled", async () => {
    const previousUrl = window.location.href;
    window.history.replaceState({}, "", "/?demo=library");
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    render(<TrackMetadataEditor />);

    fireEvent.click(screen.getByRole("button", { name: "写入或恢复音频文件标签" }));
    fireEvent.click(await screen.findByRole("button", { name: "读取内嵌标签" }));
    expect(await screen.findByLabelText("内嵌 BPM")).toHaveProperty("value", "128");
    expect(screen.getByText(/固定示例/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText("内嵌 BPM"), { target: { value: "130" } });
    const writeButton = screen.getByRole("button", { name: "准备写入：BPM" });
    expect(writeButton).toHaveProperty("disabled", true);
    fireEvent.click(writeButton);
    expect(readLibraryTrackAudioTags).not.toHaveBeenCalled();
    expect(writeLibraryTrackAudioTagUpdates).not.toHaveBeenCalled();

    window.history.replaceState({}, "", new URL(previousUrl).pathname + new URL(previousUrl).search);
  });
});
