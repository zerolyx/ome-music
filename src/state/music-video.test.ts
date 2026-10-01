import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BilibiliSongDto, LocalMusicVideoCandidate } from "../lib/api";
import type { Track } from "../types/music";
import { currentIndex, queue } from "./player";
import {
  musicVideoCandidates,
  localMusicVideoCandidates,
  localMusicVideoSelected,
  musicVideoProvider,
  musicVideoLookupSource,
  musicVideoError,
  musicVideoLoading,
  musicVideoQuality,
  musicVideoResolvedQuality,
  musicVideoSelected,
  musicVideoSrc,
  resetMusicVideo,
  searchMusicVideo,
  searchLocalMusicVideo,
  setMusicVideoQuality,
  selectMusicVideo,
  selectLocalMusicVideo,
  stopMusicVideo,
} from "./music-video";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  bilibiliSearch: vi.fn(),
  bilibiliStreamUrl: vi.fn(),
  bilibiliProxySrc: vi.fn((url: string, referer: string) => `proxy:${referer}:${url}`),
  listLocalMusicVideoCandidates: vi.fn(),
  localMusicVideoSrc: vi.fn((id: string) => `local-video:${id}`),
}));

vi.mock("../lib/api", () => api);

const track: Track = {
  id: "local:night-sailing",
  title: "夜航",
  artist: "林桥",
  album: "灯火",
  durationSeconds: 180,
  filePath: "D:/Music/night-sailing.mp3",
  source: "local",
  liked: false,
  playCount: 0,
};

const candidate: BilibiliSongDto = {
  id: "bilibili-BV1xx411c7mD",
  bvid: "BV1xx411c7mD",
  name: "夜航 · MV",
  artist: "林桥",
  album: "Bilibili",
  durationSeconds: 182,
  coverUrl: "https://i0.hdslb.com/bfs/archive/cover.jpg",
  plain: true,
};

const localCandidate: LocalMusicVideoCandidate = {
  id: "local-mv-opaque-id",
  title: "夜航 · Official MV",
  sizeBytes: 12 * 1024 * 1024,
  reasons: ["曲名匹配", "位于 MV/video 子目录"],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.isTauriRuntime.mockReturnValue(true);
  api.bilibiliSearch.mockResolvedValue([candidate]);
  api.bilibiliStreamUrl.mockResolvedValue({
    url: "https://upos-sz-mirror08c.bilivideo.com/video.mp4",
    referer: "https://www.bilibili.com",
    qualityLabel: "720p",
  });
  api.listLocalMusicVideoCandidates.mockResolvedValue([localCandidate]);
  musicVideoQuality.value = 64;
  queue.value = [track];
  currentIndex.value = 0;
  resetMusicVideo(null);
  resetMusicVideo(track.id);
});

