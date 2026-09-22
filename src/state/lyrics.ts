import { signal } from "@preact/signals";
import { neteaseLyric } from "../lib/api";
import type { Track } from "../types/music";

export interface LyricLine {
  time: number;
  text: string;
}

export const lyricLines = signal<LyricLine[]>([]);
export const lyricTrackId = signal<string | null>(null);

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
    lyricTrackId.value = null;
    return;
  }
  if (lyricTrackId.value === track.id && lyricLines.value.length > 0) return;
  try {
    const { lrc } = await neteaseLyric(Number(track.sourceId));
    lyricLines.value = parseLrc(lrc);
    lyricTrackId.value = track.id;
  } catch {
    lyricLines.value = [];
    lyricTrackId.value = null;
  }
}
