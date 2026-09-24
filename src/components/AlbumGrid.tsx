import { computed } from "@preact/signals";
import { coverUrl } from "../lib/api";
import { currentTrack, playTracks } from "../state/player";
import { Icon } from "./Icon";
import type { Track } from "../types/music";

export interface AlbumGroup {
  key: string;
  title: string;
  artist: string;
  tracks: Track[];
}

/** 按 专辑 + 艺人 分组（单曲无专辑名时归入「单曲」） */
export function groupAlbums(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const title = track.album?.trim() || "单曲";
    const key = `${title}␟${track.artist}`;
    let group = map.get(key);
    if (!group) {
      group = { key, title, artist: track.artist, tracks: [] };
      map.set(key, group);
    }
    group.tracks.push(track);
  }
  return [...map.values()];
}

/** 当前播放曲目所属专辑（folia Lattice 式「点亮在播」的判定键） */
const currentAlbumKey = computed(() => {
  const track = currentTrack.value;
  if (!track) return null;
  const title = track.album?.trim() || "单曲";
  return `${title}␟${track.artist}`;
});

/** ECHO 式专辑墙：封面 + 专辑名 + 艺人 + 曲数，点击整专播放；在播专辑点亮 */
export function AlbumGrid({ albums }: { albums: AlbumGroup[] }) {
  const playingKey = currentAlbumKey.value;
  return (
    <ul class="album-grid">
      {albums.map((album) => {
        const cover = album.tracks.find((t) => t.coverPath)?.coverPath;
        return (
          <li key={album.key}>
            <button
              class={`album-card ${album.key === playingKey ? "is-current" : ""}`}
              aria-label={`播放专辑 ${album.title}`}
              onClick={() => playTracks(album.tracks, 0)}
            >
              <span class="album-cover">
                {cover ? (
                  <img
                    src={coverUrl(cover)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span class="album-cover-empty">
                    <Icon name="music-note" size={26} />
                  </span>
                )}
                <span class="album-play">
                  <Icon name="play" size={18} />
                </span>
              </span>
              <span class="album-title">{album.title}</span>
              <span class="album-meta">
                {album.artist} · {album.tracks.length} 首
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
