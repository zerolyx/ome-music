import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTauriRuntime, type TrackAudioTags } from "../lib/api";
import { editingTrackAudioTagBatch } from "../state/album-tag-editor";
import { readLibraryTrackAudioTags, writeLibraryTrackAudioTagUpdates } from "../state/library";
import { queue } from "../state/player";
import type { Track } from "../types/music";
import { BatchTrackAudioTagEditor } from "./BatchTrackAudioTagEditor";

vi.mock("../lib/api", () => ({ isTauriRuntime: vi.fn() }));
vi.mock("../state/library", () => ({
  readLibraryTrackAudioTags: vi.fn(),
  writeLibraryTrackAudioTagUpdates: vi.fn(),
}));

const first: Track = {
  id: "local:first",
  title: "第一首",
  artist: "甲",
  album: "专辑甲",
  durationSeconds: 180,
  filePath: "D:/Music/first.mp3",
  source: "local",
  liked: false,
  playCount: 0,
};

const second: Track = {
  ...first,
  id: "local:second",
  title: "第二首",
  artist: "乙",
  album: "专辑乙",
  filePath: "D:/Music/second.mp3",
};

const tags: Record<string, TrackAudioTags> = {
  [first.id]: {
    title: first.title,
    artist: first.artist,
    album: first.album,
    albumArtist: first.artist,
    year: "2024",
    genre: "Pop",
    trackNumber: 1,
    trackTotal: 10,
    discNumber: 1,
    discTotal: 1,
    bpm: "110",
    comment: "第一首备注",
    commentTruncated: false,
  },
  [second.id]: {
    title: second.title,
    artist: second.artist,
    album: second.album,
    albumArtist: second.artist,
    year: "2023",
    genre: "Rock",
    trackNumber: 2,
    trackTotal: 8,
    discNumber: 1,
    discTotal: 1,
    bpm: "120",
    comment: "第二首备注",
    commentTruncated: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauriRuntime).mockReturnValue(true);
  vi.mocked(readLibraryTrackAudioTags).mockImplementation(async (id) => tags[id]);
  vi.mocked(writeLibraryTrackAudioTagUpdates).mockResolvedValue(first);
  editingTrackAudioTagBatch.value = [first, second];
  queue.value = [];
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  editingTrackAudioTagBatch.value = null;
});

describe("BatchTrackAudioTagEditor", () => {
  it("reads, reviews, and writes only changed fields for each selected track", async () => {
    render(<BatchTrackAudioTagEditor />);

    fireEvent.click(screen.getByRole("button", { name: "读取内嵌标签" }));
    await waitFor(() => expect(readLibraryTrackAudioTags).toHaveBeenCalledWith(first.id));
    fireEvent.input(screen.getByLabelText("内嵌 BPM"), { target: { value: "126" } });

    fireEvent.click(screen.getByRole("button", { name: /02.*第二首/ }));
    fireEvent.click(screen.getByRole("button", { name: "读取内嵌标签" }));
    await waitFor(() => expect(readLibraryTrackAudioTags).toHaveBeenCalledWith(second.id));
    fireEvent.input(screen.getByLabelText("内嵌流派"), { target: { value: "Jazz" } });

    fireEvent.click(screen.getByRole("button", { name: "准备写入 2 首" }));
    expect(screen.getByRole("region", { name: "确认批量写入" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认写入 2 首" }));

    await waitFor(() => expect(writeLibraryTrackAudioTagUpdates).toHaveBeenCalledTimes(2));
    expect(writeLibraryTrackAudioTagUpdates).toHaveBeenNthCalledWith(1, first.id, expect.objectContaining({
      title: null,
      artist: null,
      album: null,
      bpm: "126",
      syncLibraryMetadata: false,
    }));
    expect(writeLibraryTrackAudioTagUpdates).toHaveBeenNthCalledWith(2, second.id, expect.objectContaining({
      title: null,
      artist: null,
      album: null,
      genre: "Jazz",
      bpm: null,
      syncLibraryMetadata: false,
    }));
  });

  it("keeps fixed browser demo tags read-only for actual audio writes", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    window.history.replaceState({}, "", "/?demo=library");
    render(<BatchTrackAudioTagEditor />);

    fireEvent.click(screen.getByRole("button", { name: "读取内嵌标签" }));
    await waitFor(() => expect(screen.getByText(/固定演示标签/)).toBeInTheDocument());
    fireEvent.input(screen.getByLabelText("内嵌流派"), { target: { value: "Demo Genre" } });

    expect(screen.getByRole("button", { name: "已有未写入改动" })).toBeDisabled();
    const writeButton = screen.getByRole("button", { name: "准备写入 1 首" });
    expect(writeButton).toBeDisabled();
    expect(writeLibraryTrackAudioTagUpdates).not.toHaveBeenCalled();
  });

  it("blocks invalid changed numeric values before preparing a batch write", async () => {
    render(<BatchTrackAudioTagEditor />);
    fireEvent.click(screen.getByRole("button", { name: "读取内嵌标签" }));
    await waitFor(() => expect(readLibraryTrackAudioTags).toHaveBeenCalledWith(first.id));
    fireEvent.input(screen.getByLabelText("内嵌 BPM"), { target: { value: "0" } });

    expect(screen.getByRole("alert")).toHaveTextContent("BPM 需填写 1 至 999");
    expect(screen.getByRole("button", { name: "准备写入 1 首" })).toBeDisabled();
    expect(writeLibraryTrackAudioTagUpdates).not.toHaveBeenCalled();
  });
});
