import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  smbConnect: vi.fn(),
  smbDisconnect: vi.fn(),
  smbListDirectory: vi.fn(),
  smbStatus: vi.fn(),
}));

vi.mock("../lib/api", () => api);

import {
  breadcrumbs,
  connectSmb,
  connecting,
  connection,
  currentDirectoryId,
  disconnectSmb,
  entries,
  error,
  loadSmbDirectory,
  loading,
  refreshSmbStatus,
  resetSmbState,
  tracksFromSmbEntries,
} from "./smb";

afterEach(() => {
  vi.clearAllMocks();
  api.isTauriRuntime.mockReturnValue(true);
  api.smbDisconnect.mockResolvedValue(undefined);
  resetSmbState();
});

describe("session-only SMB music source", () => {
  it("refreshes only the desktop process connection", async () => {
    api.smbStatus.mockResolvedValue({ connected: true, serverLabel: "nas.home", rootId: "root-id" });

    await expect(refreshSmbStatus()).resolves.toBe(true);

    expect(connection.value).toEqual({ connected: true, serverLabel: "nas.home", rootId: "root-id" });
    expect(api.smbStatus).toHaveBeenCalledOnce();
  });

  it("does not invoke native commands in a browser preview", async () => {
    api.isTauriRuntime.mockReturnValue(false);

    await expect(refreshSmbStatus()).resolves.toBe(false);

    expect(api.smbStatus).not.toHaveBeenCalled();
    expect(connection.value.connected).toBe(false);
  });

  it("connects without keeping credentials in state and clears prior directory results", async () => {
    api.smbConnect.mockResolvedValue({ connected: true, serverLabel: "nas.home", rootId: "root-id" });
    entries.value = [{ id: "old", name: "old.mp3", isDirectory: false, sizeBytes: 12 }];
    breadcrumbs.value = [{ id: "old-dir", name: "Old" }];

    await expect(connectSmb({ host: "nas.home", share: "Music", username: "listener", password: "secret" })).resolves.toBe(true);

    expect(api.smbConnect).toHaveBeenCalledWith("nas.home", "Music", undefined, "listener", "secret");
    expect(connection.value.connected).toBe(true);
    expect(entries.value).toEqual([]);
    expect(breadcrumbs.value).toEqual([]);
    expect(connecting.value).toBe(false);
  });

  it("maps listed audio files to opaque queue-playable tracks", async () => {
    connection.value = { connected: true, serverLabel: "nas.home", rootId: "root-id" };
    api.smbListDirectory.mockResolvedValue({
      breadcrumbs: [{ id: "root", name: "Music" }, { id: "jazz", name: "Jazz" }],
      entries: [
        { id: "folder-1", name: "Live", isDirectory: true, sizeBytes: null },
        { id: "track-1", name: "Blue Note.flac", isDirectory: false, sizeBytes: 1024 },
      ],
    });

    await loadSmbDirectory("jazz");

    expect(api.smbListDirectory).toHaveBeenCalledWith("jazz");
    expect(currentDirectoryId.value).toBe("jazz");
    expect(tracksFromSmbEntries()).toEqual([expect.objectContaining({
      id: "smb:track-1",
      source: "smb",
      sourceId: "track-1",
      title: "Blue Note",
      album: "Jazz",
      filePath: "",
    })]);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("discards directory responses that finish after disconnect", async () => {
    connection.value = { connected: true, serverLabel: "nas.home", rootId: "root-id" };
    let resolveList!: (value: unknown) => void;
    api.smbListDirectory.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    const pending = loadSmbDirectory(null);
    await disconnectSmb();
    resolveList({
      breadcrumbs: [{ id: "root", name: "Music" }],
      entries: [{ id: "late", name: "Late.mp3", isDirectory: false, sizeBytes: 512 }],
    });
    await pending;

    expect(connection.value.connected).toBe(false);
    expect(entries.value).toEqual([]);
    expect(loading.value).toBe(false);
  });
});
