import type { Track } from "../../types/music";

const snapshotKey = "ome.startup.lastSessionSnapshot";

export interface LastSessionSnapshot {
  trackId: string;
  source: string;
  sourceId?: string | null;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  filePath: string;
  duration: number;
  position: number;
  volume: number;
  backgroundColors: string[];
  updatedAt: string;
}

export function loadLastSessionSnapshot(): LastSessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(snapshotKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSessionSnapshot>;
    if (!parsed.trackId || !parsed.title) return null;
    return {
      trackId: parsed.trackId,
      source: parsed.source || "local",
      sourceId: parsed.sourceId ?? null,
      title: parsed.title,
      artist: parsed.artist || "Unknown Artist",
      album: parsed.album || "Unknown Album",
      coverUrl: parsed.coverUrl || "",
      filePath: parsed.filePath || "",
      duration: Number(parsed.duration || 0),
      position: Number(parsed.position || 0),
      volume: Number.isFinite(parsed.volume) ? Number(parsed.volume) : 0.72,
      backgroundColors: Array.isArray(parsed.backgroundColors) ? parsed.backgroundColors : [],
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function snapshotToTrack(snapshot: LastSessionSnapshot): Track {
  return {
    id: snapshot.trackId,
    title: snapshot.title,
    artist: snapshot.artist,
    album: snapshot.album,
    durationSeconds: snapshot.duration,
    filePath: snapshot.filePath,
    source: snapshot.source as Track["source"],
    sourceId: snapshot.sourceId,
    unavailableReason: null,
    coverUrl: stableArtworkUrl(snapshot.coverUrl),
    genres: [],
    moods: ["unknown"],
    language: "unknown",
    year: undefined,
    playCount: 0,
    skipCount: 0,
    liked: false,
    importedAt: snapshot.updatedAt,
  };
}

export function saveLastSessionSnapshot(track: Track, position: number, volume: number): void {
  const snapshot: LastSessionSnapshot = {
    trackId: track.id,
    source: track.source || "local",
    sourceId: track.sourceId ?? null,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverUrl: stableArtworkUrl(track.coverUrl),
    filePath: track.filePath,
    duration: track.durationSeconds,
    position: Math.max(0, Math.floor(position)),
    volume,
    backgroundColors: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  } catch {
    // A missing snapshot should never affect playback.
  }
}

function stableArtworkUrl(value: string | null | undefined): string {
  const url = value?.trim() ?? "";
  if (!url) return "";
  const lower = url.toLowerCase();
  // ome-media URLs are short-lived runtime proxy handles. Persisting them in
  // the startup snapshot makes the next launch restore a dead cover and fall
  // back to the cheap placeholder. Keep only stable source/data/file artwork.
  if (lower.startsWith("ome-media:") || lower.includes("ome-media.localhost")) return "";
  return url;
}
