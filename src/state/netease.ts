import { signal } from "@preact/signals";
import {
  neteaseLike,
  neteaseLogout,
  neteaseQrCheck,
  neteaseQrKey,
  neteaseSearch,
  neteaseStatus,
  type NeteaseStatus,
} from "../lib/api";
import type { NeteaseSong, Track } from "../types/music";

export type QrPhase = "idle" | "waiting" | "scanned" | "success" | "expired";

export interface QrState {
  key: string;
  qrSvg: string;
  phase: QrPhase;
}

export const status = signal<NeteaseStatus | null>(null);
export const qrState = signal<QrState | null>(null);
export const searching = signal(false);
export const results = signal<Track[]>([]);
export const error = signal<string | null>(null);
/** 是否已执行过一次搜索（区分初始空态与「没有找到」） */
export const searched = signal(false);

/** 纯逻辑：后端 code → QR 阶段（801 与未知 code 均视为等待中） */
export function qrPhaseFromCode(code: number): QrPhase {
  if (code === 802) return "scanned";
  if (code === 803) return "success";
  if (code === 800) return "expired";
  return "waiting";
}

/** 纯逻辑：DTO → 播放器通用 Track（id 加前缀避免与本地 id 碰撞） */
export function neteaseSongToTrack(song: NeteaseSong): Track {
  return {
    id: `netease-${song.id}`,
    title: song.name,
    artist: song.artists,
    album: song.album,
    durationSeconds: Math.round(song.durationMs / 1000),
    filePath: "",
    source: "netease",
    sourceId: String(song.id),
    unavailableReason: song.plain ? null : "vip",
    coverPath: song.coverUrl ?? null,
    liked: false,
    playCount: 0,
  };
}

/** 纯逻辑：netease-{id} → 数字 id（非该前缀返回 NaN） */
export function neteaseNumericId(track: Pick<Track, "id">): number {
  return Number(track.id.replace(/^netease-/, ""));
}

const toMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function refreshStatus(): Promise<void> {
  try {
    status.value = await neteaseStatus();
  } catch {
    // 非 Tauri 环境或读取失败：按未登录处理，不打扰用户
    status.value = { loggedIn: false };
  }
}

let pollTimer = 0;
let pollSession = 0;

function stopPolling(): void {
  if (pollTimer !== 0) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
  pollSession += 1;
}

async function pollCheck(key: string, session: number, timer: number): Promise<void> {
  let phase: QrPhase;
  try {
    phase = qrPhaseFromCode((await neteaseQrCheck(key)).code);
  } catch {
    return; // 单次查询失败（网络抖动）：保持轮询
  }
  if (session !== pollSession) {
    // 本会话已被新一轮扫码取代：自己清掉自己的定时器，避免孤儿轮询常驻
    if (pollTimer === timer) pollTimer = 0;
    window.clearInterval(timer);
    return;
  }
  if (phase === "success") {
    stopPolling();
    qrState.value = qrState.value ? { ...qrState.value, phase } : null;
    await refreshStatus();
    return;
  }
  if (phase === "expired") {
    stopPolling();
    if (qrState.value) qrState.value = { ...qrState.value, phase };
    return;
  }
  if (qrState.value && qrState.value.key === key) {
    qrState.value = { ...qrState.value, phase };
  }
}

export async function startQrLogin(): Promise<void> {
  stopPolling(); // 同步清掉现有定时器并推进会话号（先于首个 await，防并发申请互踩）
  const session = pollSession;
  error.value = null;
  try {
    const { key, qrSvg } = await neteaseQrKey();
    if (session !== pollSession) return; // 等 key 期间又开了新一轮：本轮作废，不装定时器
    qrState.value = { key, qrSvg, phase: "waiting" };
    const timer = window.setInterval(() => void pollCheck(key, session, timer), 2000);
    pollTimer = timer;
  } catch (e) {
    error.value = toMessage(e);
  }
}

export function cancelQrLogin(): void {
  stopPolling();
  qrState.value = null;
}

export async function logout(): Promise<void> {
  try {
    await neteaseLogout();
  } catch (e) {
    error.value = toMessage(e);
  }
  await refreshStatus();
}

export async function search(keywords: string): Promise<void> {
  searching.value = true;
  searched.value = true;
  error.value = null;
  try {
    const songs = await neteaseSearch(keywords);
    results.value = songs.map(neteaseSongToTrack);
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    searching.value = false;
  }
}

/** 网易云行红心：乐观翻转，失败（含未登录）回滚并提示；本地曲目走曲库路径 */
export function toggleNeteaseLike(track: Track): void {
  if (track.source !== "netease") return;
  const numericId = neteaseNumericId(track);
  if (!Number.isFinite(numericId)) return;
  const nextLiked = !track.liked;
  results.value = results.value.map((item) =>
    item.id === track.id ? { ...item, liked: nextLiked } : item
  );
  neteaseLike(numericId, nextLiked).catch((e: unknown) => {
    results.value = results.value.map((item) =>
      item.id === track.id ? { ...item, liked: track.liked } : item
    );
    error.value = toMessage(e);
  });
}
