import { signal } from "@preact/signals";
import { neteaseLyric } from "../lib/api";
import type { Track } from "../types/music";

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

export async function loadLyricFor(track: Track | null): Promise<void> {
  if (!track || track.source !== "netease" || !track.sourceId) {
    lyricLines.value = [];
    yrcLines.value = [];
    lyricTrackId.value = null;
    return;
  }
  if (lyricTrackId.value === track.id && (lyricLines.value.length > 0 || yrcLines.value.length > 0)) return;
  try {
    const { lrc, yrc } = await neteaseLyric(Number(track.sourceId));
    yrcLines.value = yrc ? parseYrc(yrc) : [];
    lyricLines.value = parseLrc(lrc);
    lyricTrackId.value = track.id;
  } catch {
    lyricLines.value = [];
    yrcLines.value = [];
    lyricTrackId.value = null;
  }
}
