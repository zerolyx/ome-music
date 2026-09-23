import type { Track } from "../types/music";
import { formatDuration } from "../lib/audio";
import { Icon } from "./Icon";

interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  onPlay: (index: number) => void;
  onToggleLike: (track: Track) => void;
}

export function TrackList({ tracks, currentIndex, onPlay, onToggleLike }: TrackListProps) {
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
          <span class="track-duration">{formatDuration(track.durationSeconds)}</span>
          {/* B站暂无红心接口（v1）：源为 bilibili 时隐藏红心 */}
          {track.source !== "bilibili" && (
            <button
              class={`track-like ${track.liked ? "is-liked" : ""}`}
              aria-label={track.liked ? "取消红心" : "红心"}
              onClick={() => onToggleLike(track)}
            >
              <Icon name="heart" size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
