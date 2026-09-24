/* ============ 桌面歌词独立窗口（T5c / handover 路线图 #1） ============
 * 主窗口持有全部播放/歌词状态；第二窗口（label=desklyrics）只做渲染。
 * 跨窗同步走 Tauri 事件：主窗每 250ms 推一帧快照（含 sentAt 墙钟戳），
 * 歌词窗用 Date.now() 差值本地插值出连续进度驱动卡拉OK扫光，无需逐帧 IPC。
 * 暂停时快照字节级不变 → 发布循环按 JSON 去重，静默零流量。
 */

import { signal } from "@preact/signals";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauriRuntime } from "../lib/api";
import { currentTrack, isPlaying, position } from "./player";
import {
  activeLine,
  activeYrcLine,
  lyricLines,
  lyricTrackId,
  tlyricLines,
  translationFor,
  yrcLines,
  type LyricLine,
  type YrcLine,
} from "./lyrics";

export const DESKLYRICS_LABEL = "desklyrics";
/** 主窗 → 歌词窗：歌词快照（emitTo 定向） */
export const DESK_LYRIC_EVENT = "ome://desk-lyric";
/** 歌词窗 → 主窗：就绪握手的即时补帧 */
export const DESK_HELLO_EVENT = "ome://desk-lyric-hello";
/** 歌词窗 → 主窗：用户点了歌词窗上的关闭 */
export const DESK_CLOSE_EVENT = "ome://desk-lyric-close";
/** 歌词窗 → 主窗：用户点了歌词窗上的锁定（锁定后本窗再无鼠标事件，只能主窗解锁） */
export const DESK_LOCK_EVENT = "ome://desk-lyric-lock";

const ON_KEY = "ome.desklyrics.on";
const SIZE_KEY = "ome.desklyrics.size";
const RECT_KEY = "ome.desklyrics.rect";
const LOCK_KEY = "ome.desklyrics.locked";
/** 无歌词播放持续多久后隐藏窗口（来歌词/切歌/暂停即回） */
const HIDE_WITHOUT_LYRIC_MS = 8000;
const PUBLISH_INTERVAL_MS = 250;

/* ---- 快照（跨窗协议，纯逻辑可单测） ---- */

export interface DeskSnapshotLine {
  text: string;
  start: number;
  end: number;
}
export interface DeskSnapshotWord {
  text: string;
  start: number;
  end: number;
}
export interface DeskLyricSnapshot {
  track: { title: string; artist: string } | null;
  /** 歌词还没就位（换歌拉取中）——歌词窗据此显示「歌词加载中」 */
  pending: boolean;
  playing: boolean;
  /** sentAt 时刻的播放位置（秒） */
  position: number;
  /** 发送方墙钟（Date.now()），暂停时恒 0 保证字节级去重 */
  sentAt: number;
  line: DeskSnapshotLine | null;
  translation: string | null;
  next: string | null;
  words: DeskSnapshotWord[] | null;
}

export interface DeskSnapshotInput {
  track: { id: string; title: string; artist: string } | null;
  lyricTrackId: string | null;
  lyricLines: LyricLine[];
  yrcLines: YrcLine[];
  tlyricLines: LyricLine[];
  playing: boolean;
  position: number;
  now: number;
}

const joinWords = (words: Array<{ text: string }>): string =>
  words.map((word) => word.text).join("");

export function buildDeskSnapshot(input: DeskSnapshotInput): DeskLyricSnapshot {
  const { track, playing, position } = input;
  const base: DeskLyricSnapshot = {
    track: track ? { title: track.title, artist: track.artist } : null,
    pending: false,
    playing,
    position,
    sentAt: playing ? input.now : 0,
    line: null,
    translation: null,
    next: null,
    words: null,
  };
  if (!track) return base;
  // 歌词还挂在上一个曲目（拉取中）：显示加载态
  if (input.lyricTrackId !== track.id) return { ...base, pending: true };

  // 逐字（yrc）优先，与歌词舞台同规则
  if (input.yrcLines.length > 0) {
    const idx = activeYrcLine(input.yrcLines, position);
    const current = idx >= 0 ? input.yrcLines[idx] : null;
    const upcoming =
      idx + 1 < input.yrcLines.length ? input.yrcLines[idx + 1] : null;
    // 前奏期预览第一句；唱完最后一句后不再预览
    const preview = current ? upcoming : input.yrcLines[0];
    return {
      ...base,
      line: current
        ? { text: joinWords(current.words), start: current.start, end: current.end }
        : null,
      words: current ? current.words : null,
      next: preview ? joinWords(preview.words) : null,
    };
  }

  if (input.lyricLines.length > 0) {
    const idx = activeLine(input.lyricLines, position);
    const current = idx >= 0 ? input.lyricLines[idx] : null;
    const upcoming =
      idx + 1 < input.lyricLines.length ? input.lyricLines[idx + 1] : null;
    const preview = current ? upcoming : input.lyricLines[0];
    return {
      ...base,
      line: current
        ? {
            text: current.text,
            start: current.time,
            end: upcoming?.time ?? current.time + 8,
          }
        : null,
      translation: current
        ? translationFor(current, input.tlyricLines)?.text ?? null
        : null,
      next: preview?.text ?? null,
    };
  }
  return base;
}

