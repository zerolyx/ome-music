import type { Track } from "../types/music";

export interface QueueSearchMatch {
  /** Position in the full queue, retained so filtered actions stay correctly targeted. */
  index: number;
  track: Track;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

/** Search title, artist and album; all whitespace-separated terms must match. */
export function searchQueueTracks(tracks: Track[], query: string): QueueSearchMatch[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return tracks
    .map((track, index) => ({ index, track }))
    .filter(({ track }) => {
      const searchable = normalize(`${track.title} ${track.artist} ${track.album}`);
      return terms.every((term) => searchable.includes(term));
    });
}
