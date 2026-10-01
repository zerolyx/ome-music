import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeStage, setStageEffect } from "../state/stage";
import { currentIndex, duration, isPlaying, position, queue } from "../state/player";
import {
  lyricLines,
  lyricSubtitleMode,
  lyricTrackId,
  plainLyricText,
  plainRomanizationLines,
  romanizationLines,
  tlyricLines,
  yrcLines,
} from "../state/lyrics";
import type { Track } from "../types/music";
import { localMusicVideoCandidates, musicVideoLookupSource } from "../state/music-video";
import { StageView } from "./StageView";

const { mockSeek } = vi.hoisted(() => ({ mockSeek: vi.fn() }));

vi.mock("../state/player", async (importOriginal) => ({
  ...await importOriginal<typeof import("../state/player")>(),
  seek: mockSeek,
}));

const track: Track = {
  id: "local:stage-test",
  title: "夜航",
  artist: "林桥",
  album: "灯火",
  durationSeconds: 180,
  filePath: "D:/Music/夜航.mp3",
  source: "local",
  liked: false,
  playCount: 0,
};

beforeEach(() => {
  queue.value = [track];
  currentIndex.value = 0;
  position.value = 7;
  duration.value = 180;
  isPlaying.value = true;
  lyricTrackId.value = track.id;
  lyricLines.value = [
    { time: 1, text: "第一句" },
    { time: 6, text: "第二句" },
    { time: 12, text: "第三句" },
  ];
  yrcLines.value = [];
  plainLyricText.value = "";
  plainRomanizationLines.value = [];
  romanizationLines.value = [];
  tlyricLines.value = [];
  lyricSubtitleMode.value = "none";
  setStageEffect("flow");
  mockSeek.mockClear();
});

afterEach(() => {
  cleanup();
  closeStage();
  mockSeek.mockClear();
});

describe("StageView lyric seeking", () => {
  it("browses the complete LRC lyric list, highlights the current line, and seeks", () => {
    render(<StageView />);

    fireEvent.click(screen.getByRole("button", { name: "浏览全曲歌词" }));

    expect(screen.getByRole("region", { name: "全曲歌词列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "定位到歌词：第二句" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "定位到歌词：第三句" }));

    expect(mockSeek).toHaveBeenCalledWith(12);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "浏览全曲歌词" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "歌词舞台" })).toBeInTheDocument();
  });

  it("seeks to the selected timestamped lyric line", () => {
    render(<StageView />);

    fireEvent.click(screen.getByRole("button", { name: "定位到歌词：第三句" }));

    expect(mockSeek).toHaveBeenCalledWith(12);
  });

  it("seeks from a word-timed YRC line to its start", () => {
    lyricLines.value = [];
    yrcLines.value = [
      { start: 1, end: 4, words: [{ start: 1, end: 2, text: "星" }] },
      { start: 6, end: 9, words: [{ start: 6, end: 7, text: "河" }] },
      { start: 12, end: 15, words: [{ start: 12, end: 13, text: "远" }] },
    ];
    render(<StageView />);

    fireEvent.click(screen.getByRole("button", { name: "浏览全曲歌词" }));

    expect(screen.getByRole("button", { name: "定位到歌词：河" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "定位到歌词：远" }));

    expect(mockSeek).toHaveBeenCalledWith(12);
  });

  it("keeps untimed plain lyrics non-seekable", () => {
    lyricLines.value = [];
    plainLyricText.value = "只有歌词，没有时间轴";
    render(<StageView />);

    expect(screen.getByText("只有歌词，没有时间轴")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "浏览全曲歌词" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /定位到歌词/ })).not.toBeInTheDocument();
  });
});

describe("StageView optional MV controls", () => {
  it("does not offer local file lookup for a remote track", () => {
    queue.value = [{ ...track, source: "netease" }];
    render(<StageView />);
    fireEvent.click(screen.getByRole("button", { name: "打开 MV 面板" }));

    expect(screen.queryByRole("button", { name: "在本地找 MV" })).not.toBeInTheDocument();
  });

  it("keeps video search desktop-only in a browser preview", () => {
    render(<StageView />);

    fireEvent.click(screen.getByRole("button", { name: "打开 MV 面板" }));

    expect(screen.getByRole("region", { name: "音乐视频" })).toBeInTheDocument();
    expect(screen.getByText("MV 搜索与播放仅在 Ome Music 桌面版可用。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索 B 站 MV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "在本地找 MV" })).toBeDisabled();
    expect(screen.getByText(/本地查找只检查已授权曲库目录/)).toBeInTheDocument();
    const quality = screen.getByRole("combobox", { name: "MV 画质上限" });
    expect(quality).toBeDisabled();
    expect(quality.querySelectorAll("option")).toHaveLength(3);
  });

  it("renders local candidate metadata without exposing its filesystem path", () => {
    render(<StageView />);
    fireEvent.click(screen.getByRole("button", { name: "打开 MV 面板" }));
    act(() => {
      musicVideoLookupSource.value = "local";
      localMusicVideoCandidates.value = [{
        id: "local-mv-safe-id",
        title: "夜航 · Official MV",
        sizeBytes: 12 * 1024 * 1024,
        reasons: ["曲名匹配", "位于 MV/video 子目录"],
      }];
    });

    expect(screen.getByRole("group", { name: "本地 MV 候选" })).toBeInTheDocument();
    expect(screen.getByText("夜航 · Official MV")).toBeInTheDocument();
    expect(screen.getByText(/12.0 MB · 曲名匹配/)).toBeInTheDocument();
    expect(screen.queryByText(/D:\\/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /夜航 · Official MV/ })).toBeDisabled();
  });
});