/** 歌词窗本地插值：快照位置 + 墙钟差（暂停时不漂移） */
export function deskPositionAt(snap: DeskLyricSnapshot, nowMs: number): number {
  if (!snap.playing) return snap.position;
  return snap.position + Math.max(0, nowMs - snap.sentAt) / 1000;
}

/** 行内卡拉OK进度 0-1（行时长过短按 0.5s 兜底，与舞台一致） */
export function deskLineProgress(line: DeskSnapshotLine, position: number): number {
  const span = Math.max(line.end - line.start, 0.5);
  return Math.min(1, Math.max(0, (position - line.start) / span));
}

/* ---- 字号三档：窗口尺寸随档位走，持久化在歌词窗自己的 localStorage ---- */

export const DESK_SIZES = [
  { id: "s", label: "小", width: 640, height: 120 },
  { id: "m", label: "中", width: 780, height: 152 },
  { id: "l", label: "大", width: 960, height: 188 },
] as const;
export type DeskSizeId = (typeof DESK_SIZES)[number]["id"];

export function deskSizeFor(id: DeskSizeId): { width: number; height: number; label: string } {
  return DESK_SIZES.find((size) => size.id === id) ?? DESK_SIZES[1];
}

export function cycleDeskSize(id: DeskSizeId): DeskSizeId {
  const at = DESK_SIZES.findIndex((size) => size.id === id);
  return DESK_SIZES[(at + 1) % DESK_SIZES.length].id;
}

export function readDeskSizeId(): DeskSizeId {
  try {
    const saved = localStorage.getItem(SIZE_KEY);
    if (DESK_SIZES.some((size) => size.id === saved)) return saved as DeskSizeId;
  } catch {
    /* 存储不可用用默认 */
  }
  return "m";
}

export function saveDeskSizeId(id: DeskSizeId): void {
  try {
    localStorage.setItem(SIZE_KEY, id);
  } catch {
    /* ignore */
  }
}

/* ---- 窗口位置记忆：物理像素（outerPosition 原样），歌词窗拖动/缩放后自存 ---- */

export interface DeskRect {
  x: number;
  y: number;
}

