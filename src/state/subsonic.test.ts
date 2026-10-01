import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  subsonicConnect: vi.fn(),
  subsonicAlbumTracks: vi.fn(),
  subsonicAlbums: vi.fn(),
  subsonicDisconnect: vi.fn(),
  subsonicPlaylistTracks: vi.fn(),
  subsonicPlaylists: vi.fn(),
  subsonicSearch: vi.fn(),
  subsonicStatus: vi.fn(),
}));

vi.mock("../lib/api", () => api);

import {
  connectSubsonic,
  connecting,
  connection,
  closeSubsonicPlaylist,
  closeSubsonicAlbum,
  disconnectSubsonic,
  error,
  albumError,
  albumHasMore,
  albumLoading,
  albumNextOffset,
  albumTracks,
  albumTruncated,
  albums,
  albumsLoaded,
  albumsLoading,
  loadSubsonicAlbums,
  openSubsonicAlbum,
  loadSubsonicPlaylists,
  openSubsonicPlaylist,
  playlistError,
  playlistLoading,
  playlistPage,
  playlistTracks,
  playlistTotalSongs,
  playlistTruncated,
  playlistsLoaded,
  playlistsLoading,
  results,
  searchSubsonic,
  selectedAlbum,
  searched,
  searching,
  refreshSubsonicStatus,
} from "./subsonic";

afterEach(() => {
  vi.clearAllMocks();
  api.isTauriRuntime.mockReturnValue(true);
  connection.value = { connected: false, serverLabel: null };
  results.value = [];
  searching.value = false;
  searched.value = false;
  error.value = null;
  connecting.value = false;
  playlistPage.value = null;
  playlistsLoaded.value = false;
  playlistsLoading.value = false;
  playlistTracks.value = [];
  playlistTotalSongs.value = 0;
  playlistTruncated.value = false;
  playlistLoading.value = false;
  playlistError.value = null;
  albums.value = [];
  albumHasMore.value = false;
  albumNextOffset.value = 0;
  albumsLoaded.value = false;
  albumsLoading.value = false;
  albumError.value = null;
  albumTracks.value = [];
  albumTruncated.value = false;
  albumLoading.value = false;
  closeSubsonicPlaylist();
  closeSubsonicAlbum();
});

