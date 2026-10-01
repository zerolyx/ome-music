import { signal } from "@preact/signals";
import type { Track } from "../types/music";

export const batchMetadataTracks = signal<Track[] | null>(null);

export function openBatchMetadataMatcher(tracks: Track[]): void {
  batchMetadataTracks.value = tracks.filter((track) => track.source === "local");
}

export function closeBatchMetadataMatcher(): void {
  batchMetadataTracks.value = null;
}
