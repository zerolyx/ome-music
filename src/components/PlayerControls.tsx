import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { LoopMode, Track } from "../types/music";
import { formatDuration } from "../utils/format";

interface PlayerControlsProps {
  track: Track | null;
  isPlaying: boolean;
  progressSeconds: number;
  volume: number;
  shuffle: boolean;
  loopMode: LoopMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShuffle: () => void;
  onToggleLoop: () => void;
  onSetProgress: (seconds: number) => void;
  onSetVolume: (volume: number) => void;
}

export function PlayerControls({
  track,
  isPlaying,
  progressSeconds,
  volume,
  onTogglePlay,
  onNext,
  onPrevious,
  onSetProgress,
  onSetVolume
}: PlayerControlsProps) {
  if (!track) {
    return null;
  }

  const progress = Math.min(progressSeconds, track.durationSeconds);

  return (
    <footer data-danmaku-safe-zone="controls" className="fixed inset-x-0 bottom-0 z-30 h-24 text-[#4a2108]">
      <div className="absolute inset-x-10 bottom-8 grid grid-cols-[1fr_auto_1fr] items-center">
        <div />

        <div className="flex items-center justify-center gap-7">
          <button type="button" onClick={onPrevious} className="player-icon-button" aria-label="Previous track">
            <SkipBack className="h-[18px] w-[18px] fill-current" />
          </button>
          <button type="button" onClick={onTogglePlay} className="player-main-button" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </button>
          <button type="button" onClick={onNext} className="player-icon-button" aria-label="Next track">
            <SkipForward className="h-[18px] w-[18px] fill-current" />
          </button>
        </div>

        <div className="hidden items-center justify-end gap-3 md:flex">
          <Volume2 className="h-4 w-4 text-[#4a2108]/[0.34]" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onSetVolume(Number(event.target.value))}
            className="cinema-range w-24"
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <input
          type="range"
          min={0}
          max={Math.max(1, track.durationSeconds)}
          value={progress}
          onChange={(event) => onSetProgress(Number(event.target.value))}
          className="cinema-progress"
          aria-label="Playback progress"
        />
        <div className="pointer-events-none absolute bottom-5 right-8 text-xs font-semibold tabular-nums text-[#4a2108]/[0.52]">
          {formatDuration(progress)} / {formatDuration(track.durationSeconds)}
        </div>
      </div>
    </footer>
  );
}
