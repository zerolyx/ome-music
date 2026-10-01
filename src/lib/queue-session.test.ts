import { describe, expect, it } from "vitest";
import {
  MAX_QUEUE_SESSION_TRACKS,
  QUEUE_SESSION_KEY,
  createQueueSessionSnapshot,
  parseQueueSessionSnapshot,
  readQueueSessionSnapshot,
  rehydrateQueueSession,
  writeQueueSessionSnapshot,
} from "./queue-session";
import type { Track } from "../types/music";

const localTrack = (id: string, filePath: string): Track => ({
  id,
  title: "本地曲目",
  artist: "艺人",
  album: "专辑",
  durationSeconds: 180,
  filePath,
  source: "local",
  coverPath: "D:/covers/private.jpg",
  liked: true,
  playCount: 7,
});

const remoteTrack = (
  source: "netease" | "bilibili" | "subsonic" | "jellyfin" | "emby" | "smb",
  id: string,
  sourceId: string,
): Track => ({
  id,
  sourceId,
  title: "在线曲目",
  artist: "艺人",
  album: "专辑",
  durationSeconds: 205,
  filePath: "https://media.example.invalid/private-stream-token",
  source,
  coverPath: "https://images.example.invalid/cover.jpg",
  liked: false,
  playCount: 0,
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("queue session snapshots", () => {
  it("stores local track IDs only and never keeps paths, covers, or stream URLs", () => {
    const tracks = [
      localTrack("local-1", "D:/Music/private.flac"),
      remoteTrack("netease", "netease-42", "42"),
    ];
    const snapshot = createQueueSessionSnapshot(tracks, 0)!;
    const raw = JSON.stringify(snapshot);

    expect(snapshot.tracks[0]).toEqual({ source: "local", id: "local-1" });
    expect(raw).not.toContain("D:/Music");
    expect(raw).not.toContain("private-stream-token");
    expect(raw).not.toContain("images.example.invalid");
    expect(snapshot.tracks[1]).toMatchObject({ source: "netease", sourceId: "42", title: "在线曲目" });
  });

  it("does not persist personal-server tracks in a manual queue snapshot", () => {
    expect(createQueueSessionSnapshot([
      remoteTrack("emby", "emby:track-1", "track-1"),
    ], 0)).toBeNull();
    expect(createQueueSessionSnapshot([
      remoteTrack("smb", "smb:opaque-1", "opaque-1"),
    ], 0)).toBeNull();
  });

  it("limits the snapshot to the current track and the next 99 tracks", () => {
    const tracks = Array.from({ length: MAX_QUEUE_SESSION_TRACKS + 5 }, (_, index) =>
      remoteTrack("bilibili", `b-${index}`, `BV${index}`),
    );
    const snapshot = createQueueSessionSnapshot(tracks, 103)!;
    expect(snapshot.tracks).toHaveLength(2);
    expect(snapshot.tracks[0]).toMatchObject({ id: "b-103" });
    expect(snapshot.currentIndex).toBe(0);
  });

  it("rejects malformed, overlong, and oversized snapshots", () => {
    expect(parseQueueSessionSnapshot("not json")).toBeNull();
    expect(parseQueueSessionSnapshot(JSON.stringify({ version: 2, currentIndex: 0, tracks: [] }))).toBeNull();
    expect(parseQueueSessionSnapshot(" ".repeat(256 * 1024 + 1))).toBeNull();
    const tooMany = {
      version: 1,
      currentIndex: 0,
      tracks: Array.from({ length: MAX_QUEUE_SESSION_TRACKS + 1 }, (_, index) => ({ source: "local", id: `${index}` })),
    };
    expect(parseQueueSessionSnapshot(JSON.stringify(tooMany))).toBeNull();
  });

  it("rehydrates local IDs from the current library and reports missing files", () => {
    const snapshot = createQueueSessionSnapshot([
      localTrack("missing", "D:/old/missing.flac"),
      localTrack("available", "D:/current/available.flac"),
      remoteTrack("bilibili", "b-1", "BV1"),
    ], 0)!;

    const restored = rehydrateQueueSession(snapshot, [localTrack("available", "E:/new/available.flac")]);
    expect(restored.tracks.map((track) => track.id)).toEqual(["available", "b-1"]);
    expect(restored.tracks[0].filePath).toBe("E:/new/available.flac");
    expect(restored.tracks[1].filePath).toBe("");
    expect(restored.currentIndex).toBe(0);
    expect(restored.skippedLocalTracks).toBe(1);
  });

  it("round-trips through local storage using a single versioned key", () => {
    const storage = memoryStorage();
    const snapshot = createQueueSessionSnapshot([remoteTrack("netease", "netease-42", "42")], 0)!;
    expect(writeQueueSessionSnapshot(storage, snapshot)).toBe(true);
    expect(storage.getItem(QUEUE_SESSION_KEY)).not.toBeNull();
    expect(readQueueSessionSnapshot(storage)).toEqual(snapshot);
  });
});
