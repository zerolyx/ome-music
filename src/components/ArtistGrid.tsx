import { coverUrl } from "../lib/api";
import { playTracks } from "../state/player";
import { Icon } from "./Icon";
import type { Track } from "../types/music";

export interface ArtistGroup {
  name: string;
  tracks: Track[];
  albumCount: number;
}

/** 按艺人分组，保持曲库顺序 */
export function groupArtists(tracks: Track[]): ArtistGroup[] {
  const map = new Map<string, ArtistGroup>();
  for (const track of tracks) {
    const name = track.artist?.trim() || "未知艺术家";
    let group = map.get(name);
    if (!group) {
      group = { name, tracks: [], albumCount: 0 };
      map.set(name, group);
    }
    group.tracks.push(track);
  }
  for (const group of map.values()) {
    group.albumCount = new Set(group.tracks.map((t) => t.album?.trim() || "单曲")).size;
  }
  return [...map.values()];
}

/** ECHO 式艺人墙：2×2 封面拼贴 + 名字 + 曲数/专辑数，点击播放该艺人全部曲目 */
export function ArtistGrid({ artists }: { artists: ArtistGroup[] }) {
  return (
    <ul class="artist-grid">
      {artists.map((artist) => {
        const covers = artist.tracks
          .filter((track) => track.coverPath)
          .slice(0, 4)
          .map((track) => coverUrl(track.coverPath));
        while (covers.length < 4) covers.push("");
        return (
          <li key={artist.name}>
            <button
              class="artist-card"
              aria-label={`播放 ${artist.name} 的全部曲目`}
              onClick={() => playTracks(artist.tracks, 0)}
            >
              <span class="artist-mosaic">
                {covers.map((cover, i) =>
                  cover ? (
                    <img key={i} src={cover} alt="" loading="lazy" />
                  ) : (
                    <span key={i} class="artist-mosaic-empty">
                      <Icon name="music-note" size={16} />
                    </span>
                  )
                )}
              </span>
              <span class="artist-name">{artist.name}</span>
              <span class="artist-meta">
                {artist.tracks.length} 首{artist.albumCount > 1 ? ` · ${artist.albumCount} 专辑` : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
