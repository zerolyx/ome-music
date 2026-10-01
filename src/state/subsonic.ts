import { signal } from "@preact/signals";
import {
  isTauriRuntime,
  subsonicAlbumTracks,
  subsonicAlbums,
  subsonicConnect,
  subsonicDisconnect,
  subsonicPlaylistTracks,
  subsonicPlaylists,
  subsonicSearch,
  subsonicStatus,
} from "../lib/api";
import type { Track } from "../types/music";
import type {
  SubsonicPlaylist,
  SubsonicPlaylistPage,
  SubsonicSong,
  SubsonicAlbum,
  SubsonicStatus,
} from "../lib/api";
import { currentTrack } from "./player";
import { clearSubsonicLyricCache, loadLyricFor } from "./lyrics";

const DISCONNECTED: SubsonicStatus = { connected: false, serverLabel: null };

export const connection = signal<SubsonicStatus>(DISCONNECTED);
export const results = signal<Track[]>([]);
export const searching = signal(false);
export const searched = signal(false);
export const error = signal<string | null>(null);
export const connecting = signal(false);
export const playlistPage = signal<SubsonicPlaylistPage | null>(null);
export const playlistsLoaded = signal(false);
export const playlistsLoading = signal(false);
export const selectedPlaylist = signal<SubsonicPlaylist | null>(null);
export const playlistTracks = signal<Track[]>([]);
export const playlistTotalSongs = signal(0);
export const playlistTruncated = signal(false);
export const playlistLoading = signal(false);
export const playlistError = signal<string | null>(null);
export const albums = signal<SubsonicAlbum[]>([]);
export const albumHasMore = signal(false);
export const albumNextOffset = signal(0);
export const albumsLoaded = signal(false);
export const albumsLoading = signal(false);
export const albumError = signal<string | null>(null);
export const selectedAlbum = signal<SubsonicAlbum | null>(null);
export const albumTracks = signal<Track[]>([]);
export const albumTruncated = signal(false);
export const albumLoading = signal(false);

const ALBUM_PAGE_SIZE = 24;
let albumPageRevision = 0;
let albumDetailRevision = 0;

function trackFromSong(song: SubsonicSong): Track {
  return {
    id: `subsonic:${song.id}`,
    sourceId: song.id,
    source: "subsonic",
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationSeconds: song.durationSeconds,
    filePath: "",
    liked: false,
    playCount: 0,
  };
}

function clearPlaylistBrowser(): void {
  playlistPage.value = null;
  playlistsLoaded.value = false;
  playlistsLoading.value = false;
  selectedPlaylist.value = null;
  playlistTracks.value = [];
  playlistTotalSongs.value = 0;
  playlistTruncated.value = false;
  playlistLoading.value = false;
  playlistError.value = null;
}

function clearAlbumBrowser(): void {
  albumPageRevision += 1;
  albumDetailRevision += 1;
  albums.value = [];
  albumHasMore.value = false;
  albumNextOffset.value = 0;
  albumsLoaded.value = false;
  albumsLoading.value = false;
  albumError.value = null;
  selectedAlbum.value = null;
  albumTracks.value = [];
  albumTruncated.value = false;
  albumLoading.value = false;
}

function clearRemoteBrowsers(): void {
  clearPlaylistBrowser();
  clearAlbumBrowser();
}

export async function refreshSubsonicStatus(): Promise<void> {
  if (!isTauriRuntime()) {
    connection.value = DISCONNECTED;
    clearSubsonicLyricCache();
    return;
  }
  try {
    connection.value = await subsonicStatus();
    if (!connection.value.connected) {
      clearRemoteBrowsers();
      clearSubsonicLyricCache();
    }
  } catch {
    connection.value = DISCONNECTED;
    clearRemoteBrowsers();
    clearSubsonicLyricCache();
  }
}

