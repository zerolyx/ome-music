import { describe, expect, it } from "vitest";
import type { Track } from "../types/music";
import { findPossibleDuplicateGroups } from "./duplicates";

function localTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: "远处的灯",
    artist: "林桥",
    album: "夜行",
    durationSeconds: 202,
    filePath: `D:/Music/${id}.flac`,
    source: "local",
    liked: false,
    playCount: 0,
    ...overrides,
  };
}

describe("findPossibleDuplicateGroups", () => {
  it("groups local tracks with matching title, artist, and close durations", () => {
    const groups = findPossibleDuplicateGroups([
      localTrack("a", { title: "  远处的灯  ", durationSeconds: 201 }),
      localTrack("b", { title: "远处的灯", durationSeconds: 203, album: "精选集" }),
      localTrack("c", { title: "另一个标题", durationSeconds: 201 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tracks.map((track) => track.id)).toEqual(["a", "b"]);
  });

  it("ignores online tracks, missing identity fields, invalid durations, and missing paths", () => {
    const groups = findPossibleDuplicateGroups([
      localTrack("a"),
      localTrack("b"),
      localTrack("online", { source: "netease", sourceId: "123" }),
      localTrack("no-artist", { artist: " " }),
      localTrack("no-file", { filePath: "" }),
      localTrack("bad-duration", { durationSeconds: Number.NaN }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tracks.map((track) => track.id)).toEqual(["a", "b"]);
  });

  it("does not merge different artists, version labels, or tracks outside the two-second tolerance", () => {
    const groups = findPossibleDuplicateGroups([
      localTrack("a", { durationSeconds: 200 }),
      localTrack("b", { durationSeconds: 202.01 }),
      localTrack("other-artist", { artist: "另一位歌手", durationSeconds: 200 }),
      localTrack("live", { title: "远处的灯 Live", durationSeconds: 201 }),
    ]);

    expect(groups).toEqual([]);
  });

  it("normalizes compatible Unicode forms, letter case, and whitespace", () => {
    const groups = findPossibleDuplicateGroups([
      localTrack("a", { title: "ＡＢＣ", artist: "  Artist  ", durationSeconds: 190 }),
      localTrack("b", { title: "abc", artist: "artist", durationSeconds: 191 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tracks).toHaveLength(2);
  });
});
