import type { Track } from "../../types/music";

export interface ResolvedTrackCover {
  src: string;
  source: Track["source"] | "unknown";
  fallbackLabel: string;
  isTransient: boolean;
}

function isTransientCoverUrl(url: string): boolean {
  const value = url.trim().toLowerCase();
  return (
    value.startsWith("ome-media://") ||
    value.startsWith("http://ome-media.localhost/") ||
    value.startsWith("https://ome-media.localhost/") ||
    value.startsWith("blob:")
  );
}

export function resolveTrackCover(
  track: Pick<Track, "coverUrl" | "source"> | null,
): ResolvedTrackCover {
  const coverUrl = track?.coverUrl?.trim() ?? "";
  const isTransient = coverUrl ? isTransientCoverUrl(coverUrl) : false;
  const source = track?.source ?? "unknown";

  return {
    // Transient `ome-media://` / blob URLs are still valid inside the current
    // running session and should render immediately. Persistence cleanup lives
    // in the session snapshot layer; filtering them here made active Bilibili
    // and NetEase covers fall back to fake artwork.
    src: coverUrl,
    source,
    fallbackLabel: source === "bilibili" ? "Bilibili" : source === "netease" ? "NetEase" : "Ome",
    isTransient,
  };
}
