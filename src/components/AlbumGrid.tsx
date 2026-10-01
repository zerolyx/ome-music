import { computed } from "@preact/signals";
import { coverUrl, isTauriRuntime } from "../lib/api";
import { currentTrack, playTracks } from "../state/player";
import { Icon } from "./Icon";
import type { Track } from "../types/music";

export interface AlbumGroup {
  id: string | null;
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
    const id = track.albumId ?? (
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")
        && track.source === "local" && title !== "单曲"
        ? `demo-album:${title}␟${track.artist}`
        : null
    );
    const key = id ?? `${title}␟${track.artist}`;
    let group = map.get(key);
    if (!group) {
      group = { id, key, title, artist: track.artist, tracks: [] };
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
export function AlbumGrid({
  albums,
  onRename,
  onEditTags,
  onOpenFolder,
}: {
  albums: AlbumGroup[];
  onRename?: (album: AlbumGroup) => void;
  onEditTags?: (album: AlbumGroup) => void;
  onOpenFolder?: (album: AlbumGroup) => void;
}) {
  const playingKey = currentAlbumKey.value;
  const desktopRuntime = isTauriRuntime();
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
            {album.id && album.title !== "单曲" && album.tracks.some((track) => track.source === "local") && onRename && (
              <button
                type="button"
                class="library-entity-edit"
                aria-label={`修改专辑名 ${album.title}`}
                title="修改专辑名"
                onClick={() => onRename(album)}
              >
                <Icon name="edit" size={14} />
              </button>
            )}
            {album.id && album.title !== "单曲" && album.tracks.some((track) => track.source === "local") && onEditTags && (
              <button
                type="button"
                class="library-entity-edit library-entity-edit--tags"
                aria-label={`编辑专辑标签 ${album.title}`}
                title="编辑整张专辑的音频标签"
                onClick={() => onEditTags(album)}
              >
                <Icon name="tag" size={14} />
              </button>
            )}
            {album.id && album.title !== "单曲" && album.tracks.some((track) => track.source === "local") && onOpenFolder && (
              <button
                type="button"
                class="library-entity-edit library-entity-edit--folder"
                aria-label={`打开专辑文件夹 ${album.title}`}
                title={desktopRuntime ? "打开专辑文件夹" : "桌面版可用"}
                disabled={!desktopRuntime}
                onClick={() => onOpenFolder(album)}
              >
                <Icon name="folder" size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
