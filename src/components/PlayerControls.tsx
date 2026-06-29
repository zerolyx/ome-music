import {
  ListMusic,
  Gauge,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LoopMode, PlaybackMode, Track } from "../types/music";
import { formatDuration } from "../utils/format";

// Allowed playback speeds (cycles forward). 1x must always be available and
// is the default — see App.tsx for persistence.
export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

// Human-readable label for the current NetEase quality level. Surfaced on the
// progress bar so the user always knows what quality is actually playing.
export function qualityLabel(level: string | null | undefined): string {
  switch (level) {
    case "hires":
      return "Hi-Res";
    case "lossless":
      return "Lossless";
    case "exhigh":
      return "Ex High";
    case "higher":
      return "Higher";
    case "standard":
      return "Standard";
    default:
      return "";
  }
}

interface PlayerControlsProps {
  track: Track | null;
  isPlaying: boolean;
  progressSeconds: number;
  volume: number;
  shuffle: boolean;
  loopMode: LoopMode;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  qualityLevel: string | null | undefined;
  isQueueDrawerOpen: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onCyclePlaybackMode: () => void;
  onCyclePlaybackSpeed: () => void;
  onToggleQueue: () => void;
  onSetProgress: (seconds: number) => void;
  onSetVolume: (volume: number) => void;
}

export function PlayerControls({
  track,
  isPlaying,
  progressSeconds,
  volume,
  playbackMode,
  playbackSpeed,
  qualityLevel,
  isQueueDrawerOpen,
  onTogglePlay,
  onNext,
  onPrevious,
  onCyclePlaybackMode,
  onCyclePlaybackSpeed,
  onToggleQueue,
  onSetProgress,
  onSetVolume,
}: PlayerControlsProps) {
  if (!track) {
    return null;
  }

  const maxSeconds = Math.max(1, track.durationSeconds);
  const progress = Math.min(progressSeconds, maxSeconds);
  const remaining = Math.max(0, maxSeconds - progress);
  const isMuted = volume <= 0;
  const speedLabel = playbackSpeed === 1 ? "1x" : `${playbackSpeed}x`;
  const badge = qualityLabel(qualityLevel);
  const modeMeta = playbackModeMeta(playbackMode);

  return (
    <footer
      data-danmaku-safe-zone="controls"
      className="fixed inset-x-0 bottom-0 z-30 h-24 text-[#4a2108]"
    >
      <div className="absolute inset-x-10 bottom-8 grid grid-cols-[1fr_auto_1fr] items-center">
        {/* Left cluster: playback mode + speed. Kept small and quiet — these
            are secondary controls, the visual center is the play button. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCyclePlaybackMode}
            className={`player-icon-button ${playbackMode !== "loop" ? "is-active" : ""}`}
            aria-label={modeMeta.label}
            title={modeMeta.label}
          >
            <modeMeta.Icon className="h-[17px] w-[17px]" />
          </button>
          <button
            type="button"
            onClick={onCyclePlaybackSpeed}
            className={`player-icon-button gap-1.5 px-2.5 ${playbackSpeed !== 1 ? "is-active" : ""}`}
            aria-label={`Playback speed ${speedLabel}`}
            title={`Playback speed ${speedLabel}`}
          >
            <Gauge className="h-[15px] w-[15px]" />
            <span className="text-[11px] font-bold tabular-nums">{speedLabel}</span>
          </button>
        </div>

        {/* Center cluster: transport controls (the visual anchor). */}
        <div className="flex items-center justify-center gap-7">
          <button
            type="button"
            onClick={onPrevious}
            className="player-icon-button"
            aria-label="Previous track"
            title="Previous"
          >
            <SkipBack className="h-[18px] w-[18px] fill-current" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="player-main-button"
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="player-icon-button"
            aria-label="Next track"
            title="Next"
          >
            <SkipForward className="h-[18px] w-[18px] fill-current" />
          </button>
        </div>

        {/* Right cluster: queue toggle + volume. */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onToggleQueue}
            className={`player-icon-button ${isQueueDrawerOpen ? "is-active" : ""}`}
            aria-label="Toggle queue"
            title="Queue / 播放列表"
          >
            <ListMusic className="h-[17px] w-[17px]" />
          </button>
          <button
            type="button"
            onClick={() => onSetVolume(isMuted ? 0.72 : 0)}
            className="player-icon-button"
            aria-label={isMuted ? "Unmute" : "Mute"}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onSetVolume(Number(event.target.value))}
            className="cinema-range hidden w-24 sm:block"
            aria-label="Volume"
          />
        </div>
      </div>

      {/* Bottom progress strip: full-width seek + time + quality badge. */}
      <div className="absolute inset-x-0 bottom-0">
        <input
          type="range"
          min={0}
          max={maxSeconds}
          value={progress}
          onChange={(event) => onSetProgress(Number(event.target.value))}
          className="cinema-progress"
          aria-label="Playback progress"
        />
        <div className="pointer-events-none absolute bottom-5 right-8 flex items-center gap-2 text-xs font-semibold tabular-nums text-[#4a2108]/[0.52]">
          {badge && (
            <span className="rounded-full bg-[#4a2108]/[0.06] px-2 py-0.5 text-[10px] font-bold tracking-wide">
              {badge}
            </span>
          )}
          <span>
            {formatDuration(progress)} / -{formatDuration(remaining)}
          </span>
        </div>
      </div>
    </footer>
  );
}

function playbackModeMeta(mode: PlaybackMode): { Icon: typeof Repeat; label: string } {
  switch (mode) {
    case "curator":
      // Curator mode: taste-based next-track recommendations. Icon is a soft
      // sparkle, NOT anything labelled "AI" — the room is a music room, not a
      // tech demo.
      return { Icon: Sparkles, label: "Curator / 策展推荐" };
    case "repeat-one":
      return { Icon: Repeat1, label: "Repeat One / 单曲循环" };
    case "shuffle":
      return { Icon: Shuffle, label: "Shuffle / 随机播放" };
    case "loop":
    default:
      return { Icon: Repeat, label: "Loop / 列表循环" };
  }
}
