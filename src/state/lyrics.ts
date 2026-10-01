import { signal } from "@preact/signals";
import {
  getSavedTrackLyrics,
  getAutoBackfilledTrackLyrics,
  jellyfinLyrics,
  localLyric,
  neteaseLyric,
  neteaseSearch,
  subsonicLyrics,
  type JellyfinLyrics,
  type LocalLyricPayload,
  type SavedTrackLyrics,
} from "../lib/api";
import { sniffLyricText } from "../lib/lyricfmt";
import type { NeteaseSong, Track } from "../types/music";

export interface LyricLine {
  time: number;
  text: string;
}

export type LyricSubtitleMode = "translation" | "romanization" | "combined" | "none";
export type LyricSubtitleKind = "translation" | "romanization";
export interface LyricSubtitle {
  kind: LyricSubtitleKind;
  text: string;
}
const SUBTITLE_MODE_KEY = "ome.lyric.subtitle-mode";

function readLyricSubtitleMode(): LyricSubtitleMode {
  try {
    const saved = localStorage.getItem(SUBTITLE_MODE_KEY);
    return saved === "romanization" || saved === "combined" || saved === "none" ? saved : "translation";
  } catch {
    return "translation";
  }
}

export const lyricSubtitleMode = signal<LyricSubtitleMode>(readLyricSubtitleMode());

