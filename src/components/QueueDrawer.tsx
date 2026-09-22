import { queue, queueOpen, playAt, currentTrack } from "../state/player";
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

export function QueueDrawer() {
  const items = queue.value;
  return (
    <aside class="dj-drawer" data-open={queueOpen.value} aria-label="播放列表">
      <div class="dj-header">
        <span class="dj-title">
          播放列表 · {items.length} 首
        </span>
        <button class="titlebar-btn" aria-label="关闭播放列表" onClick={() => (queueOpen.value = false)}>
          <Icon name="close" size={14} />
        </button>
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
            currentIndex={currentTrack.value ? items.findIndex((item) => item.id === currentTrack.value?.id) : -1}
            onPlay={(index) => playAt(index)}
            onToggleLike={onToggleLike}
          />
        </div>
      )}
      {items.length > 0 && (
        <div class="queue-footer">
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