describe("session-only remote music source", () => {
  it("refreshes the current process connection without saving credentials", async () => {
    api.subsonicStatus.mockResolvedValue({ connected: true, serverLabel: "music.home" });

    await refreshSubsonicStatus();

    expect(connection.value).toEqual({ connected: true, serverLabel: "music.home" });
    expect(api.subsonicStatus).toHaveBeenCalledOnce();
  });

  it("connects and clears search state only after a successful ping", async () => {
    api.subsonicConnect.mockResolvedValue({ connected: true, serverLabel: "music.home" });
    results.value = [{
      id: "old-track", title: "Old", artist: "Artist", album: "", durationSeconds: 0,
      filePath: "", source: "subsonic", liked: false, playCount: 0,
    }];
    searched.value = true;

    await expect(connectSubsonic({
      serverUrl: "https://music.home",
      username: "listener",
      password: "session-secret",
    })).resolves.toBe(true);

    expect(connection.value.connected).toBe(true);
    expect(results.value).toEqual([]);
    expect(searched.value).toBe(false);
    expect(connecting.value).toBe(false);
  });

  it("maps bounded server search results to queue-playable tracks", async () => {
    connection.value = { connected: true, serverLabel: "music.home" };
    api.subsonicSearch.mockResolvedValue([{
      id: "track-1", title: "Quiet Night", artist: "Artist", album: "Record", durationSeconds: 190,
    }]);

    await searchSubsonic("Quiet Night");

    expect(api.subsonicSearch).toHaveBeenCalledWith("Quiet Night", 20);
    expect(results.value).toEqual([expect.objectContaining({
      id: "subsonic:track-1",
      source: "subsonic",
      sourceId: "track-1",
      title: "Quiet Night",
      durationSeconds: 190,
      filePath: "",
    })]);
    expect(searched.value).toBe(true);
    expect(searching.value).toBe(false);
  });

  it("does not send a search request while disconnected and clears on disconnect", async () => {
    await searchSubsonic("Quiet Night");
    expect(api.subsonicSearch).not.toHaveBeenCalled();
    expect(error.value).toBe("请先连接远程曲库");

    connection.value = { connected: true, serverLabel: "music.home" };
    results.value = [{
      id: "subsonic:track-1", title: "Quiet Night", artist: "Artist", album: "", durationSeconds: 1,
      filePath: "", source: "subsonic", liked: false, playCount: 0,
    }];
    api.subsonicDisconnect.mockResolvedValue(undefined);
    await expect(disconnectSubsonic()).resolves.toBe(true);
    expect(connection.value).toEqual({ connected: false, serverLabel: null });
    expect(results.value).toEqual([]);
  });

  it("loads server playlists only on request and maps selected playlist tracks", async () => {
    connection.value = { connected: true, serverLabel: "music.home" };
    api.subsonicPlaylists.mockResolvedValue({
      playlists: [{ id: "playlist-1", name: "Evening", songCount: 1 }],
      totalCount: 1,
      truncated: false,
    });
    api.subsonicPlaylistTracks.mockResolvedValue({
      playlistId: "playlist-1",
      name: "Evening",
      totalSongs: 1,
      truncated: false,
      tracks: [{ id: "track-1", title: "Quiet Night", artist: "Artist", album: "Record", durationSeconds: 190 }],
    });

    expect(api.subsonicPlaylists).not.toHaveBeenCalled();
    await loadSubsonicPlaylists();
    expect(playlistPage.value?.playlists).toEqual([{ id: "playlist-1", name: "Evening", songCount: 1 }]);
    expect(playlistsLoaded.value).toBe(true);
    await loadSubsonicPlaylists();
    expect(api.subsonicPlaylists).toHaveBeenCalledOnce();
    await loadSubsonicPlaylists(true);
    expect(api.subsonicPlaylists).toHaveBeenCalledTimes(2);

    await openSubsonicPlaylist(playlistPage.value!.playlists[0]);
    expect(api.subsonicPlaylistTracks).toHaveBeenCalledWith("playlist-1");
    expect(playlistTracks.value).toEqual([expect.objectContaining({
      id: "subsonic:track-1",
      source: "subsonic",
      sourceId: "track-1",
      title: "Quiet Night",
      filePath: "",
    })]);
    expect(playlistTotalSongs.value).toBe(1);
    expect(playlistTruncated.value).toBe(false);
    expect(playlistLoading.value).toBe(false);

    closeSubsonicPlaylist();
    expect(playlistTracks.value).toEqual([]);
  });

  it("does not fetch remote playlists while disconnected", async () => {
    await loadSubsonicPlaylists();
    expect(api.subsonicPlaylists).not.toHaveBeenCalled();
    expect(playlistError.value).toBe("请先连接远程曲库");
  });

  it("loads remote album pages on demand and maps album tracks to queue tracks", async () => {
    connection.value = { connected: true, serverLabel: "music.home" };
    api.subsonicAlbums
      .mockResolvedValueOnce({
        albums: [{
          id: "album-1", name: "Record", artist: "Artist", year: 2024,
          songCount: 1, coverArtId: "cover-1",
        }],
        offset: 0,
        hasMore: true,
      })
      .mockResolvedValueOnce({ albums: [], offset: 24, hasMore: false });
    api.subsonicAlbumTracks.mockResolvedValue({
      album: {
        id: "album-1", name: "Record", artist: "Artist", year: 2024,
        songCount: 1, coverArtId: "cover-1",
      },
      truncated: false,
      tracks: [{
        id: "track-1", title: "Quiet Night", artist: "Artist", album: "Record", durationSeconds: 190,
      }],
    });

    expect(api.subsonicAlbums).not.toHaveBeenCalled();
    await loadSubsonicAlbums(true);
    expect(api.subsonicAlbums).toHaveBeenCalledWith(0);
    expect(albums.value[0]).toMatchObject({ id: "album-1", coverArtId: "cover-1" });
    expect(albumHasMore.value).toBe(true);
    expect(albumsLoaded.value).toBe(true);

    await openSubsonicAlbum(albums.value[0]);
    expect(api.subsonicAlbumTracks).toHaveBeenCalledWith("album-1");
    expect(selectedAlbum.value?.name).toBe("Record");
    expect(albumTracks.value).toEqual([expect.objectContaining({
      id: "subsonic:track-1", source: "subsonic", sourceId: "track-1", filePath: "",
    })]);
    expect(albumLoading.value).toBe(false);
    expect(albumTruncated.value).toBe(false);

    closeSubsonicAlbum();
    await loadSubsonicAlbums();
    expect(api.subsonicAlbums).toHaveBeenLastCalledWith(24);
    expect(albumHasMore.value).toBe(false);
    expect(albums.value).toHaveLength(1);
  });

  it("keeps album browsing idle and read-only while disconnected", async () => {
    await loadSubsonicAlbums(true);
    expect(api.subsonicAlbums).not.toHaveBeenCalled();
    expect(albumError.value).toBe("请先连接远程曲库");
  });

  it("discards late album responses after detail close or disconnect", async () => {
    connection.value = { connected: true, serverLabel: "music.home" };
    let resolvePage!: (value: {
      albums: Array<{ id: string; name: string; artist: string; year: number | null; songCount: number; coverArtId: string | null }>;
      offset: number;
      hasMore: boolean;
    }) => void;
    api.subsonicAlbums.mockReturnValue(new Promise((resolve) => { resolvePage = resolve; }));
    const pageLoad = loadSubsonicAlbums(true);
    api.subsonicDisconnect.mockResolvedValue(undefined);
    await disconnectSubsonic();
    resolvePage({ albums: [{
      id: "old-album", name: "Old", artist: "Artist", year: null, songCount: 0, coverArtId: null,
    }], offset: 0, hasMore: false });
    await pageLoad;
    expect(albums.value).toEqual([]);
    expect(albumsLoaded.value).toBe(false);
    expect(albumsLoading.value).toBe(false);

    connection.value = { connected: true, serverLabel: "music.home" };
    let resolveDetail!: (value: {
      album: { id: string; name: string; artist: string; year: number | null; songCount: number; coverArtId: string | null };
      tracks: Array<{ id: string; title: string; artist: string; album: string; durationSeconds: number }>;
      truncated: boolean;
    }) => void;
    api.subsonicAlbumTracks.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve; }));
    const detailLoad = openSubsonicAlbum({
      id: "album-1", name: "Record", artist: "Artist", year: null, songCount: 1, coverArtId: null,
    });
    closeSubsonicAlbum();
    resolveDetail({
      album: { id: "album-1", name: "Record", artist: "Artist", year: null, songCount: 1, coverArtId: null },
      tracks: [{ id: "track-1", title: "Late", artist: "Artist", album: "Record", durationSeconds: 1 }],
      truncated: false,
    });
    await detailLoad;
    expect(selectedAlbum.value).toBeNull();
    expect(albumTracks.value).toEqual([]);
    expect(albumLoading.value).toBe(false);
  });
});
