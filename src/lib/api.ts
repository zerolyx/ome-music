import { invoke } from "@tauri-apps/api/core";
import type { NeteaseSong, Track } from "../types/music";

export const isTauriRuntime = (): boolean => "__TAURI_INTERNALS__" in window;

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
  skipped: number;
}

export interface NeteaseStatus {
  loggedIn: boolean;
  nickname?: string;
}

export interface NeteaseQrKey {
  key: string;
  /** 完整 <svg>…</svg> 字符串（含 XML 声明），前端 innerHTML 渲染 */
  qrSvg: string;
}

/** 801 等待 / 802 已扫 / 803 成功 / 800 过期 */
export interface NeteaseQrCheck {
  code: number;
  nickname?: string;
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

/* ============ 网易云（Plan 2 Task 3，命令名与 src-tauri 注册一致） ============ */

export const neteaseStatus = () => invoke<NeteaseStatus>("netease_status");
export const neteaseQrKey = () => invoke<NeteaseQrKey>("netease_qr_key");
export const neteaseQrCheck = (key: string) => invoke<NeteaseQrCheck>("netease_qr_check", { key });
export const neteaseSearch = (keywords: string, limit?: number) =>
  invoke<NeteaseSong[]>("netease_search", { keywords, limit });
export const neteaseStreamUrl = (id: number) => invoke<string>("netease_stream_url", { id });
export const neteaseLyric = (id: number) => invoke<{ lrc: string }>("netease_lyric", { id });
export const neteaseLike = (id: number, like: boolean) =>
  invoke<void>("netease_like", { id, like });
export const neteaseLogout = () => invoke<void>("netease_logout");

/* ============ 私人 DJ（后端命令已提交于 src-tauri/src/dj.rs，serde camelCase） ============ */

export interface DjAction {
  type: "play" | "queue" | "search_and_play" | "mood" | "none";
  query?: string | null;
  mood?: string | null;
}

export interface DjReply {
  say: string;
  actions: DjAction[];
}

export interface DjConfigState {
  configured: boolean;
  providerName: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
}

export interface DjSaveConfigPayload {
  providerName: string;
  baseUrl: string;
  model: string;
  /** 空字符串 = 保持旧密钥不变 */
  apiKey: string;
}

export interface DjMemoryFact {
  id: string;
  kind: string;
  content: string;
  weight: number;
  updatedAt: string;
}

export const djGetConfig = () => invoke<DjConfigState>("dj_config");
export const djSaveConfig = (payload: DjSaveConfigPayload) =>
  invoke<DjConfigState>("dj_save_config", { payload });
export const djChat = (text: string) => invoke<DjReply>("dj_chat", { text });
export const djGreeting = () => invoke<{ say: string }>("dj_greeting");
export const djIntro = (trackId: string) => invoke<{ say: string }>("dj_intro", { trackId });
export const djMemoryList = () => invoke<DjMemoryFact[]>("dj_memory_list");
export const djMemoryDelete = (id: string) => invoke<void>("dj_memory_delete", { id });