export function setLyricSubtitleMode(mode: LyricSubtitleMode): void {
  lyricSubtitleMode.value = mode;
  try {
    localStorage.setItem(SUBTITLE_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
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
/** 无时间轴的本地内嵌歌词，保持原始行序静态呈现。 */
export const plainLyricText = signal("");
/** 无时间轴内嵌歌词对应的罗马音行，按非空歌词行序配对。 */
export const plainRomanizationLines = signal<string[]>([]);
/** 翻译歌词（网易云 tlyric，主行下小字渲染） */
export const tlyricLines = signal<LyricLine[]>([]);
/** 罗马音副字幕（本地 .r.lrc / .r.vtt sidecar） */
export const romanizationLines = signal<LyricLine[]>([]);
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
/** 本地曲目：同目录歌词 sidecar 缓存（命中/未命中都缓存） */
const localLrcCache = new Map<string, RawLyric | null>();
/** Subsonic 曲目：服务器原生歌词只保留在当前会话内存中。 */
const subsonicCache = new Map<string, RawLyric | null>();
/** Jellyfin 曲目：服务器原生歌词只保留在当前会话内存中。 */
const jellyfinCache = new Map<string, RawLyric | null>();
/** 原始歌词留底：调歌词偏移时无需重新拉取即可重解析 */
const rawByTrack = new Map<string, RawLyric>();
let lyricLoadRevision = 0;
let subsonicSessionRevision = 0;
let jellyfinSessionRevision = 0;
let lyricLoadRequest: { revision: number; trackId: string | null } | null = null;

export interface RawLyric {
  lrc: string;
  yrc?: string | null;
  tlyric?: string | null;
  rlyric?: string | null;
  plainLyrics?: string | null;
  ttml?: string | null;
  qrc?: string | null;
}

function normalizeRawLyric(raw: RawLyric): RawLyric {
  const ttml = raw.ttml ? sniffLyricText(raw.ttml) : null;
  const qrc = raw.qrc ? sniffLyricText(raw.qrc) : null;
  return {
    ...raw,
    lrc: raw.lrc.trim() || ttml?.lrc || qrc?.lrc || "",
    yrc: raw.yrc || ttml?.yrc || qrc?.yrc || null,
  };
}

/** 从候选或已加载歌词中提取主歌词文本；翻译与罗马音副字幕不会并入。 */
export function lyricsTextFromRaw(raw: RawLyric | null | undefined): string {
  if (!raw) return "";
  const normalized = normalizeRawLyric(raw);
  const clean = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/^\uFEFF/, "").trim();
  const lrc = clean(normalized.lrc);
  if (lrc && parseLrc(lrc).length > 0) return lrc;

  const yrcRows = normalized.yrc ? parseYrc(normalized.yrc) : [];
  if (yrcRows.length > 0) {
    return yrcRows.map((row) => {
      const centiseconds = Math.max(0, Math.round(row.start * 100));
      const minutes = Math.floor(centiseconds / 6000);
      const seconds = Math.floor((centiseconds % 6000) / 100);
      const fraction = centiseconds % 100;
      const text = row.words.map((word) => word.text).join("").trim();
      return text
        ? `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}]${text}`
        : "";
    }).filter(Boolean).join("\n");
  }

  return clean(raw.plainLyrics);
}

/** 验证从本地数据库读取的已保存候选，再交给共享格式解析链。 */
export function rawLyricsFromSavedTrack(saved: SavedTrackLyrics | null): RawLyric | null {
  if (!saved || !saved.rawLyrics || typeof saved.rawLyrics !== "object") return null;
  const fields = saved.rawLyrics as unknown as Record<string, unknown>;
  const text = (key: string): string | null => typeof fields[key] === "string" ? fields[key] as string : null;
  const raw: RawLyric = {
    lrc: text("lrc") ?? "",
    yrc: text("yrc"),
    plainLyrics: text("plainLyrics"),
    ttml: text("ttml"),
    qrc: text("qrc"),
    tlyric: text("tlyric"),
    rlyric: text("rlyric"),
  };
  return lyricsTextFromRaw(raw) ? normalizeRawLyric(raw) : null;
}

/** 返回已加载主歌词的可写文本；副字幕从不并入音频标签。 */
export function lyricsTextForEmbedding(trackId: string): string {
  // 订阅当前歌词曲目变化，让打开中的曲目信息编辑器及时更新可用状态。
  void lyricTrackId.value;
  return lyricsTextFromRaw(rawByTrack.get(trackId));
}

/** 将用户挑选的候选记在当前应用会话的歌词缓存中，不写音频或 sidecar。 */
export function rememberLyricsCandidate(trackId: string, lyric: RawLyric): void {
  lyricLoadRevision += 1;
  const normalized = normalizeRawLyric(lyric);
  matchedCache.set(trackId, normalized);
  localLrcCache.set(trackId, normalized);
  rawByTrack.set(trackId, normalized);
  if (lyricTrackId.value === trackId) presentParsed(trackId, normalized);
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

function parseRomanization(text: string, mainLines: LyricLine[], offset: number): LyricLine[] {
  const parsed = sniffLyricText(text);
  const timed = parseLrc(parsed.lrc);
  if (timed.length > 0) return applyOffset(timed, offset);

  const plain = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[a-z][a-z0-9_]*\s*:/i.test(line));
  return mainLines.flatMap((line, index) => {
    const romanized = plain[index];
    return romanized ? [{ time: Math.max(0, line.time + offset), text: romanized }] : [];
  });
}

/** 将罗马音 sidecar 转成按内容行序排列的纯文本，供无时间轴主歌词配对。 */
export function parsePlainRomanizationRows(text: string | null | undefined): string[] {
  if (!text) return [];
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const parsed = sniffLyricText(normalized);
  const timed = parseLrc(parsed.lrc);
  if (timed.length > 0) return timed.map((line) => line.text.trim()).filter(Boolean);
  return parsed.lrc
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[a-z][a-z0-9_]*\s*:/i.test(line));
}

function parseLocalRomanization(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  try {
    const text = decodeLrcBase64(encoded).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    if (!text) return null;
    const parsed = sniffLyricText(text);
    if (parseLrc(parsed.lrc).length > 0) return parsed.lrc;
    const plain = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^\[[a-z][a-z0-9_]*\s*:/i.test(line));
    return plain.length > 0 ? plain.join("\n") : null;
  } catch {
    return null;
  }
}

export function lyricSubtitlesFor(
  line: LyricLine,
  mode: LyricSubtitleMode = lyricSubtitleMode.value,
  translations: LyricLine[] = tlyricLines.value,
  romanizations: LyricLine[] = romanizationLines.value,
): LyricSubtitle[] {
  if (mode === "translation") {
    const translation = translationFor(line, translations);
    return translation ? [{ kind: "translation", text: translation.text }] : [];
  }
  if (mode === "romanization") {
    const romanization = translationFor(line, romanizations);
    return romanization ? [{ kind: "romanization", text: romanization.text }] : [];
  }
  if (mode === "combined") {
    const romanization = translationFor(line, romanizations);
    const translation = translationFor(line, translations);
    return [
      ...(romanization ? [{ kind: "romanization" as const, text: romanization.text }] : []),
      ...(translation ? [{ kind: "translation" as const, text: translation.text }] : []),
    ];
  }
  return [];
}

function clearLyrics(): void {
  lyricLines.value = [];
  yrcLines.value = [];
  plainLyricText.value = "";
  plainRomanizationLines.value = [];
  tlyricLines.value = [];
  romanizationLines.value = [];
  lyricTrackId.value = null;
}

/** 切换或断开 Subsonic 会话时丢弃远程曲目的歌词与未完成请求。 */
export function clearSubsonicLyricCache(): void {
  if (lyricLoadRequest?.trackId?.startsWith("subsonic:")) lyricLoadRevision += 1;
  subsonicSessionRevision += 1;
  for (const cache of [subsonicCache, matchedCache, rawByTrack]) {
    for (const trackId of cache.keys()) {
      if (trackId.startsWith("subsonic:")) cache.delete(trackId);
    }
  }
  if (lyricTrackId.value?.startsWith("subsonic:")) clearLyrics();
}

/** 切换或断开 Jellyfin 会话时丢弃远程曲目的歌词与未完成请求。 */
export function clearJellyfinLyricCache(): void {
  if (lyricLoadRequest?.trackId?.startsWith("jellyfin:")) lyricLoadRevision += 1;
  jellyfinSessionRevision += 1;
  for (const cache of [jellyfinCache, matchedCache, rawByTrack]) {
    for (const trackId of cache.keys()) {
      if (trackId.startsWith("jellyfin:")) cache.delete(trackId);
    }
  }
  if (lyricTrackId.value?.startsWith("jellyfin:")) clearLyrics();
}

function presentLyric(trackId: string): boolean {
  return lyricTrackId.value === trackId && (
    lyricLines.value.length > 0 || yrcLines.value.length > 0 || plainLyricText.value.length > 0
  );
}

function presentParsed(trackId: string, lyric: RawLyric): void {
  const normalized = normalizeRawLyric(lyric);
  rawByTrack.set(trackId, normalized);
  const offset = getTrackOffset(trackId);
  yrcLines.value = normalized.yrc ? parseYrc(normalized.yrc) : [];
  lyricLines.value = applyOffset(parseLrc(normalized.lrc), offset);
  plainLyricText.value = normalized.plainLyrics?.trim() ?? "";
  plainRomanizationLines.value = plainLyricText.value && normalized.rlyric
    ? parsePlainRomanizationRows(normalized.rlyric)
    : [];
  tlyricLines.value = normalized.tlyric ? applyOffset(parseLrc(normalized.tlyric), offset) : [];
  romanizationLines.value = normalized.rlyric
    ? parseRomanization(normalized.rlyric, lyricLines.value, offset)
    : [];
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

async function fetchSubsonicLyric(track: Track): Promise<RawLyric | null> {
  const cached = subsonicCache.get(track.id);
  if (cached !== undefined) return cached;
  const sessionRevision = subsonicSessionRevision;
  let result: RawLyric | null = null;
  if (track.sourceId) {
    try {
      const lyrics = await subsonicLyrics(track.sourceId);
      if (lyrics) {
        const raw: RawLyric = {
          lrc: lyrics.lrc,
          yrc: lyrics.yrc,
          tlyric: lyrics.tlyric,
          rlyric: lyrics.rlyric,
          plainLyrics: lyrics.plainLyrics,
        };
        if (lyricsTextFromRaw(raw)) result = normalizeRawLyric(raw);
      }
    } catch {
      // 旧 Subsonic 服务器可能没有 OpenSubsonic songLyrics；后续回退现有匹配链。
      result = null;
    }
  }
  if (sessionRevision === subsonicSessionRevision) subsonicCache.set(track.id, result);
  return result;
}

async function fetchJellyfinLyric(track: Track): Promise<RawLyric | null> {
  const cached = jellyfinCache.get(track.id);
  if (cached !== undefined) return cached;
  const sessionRevision = jellyfinSessionRevision;
  let result: RawLyric | null = null;
  if (track.sourceId) {
    try {
      const lyrics: JellyfinLyrics | null = await jellyfinLyrics(track.sourceId);
      if (lyrics) {
        const raw: RawLyric = {
          lrc: lyrics.lrc,
          yrc: lyrics.yrc,
          plainLyrics: lyrics.plainLyrics,
        };
        if (lyricsTextFromRaw(raw)) result = normalizeRawLyric(raw);
      }
    } catch {
      // 旧版或无歌词的 Jellyfin 服务继续走当前网易云匹配回退。
      result = null;
    }
  }
  if (sessionRevision === jellyfinSessionRevision) jellyfinCache.set(track.id, result);
  return result;
}

type RemoteLyricSession =
  | { source: "subsonic"; revision: number }
  | { source: "jellyfin"; revision: number };

function isRemoteLyricSessionCurrent(session?: RemoteLyricSession): boolean {
  if (!session) return true;
  return session.source === "subsonic"
    ? session.revision === subsonicSessionRevision
    : session.revision === jellyfinSessionRevision;
}

/** 非网易云曲目：按 标题+艺人 搜网易云，标题归一化匹配后拉歌词（Folia 式智能歌词匹配的轻量版） */
async function fetchMatchedLyric(track: Track, expectedSession?: RemoteLyricSession): Promise<RawLyric | null> {
  if (!isRemoteLyricSessionCurrent(expectedSession)) return null;
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
  if (isRemoteLyricSessionCurrent(expectedSession)) {
    matchedCache.set(track.id, result);
  }
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

function parseTimedLocalLyric(encoded: string | null | undefined): ReturnType<typeof sniffLyricText> | null {
  if (!encoded) return null;
  const text = decodeLrcBase64(encoded).trim();
  if (!text) return null;
  const parsed = sniffLyricText(text);
  if (parseLrc(parsed.lrc).length === 0 && (!parsed.yrc || parseYrc(parsed.yrc).length === 0)) return null;
  return parsed;
}

function parsePlainEmbeddedLyric(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  const text = decodeLrcBase64(encoded).replace(/\r\n?/g, "\n").trim();
  if (!text) return null;

  // 识别并解析已支持的时间轴格式；解析失败时不要把格式标记当歌词显示。
  const parsed = sniffLyricText(text);
  if (parsed.lrc !== text || parsed.yrc || parseLrc(text).length > 0 || parseYrc(text).length > 0) {
    return null;
  }
  return text;
}

/** 解码本地歌词与可选翻译；有效 sidecar 优先，其次内嵌时间轴和纯文本歌词。 */
export function parseLocalLyricPayload(payload: LocalLyricPayload): RawLyric | null {
  const rlyric = parseLocalRomanization(payload.rlyric);
  const romanization = rlyric ? { rlyric } : {};
  const parsedSidecar = parseTimedLocalLyric(payload.lrc);
  if (parsedSidecar) {
    const translationText = payload.tlyric ? decodeLrcBase64(payload.tlyric).trim() : "";
    const translation = translationText ? sniffLyricText(translationText) : null;
    const tlyric = translation && parseLrc(translation.lrc).length > 0 ? translation.lrc : null;
    return { ...parsedSidecar, tlyric, ...romanization };
  }

  const parsedEmbedded = parseTimedLocalLyric(payload.embeddedLrc);
  if (parsedEmbedded) return { ...parsedEmbedded, tlyric: null, ...romanization };

  const plainLyrics = parsePlainEmbeddedLyric(payload.embeddedLrc);
  return plainLyrics ? { lrc: "", tlyric: null, ...romanization, plainLyrics } : null;
}

/** 本地曲目：同目录歌词 sidecar 优先（离线可用、准确对应版本），没有再回退网易云匹配 */
async function fetchLocalTrackLyric(track: Track): Promise<RawLyric | null> {
  const cached = localLrcCache.get(track.id);
  if (cached !== undefined) return cached;
  let result: RawLyric | null = null;
  try {
    const payload = await localLyric(track.id);
    if (payload) result = parseLocalLyricPayload(payload);
  } catch {
    result = null;
  }
  localLrcCache.set(track.id, result);
  if (result) return result;
  try {
    result = rawLyricsFromSavedTrack(await getSavedTrackLyrics(track.id));
  } catch {
    result = null;
  }
  if (!result) {
    try {
      result = rawLyricsFromSavedTrack(await getAutoBackfilledTrackLyrics(track.id));
    } catch {
      result = null;
    }
  }
  if (result) {
    localLrcCache.set(track.id, result);
    return result;
  }
  return fetchMatchedLyric(track);
}

export async function loadLyricFor(track: Track | null): Promise<void> {
  const revision = ++lyricLoadRevision;
  lyricLoadRequest = { revision, trackId: track?.id ?? null };
  try {
    if (!track) {
      clearLyrics();
      return;
    }
    if (presentLyric(track.id)) return;

    if (track.source === "netease" && track.sourceId) {
      const cached = neteaseCache.get(track.id);
      const lyric = cached !== undefined ? cached : await fetchNeteaseLyric(track.sourceId);
      neteaseCache.set(track.id, lyric);
      if (revision !== lyricLoadRevision) return;
      if (lyric) presentParsed(track.id, lyric);
      else clearLyrics();
      return;
    }

    if (track.source === "subsonic") {
      const sessionRevision = subsonicSessionRevision;
      let lyric = await fetchSubsonicLyric(track);
      if (revision !== lyricLoadRevision) return;
      if (!lyric) lyric = await fetchMatchedLyric(track, { source: "subsonic", revision: sessionRevision });
      if (revision !== lyricLoadRevision) return;
      if (lyric) presentParsed(track.id, lyric);
      else clearLyrics();
      return;
    }

    if (track.source === "jellyfin") {
      const sessionRevision = jellyfinSessionRevision;
      let lyric = await fetchJellyfinLyric(track);
      if (revision !== lyricLoadRevision) return;
      if (!lyric) lyric = await fetchMatchedLyric(track, { source: "jellyfin", revision: sessionRevision });
      if (revision !== lyricLoadRevision) return;
      if (lyric) presentParsed(track.id, lyric);
      else clearLyrics();
      return;
    }

    if (track.source === "local") {
      const lyric = await fetchLocalTrackLyric(track);
      if (revision !== lyricLoadRevision) return;
      if (lyric) presentParsed(track.id, lyric);
      else clearLyrics();
      return;
    }

    const lyric = await fetchMatchedLyric(track);
    if (revision !== lyricLoadRevision) return;
    if (lyric) presentParsed(track.id, lyric);
    else clearLyrics();
  } finally {
    if (lyricLoadRequest?.revision === revision) lyricLoadRequest = null;
  }
}

/** 手动重新匹配歌词：清掉本地/匹配缓存后按当前曲目重拉（命令面板「歌词 · 重新匹配」） */
export async function rematchLyric(track: Track): Promise<void> {
  localLrcCache.delete(track.id);
  matchedCache.delete(track.id);
  subsonicCache.delete(track.id);
  jellyfinCache.delete(track.id);
  rawByTrack.delete(track.id);
  if (lyricTrackId.value === track.id) {
    lyricLines.value = [];
    yrcLines.value = [];
    plainLyricText.value = "";
    plainRomanizationLines.value = [];
    tlyricLines.value = [];
    lyricTrackId.value = null;
  }
  await loadLyricFor(track);
}

/* ---- 手动候选确认：搜索结果列表挑选（多版本/翻唱歧义时人工定夺） ---- */

export const matchCandidates = signal<NeteaseSong[] | null>(null);
export const matchTargetTrack = signal<Track | null>(null);

/** 拉取候选列表并打开确认弹窗 */
export async function findMatchCandidates(track: Track): Promise<void> {
  matchTargetTrack.value = track;
  matchCandidates.value = null;
  try {
    matchCandidates.value = await neteaseSearch(`${track.title} ${track.artist}`, 8);
  } catch {
    matchCandidates.value = [];
  }
}

export function closeMatchPicker(): void {
  matchCandidates.value = null;
  matchTargetTrack.value = null;
}

/** 选定候选：拉它的歌词并作为该曲目匹配结果缓存 */
export async function applyMatchCandidate(song: NeteaseSong): Promise<void> {
  const revision = ++lyricLoadRevision;
  const track = matchTargetTrack.value;
  if (!track) return;
  const lyric = await fetchNeteaseLyric(String(song.id));
  if (revision !== lyricLoadRevision) return;
  matchedCache.set(track.id, lyric);
  if (track.source === "subsonic") subsonicCache.set(track.id, lyric);
  rawByTrack.delete(track.id);
  if (lyricTrackId.value === track.id) {
    lyricLines.value = [];
    yrcLines.value = [];
    tlyricLines.value = [];
    lyricTrackId.value = null;
  }
  if (lyric) presentParsed(track.id, lyric);
  else clearLyrics();
  closeMatchPicker();
}
