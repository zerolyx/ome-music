/* ============ 播放列表状态（ECHO Next 曲库管理能力补齐） ============
 * 列表 + 当前打开的歌单曲目；invoke 失败时若信号仍为 null 则置空，
 * 这样 demo 预置的数据不会被覆盖（与 dj.ts 记忆/画像同一约定）。
 */

import { signal, type Signal } from "@preact/signals";
import {
  playlistAdd,
  playlistCreate,
  playlistDelete,
  playlistList,
  playlistRemove,
  playlistRename,
  playlistTracks,
  type Playlist,
} from "../lib/api";
import type { Track } from "../types/music";

export const playlists: Signal<Playlist[] | null> = signal(null);
/** 当前打开的歌单详情（null = 未打开/已关闭） */
export const activePlaylistId = signal<string | null>(null);
export const activePlaylistTracks: Signal<Track[] | null> = signal(null);
export const playlistError = signal<string | null>(null);
/** 「加入歌单」选择器：待加入的曲目（null = 选择器关闭） */
export const pendingAddTracks: Signal<Track[] | null> = signal(null);

/** 从任意曲目行的 hover 操作打开「加入歌单」选择器 */
export function openAddToPlaylist(track: Track): void {
  pendingAddTracks.value = [track];
}

export function closeAddToPlaylist(): void {
  pendingAddTracks.value = null;
}

/** 选择器里确认：加入指定歌单并关闭 */
export async function confirmAddToPlaylist(playlistId: string): Promise<void> {
  const pending = pendingAddTracks.value;
  if (!pending) return;
  pendingAddTracks.value = null;
  await addToPlaylist(playlistId, pending);
}

export async function loadPlaylists(): Promise<void> {
  try {
    playlists.value = await playlistList();
  } catch {
    if (playlists.value === null) playlists.value = [];
  }
}

export async function createPlaylist(name: string): Promise<Playlist | null> {
  playlistError.value = null;
  try {
    const created = await playlistCreate(name);
    await loadPlaylists();
    return created;
  } catch (e) {
    playlistError.value = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  playlistError.value = null;
  try {
    await playlistRename(id, name);
    await loadPlaylists();
  } catch (e) {
    playlistError.value = e instanceof Error ? e.message : String(e);
  }
}

export async function deletePlaylist(id: string): Promise<void> {
  playlistError.value = null;
  try {
    await playlistDelete(id);
    if (activePlaylistId.value === id) closePlaylist();
    await loadPlaylists();
  } catch (e) {
    playlistError.value = e instanceof Error ? e.message : String(e);
  }
}

/** 打开歌单详情并加载曲目（null = 返回歌单总览） */
export async function openPlaylist(id: string | null): Promise<void> {
  activePlaylistId.value = id;
  if (id === null) {
    activePlaylistTracks.value = null;
    return;
  }
  activePlaylistTracks.value = null;
  try {
    activePlaylistTracks.value = await playlistTracks(id);
  } catch {
    if (activePlaylistTracks.value === null) activePlaylistTracks.value = [];
  }
}

export function closePlaylist(): void {
  activePlaylistId.value = null;
  activePlaylistTracks.value = null;
}

/** 把曲目加入歌单；返回是否成功（调用方可据此弹出轻提示） */
export async function addToPlaylist(playlistId: string, tracks: Track[]): Promise<boolean> {
  playlistError.value = null;
  try {
    await playlistAdd(
      playlistId,
      tracks.map((track) => track.id),
    );
    await loadPlaylists();
    // 正在看这首歌单：刷新详情
    if (activePlaylistId.value === playlistId) await openPlaylist(playlistId);
    return true;
  } catch (e) {
    playlistError.value = e instanceof Error ? e.message : String(e);
    return false;
  }
}

export async function removeFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  try {
    await playlistRemove(playlistId, trackId);
    await openPlaylist(playlistId);
    await loadPlaylists();
  } catch (e) {
    playlistError.value = e instanceof Error ? e.message : String(e);
  }
}
