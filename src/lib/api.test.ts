import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauriInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriInvoke }));

import {
  bilibiliStreamUrl,
  embyAlbumTracks,
  embyAlbums,
  embyPlaylistTracks,
  embyPlaylists,
  getAppVersion,
  isTauriRuntime,
  listLocalMusicVideoCandidates,
  localMusicVideoSrc,
  jellyfinAlbumTracks,
  jellyfinAlbums,
  jellyfinLyrics,
  jellyfinPlaylistTracks,
  jellyfinPlaylists,
  neteaseQrKey,
  smbConnect,
  smbDisconnect,
  smbListDirectory,
  smbStatus,
  webdavConnect,
  webdavDisconnect,
  webdavListDirectory,
  webdavStatus,
} from "./api";

type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as TauriWindow).__TAURI_INTERNALS__;
  tauriInvoke.mockResolvedValue("0.7.0");
});

afterEach(() => {
  delete (window as TauriWindow).__TAURI_INTERNALS__;
});

describe("Tauri command boundary", () => {
  it("reports a clear desktop-only error in a browser preview", async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(neteaseQrKey()).rejects.toThrow("此功能需要在 Ome Music 桌面应用中使用。");
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("only recognizes a runtime with an invoke bridge", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(false);

    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    expect(isTauriRuntime()).toBe(true);
    await expect(getAppVersion()).resolves.toBe("0.7.0");
    expect(tauriInvoke).toHaveBeenCalledWith("get_app_version", {});
  });

  it("loads Jellyfin lyrics through the native command boundary", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await jellyfinLyrics("01234567-89ab-cdef-0123-456789abcdef");

    expect(tauriInvoke).toHaveBeenCalledWith("jellyfin_lyrics", {
      itemId: "01234567-89ab-cdef-0123-456789abcdef",
    });
  });

  it("maps Jellyfin and Emby browse actions to read-only native commands", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    const itemId = "01234567-89ab-cdef-0123-456789abcdef";

    await jellyfinAlbums(48);
    await jellyfinAlbumTracks(itemId);
    await jellyfinPlaylists();
    await jellyfinPlaylistTracks(itemId);
    await embyAlbums(24);
    await embyAlbumTracks(itemId);
    await embyPlaylists();
    await embyPlaylistTracks(itemId);

    expect(tauriInvoke.mock.calls).toEqual([
      ["jellyfin_albums", { offset: 48 }],
      ["jellyfin_album_tracks", { albumId: itemId }],
      ["jellyfin_playlists", {}],
      ["jellyfin_playlist_tracks", { playlistId: itemId }],
      ["emby_albums", { offset: 24 }],
      ["emby_album_tracks", { albumId: itemId }],
      ["emby_playlists", {}],
      ["emby_playlist_tracks", { playlistId: itemId }],
    ]);
  });

  it("passes an optional allowlisted quality ceiling only for requested MV streams", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await bilibiliStreamUrl("BV1xx411c7mD", 32);
    await bilibiliStreamUrl("BV1xx411c7mD");

    expect(tauriInvoke.mock.calls).toEqual([
      ["bilibili_stream_url", { id: "BV1xx411c7mD", quality: 32 }],
      ["bilibili_stream_url", { id: "BV1xx411c7mD" }],
    ]);
  });

  it("keeps local video paths behind an opaque candidate ID", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await listLocalMusicVideoCandidates("local:track-123");

    expect(tauriInvoke).toHaveBeenCalledWith("list_local_music_video_candidates", {
      trackId: "local:track-123",
    });
    expect(localMusicVideoSrc("local-mv-opaque-id")).toBe(
      "http://ome-media.localhost/local-video?id=local-mv-opaque-id",
    );
  });

  it("keeps WebDAV directory paths opaque across the native command boundary", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await webdavConnect("https://dav.home/music", "listener", "session-secret");
    await webdavStatus();
    await webdavListDirectory("opaque-directory-id");
    await webdavDisconnect();

    expect(tauriInvoke.mock.calls).toEqual([
      ["webdav_connect", { serverUrl: "https://dav.home/music", username: "listener", password: "session-secret" }],
      ["webdav_status", {}],
      ["webdav_list_directory", { directoryId: "opaque-directory-id" }],
      ["webdav_disconnect", {}],
    ]);
  });

  it("supports anonymous WebDAV access without a credential fallback", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await webdavConnect("https://dav.home/music");

    expect(tauriInvoke).toHaveBeenCalledWith("webdav_connect", {
      serverUrl: "https://dav.home/music",
      username: null,
      password: null,
    });
  });

  it("keeps SMB share paths opaque and sends credentials only to the native session command", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await smbConnect("nas.home", "Music", "Jazz/Live", "listener", "session-secret");
    await smbStatus();
    await smbListDirectory("opaque-directory-id");
    await smbDisconnect();

    expect(tauriInvoke.mock.calls).toEqual([
      ["smb_connect", {
        host: "nas.home",
        share: "Music",
        subPath: "Jazz/Live",
        username: "listener",
        password: "session-secret",
      }],
      ["smb_status", {}],
      ["smb_list_directory", { directoryId: "opaque-directory-id" }],
      ["smb_disconnect", {}],
    ]);
  });
});
