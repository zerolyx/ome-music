import { queue, queueOpen, playAt, currentTrack, removeAt, clearQueue, moveInQueue } from "../state/player";
import { toggleLiked, tracks as libraryTracks } from "../state/library";
import { toggleNeteaseLike } from "../state/netease";
import { activeView } from "../state/app";
import type { Track } from "../types/music";
import { TrackList } from "./TrackList";
import { Icon } from "./Icon";

function onToggleLike(track: Track): void {
  if (track.source === "netease") toggleNeteaseLike(track);
  else {
    const libraryTrack = libraryTracks.value.find((item) => item.id === track.id);
    if (libraryTrack) void toggleLiked(libraryTrack);
  }
}

/** ECHO 式播放列表抽屉：行可拖拽重排 + 一键定位正在播放的曲目 */
export function QueueDrawer() {
  const items = queue.value;
  const currentAt = currentTrack.value
    ? items.findIndex((item) => item.id === currentTrack.value?.id)
    : -1;

  const locateCurrent = () => {
    if (currentAt < 0) return;
    document
      .querySelector(`.queue-scroll [data-index="${currentAt}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <aside class="dj-drawer" data-open={queueOpen.value} aria-label="播放列表">
      <div class="dj-header">
        <span class="dj-title">
          播放列表 · {items.length} 首
        </span>
        <span class="queue-header-actions">
          {currentAt >= 0 && (
            <button class="titlebar-btn" aria-label="定位正在播放" title="定位正在播放" onClick={locateCurrent}>
              <Icon name="history" size={14} />
            </button>
          )}
          <button class="titlebar-btn" aria-label="关闭播放列表" onClick={() => (queueOpen.value = false)}>
            <Icon name="close" size={14} />
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <div class="library-empty">
          <Icon name="queue" size={36} />
          <p>列表是空的</p>
          <p class="view-hint">从曲库或搜索里挑几首吧</p>
        </div>
      ) : (
        <div class="queue-scroll">
          <TrackList
            tracks={items}
            currentIndex={currentAt}
            onPlay={(index) => playAt(index)}
            onToggleLike={onToggleLike}
            onRemove={(index) => removeAt(index)}
            onReorder={moveInQueue}
          />
        </div>
      )}
      {items.length > 0 && (
        <div class="queue-footer">
          <button class="btn-secondary" onClick={() => clearQueue()}>
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
