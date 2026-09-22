import {
  currentTrack,
  duration,
  introPlaying,
  isPlaying,
  next,
  position,
  previous,
  queueOpen,
  seek,
  setVolume,
  togglePlayback,
  volume,
} from "../state/player";
import { openDrawer } from "../state/dj";
import { coverUrl } from "../lib/api";
import { formatDuration } from "../lib/audio";
import { setChromeHover } from "../state/chrome";
import { Icon } from "./Icon";

export function PlayerBar() {
  const track = currentTrack.value;
  // DJ 说歌前介绍时淡化标题：音乐还没响，先把注意力让给声音
  const titleClass = introPlaying.value ? "player-title intro-hint" : "player-title";
  return (
    <footer
      class="player-bar"
      aria-label="播放条"
      onMouseEnter={() => setChromeHover(true)}
      onMouseLeave={() => setChromeHover(false)}
    >
      <div class="player-info">
        {track ? (
          <>
            {track.coverPath ? (
              <img class="player-cover" src={coverUrl(track.coverPath)} alt="" />
            ) : (
              <div class="player-cover player-cover-empty">
                <Icon name="music-note" size={18} />
              </div>
            )}
            <div class="player-text">
              <span class={titleClass}>{track.title}</span>
              <span class="player-artist">{track.artist}</span>
            </div>
          </>
        ) : (
          <div class="player-text">
            <span class={`${titleClass} player-title-idle`}>没有在播放</span>
          </div>
        )}
      </div>

      <div class="player-center">
        <div class="player-buttons">
          <button aria-label="上一首" onClick={() => previous()}>
            <Icon name="skip-back" size={18} />
          </button>
          <button class="player-toggle" aria-label={isPlaying.value ? "暂停" : "播放"} onClick={togglePlayback}>
            <Icon name={isPlaying.value ? "pause" : "play"} size={20} />
          </button>
          <button aria-label="下一首" onClick={() => next(true)}>
            <Icon name="skip-forward" size={18} />
          </button>
        </div>
        <div class="player-progress">
          <span class="player-time">{formatDuration(position.value)}</span>
          <input
            class="slider"
            type="range"
            min={0}
            max={Math.max(duration.value, 1)}
            step={1}
            value={Math.min(position.value, duration.value || 0)}
            aria-label="播放进度"
            onInput={(event) => seek(Number((event.target as HTMLInputElement).value))}
          />
          <span class="player-time">{formatDuration(duration.value)}</span>
        </div>
      </div>

      <div class="player-actions">
        <button
          class={`player-list-btn ${queueOpen.value ? "is-active" : ""}`}
          aria-label="播放列表"
          title="播放列表"
          onClick={() => (queueOpen.value = !queueOpen.value)}
        >
          <Icon name="queue" size={18} />
        </button>
        <div class="player-volume">
          <Icon name="volume" size={16} />
          <input
            class="slider slider-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume.value}
            aria-label="音量"
            onInput={(event) => setVolume(Number((event.target as HTMLInputElement).value))}
          />
        </div>
        <button class="dj-fab" aria-label="打开 DJ" onClick={openDrawer}>
          DJ
        </button>
      </div>
    </footer>
  );
}
