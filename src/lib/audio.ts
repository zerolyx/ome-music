import type { Track } from "../types/music";
import { isTauriRuntime } from "./api";

/**
 * 远程媒体域后缀白名单：与 src-tauri/src/media.rs 的 REMOTE_MEDIA_HOST_SUFFIXES
 * 保持一致（前端只把白名单内的 https 直链转给 /remote 代理）。
 */
const REMOTE_MEDIA_HOST_SUFFIXES = ["bilivideo.com", "bilivideo.cn", "akamaized.net", "hdslb.com", "126.net"];

/** 域名是否命中白名单（host == 后缀 或以 `.后缀` 结尾）。 */
export function proxyableRemoteHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    REMOTE_MEDIA_HOST_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`))
  );
}

/** 是否可经 /remote 代理：仅 https + 白名单域名。 */
export function proxyableRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && proxyableRemoteHost(parsed.host);
  } catch {
    return false;
  }
}

/**
 * 可播放的媒体地址。
 *
 * WebAudio（频谱/EQ/淡变）要求媒体未被 CORS 污染：媒体元素已设 crossOrigin=anonymous，
 * 只有带 Access-Control-Allow-Origin 的响应才能出声。本地文件与远程白名单域名
 * 一律经 ome-media 代理（响应带 ACAO:*）；白名单外的直链保持原样（可能无声音，可正常播放）。
 */
export function toPlayableSrc(track: Track): string {
  if (track.filePath.startsWith("unavailable:")) return "";
  if (/^https?:\/\//i.test(track.filePath)) {
    if (isTauriRuntime()) {
      // 网易云 CDN 常返回 http 直链：升级 https 后走代理（126.net 支持 https）
      const upgraded = track.filePath.replace(/^http:\/\//i, "https://");
      if (proxyableRemoteUrl(upgraded)) {
        return `http://ome-media.localhost/remote?p=${encodeURIComponent(upgraded)}`;
      }
    }
    return track.filePath;
  }
  if (!isTauriRuntime()) return track.filePath;
  return `http://ome-media.localhost/local?p=${encodeURIComponent(track.filePath)}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
