import { useEffect, useMemo, useState } from "preact/hooks";
import { isTauriRuntime, playbackHistory } from "../lib/api";
import { demoLibraryTracks } from "../lib/demo";
import {
  importFolder,
  importing,
  importNotice,
  loadError,
  playFromLibrary,
  refreshTracks,
  toggleLiked,
  tracks,
} from "../state/library";
import { currentIndex, playTracks, insertNext, appendToQueue } from "../state/player";
import { TrackList } from "../components/TrackList";
import { AlbumGrid, groupAlbums } from "../components/AlbumGrid";
import { ArtistGrid, groupArtists } from "../components/ArtistGrid";
import { PlaylistBoard } from "./Playlists";
import { openAddToPlaylist } from "../state/playlists";
import { Icon } from "../components/Icon";
import type { Track } from "../types/music";

type LibraryMode = "list" | "grid" | "artists" | "history" | "playlists";
const MODE_KEY = "ome.library.view";
const LIKED_KEY = "ome.library.likedOnly";

const MODES: Array<{ value: LibraryMode; label: string; icon: "list" | "grid" | "user" | "history" | "playlist" }> = [
  { value: "list", label: "列表", icon: "list" },
  { value: "grid", label: "专辑墙", icon: "grid" },
  { value: "artists", label: "艺人", icon: "user" },
  { value: "playlists", label: "歌单", icon: "playlist" },
  { value: "history", label: "历史", icon: "history" },
];

function loadMode(): LibraryMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return MODES.some((m) => m.value === saved) ? (saved as LibraryMode) : "list";
  } catch {
    return "list";
  }
}

function loadLikedOnly(): boolean {
  try {
    return localStorage.getItem(LIKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function LibraryView() {
  const [mode, setMode] = useState<LibraryMode>(loadMode);
  const [likedOnly, setLikedOnly] = useState<boolean>(loadLikedOnly);
  const [history, setHistory] = useState<Track[] | null>(null);

  useEffect(() => {
    if (isTauriRuntime()) void refreshTracks();
  }, []);

  // 历史视图：进入时加载（浏览器演示用演示数据兜底）
  useEffect(() => {
    if (mode !== "history") return;
    if (!isTauriRuntime()) {
      setHistory([...demoLibraryTracks()].reverse());
      return;
    }
    playbackHistory(50)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [mode]);

  const visible = useMemo(
    () => (likedOnly ? tracks.value.filter((track) => track.liked) : tracks.value),
    [tracks.value, likedOnly]
  );
  const albums = useMemo(() => groupAlbums(visible), [visible]);
  const artists = useMemo(() => groupArtists(visible), [visible]);

  const switchMode = (next: LibraryMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const switchLikedOnly = () => {
    const next = !likedOnly;
    setLikedOnly(next);
    try {
      if (next) localStorage.setItem(LIKED_KEY, "1");
      else localStorage.removeItem(LIKED_KEY);
    } catch {
      /* ignore */
    }
  };

  const count =
    mode === "history" ? (history?.length ?? 0) : likedOnly ? visible.length : tracks.value.length;
  const countLabel =
    mode === "history" ? `最近 ${count} 首` : likedOnly ? `收藏 ${count} 首` : `共 ${count} 首`;

  return (
    <section class="view view-library">
      <div class="view-head">
        <div class="view-head-text">
          <h1 class="view-title">曲库</h1>
          {count > 0 && <span class="view-count">{countLabel}</span>}
        </div>
        <div class="view-head-actions">
          <button
            class={`chip-toggle ${likedOnly ? "is-active" : ""}`}
            aria-pressed={likedOnly}
            aria-label="只看收藏"
            title="只看收藏"
            onClick={switchLikedOnly}
          >
            <Icon name="heart" size={14} />
            只看收藏
          </button>
          <div class="segmented" role="radiogroup" aria-label="曲库视图">
            {MODES.map((item) => (
              <button
                key={item.value}
                role="radio"
                aria-checked={mode === item.value}
                class={`segment ${mode === item.value ? "is-active" : ""}`}
                onClick={() => switchMode(item.value)}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            ))}
          </div>
          <button class="btn-primary" disabled={importing.value} onClick={() => void importFolder()}>
            <Icon name="plus" size={16} />
            {importing.value ? "正在导入…" : "导入音乐文件夹"}
          </button>
        </div>
      </div>
      {importNotice.value && <p class="view-hint">{importNotice.value}</p>}
      {loadError.value && <p class="view-hint">曲库加载失败：{loadError.value}</p>}

      {mode === "history" ? (
        history === null ? (
          <div class="library-empty">
            <Icon name="history" size={36} />
            <p>正在读取播放历史…</p>
          </div>
        ) : history.length === 0 ? (
          <div class="library-empty">
            <Icon name="history" size={40} />
            <p>还没有播放记录</p>
            <p class="view-hint">电台开播后，这里会记下你听过的每一首</p>
          </div>
        ) : (
          <TrackList
            tracks={history}
            currentIndex={-1}
            onPlay={(index) => playTracks(history, index)}
            onToggleLike={(track) => void toggleLiked(track)}
            onPlayNext={insertNext}
            onEnqueue={appendToQueue}
            onAddToPlaylist={openAddToPlaylist}
          />
        )
      ) : tracks.value.length === 0 ? (
        <div class="library-empty">
          <Icon name="library" size={40} />
          <p>曲库还是空的</p>
          <p class="view-hint">点击右上角导入你的音乐文件夹</p>
        </div>
      ) : likedOnly && visible.length === 0 ? (
        <div class="library-empty">
          <Icon name="heart" size={40} />
          <p>还没有收藏</p>
          <p class="view-hint">点击曲目右侧的红心，把喜欢的歌留在这里</p>
        </div>
      ) : mode === "grid" ? (
        <AlbumGrid albums={albums} />
      ) : mode === "artists" ? (
        <ArtistGrid artists={artists} />
      ) : mode === "playlists" ? (
        <PlaylistBoard />
      ) : (
        <TrackList
          tracks={visible}
          currentIndex={currentIndex.value}
          onPlay={playFromLibrary}
          onToggleLike={(track) => void toggleLiked(track)}
          onPlayNext={insertNext}
          onEnqueue={appendToQueue}
          onAddToPlaylist={openAddToPlaylist}
        />
      )}
    </section>
  );
}
