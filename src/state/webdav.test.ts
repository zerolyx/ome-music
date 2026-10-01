import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  webdavConnect: vi.fn(),
  webdavDisconnect: vi.fn(),
  webdavListDirectory: vi.fn(),
  webdavStatus: vi.fn(),
}));

vi.mock("../lib/api", () => api);

import {
  breadcrumbs,
  connectWebDav,
  connecting,
  connection,
  currentDirectoryId,
  disconnectWebDav,
  entries,
  error,
  loadWebDavDirectory,
  loading,
  refreshWebDavStatus,
  resetWebDavState,
  tracksFromWebDavEntries,
} from "./webdav";

afterEach(() => {
  vi.clearAllMocks();
  api.isTauriRuntime.mockReturnValue(true);
  api.webdavDisconnect.mockResolvedValue(undefined);
  resetWebDavState();
});

describe("session-only WebDAV music source", () => {
  it("refreshes only the desktop process connection", async () => {
    api.webdavStatus.mockResolvedValue({ connected: true, serverLabel: "dav.home" });

    await expect(refreshWebDavStatus()).resolves.toBe(true);

    expect(connection.value).toEqual({ connected: true, serverLabel: "dav.home" });
    expect(api.webdavStatus).toHaveBeenCalledOnce();
  });

  it("does not invoke native commands in a browser preview", async () => {
    api.isTauriRuntime.mockReturnValue(false);

    await expect(refreshWebDavStatus()).resolves.toBe(false);

    expect(api.webdavStatus).not.toHaveBeenCalled();
    expect(connection.value).toEqual({ connected: false, serverLabel: null });
  });

  it("connects without persisting credentials and clears old directory results", async () => {
    api.webdavConnect.mockResolvedValue({ connected: true, serverLabel: "dav.home" });
    entries.value = [{ id: "old", name: "old.mp3", isDirectory: false, sizeBytes: null, lastModified: null }];
    breadcrumbs.value = [{ id: "old-dir", name: "Old" }];

    await expect(connectWebDav({ serverUrl: "https://dav.home/music/" })).resolves.toBe(true);

    expect(api.webdavConnect).toHaveBeenCalledWith("https://dav.home/music/", undefined, undefined);
    expect(connection.value.connected).toBe(true);
    expect(entries.value).toEqual([]);
    expect(breadcrumbs.value).toEqual([]);
    expect(connecting.value).toBe(false);
  });

  it("lists opaque children and maps audio files to queue-playable tracks", async () => {
    connection.value = { connected: true, serverLabel: "dav.home" };
    api.webdavListDirectory.mockResolvedValue({
      breadcrumbs: [{ id: "root", name: "曲库根目录" }, { id: "jazz", name: "Jazz" }],
      entries: [
        { id: "folder-1", name: "Live", isDirectory: true, sizeBytes: null, lastModified: null },
        { id: "track-1", name: "Blue Note.flac", isDirectory: false, sizeBytes: 1024, lastModified: null },
      ],
    });

    await loadWebDavDirectory("jazz");

    expect(api.webdavListDirectory).toHaveBeenCalledWith("jazz");
    expect(currentDirectoryId.value).toBe("jazz");
    expect(tracksFromWebDavEntries()).toEqual([expect.objectContaining({
      id: "webdav:track-1",
      source: "webdav",
      sourceId: "track-1",
      title: "Blue Note",
      album: "Jazz",
      filePath: "",
    })]);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("discards a directory response that completes after disconnect", async () => {
    connection.value = { connected: true, serverLabel: "dav.home" };
    let resolveList!: (value: unknown) => void;
    api.webdavListDirectory.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    const pending = loadWebDavDirectory(null);
    await disconnectWebDav();
    resolveList({
      breadcrumbs: [{ id: "root", name: "曲库根目录" }],
      entries: [{ id: "late", name: "Late.mp3", isDirectory: false, sizeBytes: null, lastModified: null }],
    });
    await pending;

    expect(connection.value.connected).toBe(false);
    expect(entries.value).toEqual([]);
    expect(loading.value).toBe(false);
  });

  it("does not restore a connection when an old connect finishes after disconnect", async () => {
    let resolveConnect!: (value: unknown) => void;
    api.webdavConnect.mockReturnValue(new Promise((resolve) => { resolveConnect = resolve; }));

    const pending = connectWebDav({ serverUrl: "https://dav.home/music/" });
    expect(connecting.value).toBe(true);
    await disconnectWebDav();
    resolveConnect({ connected: true, serverLabel: "dav.home" });
    await expect(pending).resolves.toBe(false);

    expect(connection.value.connected).toBe(false);
    expect(connecting.value).toBe(false);
  });
});
