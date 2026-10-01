import type { Track } from "../types/music";

export const DUPLICATE_DURATION_TOLERANCE_SECONDS = 2;

export interface PossibleDuplicateGroup {
  id: string;
  title: string;
  artist: string;
  tracks: Track[];
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

function medianDuration(items: readonly Track[]): number {
  const durations = items.map((track) => track.durationSeconds).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  return durations.length % 2 === 0
    ? (durations[middle - 1]! + durations[middle]!) / 2
    : durations[middle]!;
}

/**
 * Conservatively group local tracks with the same normalized title and artist
 * whose duration is within the configured tolerance of the group's median.
 * This is a review aid, not an audio fingerprint or a deletion decision.
 */
export function findPossibleDuplicateGroups(
  items: readonly Track[],
  toleranceSeconds = DUPLICATE_DURATION_TOLERANCE_SECONDS,
): PossibleDuplicateGroup[] {
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return [];

  const buckets = new Map<string, Track[]>();
  for (const track of items) {
    const title = normalize(track.title);
    const artist = normalize(track.artist);
    if (
      track.source !== "local" ||
      !track.id ||
      !track.filePath.trim() ||
      !title ||
      !artist ||
      !Number.isFinite(track.durationSeconds) ||
      track.durationSeconds <= 0
    ) {
      continue;
    }

    const key = `${title}\u0000${artist}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(track);
    else buckets.set(key, [track]);
  }

  const groups: PossibleDuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds ||
        a.album.localeCompare(b.album) ||
        a.filePath.localeCompare(b.filePath),
    );
    let cluster: Track[] = [];

    const flush = () => {
      if (cluster.length > 1) {
        const first = cluster[0]!;
        groups.push({
          id: cluster.map((track) => track.id).sort().join("\u0000"),
          title: first.title,
          artist: first.artist,
          tracks: cluster,
        });
      }
      cluster = [];
    };

    for (const track of sorted) {
      if (
        cluster.length > 0 &&
        Math.abs(track.durationSeconds - medianDuration(cluster)) > toleranceSeconds
      ) {
        flush();
      }
      cluster.push(track);
    }
    flush();
  }

  return groups.sort(
    (a, b) => a.title.localeCompare(b.title, "zh-CN") || a.artist.localeCompare(b.artist, "zh-CN"),
  );
}
