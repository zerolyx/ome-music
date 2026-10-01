import { signal } from "@preact/signals";
import type {
  MediaServerAlbum,
  MediaServerAlbumPage,
  MediaServerPlaylist,
  MediaServerPlaylistPage,
  MediaServerTracksPage,
  JellyfinSong,
} from "../lib/api";
import type { Track } from "../types/music";

const ALBUM_PAGE_SIZE = 24;

export interface RemoteMediaCatalogApi {
  albums(offset: number): Promise<MediaServerAlbumPage>;
  albumTracks(albumId: string): Promise<MediaServerTracksPage>;
  playlists(): Promise<MediaServerPlaylistPage>;
  playlistTracks(playlistId: string): Promise<MediaServerTracksPage>;
}

export function createRemoteCatalog(
  source: "jellyfin" | "emby",
  isConnected: () => boolean,
  api: RemoteMediaCatalogApi,
  coverUrl: (itemId: string) => string | null,
) {
  const albums = signal<MediaServerAlbum[]>([]);
  const albumsTotalCount = signal(0);
  const albumNextOffset = signal(0);
  const albumHasMore = signal(false);
  const albumsLoaded = signal(false);
  const albumsLoading = signal(false);
  const albumListError = signal<string | null>(null);
  const selectedAlbum = signal<MediaServerAlbum | null>(null);
  const albumTracks = signal<Track[]>([]);
  const albumTotalSongs = signal(0);
  const albumTruncated = signal(false);
  const albumLoading = signal(false);
  const albumError = signal<string | null>(null);

  const playlists = signal<MediaServerPlaylist[]>([]);
  const playlistsTotalCount = signal(0);
  const playlistsTruncated = signal(false);
  const playlistsLoaded = signal(false);
  const playlistsLoading = signal(false);
  const playlistListError = signal<string | null>(null);
  const selectedPlaylist = signal<MediaServerPlaylist | null>(null);
  const playlistTracks = signal<Track[]>([]);
  const playlistTotalSongs = signal(0);
  const playlistTruncated = signal(false);
  const playlistLoading = signal(false);
  const playlistError = signal<string | null>(null);

  let albumListRevision = 0;
  let albumDetailRevision = 0;
  let playlistListRevision = 0;
  let playlistDetailRevision = 0;

  const sourceLabel = source === "jellyfin" ? "Jellyfin" : "Emby";
  const errorMessage = (cause: unknown, fallback: string) =>
    cause instanceof Error ? cause.message : fallback;

  function toTracks(page: MediaServerTracksPage): Track[] {
    return page.tracks.map((song: JellyfinSong) => ({
      id: `${source}:${song.id}`,
      sourceId: song.id,
      source,
      title: song.title,
      artist: song.artist,
      album: song.album,
      durationSeconds: song.durationSeconds,
      filePath: "",
      coverPath: song.coverId ? coverUrl(song.coverId) : null,
      liked: false,
      playCount: 0,
    }));
  }

  function clear(): void {
    albumListRevision += 1;
    albumDetailRevision += 1;
    playlistListRevision += 1;
    playlistDetailRevision += 1;

    albums.value = [];
    albumsTotalCount.value = 0;
    albumNextOffset.value = 0;
    albumHasMore.value = false;
    albumsLoaded.value = false;
    albumsLoading.value = false;
    albumListError.value = null;
    closeAlbum();

    playlists.value = [];
    playlistsTotalCount.value = 0;
    playlistsTruncated.value = false;
    playlistsLoaded.value = false;
    playlistsLoading.value = false;
    playlistListError.value = null;
    closePlaylist();
  }

  async function loadAlbums(force = false): Promise<void> {
    if (!isConnected()) {
      albumListError.value = `请先连接 ${sourceLabel} 曲库`;
      return;
    }
    if (albumsLoading.value) return;
    if (!force && albumsLoaded.value && !albumHasMore.value) return;

    if (force) {
      albumListRevision += 1;
      albums.value = [];
      albumsTotalCount.value = 0;
      albumNextOffset.value = 0;
      albumHasMore.value = false;
      albumsLoaded.value = false;
    }
    const revision = albumListRevision;
    const offset = albumNextOffset.value;
    albumsLoading.value = true;
    albumListError.value = null;
    try {
      const page = await api.albums(offset);
      if (revision !== albumListRevision) return;
      const existing = new Set(albums.value.map((album) => album.id));
      const freshAlbums = page.albums.filter((album) => !existing.has(album.id));
      albums.value = force ? page.albums : [...albums.value, ...freshAlbums];
      albumsTotalCount.value = page.totalCount;
      albumNextOffset.value = page.nextOffset;
      albumHasMore.value = page.hasMore;
      albumsLoaded.value = true;
    } catch (cause) {
      if (revision === albumListRevision) {
        albumListError.value = errorMessage(cause, `${sourceLabel} 暂时无法读取专辑`);
      }
    } finally {
      if (revision === albumListRevision) albumsLoading.value = false;
    }
  }

  async function openAlbum(album: MediaServerAlbum): Promise<void> {
    if (!isConnected()) {
      albumError.value = `请先连接 ${sourceLabel} 曲库`;
      return;
    }
    const revision = ++albumDetailRevision;
    selectedAlbum.value = album;
    albumTracks.value = [];
    albumTotalSongs.value = album.songCount;
    albumTruncated.value = false;
    albumLoading.value = true;
    albumError.value = null;
    try {
      const page = await api.albumTracks(album.id);
      if (revision !== albumDetailRevision) return;
      albumTracks.value = toTracks(page);
      albumTotalSongs.value = page.totalCount;
      albumTruncated.value = page.truncated;
    } catch (cause) {
      if (revision === albumDetailRevision) {
        albumError.value = errorMessage(cause, `无法读取这张 ${sourceLabel} 专辑`);
      }
    } finally {
      if (revision === albumDetailRevision) albumLoading.value = false;
    }
  }

  function closeAlbum(): void {
    albumDetailRevision += 1;
    selectedAlbum.value = null;
    albumTracks.value = [];
    albumTotalSongs.value = 0;
    albumTruncated.value = false;
    albumLoading.value = false;
    albumError.value = null;
  }

  async function loadPlaylists(force = false): Promise<void> {
    if (!isConnected()) {
      playlistListError.value = `请先连接 ${sourceLabel} 曲库`;
      return;
    }
    if ((playlistsLoaded.value && !force) || playlistsLoading.value) return;
    if (force) {
      playlistListRevision += 1;
      playlists.value = [];
      playlistsTotalCount.value = 0;
      playlistsTruncated.value = false;
      playlistsLoaded.value = false;
    }
    const revision = playlistListRevision;
    playlistsLoading.value = true;
    playlistListError.value = null;
    try {
      const page = await api.playlists();
      if (revision !== playlistListRevision) return;
      playlists.value = page.playlists;
      playlistsTotalCount.value = page.totalCount;
      playlistsTruncated.value = page.truncated;
      playlistsLoaded.value = true;
    } catch (cause) {
      if (revision === playlistListRevision) {
        playlistListError.value = errorMessage(cause, `${sourceLabel} 暂时无法读取歌单`);
      }
    } finally {
      if (revision === playlistListRevision) playlistsLoading.value = false;
    }
  }

  async function openPlaylist(playlist: MediaServerPlaylist): Promise<void> {
    if (!isConnected()) {
      playlistError.value = `请先连接 ${sourceLabel} 曲库`;
      return;
    }
    const revision = ++playlistDetailRevision;
    selectedPlaylist.value = playlist;
    playlistTracks.value = [];
    playlistTotalSongs.value = playlist.songCount;
    playlistTruncated.value = false;
    playlistLoading.value = true;
    playlistError.value = null;
    try {
      const page = await api.playlistTracks(playlist.id);
      if (revision !== playlistDetailRevision) return;
      playlistTracks.value = toTracks(page);
      playlistTotalSongs.value = page.totalCount;
      playlistTruncated.value = page.truncated;
    } catch (cause) {
      if (revision === playlistDetailRevision) {
        playlistError.value = errorMessage(cause, `无法读取这个 ${sourceLabel} 歌单`);
      }
    } finally {
      if (revision === playlistDetailRevision) playlistLoading.value = false;
    }
  }

  function closePlaylist(): void {
    playlistDetailRevision += 1;
    selectedPlaylist.value = null;
    playlistTracks.value = [];
    playlistTotalSongs.value = 0;
    playlistTruncated.value = false;
    playlistLoading.value = false;
    playlistError.value = null;
  }

  return {
    albums,
    albumsTotalCount,
    albumNextOffset,
    albumHasMore,
    albumsLoaded,
    albumsLoading,
    albumListError,
    selectedAlbum,
    albumTracks,
    albumTotalSongs,
    albumTruncated,
    albumLoading,
    albumError,
    playlists,
    playlistsTotalCount,
    playlistsTruncated,
    playlistsLoaded,
    playlistsLoading,
    playlistListError,
    selectedPlaylist,
    playlistTracks,
    playlistTotalSongs,
    playlistTruncated,
    playlistLoading,
    playlistError,
    loadAlbums,
    openAlbum,
    closeAlbum,
    loadPlaylists,
    openPlaylist,
    closePlaylist,
    clear,
  };
}

export { ALBUM_PAGE_SIZE };
