import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTauriRuntime } from "../lib/api";
import type { Track } from "../types/music";
import { AlbumGrid, groupAlbums } from "./AlbumGrid";

vi.mock("../lib/api", () => ({
  coverUrl: vi.fn((path?: string | null) => path ?? ""),
  isTauriRuntime: vi.fn(),
}));

const localTrack: Track = {
  id: "local:one",
  albumId: "album:one",
  title: "远处的灯",
  artist: "林桥",
  album: "夜行",
  durationSeconds: 180,
  filePath: "D:/Music/夜行/01.flac",
  source: "local",
  liked: false,
  playCount: 0,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AlbumGrid folder action", () => {
  it("keeps folder opening unavailable outside the desktop runtime", () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    render(<AlbumGrid albums={groupAlbums([localTrack])} onOpenFolder={vi.fn()} />);

    expect(screen.getByRole("button", { name: "打开专辑文件夹 夜行" })).toBeDisabled();
  });

  it("opens the indexed local album folder through its action", () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    const onOpenFolder = vi.fn();
    const albums = groupAlbums([localTrack]);
    render(<AlbumGrid albums={albums} onOpenFolder={onOpenFolder} />);

    fireEvent.click(screen.getByRole("button", { name: "打开专辑文件夹 夜行" }));

    expect(onOpenFolder).toHaveBeenCalledWith(albums[0]);
  });
});
