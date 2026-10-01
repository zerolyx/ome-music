import { signal } from "@preact/signals";
import type { AlbumGroup } from "../components/AlbumGrid";
import type { Track } from "../types/music";

export interface AlbumTagEditorTarget {
  id: string;
  kind: "album" | "selection";
  title: string;
  artist: string;
  tracks: Track[];
  hasOtherSources: boolean;
}

export const editingAlbumTags = signal<AlbumTagEditorTarget | null>(null);
export const editingTrackAudioTagBatch = signal<Track[] | null>(null);
export const selectingTrackAudioTags = signal<Track[] | null>(null);

export function openAlbumTagEditor(album: AlbumGroup, completeLocalTracks = album.tracks): void {
  if (!album.id) return;
  const localTracks = completeLocalTracks.filter((track) => track.source === "local");
  if (localTracks.length === 0) return;
  editingAlbumTags.value = {
    id: album.id,
    kind: "album",
    title: album.title,
    artist: album.artist,
    tracks: localTracks,
    hasOtherSources: album.tracks.some((track) => track.source !== "local"),
  };
}

export function openTrackAudioTagSelection(candidates: Track[]): void {
  selectingTrackAudioTags.value = [...new Map(
    candidates
      .filter((track) => track.source === "local")
      .map((track) => [track.id, track]),
  ).values()];
}

export function closeTrackAudioTagSelection(): void {
  selectingTrackAudioTags.value = null;
}

export function openSelectedTrackAudioTagEditor(selectedTracks: Track[]): void {
  const uniqueLocalTracks = [...new Map(
    selectedTracks
      .filter((track) => track.source === "local")
      .map((track) => [track.id, track]),
  ).values()];
  if (uniqueLocalTracks.length === 0 || uniqueLocalTracks.length > 20) return;
  const first = uniqueLocalTracks[0];
  editingAlbumTags.value = {
    id: `selection:${uniqueLocalTracks.map((track) => track.id).join(",")}`,
    kind: "selection",
    title: first.album,
    artist: first.artist,
    tracks: uniqueLocalTracks,
    hasOtherSources: false,
  };
}

export function openSelectedTrackAudioTagBatchEditor(selectedTracks: Track[]): void {
  const uniqueLocalTracks = [...new Map(
    selectedTracks
      .filter((track) => track.source === "local")
      .map((track) => [track.id, track]),
  ).values()];
  if (uniqueLocalTracks.length === 0 || uniqueLocalTracks.length > 20) return;
  editingTrackAudioTagBatch.value = uniqueLocalTracks;
}

export function closeTrackAudioTagBatchEditor(): void {
  editingTrackAudioTagBatch.value = null;
}

export function closeAlbumTagEditor(): void {
  editingAlbumTags.value = null;
}
