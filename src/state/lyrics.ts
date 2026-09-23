import { signal } from "@preact/signals";
import { localLyric, neteaseLyric, neteaseSearch } from "../lib/api";
import type { NeteaseSong, Track } from "../types/music";

export interface LyricLine {
  time: number;
  text: string;
}

/** 逐字歌词（网易云 yrc）：字级时间戳，Folia 式逐字点亮 */
export interface YrcWord {
  start: number;
  end: number;
  text: string;
}
export interface YrcLine {
  start: number;
  end: number;
  words: YrcWord[];
}

export const lyricLines = signal<LyricLine[]>([]);
export const yrcLines = signal<YrcLine[]>([]);
/** 翻译歌词（网易云 tlyric，主行下小字渲染） */
export const tlyricLines = signal<LyricLine[]>([]);
export const lyricTrackId = signal<string | null>(null);

/** yrc 行格式：[start,dur](s,d)字(s,d)字…；首部元数据行内容是 JSON，过滤掉 */
export function parseYrc(text: string): YrcLine[] {
  const out: YrcLine[] = [];
  for (const raw of text.split(String.fromCharCode(10))) {
    const head = /^\[(\d+),(\d+)\]/.exec(raw);
    if (!head) continue;
    const start = Number(head[1]) / 1000;
    const end = start + Number(head[2]) / 1000;
    const words: YrcWord[] = [];
    const wordRe = /\((\d+),(\d+)\)([^()]*)/g;
    let match: RegExpExecArray | null;
    while ((match = wordRe.exec(raw))) {
      const wordStart = Number(match[1]) / 1000;
      const text = match[3];
      if (text.trim()) {
        words.push({ start: wordStart, end: wordStart + Number(match[2]) / 1000, text });
      }
    }
    if (words.length === 0) continue; // 元数据行（作曲/作词 JSON）
    out.push({ start, end, words });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 逐字模式：某行内按位置点亮；返回每个字的状态 */
export function yrcWordStates(line: YrcLine, position: number): Array<"sung" | "singing" | "next"> {
  return line.words.map((word) => {
    if (position >= word.end) return "sung" as const;
    if (position >= word.start) return "singing" as const;
    return "next" as const;
  });
}

/** 当前行索引（yrc） */
export function activeYrcLine(lines: YrcLine[], position: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= position + 0.15) index = i;
    else break;
  }
  return index;
}

/** 解析 LRC：支持一行多时间戳，输出按时间升序 */
export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    let match: RegExpExecArray | null;
    const stamps: number[] = [];
    let lastIndex = 0;
    while ((match = re.exec(raw))) {
      const time = Number(match[1]) * 60 + Number(match[2]) + (match[3] ? Number(`0.${match[3]}`) : 0);
      stamps.push(time);
      lastIndex = re.lastIndex;
    }
    const content = raw.slice(lastIndex).trim();
    if (content) {
      for (const time of stamps) out.push({ time, text: content });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** 当前播放行索引：最后一个 time <= position 的行；-1 = 还没开始 */
export function activeLine(lines: LyricLine[], position: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position + 0.2) index = i;
    else break;
  }
  return index;
}

/** 网易云源曲目歌词（内存缓存键 trackId） */
const neteaseCache = new Map<string, RawLyric | null>();
/** 非网易云曲目：搜索匹配结果缓存（命中/未命中都缓存，避免反复搜索） */
const matchedCache = new Map<string, RawLyric | null>();
/** 本地曲目：同目录 .lrc 缓存（命中/未命中都缓存） */
const localLrcCache = new Map<string, { lrc: string } | null>();
/** 原始歌词留底：调歌词偏移时无需重新拉取即可重解析 */
const rawByTrack = new Map<string, RawLyric>();

interface RawLyric {
  lrc: string;
  yrc?: string | null;
  tlyric?: string | null;
}

/* ---- 歌词偏移：localStorage 按曲目记忆（Folia：手动偏移按歌曲保存） ---- */

const OFFSETS_KEY = "ome.lyric.offsets";
export const OFFSET_STEP = 0.5;
const OFFSET_LIMIT = 20; // 单向最多 ±20s

export function readOffsets(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      );
    }
  } catch {
    /* 坏数据按无偏移处理 */
  }
  return {};
}

export function getTrackOffset(trackId: string): number {
  return readOffsets()[trackId] ?? 0;
}

export function setTrackOffset(trackId: string, offset: number): void {
  const offsets = readOffsets();
  if (Math.abs(offset) < 0.01) delete offsets[trackId];
  else offsets[trackId] = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, offset));
  try {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets));
  } catch {
    /* ignore */
  }
}

/** 给已解析行施加偏移（钳到 0，避免负时间戳打乱 activeLine） */
export function applyOffset(lines: LyricLine[], offset: number): LyricLine[] {
  if (!offset) return lines;
  return lines.map((line) => ({ ...line, time: Math.max(0, line.time + offset) }));
}

/** 步进调整某曲目的歌词偏移；若该曲正在展示，立即重解析生效 */
export function adjustTrackOffset(trackId: string, delta: number): number {
  const next = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, getTrackOffset(trackId) + delta));
  setTrackOffset(trackId, next);
  const raw = rawByTrack.get(trackId);
  if (raw && lyricTrackId.value === trackId) presentParsed(trackId, raw);
  return next;
}

