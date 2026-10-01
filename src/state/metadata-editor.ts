import { signal } from "@preact/signals";
import type { Track } from "../types/music";

export const editingTrack = signal<Track | null>(null);

export function openTrackMetadataEditor(track: Track): void {
  if (track.source === "local") editingTrack.value = track;
}

export function closeTrackMetadataEditor(): void {
  editingTrack.value = null;
}
