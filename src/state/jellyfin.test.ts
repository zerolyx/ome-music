import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  jellyfinAlbumTracks: vi.fn(),
  jellyfinAlbums: vi.fn(),
  jellyfinConnect: vi.fn(),
  jellyfinCoverUrl: vi.fn(),
  jellyfinDisconnect: vi.fn(),
  jellyfinPlaylistTracks: vi.fn(),
  jellyfinPlaylists: vi.fn(),
  jellyfinSearch: vi.fn(),
  jellyfinStatus: vi.fn(),
}));

vi.mock("../lib/api", () => api);

import {
  connectJellyfin,
  connecting,
  connection,
  disconnectJellyfin,
  error,
  refreshJellyfinStatus,
  results,
  searchJellyfin,
  searched,
  searching,
} from "./jellyfin";

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

describe("session-only Jellyfin source", () => {
  it("refreshes only the current process connection", async () => {
    api.jellyfinStatus.mockResolvedValue({ connected: true, serverLabel: "music.home" });

    await refreshJellyfinStatus();

    expect(connection.value).toEqual({ connected: true, serverLabel: "music.home" });
    expect(api.jellyfinStatus).toHaveBeenCalledOnce();
  });

  it("connects with credentials only for the current session", async () => {
    api.jellyfinConnect.mockResolvedValue({ connected: true, serverLabel: "music.home" });

    await expect(connectJellyfin({
      serverUrl: "https://music.home",
      username: "listener",
      password: "session-secret",
    })).resolves.toBe(true);

    expect(api.jellyfinConnect).toHaveBeenCalledWith("https://music.home", "listener", "session-secret");
    expect(connection.value).toEqual({ connected: true, serverLabel: "music.home" });
    expect(connecting.value).toBe(false);
  });

  it("does not call native status from a browser preview", async () => {
    api.isTauriRuntime.mockReturnValue(false);

    await refreshJellyfinStatus();

    expect(connection.value).toEqual({ connected: false, serverLabel: null });
    expect(api.jellyfinStatus).not.toHaveBeenCalled();
  });

  it("maps bounded search results to session-only playable tracks", async () => {
    connection.value = { connected: true, serverLabel: "music.home" };
    api.jellyfinSearch.mockResolvedValue([{
      id: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Quiet Night",
      artist: "Artist",
      album: "Record",
      durationSeconds: 190,
      coverId: "01234567-89ab-cdef-0123-456789abcdef",
    }]);
    api.jellyfinCoverUrl.mockReturnValue("http://ome-media.localhost/jellyfin-cover?id=track");

    await searchJellyfin("Quiet Night");

    expect(api.jellyfinSearch).toHaveBeenCalledWith("Quiet Night", 20);
    expect(results.value).toEqual([expect.objectContaining({
      id: "jellyfin:01234567-89ab-cdef-0123-456789abcdef",
      source: "jellyfin",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      title: "Quiet Night",
      durationSeconds: 190,
      filePath: "",
      coverPath: "http://ome-media.localhost/jellyfin-cover?id=track",
    })]);
    expect(searched.value).toBe(true);
    expect(searching.value).toBe(false);
  });

  it("requires an active session before search and clears results after disconnect", async () => {
    await searchJellyfin("Quiet Night");
    expect(api.jellyfinSearch).not.toHaveBeenCalled();
    expect(error.value).toBe("请先连接 Jellyfin 曲库");

    connection.value = { connected: true, serverLabel: "music.home" };
    results.value = [{
      id: "jellyfin:01234567-89ab-cdef-0123-456789abcdef",
      sourceId: "01234567-89ab-cdef-0123-456789abcdef",
      source: "jellyfin",
      title: "Quiet Night",
      artist: "Artist",
      album: "Record",
      durationSeconds: 190,
      filePath: "",
      coverPath: null,
      liked: false,
      playCount: 0,
    }];
    api.jellyfinDisconnect.mockResolvedValue(undefined);

    await expect(disconnectJellyfin()).resolves.toBe(true);

    expect(connection.value).toEqual({ connected: false, serverLabel: null });
    expect(results.value).toEqual([]);
    expect(searched.value).toBe(false);
  });
});
