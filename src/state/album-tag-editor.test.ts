import { beforeEach, describe, expect, it } from "vitest";
import type { AlbumGroup } from "../components/AlbumGrid";
import type { Track } from "../types/music";
import {
  closeAlbumTagEditor,
  editingAlbumTags,
  openAlbumTagEditor,
  openSelectedTrackAudioTagEditor,
} from "./album-tag-editor";

function track(id: string, source: Track["source"] = "local"): Track {
  return {
    id,
    artistId: "artist-1",
    albumId: "album-1",
    title: id,
    artist: "林桥",
    album: "夜行",
    durationSeconds: 180,
    filePath: `C:\\music\\${id}.mp3`,
    source,
    liked: false,
    playCount: 0,
  };
}

describe("album tag editor target", () => {
  beforeEach(() => closeAlbumTagEditor());

  it("uses the complete writable album when the visible wall is filtered", () => {
    const favorite = track("favorite");
    const otherTrack = track("not-favorite");
    const visibleAlbum: AlbumGroup = {
      id: "album-1",
      key: "album-1",
      title: "夜行",
      artist: "林桥",
      tracks: [favorite],
    };

    openAlbumTagEditor(visibleAlbum, [favorite, otherTrack]);

    expect(editingAlbumTags.value?.tracks.map((item) => item.id)).toEqual(["favorite", "not-favorite"]);
  });

  it("keeps the mixed-source guard from the visible album group", () => {
    const local = track("local");
    const remote = track("remote", "netease");
    const visibleAlbum: AlbumGroup = {
      id: "album-1",
      key: "album-1",
      title: "夜行",
      artist: "林桥",
      tracks: [local, remote],
    };

    openAlbumTagEditor(visibleAlbum, [local]);

    expect(editingAlbumTags.value?.tracks.map((item) => item.id)).toEqual(["local"]);
    expect(editingAlbumTags.value?.hasOtherSources).toBe(true);
  });

  it("opens a deduplicated, local-only selection target", () => {
    const first = track("first");
    const second = { ...track("second"), album: "另一张专辑" };
    const remote = track("remote", "netease");

    openSelectedTrackAudioTagEditor([first, remote, first, second]);

    expect(editingAlbumTags.value?.kind).toBe("selection");
    expect(editingAlbumTags.value?.tracks.map((item) => item.id)).toEqual(["first", "second"]);
    expect(editingAlbumTags.value?.title).toBe("夜行");
    expect(editingAlbumTags.value?.hasOtherSources).toBe(false);
  });

  it("rejects a selection larger than one write batch", () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => track(`track-${index}`));

    openSelectedTrackAudioTagEditor(tooMany);

    expect(editingAlbumTags.value).toBeNull();
  });
});
