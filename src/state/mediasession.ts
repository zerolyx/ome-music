/* ============ Media Session：系统媒体键与媒体浮层（完全体播放器标配） ============
 * WebView2(Chromium) 支持 Media Session API：键盘媒体键、系统媒体浮层的
 * 播放/暂停/上下曲/进度都从这里走。纯前端，零依赖、零权限。
 */

import { effect, untracked } from "@preact/signals";
import { coverUrl } from "../lib/api";
import { currentTrack, duration, isPlaying, next, position, previous, seek, togglePlayback } from "./player";

export interface MediaMetadataData {
  title: string;
  artist: string;
  album: string;
  artworkSrc: string | null;
}

/** 纯逻辑：曲目 → 媒体浮层元数据（可单测） */
export function buildMediaMetadata(track: {
  title: string;
  artist: string;
  album: string;
  coverPath?: string | null;
}): MediaMetadataData {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album || "Ome Music",
    artworkSrc: track.coverPath ? coverUrl(track.coverPath) : null,
  };
}

type Session = Pick<MediaSession, "metadata" | "playbackState" | "setPositionState" | "setActionHandler">;

function session(): Session | null {
  const nav = navigator as Navigator & { mediaSession?: MediaSession };
  return nav.mediaSession ?? null;
}

function applyMetadata(data: MediaMetadataData): void {
  const ms = session();
  if (!ms) return;
  try {
    ms.metadata = new MediaMetadata({
      title: data.title,
      artist: data.artist,
      album: data.album,
      artwork: data.artworkSrc ? [{ src: data.artworkSrc, sizes: "640x640", type: "image/jpeg" }] : [],
    });
  } catch {
    /* 构造失败（极旧内核）忽略 */
  }
}

function applyPositionState(): void {
  const ms = session();
  if (!ms || !ms.setPositionState) return;
  if (!isPlaying.value || duration.value <= 0) return;
  try {
    ms.setPositionState({
      duration: duration.value,
      playbackRate: 1,
      position: Math.min(Math.max(position.value, 0), duration.value),
    });
  } catch {
    /* 换歌瞬间 position > duration 会抛：下一拍自动修正 */
  }
}

/** 应用挂载时接线；重复调用安全（handler 幂等覆盖） */
export function initMediaSession(): void {
  const ms = session();
  if (!ms) return;
  try {
    ms.setActionHandler("play", () => {
      if (!isPlaying.value) togglePlayback();
    });
    ms.setActionHandler("pause", () => {
      if (isPlaying.value) togglePlayback();
    });
    ms.setActionHandler("previoustrack", () => previous());
    ms.setActionHandler("nexttrack", () => next(true));
    ms.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });
    ms.setActionHandler("seekbackward", () => seek(Math.max(0, position.value - 10)));
    ms.setActionHandler("seekforward", () => seek(position.value + 10));
  } catch {
    /* 个别 action 不支持：忽略 */
  }

  // 换曲 → 元数据 + 进度态；播放态变化 → playbackState + 进度态。
  // 进度读数用 untrack：position 每 timeupdate 都变，不能当依赖（否则 4Hz 重跑）。
  effect(() => {
    const track = currentTrack.value;
    untracked(() =>
      applyMetadata(
        track
          ? buildMediaMetadata(track)
          : { title: "Ome Music", artist: "私人电台", album: "", artworkSrc: null },
      ),
    );
    untracked(applyPositionState);
  });
  effect(() => {
    const playing = isPlaying.value;
    untracked(() => {
      const s = session();
      if (s) s.playbackState = playing ? "playing" : "paused";
      applyPositionState();
    });
  });
}
