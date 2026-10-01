import { signal } from "@preact/signals";
import {
  isTauriRuntime,
  jellyfinAlbumTracks,
  jellyfinAlbums,
  jellyfinPlaylists,
  jellyfinConnect,
  jellyfinDisconnect,
  jellyfinSearch,
  jellyfinPlaylistTracks,
  jellyfinStatus,
  jellyfinCoverUrl,
  type JellyfinSong,
  type JellyfinStatus,
} from "../lib/api";
import type { Track } from "../types/music";
import { currentTrack } from "./player";
import { clearJellyfinLyricCache, loadLyricFor } from "./lyrics";
import { createRemoteCatalog } from "./remote-catalog";

const DISCONNECTED: JellyfinStatus = { connected: false, serverLabel: null };

function resetJellyfinLyrics(): void {
  clearJellyfinLyricCache();
  const track = currentTrack.value;
  if (track?.source === "jellyfin") void loadLyricFor(track);
}

export const connection = signal<JellyfinStatus>(DISCONNECTED);
export const results = signal<Track[]>([]);
export const searching = signal(false);
export const searched = signal(false);
export const connecting = signal(false);
export const error = signal<string | null>(null);

export const catalog = createRemoteCatalog(
  "jellyfin",
  () => connection.value.connected,
  {
    albums: jellyfinAlbums,
    albumTracks: jellyfinAlbumTracks,
    playlists: jellyfinPlaylists,
    playlistTracks: jellyfinPlaylistTracks,
  },
  jellyfinCoverUrl,
);

function trackFromSong(song: JellyfinSong): Track {
  return {
    id: `jellyfin:${song.id}`,
    sourceId: song.id,
    source: "jellyfin",
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationSeconds: song.durationSeconds,
    filePath: "",
    coverPath: song.coverId ? jellyfinCoverUrl(song.coverId) : null,
    liked: false,
    playCount: 0,
  };
}

export async function refreshJellyfinStatus(): Promise<void> {
  if (!isTauriRuntime()) {
    connection.value = DISCONNECTED;
    resetJellyfinLyrics();
    return;
  }
  try {
    connection.value = await jellyfinStatus();
    if (!connection.value.connected) {
      catalog.clear();
      resetJellyfinLyrics();
    }
  } catch {
    connection.value = DISCONNECTED;
    catalog.clear();
    resetJellyfinLyrics();
  }
}

export async function connectJellyfin(input: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<boolean> {
  connecting.value = true;
  error.value = null;
  try {
    connection.value = await jellyfinConnect(input.serverUrl, input.username, input.password);
    catalog.clear();
    resetJellyfinLyrics();
    results.value = [];
    searched.value = false;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "连接 Jellyfin 曲库失败";
    return false;
  } finally {
    connecting.value = false;
  }
}

export async function disconnectJellyfin(): Promise<boolean> {
  error.value = null;
  try {
    await jellyfinDisconnect();
    connection.value = DISCONNECTED;
    catalog.clear();
    resetJellyfinLyrics();
    results.value = [];
    searched.value = false;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "断开 Jellyfin 曲库失败";
    return false;
  }
}

export async function searchJellyfin(keywords: string): Promise<void> {
  if (!connection.value.connected) {
    error.value = "请先连接 Jellyfin 曲库";
    results.value = [];
    searched.value = false;
    return;
  }
  searching.value = true;
  searched.value = false;
  error.value = null;
  try {
    results.value = (await jellyfinSearch(keywords, 20)).map(trackFromSong);
    searched.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Jellyfin 暂时无法搜索";
    results.value = [];
  } finally {
    searching.value = false;
  }
}
