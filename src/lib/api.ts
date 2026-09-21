import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types/music";

export const isTauriRuntime = (): boolean => "__TAURI_INTERNALS__" in window;

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
  skipped: number;
}

/** 封面与音频走同一 ome-media 代理（Task 6 handler 已支持 png/jpg），零新协议 */
export function coverUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!isTauriRuntime()) return path;
  return `http://ome-media.localhost/local?p=${encodeURIComponent(path)}`;
}

export const getAppVersion = () => invoke<string>("get_app_version");
export const listTracks = () => invoke<Track[]>("list_tracks");
export const importMusicFolder = () => invoke<ImportResult>("import_music_folder");
export const setTrackLiked = (id: string, liked: boolean) =>
  invoke<void>("set_track_liked_command", { id, liked });
export const recordPlaybackEvent = (
  trackId: string,
  eventType: "play" | "skip" | "completed",
  positionSeconds: number
) => invoke<void>("record_playback_event_command", { trackId, eventType, positionSeconds });
