import { computed, signal } from "@preact/signals";
import type { Track } from "../types/music";
import { neteaseStreamUrl, recordPlaybackEvent } from "../lib/api";
import { toPlayableSrc } from "../lib/audio";

export const queue = signal<Track[]>([]);
export const currentIndex = signal(-1);
export const isPlaying = signal(false);
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.9);
/** 取流/播放失败提示（如「该歌曲需要 VIP 或无版权」） */
export const playbackError = signal<string | null>(null);

export const currentTrack = computed<Track | null>(
  () => queue.value[currentIndex.value] ?? null
);

let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.volume = volume.value;
  audio.addEventListener("timeupdate", () => {
    position.value = audio?.currentTime ?? 0;
  });
  audio.addEventListener("durationchange", () => {
    duration.value = Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0;
  });
  audio.addEventListener("play", () => (isPlaying.value = true));
  audio.addEventListener("pause", () => (isPlaying.value = false));
  audio.addEventListener("ended", () => onEnded());
  return audio;
}

/** 纯逻辑：是否算完整听完（播过 90% 以上，恰好 90% 不算） */
export function endEventType(positionSec: number, durationSec: number): "completed" | "skip" {
  if (durationSec > 0 && positionSec > durationSec * 0.9) return "completed";
  return "skip";
}

/** 纯逻辑：下一个索引；末尾返回 null */
export function advance(index: number, length: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

function onEnded() {
  const track = currentTrack.value;
  if (track) {
    void recordPlaybackEvent(track.id, endEventType(position.value, duration.value), Math.round(position.value));
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    isPlaying.value = false;
    position.value = 0;
    return;
  }
  playAt(nextIndex);
}

export function playTracks(tracks: Track[], start = 0) {
  queue.value = tracks;
  playAt(start);
}

/** 网易云曲目：取流换成真实 https 直链并缓存回 track.filePath（togglePlayback/seek 复用） */
async function resolveNeteaseSrc(track: Track): Promise<string> {
  if (/^https?:\/\//i.test(track.filePath)) return toPlayableSrc(track);
  const numericId = Number(track.id.replace(/^netease-/, ""));
  if (!Number.isFinite(numericId)) throw new Error("无效的网易云曲目");
  const url = await neteaseStreamUrl(numericId);
  track.filePath = url;
  return toPlayableSrc(track);
}

export function playAt(index: number) {
  const track = queue.value[index];
  if (!track) return;
  currentIndex.value = index;
  position.value = 0;
  duration.value = track.durationSeconds;
  playbackError.value = null;
  const element = ensureAudio();

  if (track.source === "netease") {
    isPlaying.value = false;
    resolveNeteaseSrc(track)
      .then((src) => {
        if (queue.value[index] !== track) return; // 已切歌，丢弃过期结果
        if (!src) {
          playbackError.value = "无法获取播放地址";
          return;
        }
        element.src = src;
        void element.play().catch(() => {
          isPlaying.value = false;
        });
        void recordPlaybackEvent(track.id, "play", 0);
      })
      .catch((e: unknown) => {
        isPlaying.value = false;
        // 清掉旧 src：下次按播放会重试当前曲目而不是恢复上一首
        element.pause();
        element.removeAttribute("src");
        playbackError.value = e instanceof Error ? e.message : String(e);
      });
    return;
  }

  element.src = toPlayableSrc(track);
  void element.play().catch(() => {
    isPlaying.value = false;
  });
  void recordPlaybackEvent(track.id, "play", 0);
}

export function togglePlayback() {
  const element = ensureAudio();
  if (!element.src) {
    if (queue.value.length > 0) playAt(Math.max(currentIndex.value, 0));
    return;
  }
  if (element.paused) void element.play();
  else element.pause();
}

export function next(manual: boolean) {
  const track = currentTrack.value;
  if (manual && track) {
    void recordPlaybackEvent(track.id, "skip", Math.round(position.value));
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    ensureAudio().pause();
    return;
  }
  playAt(nextIndex);
}

export function previous() {
  if (position.value > 3) {
    seek(0);
    return;
  }
  const prevIndex = currentIndex.value - 1;
  if (prevIndex >= 0) playAt(prevIndex);
  else seek(0);
}

export function seek(seconds: number) {
  const element = ensureAudio();
  element.currentTime = seconds;
  position.value = seconds;
}

export function setVolume(value: number) {
  volume.value = Math.min(1, Math.max(0, value));
  ensureAudio().volume = volume.value;
}