export async function connectSubsonic(input: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<boolean> {
  connecting.value = true;
  error.value = null;
  try {
    connection.value = await subsonicConnect(input.serverUrl, input.username, input.password);
    clearSubsonicLyricCache();
    if (currentTrack.value?.source === "subsonic") void loadLyricFor(currentTrack.value);
    results.value = [];
    searched.value = false;
    clearRemoteBrowsers();
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "连接远程曲库失败";
    return false;
  } finally {
    connecting.value = false;
  }
}

export async function disconnectSubsonic(): Promise<boolean> {
  error.value = null;
  try {
    await subsonicDisconnect();
    connection.value = DISCONNECTED;
    clearSubsonicLyricCache();
    results.value = [];
    searched.value = false;
    clearRemoteBrowsers();
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "断开远程曲库失败";
    return false;
  }
}

export async function searchSubsonic(keywords: string): Promise<void> {
  if (!connection.value.connected) {
    error.value = "请先连接远程曲库";
    results.value = [];
    searched.value = false;
    return;
  }
  searching.value = true;
  searched.value = false;
  error.value = null;
  try {
    results.value = (await subsonicSearch(keywords, 20)).map(trackFromSong);
    searched.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "远程曲库暂时无法搜索";
    results.value = [];
  } finally {
    searching.value = false;
  }
}

export async function loadSubsonicPlaylists(force = false): Promise<void> {
  if (!connection.value.connected) {
    playlistError.value = "请先连接远程曲库";
    return;
  }
  if ((playlistsLoaded.value && !force) || playlistsLoading.value) return;
  playlistsLoading.value = true;
  playlistError.value = null;
  try {
    playlistPage.value = await subsonicPlaylists();
    playlistsLoaded.value = true;
  } catch (cause) {
    playlistError.value = cause instanceof Error ? cause.message : "远程歌单暂时无法读取";
  } finally {
    playlistsLoading.value = false;
  }
}

export async function openSubsonicPlaylist(playlist: SubsonicPlaylist): Promise<void> {
  if (!connection.value.connected) {
    playlistError.value = "请先连接远程曲库";
    return;
  }
  selectedPlaylist.value = playlist;
  playlistTracks.value = [];
  playlistTotalSongs.value = playlist.songCount;
  playlistTruncated.value = false;
  playlistLoading.value = true;
  playlistError.value = null;
  try {
    const detail = await subsonicPlaylistTracks(playlist.id);
    selectedPlaylist.value = { id: detail.playlistId, name: detail.name, songCount: detail.totalSongs };
    playlistTracks.value = detail.tracks.map(trackFromSong);
    playlistTotalSongs.value = detail.totalSongs;
    playlistTruncated.value = detail.truncated;
  } catch (cause) {
    selectedPlaylist.value = null;
    playlistError.value = cause instanceof Error ? cause.message : "远程歌单暂时无法读取";
  } finally {
    playlistLoading.value = false;
  }
}

export function closeSubsonicPlaylist(): void {
  selectedPlaylist.value = null;
  playlistTracks.value = [];
  playlistTotalSongs.value = 0;
  playlistTruncated.value = false;
  playlistError.value = null;
}

export async function loadSubsonicAlbums(force = false): Promise<void> {
  if (!connection.value.connected) {
    albumError.value = "请先连接远程曲库";
    return;
  }
  if (albumsLoading.value || (!force && albumsLoaded.value && !albumHasMore.value)) return;

  const offset = force ? 0 : albumNextOffset.value;
  albumsLoading.value = true;
  albumError.value = null;
  if (force) {
    albumDetailRevision += 1;
    albums.value = [];
    albumHasMore.value = false;
    albumNextOffset.value = 0;
    albumsLoaded.value = false;
    selectedAlbum.value = null;
    albumTracks.value = [];
    albumTruncated.value = false;
  }
  const revision = ++albumPageRevision;

  try {
    const page = await subsonicAlbums(offset);
    if (revision !== albumPageRevision) return;
    const current = force ? [] : albums.value;
    const knownIds = new Set(current.map((album) => album.id));
    albums.value = [
      ...current,
      ...page.albums.filter((album) => !knownIds.has(album.id)),
    ];
    albumHasMore.value = page.hasMore;
    albumNextOffset.value = page.offset + ALBUM_PAGE_SIZE;
    albumsLoaded.value = true;
  } catch (cause) {
    if (revision !== albumPageRevision) return;
    albumError.value = cause instanceof Error ? cause.message : "远程专辑暂时无法读取";
  } finally {
    if (revision === albumPageRevision) albumsLoading.value = false;
  }
}

export async function openSubsonicAlbum(album: SubsonicAlbum): Promise<void> {
  if (!connection.value.connected) {
    albumError.value = "请先连接远程曲库";
    return;
  }
  selectedAlbum.value = album;
  albumTracks.value = [];
  albumTruncated.value = false;
  albumLoading.value = true;
  albumError.value = null;
  const revision = ++albumDetailRevision;
  try {
    const detail = await subsonicAlbumTracks(album.id);
    if (revision !== albumDetailRevision) return;
    selectedAlbum.value = detail.album;
    albumTracks.value = detail.tracks.map(trackFromSong);
    albumTruncated.value = detail.truncated;
  } catch (cause) {
    if (revision !== albumDetailRevision) return;
    albumError.value = cause instanceof Error ? cause.message : "远程专辑暂时无法读取";
  } finally {
    if (revision === albumDetailRevision) albumLoading.value = false;
  }
}

export function closeSubsonicAlbum(): void {
  albumDetailRevision += 1;
  selectedAlbum.value = null;
  albumTracks.value = [];
  albumTruncated.value = false;
  albumLoading.value = false;
  albumError.value = null;
}