export function readDeskRect(): DeskRect | null {
  try {
    const raw = localStorage.getItem(RECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeskRect>;
    if (typeof parsed?.x === "number" && Number.isFinite(parsed.x)
      && typeof parsed?.y === "number" && Number.isFinite(parsed.y)) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    /* 坏数据按无记忆处理 */
  }
  return null;
}

export function saveDeskRect(rect: DeskRect): void {
  try {
    localStorage.setItem(RECT_KEY, JSON.stringify(rect));
  } catch {
    /* ignore */
  }
}

/* ---- 开关与窗口生命周期（仅主窗口上下文调用） ---- */

/** 开关状态；开启意图持久化（下次开机随主窗自动恢复） */
export const deskLyricsOpen = signal(false);

/** 锁定 = 全鼠标穿透（ECHO 式）；锁定后歌词窗收不到事件，只能主窗解锁 */
export const deskLyricsLocked = signal(readLocked());

function readLocked(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** 无歌词自动隐藏的运行态（不持久化） */
let nolyricSince = 0;
let lyriclessHidden = false;

async function applyCursorEvents(locked: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const win = await WebviewWindow.getByLabel(DESKLYRICS_LABEL).catch(() => null);
  if (win) await win.setIgnoreCursorEvents(locked).catch(() => undefined);
}

export function setDeskLyricsLocked(locked: boolean): void {
  deskLyricsLocked.value = locked;
  try {
    localStorage.setItem(LOCK_KEY, locked ? "1" : "0");
  } catch {
    /* ignore */
  }
  void applyCursorEvents(locked);
}

/** 无歌词自动隐藏：仅在播放中判定；暂停/来歌词/切歌立即回显 */
async function syncLyriclessVisibility(snap: DeskLyricSnapshot): Promise<void> {
  const starved = snap.playing && !!snap.track && !snap.pending && !snap.line && !snap.next;
  if (starved) {
    if (!nolyricSince) nolyricSince = Date.now();
    if (!lyriclessHidden && Date.now() - nolyricSince > HIDE_WITHOUT_LYRIC_MS) {
      lyriclessHidden = true;
      const win = await WebviewWindow.getByLabel(DESKLYRICS_LABEL).catch(() => null);
      await win?.hide().catch(() => undefined);
    }
    return;
  }
  nolyricSince = 0;
  if (lyriclessHidden) {
    lyriclessHidden = false;
    const win = await WebviewWindow.getByLabel(DESKLYRICS_LABEL).catch(() => null);
    await win?.show().catch(() => undefined);
  }
}

let publishTimer: number | null = null;
let unlisteners: Array<UnlistenFn> = [];
let lastPayload: string | null = null;

function markClosed(): void {
  stopPublisher();
  deskLyricsOpen.value = false;
  try {
    localStorage.removeItem(ON_KEY);
  } catch {
    /* ignore */
  }
}

async function publishSnapshot(): Promise<void> {
  if (!deskLyricsOpen.value) return;
  const snap = buildDeskSnapshot({
    track: currentTrack.value,
    lyricTrackId: lyricTrackId.value,
    lyricLines: lyricLines.value,
    yrcLines: yrcLines.value,
    tlyricLines: tlyricLines.value,
    playing: isPlaying.value,
    position: position.value,
    now: Date.now(),
  });
  const payload = JSON.stringify(snap);
  if (payload === lastPayload) return; // 暂停静默：不重发相同帧
  lastPayload = payload;
  try {
    await emitTo(DESKLYRICS_LABEL, DESK_LYRIC_EVENT, snap);
  } catch {
    markClosed(); // 歌词窗已不在（外部销毁/崩溃）：自愈关闭
    return;
  }
  await syncLyriclessVisibility(snap);
}

function startPublisher(): void {
  stopPublisher();
  lastPayload = null;
  void publishSnapshot(); // 立即推一帧，歌词窗打开即有内容
  publishTimer = window.setInterval(() => void publishSnapshot(), PUBLISH_INTERVAL_MS);
  // 歌词窗就绪握手：补推当前帧；歌词窗上的关闭按钮走主窗统一关停
  void listen(DESK_HELLO_EVENT, () => {
    lastPayload = null;
    void publishSnapshot();
  })
    .then((un) => unlisteners.push(un))
    .catch(() => undefined);
  void listen(DESK_CLOSE_EVENT, () => void closeDeskLyrics())
    .then((un) => unlisteners.push(un))
    .catch(() => undefined);
  void listen(DESK_LOCK_EVENT, () => setDeskLyricsLocked(true))
    .then((un) => unlisteners.push(un))
    .catch(() => undefined);
}

function stopPublisher(): void {
  if (publishTimer !== null) {
    window.clearInterval(publishTimer);
    publishTimer = null;
  }
  for (const un of unlisteners) {
    try {
      un();
    } catch {
      /* 已失效忽略 */
    }
  }
  unlisteners = [];
}

export async function openDeskLyrics(): Promise<void> {
  if (!isTauriRuntime() || deskLyricsOpen.value) return;
  deskLyricsOpen.value = true;
  try {
    localStorage.setItem(ON_KEY, "1");
  } catch {
    /* ignore */
  }
  const existing = await WebviewWindow.getByLabel(DESKLYRICS_LABEL).catch(() => null);
  if (existing) {
    await existing.show().catch(() => undefined);
    if (deskLyricsLocked.value) await applyCursorEvents(true);
    startPublisher();
    return;
  }
  const size = deskSizeFor(readDeskSizeId());
  const win = new WebviewWindow(DESKLYRICS_LABEL, {
    url: "index.html",
    title: "桌面歌词",
    width: size.width,
    height: size.height,
    center: true,
    transparent: true,
    decorations: false,
    shadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false, // 悬浮条不抢焦点：打开瞬间也不从当前应用夺走输入
    visible: false, // 定位就绪后由歌词窗自行 show，避免原点闪现
  });
  await new Promise<void>((resolve) => {
    let done = false;
    const settle = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    win.once("tauri://created", settle);
    win.once("tauri://error", settle);
  });
  if (deskLyricsLocked.value) await applyCursorEvents(true);
  startPublisher();
}

export async function closeDeskLyrics(): Promise<void> {
  markClosed();
  if (!isTauriRuntime()) return;
  const win = await WebviewWindow.getByLabel(DESKLYRICS_LABEL).catch(() => null);
  if (win) await win.destroy().catch(() => undefined);
}

export function toggleDeskLyrics(): void {
  if (deskLyricsOpen.value) void closeDeskLyrics();
  else void openDeskLyrics();
}

/** 开机恢复（app 挂载后调用）：上开着就随主窗一起回来 */
export function restoreDeskLyrics(): void {
  if (!isTauriRuntime()) return;
  let on = false;
  try {
    on = localStorage.getItem(ON_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (on) {
    window.setTimeout(() => {
      if (!deskLyricsOpen.value) void openDeskLyrics();
    }, 800);
  }
}
