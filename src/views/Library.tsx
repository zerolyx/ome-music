import { useEffect, useMemo, useState } from "preact/hooks";
import { isTauriRuntime, playbackHistoryEntries } from "../lib/api";
import { demoLibraryTracks } from "../lib/demo";
import {
  filterHistory,
  HISTORY_RANGES,
  historyStats,
  type HistoryEntry,
  type HistoryRange,
} from "../lib/history";
import { findPossibleDuplicateGroups } from "../lib/duplicates";
import {
  importFolder,
  importing,
  importOperation,
  ignoredTracks,
  loadError,
  libraryChangeRevision,
  playFromLibrary,
  revealLibraryAlbumFolder,
  refreshTracks,
  rescanLibrary,
  toggleLiked,
  tracks,
} from "../state/library";
import { currentIndex, currentTrack, playTracks, insertNext, appendToQueue } from "../state/player";
import { TrackList } from "../components/TrackList";
import { AlbumGrid, groupAlbums } from "../components/AlbumGrid";
import { ArtistGrid, groupArtists } from "../components/ArtistGrid";
import { CatalogEntityEditor, type CatalogEntityEditorTarget } from "../components/CatalogEntityEditor";
import { PlaylistBoard } from "./Playlists";
import { openAddToPlaylist } from "../state/playlists";
import { openTrackMetadataEditor } from "../state/metadata-editor";
import { openAlbumTagEditor, openTrackAudioTagSelection } from "../state/album-tag-editor";
import { openTrackRemovalConfirm, openTracksRemovalConfirm } from "../state/library-removal";
import { openBatchMetadataMatcher } from "../state/batch-metadata";
import { Icon } from "../components/Icon";
import type { Track } from "../types/music";

type LibraryMode = "list" | "grid" | "artists" | "folders" | "duplicates" | "history" | "playlists" | "ignored";
const MODE_KEY = "ome.library.view";
const LIKED_KEY = "ome.library.likedOnly";
const MAX_TRACK_REMOVAL_BATCH = 10_000;