/** 找主行对应的翻译行：时间戳最近者（容差 0.6s），对不齐就不显示 */
export function translationFor(line: LyricLine, translations: LyricLine[]): LyricLine | null {
  let best: LyricLine | null = null;
  let bestDelta = 0.6;
  for (const candidate of translations) {
    const delta = Math.abs(candidate.time - line.time);
    if (delta <= bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

function clearLyrics(): void {
  lyricLines.value = [];
  yrcLines.value = [];
  tlyricLines.value = [];
  lyricTrackId.value = null;
}

function presentLyric(trackId: string): boolean {
  return lyricTrackId.value === trackId && (lyricLines.value.length > 0 || yrcLines.value.length > 0);
}

function presentParsed(trackId: string, lyric: RawLyric): void {
  rawByTrack.set(trackId, lyric);
  const offset = getTrackOffset(trackId);
  yrcLines.value = lyric.yrc ? parseYrc(lyric.yrc) : [];
  lyricLines.value = applyOffset(parseLrc(lyric.lrc), offset);
  tlyricLines.value = lyric.tlyric ? applyOffset(parseLrc(lyric.tlyric), offset) : [];
  lyricTrackId.value = trackId;
}

const normalize = (text: string): string =>
  text.toLowerCase().replace(/[\s\p{Punctuation}]/gu, "");

/** 从搜索结果里挑最像的一首：标题完全一致 > 互相包含 > 第一首 */
function pickBestMatch(songs: NeteaseSong[], title: string): NeteaseSong | null {
  if (songs.length === 0) return null;
  const want = normalize(title);
  return (
    songs.find((song) => normalize(song.name) === want) ??
    songs.find((song) => {
      const name = normalize(song.name);
      return name.includes(want) || want.includes(name);
    }) ??
    songs[0]
  );
}

async function fetchNeteaseLyric(sourceId: string): Promise<RawLyric | null> {
  try {
    return await neteaseLyric(Number(sourceId));
  } catch {
    return null;
  }
}

/** 非网易云曲目：按 标题+艺人 搜网易云，标题归一化匹配后拉歌词（Folia 式智能歌词匹配的轻量版） */
async function fetchMatchedLyric(track: Track): Promise<RawLyric | null> {
  const cached = matchedCache.get(track.id);
  if (cached !== undefined) return cached;
  let result: RawLyric | null = null;
  try {
    const songs = await neteaseSearch(`${track.title} ${track.artist}`, 5);
    const best = pickBestMatch(songs, track.title);
    if (best) result = await fetchNeteaseLyric(String(best.id));
  } catch {
    result = null; // 未登录/网络失败：静默无歌词
  }
  matchedCache.set(track.id, result);
  return result;
}

/** base64（Rust 原样字节）→ 文本：UTF-8 严格解码，失败回退 GBK（Windows 歌词常见编码） */
export function decodeLrcBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gbk").decode(bytes);
  }
}

/** 本地曲目：同目录 .lrc 优先（离线可用、准确对应版本），没有再回退网易云匹配 */
async function fetchLocalTrackLyric(track: Track): Promise<RawLyric | null> {
  const cached = localLrcCache.get(track.id);
  if (cached !== undefined) return cached;
  let result: RawLyric | null = null;
  try {
    const encoded = await localLyric(track.id);
    if (encoded) {
      const lrc = decodeLrcBase64(encoded).trim();
      if (lrc) result = { lrc };
    }
  } catch {
    result = null;
  }
  localLrcCache.set(track.id, result);
  if (result) return result;
  return fetchMatchedLyric(track);
}

export async function loadLyricFor(track: Track | null): Promise<void> {
  if (!track) {
    clearLyrics();
    return;
  }
  if (presentLyric(track.id)) return;

  if (track.source === "netease" && track.sourceId) {
    const cached = neteaseCache.get(track.id);
    const lyric = cached !== undefined ? cached : await fetchNeteaseLyric(track.sourceId);
    neteaseCache.set(track.id, lyric);
    if (lyric) presentParsed(track.id, lyric);
    else clearLyrics();
    return;
  }

  if (track.source === "local") {
    const lyric = await fetchLocalTrackLyric(track);
    if (lyric) presentParsed(track.id, lyric);
    else clearLyrics();
    return;
  }

  const lyric = await fetchMatchedLyric(track);
  if (lyric) presentParsed(track.id, lyric);
  else clearLyrics();
}

/** 手动重新匹配歌词：清掉本地/匹配缓存后按当前曲目重拉（命令面板「歌词 · 重新匹配」） */
export async function rematchLyric(track: Track): Promise<void> {
  localLrcCache.delete(track.id);
  matchedCache.delete(track.id);
  rawByTrack.delete(track.id);
  if (lyricTrackId.value === track.id) {
    lyricLines.value = [];
    yrcLines.value = [];
    tlyricLines.value = [];
    lyricTrackId.value = null;
  }
  await loadLyricFor(track);
}
