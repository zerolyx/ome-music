import { computed, signal } from "@preact/signals";
import type { Track } from "../types/music";
import { recordPlaybackEvent } from "../lib/api";
import { toPlayableSrc } from "../lib/audio";

export const queue = signal<Track[]>([]);
export const currentIndex = signal(-1);
export const isPlaying = signal(false);
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.9);

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

export function playAt(index: number) {
  const track = queue.value[index];
  if (!track) return;
  currentIndex.value = index;
  position.value = 0;
  duration.value = track.durationSeconds;
  const element = ensureAudio();
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
