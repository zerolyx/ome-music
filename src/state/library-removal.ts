import { signal } from "@preact/signals";
import type { Track } from "../types/music";

export const trackPendingRemoval = signal<Track[] | null>(null);

export function openTrackRemovalConfirm(track: Track): void {
  openTracksRemovalConfirm([track]);
}

export function openTracksRemovalConfirm(tracks: Track[]): void {
  const localTracks = [...new Map(
    tracks.filter((track) => track.source === "local").map((track) => [track.id, track]),
  ).values()];
  if (localTracks.length > 0) trackPendingRemoval.value = localTracks;
}

export function closeTrackRemovalConfirm(): void {
  trackPendingRemoval.value = null;
}
