import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importing } from "../state/library";
import { closeTrackRemovalConfirm, openTracksRemovalConfirm } from "../state/library-removal";
import type { Track } from "../types/music";
import { TrackRemovalConfirm } from "./TrackRemovalConfirm";

const tracks: Track[] = [
  {
    id: "local:a",
    title: "远处的灯",
    artist: "林桥",
    album: "夜行",
    durationSeconds: 180,
    filePath: "D:/Music/夜行/远处的灯.flac",
    source: "local",
    liked: false,
    playCount: 0,
  },
  {
    id: "local:b",
    title: "远处的灯",
    artist: "林桥",
    album: "深夜精选",
    durationSeconds: 181,
    filePath: "D:/Music/精选/远处的灯.flac",
    source: "local",
    liked: false,
    playCount: 0,
  },
];

beforeEach(() => {
  closeTrackRemovalConfirm();
  importing.value = false;
});

afterEach(() => {
  cleanup();
  closeTrackRemovalConfirm();
  importing.value = false;
});

describe("TrackRemovalConfirm", () => {
  it("shows distinguishing details for same-title tracks and pauses confirmation during library work", () => {
    openTracksRemovalConfirm(tracks);
    const { rerender } = render(<TrackRemovalConfirm />);

    expect(screen.getByRole("list", { name: "待移除的 2 首曲目" })).toHaveTextContent("夜行/远处的灯.flac");
    expect(screen.getByRole("list", { name: "待移除的 2 首曲目" })).toHaveTextContent("精选/远处的灯.flac");

    importing.value = true;
    rerender(<TrackRemovalConfirm />);

    expect(screen.getByRole("status")).toHaveTextContent("曲库正在导入或重扫");
    expect(screen.getByRole("button", { name: "曲库处理中…" })).toBeDisabled();
  });
});
