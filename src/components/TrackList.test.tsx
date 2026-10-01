import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types/music";
import { TrackList } from "./TrackList";

const localTrack: Track = {
  id: "local:one",
  title: "远处的灯",
  artist: "林桥",
  album: "夜行",
  durationSeconds: 180,
  filePath: "D:/Music/夜行/01.flac",
  source: "local",
  liked: false,
  playCount: 0,
};

const onlineTrack: Track = {
  ...localTrack,
  id: "netease:two",
  title: "海边",
  source: "netease",
};

const subsonicTrack: Track = {
  ...onlineTrack,
  id: "subsonic:track-1",
  sourceId: "track-1",
  source: "subsonic",
  title: "服务器曲目",
};

afterEach(cleanup);

describe("TrackList batch selection", () => {
  it("uses checkboxes only for local tracks and hides the single-remove action", () => {
    const onToggleSelection = vi.fn();
    const onRemoveFromLibrary = vi.fn();
    render(
      <TrackList
        tracks={[localTrack, onlineTrack]}
        currentIndex={-1}
        onPlay={vi.fn()}
        onToggleLike={vi.fn()}
        selectionMode
        selectedIds={new Set([localTrack.id])}
        onToggleSelection={onToggleSelection}
        onRemoveFromLibrary={onRemoveFromLibrary}
      />,
    );

    const localCheckbox = screen.getByRole("checkbox", { name: "选择 远处的灯" });
    expect(localCheckbox).toBeChecked();
    fireEvent.click(localCheckbox);
    expect(onToggleSelection).toHaveBeenCalledWith(localTrack);
    expect(screen.getByRole("button", { name: "播放 海边" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "从曲库移除 远处的灯" })).not.toBeInTheDocument();
    expect(onRemoveFromLibrary).not.toHaveBeenCalled();
  });
});

describe("remote library track actions", () => {
  it("keeps queue playback actions and hides unsupported likes and playlist writes", () => {
    const onToggleLike = vi.fn();
    const onAddToPlaylist = vi.fn();
    render(
      <TrackList
        tracks={[subsonicTrack]}
        currentIndex={-1}
        onPlay={vi.fn()}
        onToggleLike={onToggleLike}
        onPlayNext={vi.fn()}
        onEnqueue={vi.fn()}
        onAddToPlaylist={onAddToPlaylist}
      />,
    );

    expect(screen.getByRole("button", { name: "播放 服务器曲目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一首播放 服务器曲目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入队列 服务器曲目" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "红心" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加入歌单 服务器曲目" })).not.toBeInTheDocument();
    expect(onToggleLike).not.toHaveBeenCalled();
    expect(onAddToPlaylist).not.toHaveBeenCalled();
  });
});
