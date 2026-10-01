import { signal } from "@preact/signals";
import {
  embyConnect,
  embyAlbumTracks,
  embyAlbums,
  embyCoverUrl,
  embyDisconnect,
  embyPlaylistTracks,
  embyPlaylists,
  embySearch,
  embyStatus,
  isTauriRuntime,
  type EmbySong,
  type EmbyStatus,
} from "../lib/api";
import type { Track } from "../types/music";
import { createRemoteCatalog } from "./remote-catalog";

const DISCONNECTED: EmbyStatus = { connected: false, serverLabel: null };

export const connection = signal<EmbyStatus>(DISCONNECTED);
export const results = signal<Track[]>([]);
export const searching = signal(false);
export const searched = signal(false);
export const connecting = signal(false);
export const error = signal<string | null>(null);

export const catalog = createRemoteCatalog(
  "emby",
  () => connection.value.connected,
  {
    albums: embyAlbums,
    albumTracks: embyAlbumTracks,
    playlists: embyPlaylists,
    playlistTracks: embyPlaylistTracks,
  },
  embyCoverUrl,
);

function trackFromSong(song: EmbySong): Track {
  return {
    id: `emby:${song.id}`,
    sourceId: song.id,
    source: "emby",
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationSeconds: song.durationSeconds,
    filePath: "",
    coverPath: song.coverId ? embyCoverUrl(song.coverId) : null,
    liked: false,
    playCount: 0,
  };
}

export async function refreshEmbyStatus(): Promise<void> {
  if (!isTauriRuntime()) {
    connection.value = DISCONNECTED;
    return;
  }
  try {
    connection.value = await embyStatus();
    if (!connection.value.connected) catalog.clear();
  } catch {
    connection.value = DISCONNECTED;
    catalog.clear();
  }
}

export async function connectEmby(input: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<boolean> {
  connecting.value = true;
  error.value = null;
  try {
    connection.value = await embyConnect(input.serverUrl, input.username, input.password);
    catalog.clear();
    results.value = [];
    searched.value = false;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "连接 Emby 曲库失败";
    return false;
  } finally {
    connecting.value = false;
  }
}

export async function disconnectEmby(): Promise<boolean> {
  error.value = null;
  try {
    await embyDisconnect();
    connection.value = DISCONNECTED;
    catalog.clear();
    results.value = [];
    searched.value = false;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "断开 Emby 曲库失败";
    return false;
  }
}

export async function searchEmby(keywords: string): Promise<void> {
  if (!connection.value.connected) {
    error.value = "请先连接 Emby 曲库";
    results.value = [];
    searched.value = false;
    return;
  }
  searching.value = true;
  searched.value = false;
  error.value = null;
  try {
    results.value = (await embySearch(keywords, 20)).map(trackFromSong);
    searched.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Emby 暂时无法搜索";
    results.value = [];
  } finally {
    searching.value = false;
  }
}
