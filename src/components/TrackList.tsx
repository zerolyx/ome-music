import type { Track } from "../types/music";
import { formatDuration } from "../lib/audio";
import { Icon } from "./Icon";

interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  onPlay: (index: number) => void;
  onToggleLike: (track: Track) => void;
  /** 插播到当前之后（hover 显示） */
  onPlayNext?: (track: Track) => void;
  /** 追加到队尾（hover 显示） */
  onEnqueue?: (track: Track) => void;
  /** 从队列移除（hover 显示，用于播放列表抽屉） */
  onRemove?: (index: number) => void;
  /** 加入歌单（hover 显示，唤起全局选择器） */
  onAddToPlaylist?: (track: Track) => void;
}

export function TrackList({
  tracks,
  currentIndex,
  onPlay,
  onToggleLike,
  onPlayNext,
  onEnqueue,
  onRemove,
  onAddToPlaylist,
}: TrackListProps) {
  return (
    <ul class="track-list" role="list">
      {tracks.map((track, index) => (
        <li
          key={track.id}
          class={`track-row ${index === currentIndex ? "is-current" : ""}`}
        >
          <button class="track-play" aria-label={`播放 ${track.title}`} onClick={() => onPlay(index)}>
            <Icon name="play" size={14} />
          </button>
          <div class="track-meta" onClick={() => onPlay(index)}>
            <span class="track-title">
              {track.title}
              {track.unavailableReason === "vip" && <span class="vip-chip">VIP</span>}
            </span>
            <span class="track-artist">{track.artist}</span>
          </div>
          {/* 占位槽保证各列对齐；hover 才浮现操作 */}
          <span class="track-action-slot">
            {onPlayNext && (
              <button
                class="track-action"
                aria-label={`下一首播放 ${track.title}`}
                title="下一首播放"
                onClick={() => onPlayNext(track)}
              >
                <Icon name="play-next" size={15} />
              </button>
            )}
          </span>
          <span class="track-action-slot">
            {onEnqueue && (
              <button
                class="track-action"
                aria-label={`加入队列 ${track.title}`}
                title="加入队列"
                onClick={() => onEnqueue(track)}
              >
                <Icon name="plus" size={15} />
              </button>
            )}
          </span>
          <span class="track-duration">{formatDuration(track.durationSeconds)}</span>
          <span class="track-action-slot">
            {onRemove && (
              <button
                class="track-action track-remove"
                aria-label={`移除 ${track.title}`}
                title="从队列移除"
                onClick={() => onRemove(index)}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
          <span class="track-action-slot">
            {onAddToPlaylist && (
              <button
                class="track-action"
                aria-label={`加入歌单 ${track.title}`}
                title="加入歌单"
                onClick={() => onAddToPlaylist(track)}
              >
                <Icon name="playlist" size={15} />
              </button>
            )}
          </span>
          {/* B站暂无红心接口（v1）：源为 bilibili 时隐藏红心 */}
          {track.source !== "bilibili" ? (
            <button
              class={`track-like ${track.liked ? "is-liked" : ""}`}
              aria-label={track.liked ? "取消红心" : "红心"}
              onClick={() => onToggleLike(track)}
            >
              <Icon name="heart" size={16} />
            </button>
          ) : (
            <span class="track-like-slot" aria-hidden="true" />
          )}
        </li>
      ))}
    </ul>
  );
}