describe("optional stage music video", () => {
  it("searches only when explicitly requested and only for the current track", async () => {
    await searchMusicVideo(track);

    expect(api.bilibiliSearch).toHaveBeenCalledWith("夜航 林桥", 12);
    expect(api.bilibiliStreamUrl).not.toHaveBeenCalled();
    expect(musicVideoCandidates.value).toEqual([candidate]);
    expect(musicVideoLoading.value).toBe(false);
  });

  it("does not call native search from browser preview", async () => {
    api.isTauriRuntime.mockReturnValue(false);

    await searchMusicVideo(track);

    expect(api.bilibiliSearch).not.toHaveBeenCalled();
    expect(musicVideoError.value).toContain("桌面版");
  });

  it("looks for local videos only after an explicit request for a local track", async () => {
    await searchLocalMusicVideo(track);

    expect(api.listLocalMusicVideoCandidates).toHaveBeenCalledWith(track.id);
    expect(api.bilibiliSearch).not.toHaveBeenCalled();
    expect(api.bilibiliStreamUrl).not.toHaveBeenCalled();
    expect(musicVideoLookupSource.value).toBe("local");
    expect(localMusicVideoCandidates.value).toEqual([localCandidate]);
  });

  it("refuses local lookup for remote tracks and in browser preview", async () => {
    await searchLocalMusicVideo({ ...track, source: "bilibili" });
    expect(api.listLocalMusicVideoCandidates).not.toHaveBeenCalled();
    expect(musicVideoError.value).toContain("本地曲目");

    api.isTauriRuntime.mockReturnValue(false);
    await searchLocalMusicVideo(track);
    expect(api.listLocalMusicVideoCandidates).not.toHaveBeenCalled();
    expect(musicVideoError.value).toContain("桌面版");
  });

  it("plays a selected local candidate through its opaque ID without a Bilibili request", async () => {
    await searchLocalMusicVideo(track);
    await selectLocalMusicVideo(track, localCandidate);

    expect(api.localMusicVideoSrc).toHaveBeenCalledWith(localCandidate.id);
    expect(api.bilibiliStreamUrl).not.toHaveBeenCalled();
    expect(musicVideoProvider.value).toBe("local");
    expect(localMusicVideoSelected.value).toEqual(localCandidate);
    expect(musicVideoSrc.value).toBe(`local-video:${localCandidate.id}`);
    expect(musicVideoResolvedQuality.value).toBeNull();
  });

  it("requests a video stream only after choosing a result and can stop it", async () => {
    await searchMusicVideo(track);
    await selectMusicVideo(track, candidate);

    expect(api.bilibiliStreamUrl).toHaveBeenCalledWith(candidate.bvid, 64);
    expect(api.bilibiliProxySrc).toHaveBeenCalledWith(
      "https://upos-sz-mirror08c.bilivideo.com/video.mp4",
      "https://www.bilibili.com",
    );
    expect(musicVideoSelected.value).toEqual(candidate);
    expect(musicVideoSrc.value).toBe("proxy:https://www.bilibili.com:https://upos-sz-mirror08c.bilivideo.com/video.mp4");
    expect(musicVideoResolvedQuality.value).toBe("720p");

    stopMusicVideo();
    expect(musicVideoSelected.value).toBeNull();
    expect(musicVideoSrc.value).toBeNull();
    expect(musicVideoCandidates.value).toEqual([candidate]);
    expect(musicVideoResolvedQuality.value).toBeNull();
  });

  it("re-resolves the selected video at a lower quality ceiling", async () => {
    await selectMusicVideo(track, candidate);
    api.bilibiliStreamUrl.mockResolvedValueOnce({
      url: "https://upos-sz-mirror08c.bilivideo.com/video-480.mp4",
      referer: "https://www.bilibili.com",
      qualityLabel: "480p",
    });

    await setMusicVideoQuality(32);

    expect(musicVideoQuality.value).toBe(32);
    expect(api.bilibiliStreamUrl).toHaveBeenLastCalledWith(candidate.bvid, 32);
    expect(musicVideoSrc.value).toBe("proxy:https://www.bilibili.com:https://upos-sz-mirror08c.bilivideo.com/video-480.mp4");
    expect(musicVideoResolvedQuality.value).toBe("480p");
  });

  it("does not re-resolve a local video when the Bilibili quality ceiling changes", async () => {
    await selectLocalMusicVideo(track, localCandidate);

    await setMusicVideoQuality(32);

    expect(musicVideoQuality.value).toBe(32);
    expect(api.bilibiliStreamUrl).not.toHaveBeenCalled();
    expect(musicVideoSrc.value).toBe(`local-video:${localCandidate.id}`);
  });

  it("ignores unsupported quality values", async () => {
    await setMusicVideoQuality(1080);

    expect(musicVideoQuality.value).toBe(64);
    expect(api.bilibiliStreamUrl).not.toHaveBeenCalled();
  });

  it("discards late results after the current track changes", async () => {
    let resolveSearch!: (results: BilibiliSongDto[]) => void;
    api.bilibiliSearch.mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }));
    const search = searchMusicVideo(track);
    const nextTrack = { ...track, id: "local:next" };
    queue.value = [track, nextTrack];
    currentIndex.value = 1;
    resetMusicVideo(nextTrack.id);
    resolveSearch([candidate]);
    await search;

    expect(musicVideoCandidates.value).toEqual([]);
    expect(musicVideoLoading.value).toBe(false);
  });

  it("keeps lookup failures visible without selecting a video", async () => {
    api.bilibiliSearch.mockRejectedValueOnce(new Error("Bilibili is unavailable"));

    await searchMusicVideo(track);

    expect(musicVideoError.value).toBe("Bilibili is unavailable");
    expect(musicVideoSelected.value).toBeNull();
  });
});

