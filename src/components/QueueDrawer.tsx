import { useEffect, useState } from "preact/hooks";
import {
  queue,
  queueOpen,
  currentTrack,
  currentIndex,
  removeAt,
  selectQueueTrack,
  restoreLastManualQueue,
  forgetSavedManualQueue,
  lastManualQueueSession,
  clearQueue,
  moveInQueue,
  cycleRepeatMode,
  queueModesLocked,
  repeatMode,
  shuffleAvailable,
  shuffleQueue,
} from "../state/player";
import { toggleLiked, tracks as libraryTracks } from "../state/library";
import { toggleNeteaseLike } from "../state/netease";
import { openTrackMetadataEditor } from "../state/metadata-editor";
import { activeView } from "../state/app";
import type { Track } from "../types/music";
import { TrackList } from "./TrackList";
import { Icon } from "./Icon";
import { searchQueueTracks } from "../lib/queue-search";

function onToggleLike(track: Track): void {
  if (track.source === "netease") toggleNeteaseLike(track);
  else {
    const libraryTrack = libraryTracks.value.find((item) => item.id === track.id);
    if (libraryTrack) void toggleLiked(libraryTrack);
  }
}

/** ECHO 式播放列表抽屉：行可拖拽重排 + 一键定位正在播放的曲目 */
export function QueueDrawer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const items = queue.value;
  const matches = searchQueueTracks(items, searchQuery);
  const currentAt = currentTrack.value ? currentIndex.value : -1;
  const currentVisibleAt = matches.findIndex(({ index }) => index === currentAt);
  const hasActiveSearch = searchQuery.normalize("NFKC").trim().length > 0;
  const repeatLabel = repeatMode.value === "all" ? "列表循环" : repeatMode.value === "one" ? "单曲循环" : "关闭循环";
  const queueModeHint = queueModesLocked.value ? "AI 电台开启时由电台选曲控制" : undefined;
  const shuffleTitle = queueModeHint ?? (shuffleAvailable.value ? "打乱尚未播放的曲目顺序" : "至少需要两首尚未播放的曲目才能打乱队列");
  const savedTrackCount = lastManualQueueSession.value?.tracks.length ?? 0;

  const restorePreviousQueue = () => {
    const result = restoreLastManualQueue(libraryTracks.value);
    if (result.restoredTracks === 0) {
      setRestoreNotice(result.skippedLocalTracks > 0
        ? "上次队列里的本地曲目已不在当前曲库，未恢复。"
        : "上次队列没有可恢复的曲目。");
      return;
    }
    setRestoreNotice(result.skippedLocalTracks > 0
      ? `已恢复 ${result.restoredTracks} 首，跳过 ${result.skippedLocalTracks} 首已不在曲库的本地曲目。`
      : `已恢复上次队列，共 ${result.restoredTracks} 首。`);
  };

  useEffect(() => {
    if (items.length === 0) setSearchQuery("");
  }, [items.length]);

  const locateCurrent = () => {
    if (currentAt < 0) return;
    document
      .querySelector(`.queue-scroll [data-index="${currentVisibleAt}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <aside id="queue-drawer" class="dj-drawer" data-open={queueOpen.value} aria-label="播放列表">
      <div class="dj-header">
        <span class="dj-title">
          播放列表 · {items.length} 首
        </span>
        <span class="queue-header-actions">
          {items.length > 0 && (
            <span class="queue-mode-actions" role="group" aria-label="播放方式">
              <button
                class="titlebar-btn"
                aria-label="打乱尚未播放的曲目"
                title={shuffleTitle}
                disabled={!shuffleAvailable.value}
                onClick={shuffleQueue}
              >
                <Icon name="shuffle" size={15} />
              </button>
              <button
                class={`titlebar-btn ${repeatMode.value !== "off" ? "is-active" : ""}`}
                aria-label={`循环播放：${repeatLabel}`}
                aria-pressed={repeatMode.value !== "off"}
                title={queueModeHint ?? `循环播放：${repeatLabel}（点击切换）`}
                disabled={queueModesLocked.value}
                onClick={cycleRepeatMode}
              >
                <Icon name={repeatMode.value === "one" ? "repeat-one" : "repeat"} size={15} />
              </button>
            </span>
          )}
          {savedTrackCount > 0 && items.length > 0 && (
            <>
              <button
                class="titlebar-btn"
                aria-label="恢复上次队列"
                title={`替换当前列表并恢复上次手动队列（${savedTrackCount} 首）`}
                onClick={restorePreviousQueue}
              >
                <Icon name="playlist" size={14} />
              </button>
              <button
                class="titlebar-btn"
                aria-label="忘记上次队列"
                title="删除本机保存的队列快照"
                onClick={() => {
                  forgetSavedManualQueue();
                  setRestoreNotice("已删除本机保存的队列快照。");
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </>
          )}
          {currentAt >= 0 && currentVisibleAt >= 0 && (
            <button class="titlebar-btn" aria-label="定位正在播放" title="定位正在播放" onClick={locateCurrent}>
              <Icon name="history" size={14} />
            </button>
          )}
          <button
            class="titlebar-btn"
            aria-label="关闭播放列表"
            onClick={() => {
              queueOpen.value = false;
              requestAnimationFrame(() => {
                document.querySelector<HTMLButtonElement>(".player-list-btn[aria-label='播放列表']")?.focus();
              });
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </span>
      </div>
      {restoreNotice && <p class="queue-restore-notice" role="status" aria-live="polite">{restoreNotice}</p>}
      {items.length === 0 ? (
        <div class="library-empty">
          <Icon name="queue" size={36} />
          <p>列表是空的</p>
          <p class="view-hint">从曲库或搜索里挑几首吧</p>
          {savedTrackCount > 0 && (
            <div class="queue-restore-actions">
              <button class="btn-secondary queue-restore-button" onClick={restorePreviousQueue}>
                恢复上次队列 · {savedTrackCount} 首
              </button>
              <button
                class="queue-restore-forget"
                aria-label="忘记上次队列"
                onClick={() => {
                  forgetSavedManualQueue();
                  setRestoreNotice("已删除本机保存的队列快照。");
                }}
              >
                忘记
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
        <label class="queue-search">
          <Icon name="search" size={14} />
          <input
            class="queue-search-input"
            type="text"
            value={searchQuery}
            aria-label="搜索播放列表"
            placeholder="按曲名、歌手或专辑搜索"
            onInput={(event) => setSearchQuery((event.currentTarget as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              class="queue-search-clear"
              aria-label="清除播放列表搜索"
              onClick={() => setSearchQuery("")}
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </label>
        {matches.length === 0 ? (
          <div class="queue-search-empty" role="status">
            <Icon name="search" size={22} />
            <p>没有匹配的曲目</p>
            <span>试试曲名、歌手或专辑名称</span>
          </div>
        ) : (
        <div class="queue-scroll">
          <TrackList
            tracks={matches.map(({ track }) => track)}
            currentIndex={currentVisibleAt}
            onPlay={(index) => selectQueueTrack(matches[index].index)}
            onToggleLike={onToggleLike}
            onRemove={(index) => removeAt(matches[index].index)}
            onEditMetadata={openTrackMetadataEditor}
            onReorder={hasActiveSearch ? undefined : moveInQueue}
          />
        </div>
        )}
        {hasActiveSearch && matches.length > 0 && (
          <p class="queue-search-hint">搜索时暂不支持拖动排序</p>
        )}
        </>
      )}
      {items.length > 0 && (
        <div class="queue-footer">
          <button class="btn-secondary" onClick={() => {
            setRestoreNotice(null);
            clearQueue();
          }}>
            清空列表
          </button>
          <button
            class="btn-secondary"
            onClick={() => {
              queueOpen.value = false;
              activeView.value = "library";
            }}
          >
            去曲库添加
          </button>
        </div>
      )}
    </aside>
  );
}
