import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Icon } from "./Icon";
import { coverUrl } from "../lib/api";
import { activeView } from "../state/app";
import { currentTrack, isPlaying, next, togglePlayback } from "../state/player";

/** 迷你播放器悬浮窗：切走后仍能掌控播放（ECHO mini-player 思路） */
export const miniPlayerDismissed = signal(false);
let lastTrackId: string | null = null;

export function MiniPlayer() {
  const track = currentTrack.value;
  const visible = !!track && activeView.value !== "home";

  // 切歌时自动重新弹出（用户点过关闭也只关到下一首）
  useEffect(() => {
    if (track && track.id !== lastTrackId) {
      lastTrackId = track.id;
      miniPlayerDismissed.value = false;
    }
  }, [track?.id]);

  if (!visible || miniPlayerDismissed.value) return null;
  if (!track) return null;

  return (
    <div class="mini-player" role="region" aria-label="迷你播放器">
      <img
        class="mini-cover"
        src={coverUrl(track.coverPath)}
        alt=""
        onError={(event) => {
          (event.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <div class="mini-meta" onClick={() => (activeView.value = "home")}>
        <span class="mini-title">{track.title}</span>
        <span class="mini-artist">{track.artist}</span>
      </div>
      <button class="mini-btn" aria-label={isPlaying.value ? "暂停" : "播放"} onClick={() => togglePlayback()}>
        <Icon name={isPlaying.value ? "pause" : "play"} size={16} />
      </button>
      <button class="mini-btn" aria-label="下一首" onClick={() => next(true)}>
        <Icon name="skip-forward" size={16} />
      </button>
      <button
        class="mini-btn mini-close"
        aria-label="收起迷你播放器"
        onClick={() => (miniPlayerDismissed.value = true)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
