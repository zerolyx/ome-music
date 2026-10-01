import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  embyConnect: vi.fn(),
  embyAlbumTracks: vi.fn(),
  embyAlbums: vi.fn(),
  embyCoverUrl: vi.fn(),
  embyDisconnect: vi.fn(),
  embyPlaylistTracks: vi.fn(),
  embyPlaylists: vi.fn(),
  embySearch: vi.fn(),
  embyStatus: vi.fn(),
}));

vi.mock("../lib/api", () => api);

import {
  connectEmby,
  connecting,
  connection,
  disconnectEmby,
  error,
  refreshEmbyStatus,
  results,
  searchEmby,
  searched,
  searching,
} from "./emby";

afterEach(() => {
  vi.clearAllMocks();
  api.isTauriRuntime.mockReturnValue(true);
  connection.value = { connected: false, serverLabel: null };
  results.value = [];
  searching.value = false;
  searched.value = false;
  connecting.value = false;
  error.value = null;
});

describe("session-only Emby source", () => {
  it("refreshes the current process connection and connects explicitly", async () => {
    api.embyStatus.mockResolvedValue({ connected: true, serverLabel: "media.home" });
    await refreshEmbyStatus();
    expect(connection.value).toEqual({ connected: true, serverLabel: "media.home" });

    api.embyConnect.mockResolvedValue({ connected: true, serverLabel: "media.home" });
    await expect(connectEmby({
      serverUrl: "https://media.home",
      username: "listener",
      password: "session-secret",
    })).resolves.toBe(true);
    expect(api.embyConnect).toHaveBeenCalledWith("https://media.home", "listener", "session-secret");
    expect(connecting.value).toBe(false);
  });

  it("does not call native status from a browser preview", async () => {
    api.isTauriRuntime.mockReturnValue(false);

    await refreshEmbyStatus();

    expect(connection.value).toEqual({ connected: false, serverLabel: null });
    expect(api.embyStatus).not.toHaveBeenCalled();
  });

  it("maps bounded search results to queue-playable tracks", async () => {
    connection.value = { connected: true, serverLabel: "media.home" };
    api.embySearch.mockResolvedValue([{
      id: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Quiet Night",
      artist: "Artist",
      album: "Record",
      durationSeconds: 190,
      coverId: "01234567-89ab-cdef-0123-456789abcdef",
    }]);
    api.embyCoverUrl.mockReturnValue("http://ome-media.localhost/emby-cover?id=track");

    await searchEmby("Quiet Night");

    expect(api.embySearch).toHaveBeenCalledWith("Quiet Night", 20);
    expect(results.value).toEqual([expect.objectContaining({
      id: "emby:01234567-89ab-cdef-0123-456789abcdef",
      source: "emby",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Quiet Night",
      durationSeconds: 190,
      filePath: "",
      coverPath: "http://ome-media.localhost/emby-cover?id=track",
    })]);
    expect(searched.value).toBe(true);
    expect(searching.value).toBe(false);
  });

  it("requires a connection to search and clears results after disconnect", async () => {
    await searchEmby("Quiet Night");
    expect(api.embySearch).not.toHaveBeenCalled();
    expect(error.value).toBe("请先连接 Emby 曲库");

    connection.value = { connected: true, serverLabel: "media.home" };
    results.value = [{
      id: "emby:01234567-89ab-cdef-0123-456789abcdef",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      source: "emby",
      title: "Quiet Night",
      artist: "Artist",
      album: "Record",
      durationSeconds: 190,
      filePath: "",
      coverPath: null,
      liked: false,
      playCount: 0,
    }];
    api.embyDisconnect.mockResolvedValue(undefined);

    await expect(disconnectEmby()).resolves.toBe(true);

    expect(connection.value).toEqual({ connected: false, serverLabel: null });
    expect(results.value).toEqual([]);
    expect(searched.value).toBe(false);
  });
});