const MODES: Array<{
  value: LibraryMode;
  label: string;
  icon: "list" | "grid" | "user" | "folder" | "copy" | "history" | "playlist" | "eye-off";
}> = [
  { value: "list", label: "列表", icon: "list" },
  { value: "grid", label: "专辑墙", icon: "grid" },
  { value: "artists", label: "艺人", icon: "user" },
  { value: "folders", label: "文件夹", icon: "folder" },
  { value: "duplicates", label: "重复", icon: "copy" },
  { value: "playlists", label: "歌单", icon: "playlist" },
  { value: "history", label: "历史", icon: "history" },
  { value: "ignored", label: "已排除", icon: "eye-off" },
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
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [catalogEntityEditor, setCatalogEntityEditor] = useState<CatalogEntityEditorTarget | null>(null);
  const [catalogEntityNotice, setCatalogEntityNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isTauriRuntime()) void refreshTracks();
  }, []);

  // 历史视图：进入时加载（浏览器演示用演示数据兜底）
  useEffect(() => {
    if (mode !== "history") return;
    if (!isTauriRuntime()) {
      const now = Date.now();
      const stamp = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString().slice(0, 19).replace("T", " ");
      setHistory(
        [...demoLibraryTracks()].reverse().map((track, index) => ({
          ...track,
          playedAt: stamp(index * 95 + 3),
        })),
      );
      return;
    }
    playbackHistoryEntries(200)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [mode]);

  useEffect(() => {
    if (mode !== "history" || !isTauriRuntime() || libraryChangeRevision.value === 0) return;
    playbackHistoryEntries(200)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [libraryChangeRevision.value]);

  const visible = useMemo(
    () => (likedOnly ? tracks.value.filter((track) => track.liked) : tracks.value),
    [tracks.value, likedOnly]
  );
  const duplicateGroups = useMemo(() => findPossibleDuplicateGroups(visible), [visible]);
  const albums = useMemo(() => groupAlbums(visible), [visible]);
  const artists = useMemo(() => groupArtists(visible), [visible]);
  const allLocalTracks = [...tracks.value, ...ignoredTracks.value].filter((track) => track.source === "local");
  const activeLocalTracks = tracks.value.filter((track) => track.source === "local");
  const allLocalArtists = groupArtists(allLocalTracks);
  const allLocalAlbums = groupAlbums(allLocalTracks);
  const catalogEntityMergeTargets = catalogEntityEditor?.kind === "artist"
    ? allLocalArtists
      .filter((artist) => artist.id && artist.id !== catalogEntityEditor.id && artist.tracks.every((track) => track.source === "local"))
      .map((artist) => ({ id: artist.id!, name: artist.name, trackCount: artist.tracks.length }))
    : catalogEntityEditor?.kind === "album"
      ? allLocalAlbums
        .filter((album) => album.id && album.id !== catalogEntityEditor.id && album.title !== "单曲")
        .filter((album) => {
          const candidateTrack = album.tracks.find((track) => track.albumId === album.id) ?? album.tracks[0];
          const candidateArtistId = candidateTrack?.artistId ?? null;
          if (catalogEntityEditor.artistId || candidateArtistId) {
            return candidateArtistId === (catalogEntityEditor.artistId ?? null);
          }
          return album.artist === catalogEntityEditor.artist;
        })
        .map((album) => ({
          id: album.id!,
          name: album.title,
          trackCount: album.tracks.length,
          artist: album.artist,
        }))
      : [];
  const openCatalogEntityEditor = (
    kind: "artist" | "album",
    id: string,
    name: string,
    artist?: string,
    artistId?: string | null,
  ) => {
    const isDemoEntity = id.startsWith("demo-");
    const localTracks = allLocalTracks.filter((track) => {
      if (kind === "artist") return isDemoEntity ? track.artist === name : track.artistId === id;
      return isDemoEntity
        ? track.album === name && track.artist === artist
        : track.albumId === id;
    });
    setCatalogEntityNotice(null);
    setCatalogEntityEditor({ kind, id, name, trackCount: localTracks.length, localTracks, artist, artistId });
  };
  const folders = useMemo(() => groupFolders(visible), [visible]);
  const folderTracks = useMemo(
    () => (selectedFolder ? (folders.find((group) => group.dir === selectedFolder)?.tracks ?? []) : []),
    [folders, selectedFolder]
  );
  const isFolderMetadataMatch = mode === "folders" && selectedFolder !== null;
  const metadataMatchTracks = isFolderMetadataMatch ? folderTracks : activeLocalTracks;
  const audioTagSelectionTracks = mode === "folders" && selectedFolder
    ? folderTracks
    : mode === "list"
      ? visible.filter((track) => track.source === "local")
      : [];
  const selectionScopeTracks = useMemo(() => {
    const candidates = mode === "folders" && selectedFolder
      ? folderTracks
      : mode === "duplicates"
        ? duplicateGroups.flatMap((group) => group.tracks)
        : mode === "list"
          ? visible
          : [];
    return [...new Map(
      candidates.filter((track) => track.source === "local").map((track) => [track.id, track]),
    ).values()];
  }, [mode, selectedFolder, folderTracks, duplicateGroups, visible]);
  const selectionScopeIds = selectionScopeTracks.map((track) => track.id);
  const selectionScopeKey = selectionScopeIds.join("\u0000");
  const selectedTrackIdSet = new Set(selectedTrackIds);
  const selectedInScopeCount = selectionScopeIds.filter((id) => selectedTrackIdSet.has(id)).length;
  const canBatchRemove = selectionScopeTracks.length > 0 &&
    (mode === "list" || mode === "duplicates" || (mode === "folders" && selectedFolder !== null));
  const toggleTrackSelection = (track: Track) => setSelectedTrackIds((current) =>
    current.includes(track.id)
      ? current.filter((id) => id !== track.id)
      : [...current, track.id],
  );

  useEffect(() => {
    const validIds = new Set(selectionScopeIds);
    setSelectedTrackIds((current) => current.filter((id) => validIds.has(id)));
  }, [selectionScopeKey]);
  // 历史条目：按范围筛选 + 统计摘要（ECHO HistoryPage 思路）
  const historyFiltered = useMemo(
    () => (history ? filterHistory(history, historyRange, Date.now()) : []),
    [history, historyRange]
  );
  const historySummary = useMemo(
    () => (history ? historyStats(history, historyRange, Date.now()) : null),
    [history, historyRange]
  );

  const switchMode = (next: LibraryMode) => {
    setMode(next);
    setSelectedFolder(null);
    setSelectionMode(false);
    setSelectedTrackIds([]);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const switchLikedOnly = () => {
    const next = !likedOnly;
    setLikedOnly(next);
    setSelectionMode(false);
    setSelectedTrackIds([]);
    try {
      if (next) localStorage.setItem(LIKED_KEY, "1");
      else localStorage.removeItem(LIKED_KEY);
    } catch {
      /* ignore */
    }
  };

  const duplicateTrackCount = duplicateGroups.reduce((sum, group) => sum + group.tracks.length, 0);
  const count =
    mode === "ignored"
      ? ignoredTracks.value.length
      : mode === "duplicates"
      ? duplicateTrackCount
      : mode === "history"
        ? (history?.length ?? 0)
        : mode === "folders"
          ? selectedFolder
            ? folderTracks.length
            : folders.length
          : likedOnly
            ? visible.length
            : tracks.value.length;
  const countLabel =
    mode === "ignored"
      ? `${count} 首已排除`
      : mode === "duplicates"
      ? `${count} 首可能重复 · ${duplicateGroups.length} 组`
      : mode === "history"
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
          {(count > 0 || mode === "duplicates") && <span class="view-count">{countLabel}</span>}
        </div>
        <div class="view-head-actions">
          {mode !== "ignored" && (
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
          )}
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
          <div class="library-folder-actions">
            {canBatchRemove && !selectionMode && (
              <button
                class="btn-secondary library-rescan-btn"
                disabled={importing.value}
                onClick={() => {
                  setSelectedTrackIds([]);
                  setSelectionMode(true);
                }}
              >
                <Icon name="check" size={15} />
                选择曲目
              </button>
            )}
            {selectionMode && canBatchRemove && (
              <div class="library-selection-actions" aria-label="批量移除选择工具">
                <span class="library-selection-count" aria-live="polite">
                  已选 {selectedInScopeCount} / {selectionScopeTracks.length} 首
                  {selectedInScopeCount > MAX_TRACK_REMOVAL_BATCH && " · 单次最多移除 10000 首"}
                </span>
                <button
                  class="btn-secondary"
                  disabled={importing.value || selectedInScopeCount === selectionScopeTracks.length}
                  onClick={() => setSelectedTrackIds(selectionScopeIds)}
                >
                  全选范围
                </button>
                <button
                  class="btn-secondary"
                  disabled={importing.value || selectedInScopeCount === 0}
                  onClick={() => setSelectedTrackIds([])}
                >
                  清空选择
                </button>
                <button
                  class="btn-secondary is-danger"
                  disabled={importing.value || selectedInScopeCount === 0 || selectedInScopeCount > MAX_TRACK_REMOVAL_BATCH}
                  onClick={() => openTracksRemovalConfirm(
                    selectionScopeTracks.filter((track) => selectedTrackIdSet.has(track.id)),
                  )}
                >
                  <Icon name="trash" size={14} />
                  移除 {selectedInScopeCount} 首
                </button>
                <button
                  class="btn-secondary"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedTrackIds([]);
                  }}
                >
                  完成
                </button>
              </div>
            )}
            {audioTagSelectionTracks.length > 0 && (
              <button
                class="btn-secondary library-rescan-btn"
                disabled={importing.value}
                title="选择最多 20 首本地曲目，逐首确认后写入共同专辑标签"
                onClick={() => openTrackAudioTagSelection(audioTagSelectionTracks)}
              >
                <Icon name="tag" size={15} />
                批量写标签
              </button>
            )}
            <button
              class="btn-secondary library-rescan-btn"
              disabled={importing.value || metadataMatchTracks.length === 0}
              title={isFolderMetadataMatch
                ? "仅匹配当前文件夹内的曲目，逐首审核候选后再保存资料"
                : "逐首尝试网易云、QQ 音乐和酷狗，检查候选后再保存资料"}
              onClick={() => openBatchMetadataMatcher(metadataMatchTracks)}
            >
              <Icon name="search" size={15} />
              {isFolderMetadataMatch ? "匹配当前文件夹" : "批量匹配资料"}
            </button>
            <button
              class="btn-secondary library-rescan-btn"
              disabled={importing.value}
              title="重扫曾导入的文件夹，更新曲目资料，不会删除曲库条目"
              onClick={() => void rescanLibrary()}
            >
              <Icon name="refresh" size={15} />
              {importing.value && importOperation.value === "rescan" ? "正在重扫…" : "重扫曲库"}
            </button>
            <button class="btn-primary" disabled={importing.value} onClick={() => void importFolder()}>
              <Icon name="plus" size={16} />
              {importing.value && importOperation.value === "import"
                ? "正在导入…"
                : "导入音乐文件夹"}
            </button>
          </div>
        </div>
      </div>
      {loadError.value && <p class="view-hint">曲库加载失败：{loadError.value}</p>}

      {mode === "ignored" ? (
        ignoredTracks.value.length === 0 ? (
          <div class="library-empty">
            <Icon name="eye-off" size={40} />
            <p>没有被规则排除的曲目</p>
            <p class="view-hint">调整 `.foliaignore` 后重扫，排除状态会在曲目成功读入时自动更新</p>
          </div>
        ) : (
          <>
            <div class="library-ignored-list" role="list" aria-label="已排除的本地曲目">
              {ignoredTracks.value.map((track) => (
                <article class="library-ignored-row" role="listitem" key={track.id}>
                  <Icon name="eye-off" size={17} />
                  <div class="library-ignored-title-group">
                    <span class="library-ignored-title" title={track.title}>{track.title}</span>
                    <span class="library-ignored-artist">{track.artist || "未知艺人"}</span>
                  </div>
                  <span class="library-ignored-path" title={track.filePath}>{track.filePath}</span>
                  <span class="library-ignored-reason">由规则排除</span>
                </article>
              ))}
            </div>
            <p class="library-ignored-hint" role="note">
              要恢复曲目，请检查所在目录及上级目录中的 `.foliaignore`，移除匹配规则后点击“重扫曲库”。曲目和歌单关联会保留。
            </p>
          </>
        )
      ) : mode === "history" ? (
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
          <>
            {historySummary && (
              <div class="history-summary">
                <div class="history-stat">
                  <span class="history-stat-value">{historySummary.today}</span>
                  <span class="history-stat-label">今天播放</span>
                </div>
                <div class="history-stat">
                  <span class="history-stat-value">{historySummary.week}</span>
                  <span class="history-stat-label">最近 7 天</span>
                </div>
                <div class="history-stat">
                  <span class="history-stat-value">{historySummary.plays}</span>
                  <span class="history-stat-label">播放次数</span>
                </div>
                <div class="history-stat">
                  <span class="history-stat-value">{historySummary.tracks}</span>
                  <span class="history-stat-label">不重复曲目</span>
                </div>
                <div class="history-stat">
                  <span class="history-stat-value">{historySummary.minutes}</span>
                  <span class="history-stat-label">累计收听（分钟）</span>
                </div>
              </div>
            )}
            <div class="history-ranges" role="radiogroup" aria-label="历史范围">
              {HISTORY_RANGES.map((range) => (
                <button
                  key={range.id}
                  role="radio"
                  aria-checked={historyRange === range.id}
                  class={`chip-toggle ${historyRange === range.id ? "is-active" : ""}`}
                  onClick={() => setHistoryRange(range.id)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <TrackList
              tracks={historyFiltered}
              currentIndex={-1}
              onPlay={(index) => playTracks(historyFiltered, index)}
              onToggleLike={(track) => void toggleLiked(track)}
              onPlayNext={insertNext}
              onEnqueue={appendToQueue}
              onAddToPlaylist={openAddToPlaylist}
              onEditMetadata={openTrackMetadataEditor}
            />
          </>
        )
      ) : mode === "folders" ? (
        selectedFolder ? (
          <>
            <div class="folder-toolbar">
              <button class="chip-toggle" onClick={() => {
                setSelectedFolder(null);
                setSelectionMode(false);
                setSelectedTrackIds([]);
              }}>
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
                onEditMetadata={openTrackMetadataEditor}
                onRemoveFromLibrary={openTrackRemovalConfirm}
                selectionMode={selectionMode}
                selectedIds={selectedTrackIdSet}
                selectionDisabled={importing.value}
                onToggleSelection={toggleTrackSelection}
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
      ) : mode === "duplicates" ? (
        duplicateGroups.length === 0 ? (
          <div class="library-empty">
            <Icon name="copy" size={40} />
            <p>没有发现可能重复的本地曲目</p>
            <p class="view-hint">筛选条件：曲名与艺人相同，时长差不超过 2 秒。</p>
          </div>
        ) : (
          <>
            <p class="duplicate-summary" role="note">
              这里只标出待你核对的候选项；不会隐藏或删除曲目，也不会比较音频内容。
            </p>
            <div class="duplicate-groups">
              {duplicateGroups.map((group) => (
                <section class="duplicate-group" key={group.id}>
                  <header class="duplicate-group-head">
                    <h2 class="duplicate-group-title">{group.title}</h2>
                    <span class="duplicate-group-artist">{group.artist}</span>
                    <span class="duplicate-group-count">{group.tracks.length} 个候选</span>
                  </header>
                  <TrackList
                    tracks={group.tracks}
                    currentIndex={group.tracks.findIndex((track) => track.id === currentTrack.value?.id)}
                    onPlay={(index) => playTracks(group.tracks, index)}
                    onToggleLike={(track) => void toggleLiked(track)}
                    onPlayNext={insertNext}
                    onEnqueue={appendToQueue}
                    onAddToPlaylist={openAddToPlaylist}
                    onEditMetadata={openTrackMetadataEditor}
                    onRemoveFromLibrary={openTrackRemovalConfirm}
                    selectionMode={selectionMode}
                    selectedIds={selectedTrackIdSet}
                    selectionDisabled={importing.value}
                    onToggleSelection={toggleTrackSelection}
                    detailText={(track) => duplicateTrackDetail(track)}
                  />
                </section>
              ))}
            </div>
          </>
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
        <AlbumGrid
          albums={albums}
          onEditTags={(album) => {
            const completeAlbum = groupAlbums(activeLocalTracks).find((candidate) => candidate.id === album.id);
            openAlbumTagEditor(album, completeAlbum?.tracks ?? album.tracks);
          }}
          onRename={(album) => {
            if (album.id) openCatalogEntityEditor(
              "album",
              album.id,
              album.title,
              album.artist,
              album.tracks.find((track) => track.albumId === album.id)?.artistId ?? album.tracks[0]?.artistId,
            );
          }}
          onOpenFolder={(album) => {
            if (!album.id) return;
            void revealLibraryAlbumFolder(album.id)
              .then(() => setCatalogEntityNotice(`已打开「${album.title}」所在的文件夹。`))
              .catch((error: unknown) => {
                setCatalogEntityNotice(typeof error === "string" ? error : "无法打开专辑文件夹，请检查文件是否仍可访问。");
              });
          }}
        />
      ) : mode === "artists" ? (
        <ArtistGrid
          artists={artists}
          onRename={(artist) => {
            if (artist.id) openCatalogEntityEditor("artist", artist.id, artist.name);
          }}
        />
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
          onEditMetadata={openTrackMetadataEditor}
          onRemoveFromLibrary={openTrackRemovalConfirm}
          selectionMode={selectionMode}
          selectedIds={selectedTrackIdSet}
          selectionDisabled={importing.value}
          onToggleSelection={toggleTrackSelection}
        />
      )}
      {catalogEntityNotice && <p class="library-entity-notice" role="status">{catalogEntityNotice}</p>}
      <CatalogEntityEditor
        key={catalogEntityEditor ? `${catalogEntityEditor.kind}:${catalogEntityEditor.id}` : "closed"}
        entity={catalogEntityEditor}
        mergeTargets={catalogEntityMergeTargets}
        onClose={() => setCatalogEntityEditor(null)}
        onSaved={(kind, previousName, name, trackCount) => {
          setCatalogEntityNotice(`已更新 ${trackCount} 首曲目的${kind === "artist" ? "艺人" : "专辑"}名：「${previousName}」→「${name}」。`);
        }}
        onMerged={(kind, result) => {
          setCatalogEntityNotice(`已将 ${result.tracks.length} 首曲目和相关记录并入目标${kind === "artist" ? "艺人" : "专辑"}「${result.name}」。`);
        }}
        onSplit={(kind, result) => {
          setCatalogEntityNotice(`已将 ${result.tracks.length} 首曲目拆分为新${kind === "artist" ? "艺人" : "专辑"}「${result.name}」。`);
        }}
      />
    </section>
  );
}

function duplicateTrackDetail(track: Track): string {
  const segments = track.filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = segments.pop() ?? "";
  const folder = segments.pop() ?? "";
  return [track.album, folder, fileName].filter(Boolean).join(" · ");
}
