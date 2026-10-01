import { describe, expect, it, vi } from "vitest";
import type {
  MediaServerAlbumPage,
  MediaServerPlaylistPage,
  MediaServerTracksPage,
} from "../lib/api";
import { createRemoteCatalog, type RemoteMediaCatalogApi } from "./remote-catalog";

const albumPage = (offset: number, nextOffset: number, hasMore: boolean): MediaServerAlbumPage => ({
  albums: [{
    id: `album-${offset}`,
    name: `Album ${offset}`,
    artist: "Artist",
    year: 2024,
    songCount: 1,
    coverId: `cover-${offset}`,
  }],
  offset,
  nextOffset,
  totalCount: hasMore ? nextOffset + 1 : nextOffset,
  hasMore,
});

const trackPage = (overrides: Partial<MediaServerTracksPage> = {}): MediaServerTracksPage => ({
  tracks: [{
    id: "01234567-89ab-cdef-0123-456789abcdef",
    title: "Track",
    artist: "Artist",
    album: "Album",
    durationSeconds: 120,
    coverId: "01234567-89ab-cdef-0123-456789abcdef",
  }],
  totalCount: 1,
  truncated: false,
  ...overrides,
});

const playlistPage: MediaServerPlaylistPage = {
  playlists: [{ id: "playlist-id", name: "Quiet Night", songCount: 1 }],
  totalCount: 1,
  truncated: false,
};

function createApi(overrides: Partial<RemoteMediaCatalogApi> = {}): RemoteMediaCatalogApi {
  return {
    albums: vi.fn().mockResolvedValue(albumPage(0, 24, false)),
    albumTracks: vi.fn().mockResolvedValue(trackPage()),
    playlists: vi.fn().mockResolvedValue(playlistPage),
    playlistTracks: vi.fn().mockResolvedValue(trackPage()),
    ...overrides,
  };
}

describe("remote media catalog", () => {
  it("loads album pages without duplicating entries and preserves the server cursor", async () => {
    const api = createApi({
      albums: vi.fn()
        .mockResolvedValueOnce(albumPage(0, 24, true))
        .mockResolvedValueOnce(albumPage(24, 25, false)),
    });
    const catalog = createRemoteCatalog("jellyfin", () => true, api, (id) => `cover:${id}`);

    await catalog.loadAlbums(true);
    await catalog.loadAlbums();

    expect(api.albums).toHaveBeenNthCalledWith(1, 0);
    expect(api.albums).toHaveBeenNthCalledWith(2, 24);
    expect(catalog.albums.value.map((album) => album.id)).toEqual(["album-0", "album-24"]);
    expect(catalog.albumHasMore.value).toBe(false);
    expect(catalog.albumsTotalCount.value).toBe(25);
  });

  it("maps selected album tracks into the shared player model and shows truncation", async () => {
    const api = createApi({
      albumTracks: vi.fn().mockResolvedValue(trackPage({ totalCount: 205, truncated: true })),
    });
    const catalog = createRemoteCatalog("jellyfin", () => true, api, (id) => `cover:${id}`);

    await catalog.openAlbum({
      id: "album-id",
      name: "Album",
      artist: "Artist",
      year: null,
      songCount: 205,
      coverId: "album-id",
    });

    expect(api.albumTracks).toHaveBeenCalledWith("album-id");
    expect(catalog.albumTracks.value[0]).toMatchObject({
      id: "jellyfin:01234567-89ab-cdef-0123-456789abcdef",
      source: "jellyfin",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      coverPath: "cover:01234567-89ab-cdef-0123-456789abcdef",
    });
    expect(catalog.albumTotalSongs.value).toBe(205);
    expect(catalog.albumTruncated.value).toBe(true);
  });

  it("loads playlist tracks with the same queue-ready track shape", async () => {
    const api = createApi();
    const catalog = createRemoteCatalog("emby", () => true, api, (id) => `cover:${id}`);
    await catalog.loadPlaylists(true);
    await catalog.openPlaylist(playlistPage.playlists[0]);

    expect(api.playlistTracks).toHaveBeenCalledWith("playlist-id");
    expect(catalog.playlistTracks.value[0]).toMatchObject({
      id: "emby:01234567-89ab-cdef-0123-456789abcdef",
      source: "emby",
    });
  });

  it("does not request remote data while disconnected", async () => {
    const api = createApi();
    const catalog = createRemoteCatalog("emby", () => false, api, () => null);

    await catalog.loadAlbums(true);
    await catalog.loadPlaylists(true);

    expect(api.albums).not.toHaveBeenCalled();
    expect(api.playlists).not.toHaveBeenCalled();
    expect(catalog.albumListError.value).toBe("请先连接 Emby 曲库");
    expect(catalog.playlistListError.value).toBe("请先连接 Emby 曲库");
  });

  it("drops results that complete after the catalog session is cleared", async () => {
    let resolvePage!: (page: MediaServerAlbumPage) => void;
    const api = createApi({
      albums: vi.fn((_offset: number) => new Promise<MediaServerAlbumPage>((resolve) => { resolvePage = resolve; })),
    });
    const catalog = createRemoteCatalog("jellyfin", () => true, api, () => null);
    const pending = catalog.loadAlbums(true);
    catalog.clear();
    resolvePage(albumPage(0, 1, false));
    await pending;

    expect(catalog.albums.value).toEqual([]);
    expect(catalog.albumsLoading.value).toBe(false);
  });
});
