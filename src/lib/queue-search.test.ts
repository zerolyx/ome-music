import { describe, expect, it } from "vitest";
import { searchQueueTracks } from "./queue-search";
import type { Track } from "../types/music";

const tracks: Track[] = [
  {
    id: "first",
    title: "情歌",
    artist: "梁静茹",
    album: "现在开始我爱你",
    durationSeconds: 263,
    filePath: "",
    source: "netease",
    coverPath: null,
    liked: false,
    playCount: 0,
  },
  {
    id: "second",
    title: "Midnight Walk",
    artist: "林桥",
    album: "Night Notes",
    durationSeconds: 202,
    filePath: "",
    source: "local",
    coverPath: null,
    liked: false,
    playCount: 0,
  },
  {
    id: "third",
    title: "宁夏",
    artist: "梁静茹",
    album: "燕尾蝶",
    durationSeconds: 215,
    filePath: "",
    source: "netease",
    coverPath: null,
    liked: false,
    playCount: 0,
  },
];

describe("searchQueueTracks", () => {
  it("matches Chinese title and artist terms in any order", () => {
    expect(searchQueueTracks(tracks, " 梁静茹 情歌 ").map(({ index }) => index)).toEqual([0]);
  });

  it("matches English text case-insensitively in title or album", () => {
    expect(searchQueueTracks(tracks, "MIDNIGHT").map(({ index }) => index)).toEqual([1]);
    expect(searchQueueTracks(tracks, "night notes").map(({ index }) => index)).toEqual([1]);
  });

  it("keeps original queue indices and returns every track for an empty query", () => {
    expect(searchQueueTracks(tracks, "梁静茹").map(({ index }) => index)).toEqual([0, 2]);
    expect(searchQueueTracks(tracks, "  ").map(({ index }) => index)).toEqual([0, 1, 2]);
  });

  it("returns no match when every query term cannot be satisfied", () => {
    expect(searchQueueTracks(tracks, "情歌 远方")).toEqual([]);
  });
});
