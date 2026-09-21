import type { Track } from "../types/music";
import { isTauriRuntime } from "./api";

export function toPlayableSrc(track: Track): string {
  if (track.filePath.startsWith("unavailable:")) return "";
  if (/^https?:\/\//i.test(track.filePath)) return track.filePath;
  if (!isTauriRuntime()) return track.filePath;
  return `http://ome-media.localhost/local?p=${encodeURIComponent(track.filePath)}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
