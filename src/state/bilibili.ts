/* ============ B站搜索源（Plan 4 Task 2）============
 * 匿名可用、无登录；搜索结果直接映射为播放器 Track，
 * 取流时再经 player 换真实直链并走 /remote 代理。
 */

import { signal } from "@preact/signals";
import { bilibiliSearch, isTauriRuntime, type BilibiliSongDto } from "../lib/api";
import type { Track } from "../types/music";

/**
 * B站图片 CDN（hdslb.com）有防盗链：WebView 的 Referer 会被 403。
 * 桌面端经 ome-media /remote 代理注入 B站 Referer；http 升级 https。
 */
export function bilibiliImageProxy(url: string | null): string | null {
  if (!url) return null;
  const httpsUrl = url.replace(/^http:/, "https:");
  if (!isTauriRuntime()) return httpsUrl;
  return `http://ome-media.localhost/remote?p=${encodeURIComponent(httpsUrl)}&r=www.bilibili.com`;
}

export const searching = signal(false);
export const results = signal<Track[]>([]);
export const error = signal<string | null>(null);
/** 是否已执行过一次搜索（区分初始空态与「没有找到」） */
export const searched = signal(false);

/** 纯逻辑：DTO → 播放器通用 Track（id 保留后端前缀防碰撞，sourceId 用干净 bvid 供取流/弹幕） */
export function bilibiliSongToTrack(song: BilibiliSongDto): Track {
  return {
    id: song.id,
    title: song.name,
    artist: song.artist,
    album: song.album,
    durationSeconds: song.durationSeconds,
    filePath: "",
    source: "bilibili",
    sourceId: song.bvid,
    unavailableReason: null, // B站曲目全部可播，无 VIP 角标
    coverPath: bilibiliImageProxy(song.coverUrl || null),
    liked: false,
    playCount: 0,
  };
}

const toMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function searchBilibili(keywords: string): Promise<void> {
  searching.value = true;
  searched.value = true;
  error.value = null;
  try {
    const songs = await bilibiliSearch(keywords);
    results.value = songs.map(bilibiliSongToTrack);
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    searching.value = false;
  }
}
