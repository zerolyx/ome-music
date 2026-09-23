import { computed, signal } from "@preact/signals";
import type { Track } from "../types/music";
import { neteaseStreamUrl, recordPlaybackEvent, bilibiliProxySrc, bilibiliStreamUrl } from "../lib/api";
import { toPlayableSrc } from "../lib/audio";
import { djConfig } from "./dj";
import { introFor, radioEnabled, radioNext, recordSkip } from "./radio";
import { speak } from "./tts";

export const queue = signal<Track[]>([]);
/** 播放列表抽屉开关 */
export const queueOpen = signal(false);
export const currentIndex = signal(-1);
export const isPlaying = signal(false);
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.9);
/** 取流/播放失败提示（如「该歌曲需要 VIP 或无版权」） */
export const playbackError = signal<string | null>(null);
/** DJ 正在说歌前介绍（player-bar 可据此淡化标题） */
export const introPlaying = signal(false);

export const currentTrack = computed<Track | null>(
  () => queue.value[currentIndex.value] ?? null
);

let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.volume = volume.value;
  let lastPersist = 0;
  audio.addEventListener("timeupdate", () => {
    position.value = audio?.currentTime ?? 0;
    const now = Date.now();
    if (now - lastPersist > 5000) {
      lastPersist = now;
      const track = currentTrack.value;
      if (track) saveLastPlayback(track, position.value);
    }
  });
  audio.addEventListener("durationchange", () => {
    duration.value = Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0;
  });
  audio.addEventListener("play", () => (isPlaying.value = true));
  audio.addEventListener("pause", () => (isPlaying.value = false));
  audio.addEventListener("loadedmetadata", () => {
    if (pendingSeekSeconds !== null && audio) {
      try { audio.currentTime = pendingSeekSeconds; position.value = pendingSeekSeconds; } catch { /* 越界忽略 */ }
      pendingSeekSeconds = null;
    }
  });
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

/** 纯逻辑：曲目已在队列则返回其下标，否则返回追加后的队尾下标 */
export function queueIndexFor(tracks: Track[], track: Track): number {
  const existing = tracks.findIndex((item) => item.id === track.id);
  return existing === -1 ? tracks.length : existing;
}

/** 起播序号：电台选曲期间用户手动开播了别的歌时，用它丢弃过期的自动接播 */
let playSeq = 0;
/** 歌前介绍会话：快速连点时只保留最新一次介绍 */
let introToken = 0;

/* ---- 续播记忆：上次播放的曲目与进度 ---- */
const LAST_KEY = "ome.last";
let pendingSeekSeconds: number | null = null;

export function saveLastPlayback(track: Track | null, positionSeconds: number): void {
  try {
    if (!track) return;
    localStorage.setItem(LAST_KEY, JSON.stringify({ track, position: Math.round(positionSeconds) }));
  } catch { /* 存储不可用忽略 */ }
}

export function setPendingSeek(seconds: number | null): void {
  pendingSeekSeconds = seconds;
}

export function readLastPlayback(): { track: Track; position: number } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { track: Track; position: number };
    if (!parsed?.track?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stopAtQueueEnd() {
  isPlaying.value = false;
  position.value = 0;
}

async function onEnded() {
  const track = currentTrack.value;
  if (track) {
    void recordPlaybackEvent(track.id, endEventType(position.value, duration.value), Math.round(position.value));
  }
  // 自动电台：DJ 挑下一首并附开场白；未开电台 / DJ 未配置走原有顺序播放
  if (radioEnabled.value && djConfig.value?.configured) {
    const seqAtEnd = playSeq;
    const nextTrack = await radioNext(track?.id ?? null);
    if (playSeq !== seqAtEnd) return; // 选曲期间用户手动开播了：不抢播放
    if (!nextTrack) {
      stopAtQueueEnd();
      return;
    }
    const nextIndex = queueIndexFor(queue.value, nextTrack);
    if (nextIndex === queue.value.length) queue.value = [...queue.value, nextTrack];
    await playWithRadioIntro(nextTrack, nextIndex, "ended");
    return;
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    stopAtQueueEnd();
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

/**
 * 播放队列中第 index 首。
 * opts.intro 为 true 时先让 DJ 说一句歌前介绍再起播（未配置 DJ / TTS 关闭则立即直放）。
 */
export function playAt(index: number, opts?: { intro?: boolean }) {
  const track = queue.value[index];
  if (!track) return;
  if (opts?.intro) {
    void playWithRadioIntro(track, index);
    return;
  }
  playImmediate(index);
}

/** 立即起播 / 手动暂停时作废等待中的介绍会话：过期的介绍返回时不得抢回播放 */
function invalidateIntro() {
  introToken += 1;
  introPlaying.value = false;
}

/** 直接起播（无介绍）：原有 playAt 逻辑 */
function playImmediate(index: number) {
  const track = queue.value[index];
  if (!track) return;
  playSeq += 1;
  invalidateIntro();
  currentIndex.value = index;
  position.value = 0;
  duration.value = track.durationSeconds;
  saveLastPlayback(track, 0);
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

  if (track.source === "bilibili") {
    isPlaying.value = false;
    const sourceId = track.sourceId ?? "";
    // B站 CDN 有 Referer 防盗链：真实直链必须经 ome-media /remote 代理中转
    bilibiliStreamUrl(sourceId)
      .then(({ url, referer }) => {
        if (queue.value[index] !== track) return; // 已切歌，丢弃过期结果
        element.src = bilibiliProxySrc(url, referer);
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

/**
 * 电台起播：拿到介绍词 → TTS 说完 → 起播；任何一步失败立即直放，绝不阻塞音乐。
 * 用 introToken 防竞态：请求期间用户点了别的歌，过期的介绍整段丢弃。
 */
export async function playWithRadioIntro(
  track: Track,
  index: number,
  event?: "skip" | "ended" | "boot" | "resume"
): Promise<void> {
  const token = ++introToken;
  introPlaying.value = true;
  try {
    const say = await introFor(track, event);
    if (token !== introToken || queue.value[index] !== track) return;
    if (say) await speak(say);
    if (token !== introToken || queue.value[index] !== track) return;
    playImmediate(index);
  } finally {
    if (token === introToken) introPlaying.value = false;
  }
}

export function togglePlayback() {
  const element = ensureAudio();
  if (!element.src) {
    if (queue.value.length > 0) playAt(Math.max(currentIndex.value, 0));
    return;
  }
  if (element.paused) void element.play();
  else {
    invalidateIntro(); // 手动暂停同样取消等待中的介绍，避免继续播放时被过期介绍抢回
    element.pause();
  }
}

export function next(manual: boolean) {
  const track = currentTrack.value;
  if (manual && track) {
    void recordPlaybackEvent(track.id, "skip", Math.round(position.value));
    recordSkip(track.id); // 电台记忆：近 20 分钟内降权
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    invalidateIntro(); // 队列播完即停：等待中的介绍作废，不得在停歇时抢回播放
    ensureAudio().pause();
    return;
  }
  // 情绪化电台：手动跳歌也由 DJ 承接情绪（skip 语境），未配置则直切
  if (manual && radioEnabled.value && djConfig.value?.configured) {
    void playWithRadioIntro(queue.value[nextIndex], nextIndex, "skip");
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
