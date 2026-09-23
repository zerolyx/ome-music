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

type LibraryMode = "list" | "grid" | "artists" | "folders" | "history" | "playlists";
const MODE_KEY = "ome.library.view";
const LIKED_KEY = "ome.library.likedOnly";

const MODES: Array<{
  value: LibraryMode;
  label: string;
  icon: "list" | "grid" | "user" | "folder" | "history" | "playlist";
}> = [
  { value: "list", label: "列表", icon: "list" },
  { value: "grid", label: "专辑墙", icon: "grid" },
  { value: "artists", label: "艺人", icon: "user" },
  { value: "folders", label: "文件夹", icon: "folder" },
  { value: "playlists", label: "歌单", icon: "playlist" },
  { value: "history", label: "历史", icon: "history" },
];

/** 曲目所在目录（统一分隔符后取最后一段之前的路径；无路径返回 null） */
function dirOf(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return null;
  return normalized.slice(0, index);
}

interface FolderGroup {
  dir: string;
  tracks: Track[];
}

/** 按目录分组并排序（目录名升序） */
function groupFolders(items: Track[]): FolderGroup[] {
  const map = new Map<string, Track[]>();
  for (const track of items) {
    if (track.source !== "local") continue;
    const dir = dirOf(track.filePath);
    if (!dir) continue;
    const bucket = map.get(dir);
    if (bucket) bucket.push(track);
    else map.set(dir, [track]);
  }
  return [...map.entries()]
    .map(([dir, groupTracks]) => ({ dir, tracks: groupTracks }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

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
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

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
  const folders = useMemo(() => groupFolders(visible), [visible]);
  const folderTracks = useMemo(
    () => (selectedFolder ? (folders.find((group) => group.dir === selectedFolder)?.tracks ?? []) : []),
    [folders, selectedFolder]
  );

  const switchMode = (next: LibraryMode) => {
    setMode(next);
    setSelectedFolder(null);
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
    mode === "history"
      ? (history?.length ?? 0)
      : mode === "folders"
        ? selectedFolder
          ? folderTracks.length
          : folders.length
        : likedOnly
          ? visible.length
          : tracks.value.length;
  const countLabel =
    mode === "history"
      ? `最近 ${count} 首`
      : mode === "folders"
        ? selectedFolder
          ? `${count} 首`
          : `${count} 个文件夹`
        : likedOnly
          ? `收藏 ${count} 首`
          : `共 ${count} 首`;

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
      ) : mode === "folders" ? (
        selectedFolder ? (
          <>
            <div class="folder-toolbar">
              <button class="chip-toggle" onClick={() => setSelectedFolder(null)}>
                <Icon name="chevron-down" size={14} />
                返回文件夹
              </button>
              <span class="view-hint folder-path" title={selectedFolder}>
                {selectedFolder}
              </span>
            </div>
            {folderTracks.length === 0 ? (
              <div class="library-empty">
                <Icon name="folder" size={40} />
                <p>这个文件夹没有可播放的曲目</p>
              </div>
            ) : (
              <TrackList
                tracks={folderTracks}
                currentIndex={-1}
                onPlay={(index) => playTracks(folderTracks, index)}
                onToggleLike={(track) => void toggleLiked(track)}
                onPlayNext={insertNext}
                onEnqueue={appendToQueue}
                onAddToPlaylist={openAddToPlaylist}
              />
            )}
          </>
        ) : folders.length === 0 ? (
          <div class="library-empty">
            <Icon name="folder" size={40} />
            <p>没有本地文件夹</p>
            <p class="view-hint">导入音乐文件夹后，可按磁盘上的目录浏览</p>
          </div>
        ) : (
          <div class="folder-list">
            {folders.map((group) => {
              const name = group.dir.replace(/\\/g, "/").split("/").pop() ?? group.dir;
              return (
                <button
                  key={group.dir}
                  class="folder-row"
                  title={group.dir}
                  onClick={() => setSelectedFolder(group.dir)}
                >
                  <Icon name="folder" size={20} />
                  <span class="folder-row-name">{name}</span>
                  <span class="folder-row-count">{group.tracks.length} 首</span>
                </button>
              );
            })}
          </div>
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
