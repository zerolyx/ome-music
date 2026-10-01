import type { Track } from "../types/music";

export const QUEUE_SESSION_KEY = "ome.queue-session";
export const MAX_QUEUE_SESSION_TRACKS = 100;
export const MAX_QUEUE_SESSION_BYTES = 256 * 1024;

type StoredLocalTrack = {
  source: "local";
  id: string;
};

type StoredRemoteTrack = {
  source: "netease" | "bilibili";
  id: string;
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
};

export type StoredQueueTrack = StoredLocalTrack | StoredRemoteTrack;

export interface QueueSessionSnapshot {
  version: 1;
  currentIndex: number;
  tracks: StoredQueueTrack[];
}

export interface RestoredQueueSession {
  tracks: Track[];
  currentIndex: number;
  skippedLocalTracks: number;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function finiteDuration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 24 * 60 * 60)
    : 0;
}

function sourceIdFor(track: Track): string | null {
  const sourceId = boundedString(track.sourceId, 256);
  if (sourceId) return sourceId;
  if (track.source === "netease") {
    return boundedString(track.id.replace(/^netease-/, ""), 256);
  }
  return null;
}

function storeTrack(track: Track): StoredQueueTrack | null {
  const id = boundedString(track.id, 256);
  if (!id) return null;
  if (track.source === "local") return { source: "local", id };
  if (track.source !== "netease" && track.source !== "bilibili") return null;

  const sourceId = sourceIdFor(track);
  if (!sourceId) return null;
  return {
    source: track.source,
    id,
    sourceId,
    title: boundedString(track.title, 160) ?? "未知曲目",
    artist: boundedString(track.artist, 120) ?? "未知艺人",
    album: boundedString(track.album, 160) ?? "",
    durationSeconds: finiteDuration(track.durationSeconds),
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function createQueueSessionSnapshot(
  tracks: Track[],
  currentIndex: number,
): QueueSessionSnapshot | null {
  if (tracks.length === 0) return null;
  const activeIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < tracks.length
    ? currentIndex
    : 0;
  const storedTracks = tracks
    .slice(activeIndex, activeIndex + MAX_QUEUE_SESSION_TRACKS)
    .map(storeTrack)
    .filter((track): track is StoredQueueTrack => track !== null);
  if (storedTracks.length === 0) return null;

  const snapshot: QueueSessionSnapshot = {
    version: 1,
    currentIndex: 0,
    tracks: storedTracks,
  };
  return byteLength(JSON.stringify(snapshot)) <= MAX_QUEUE_SESSION_BYTES ? snapshot : null;
}

function parseStoredTrack(value: unknown): StoredQueueTrack | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const source = item.source;
  const id = boundedString(item.id, 256);
  if (!id) return null;
  if (source === "local") return { source, id };
  if (source !== "netease" && source !== "bilibili") return null;

  const sourceId = boundedString(item.sourceId, 256);
  if (!sourceId) return null;
  return {
    source,
    id,
    sourceId,
    title: boundedString(item.title, 160) ?? "未知曲目",
    artist: boundedString(item.artist, 120) ?? "未知艺人",
    album: boundedString(item.album, 160) ?? "",
    durationSeconds: finiteDuration(item.durationSeconds),
  };
}

export function parseQueueSessionSnapshot(raw: string | null): QueueSessionSnapshot | null {
  if (!raw || byteLength(raw) > MAX_QUEUE_SESSION_BYTES) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tracks) || parsed.tracks.length === 0) return null;
    if (parsed.tracks.length > MAX_QUEUE_SESSION_TRACKS) return null;
    const tracks = parsed.tracks.map(parseStoredTrack);
    if (tracks.some((track) => track === null)) return null;
    const currentIndex = parsed.currentIndex;
    if (!Number.isInteger(currentIndex) || (currentIndex as number) < 0 || (currentIndex as number) >= tracks.length) return null;
    return { version: 1, currentIndex: currentIndex as number, tracks: tracks as StoredQueueTrack[] };
  } catch {
    return null;
  }
}

export function readQueueSessionSnapshot(storage: Pick<Storage, "getItem">): QueueSessionSnapshot | null {
  try {
    return parseQueueSessionSnapshot(storage.getItem(QUEUE_SESSION_KEY));
  } catch {
    return null;
  }
}

export function writeQueueSessionSnapshot(
  storage: Pick<Storage, "setItem">,
  snapshot: QueueSessionSnapshot,
): boolean {
  try {
    const raw = JSON.stringify(snapshot);
    if (byteLength(raw) > MAX_QUEUE_SESSION_BYTES) return false;
    storage.setItem(QUEUE_SESSION_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function rehydrateQueueSession(
  snapshot: QueueSessionSnapshot,
  libraryTracks: Track[],
): RestoredQueueSession {
  const localTracks = new Map(
    libraryTracks.filter((track) => track.source === "local").map((track) => [track.id, track]),
  );
  const restored: Array<{ originalIndex: number; track: Track }> = [];
  let skippedLocalTracks = 0;

  snapshot.tracks.forEach((stored, originalIndex) => {
    if (stored.source === "local") {
      const track = localTracks.get(stored.id);
      if (track) restored.push({ originalIndex, track });
      else skippedLocalTracks += 1;
      return;
    }
    restored.push({
      originalIndex,
      track: {
        id: stored.id,
        sourceId: stored.sourceId,
        source: stored.source,
        title: stored.title,
        artist: stored.artist,
        album: stored.album,
        durationSeconds: stored.durationSeconds,
        filePath: "",
        liked: false,
        playCount: 0,
      },
    });
  });

  const currentRestoredIndex = restored.findIndex(({ originalIndex }) => originalIndex >= snapshot.currentIndex);
  const fallbackIndex = Math.max(0, restored.length - 1);
  return {
    tracks: restored.map(({ track }) => track),
    currentIndex: currentRestoredIndex >= 0 ? currentRestoredIndex : fallbackIndex,
    skippedLocalTracks,
  };
}
