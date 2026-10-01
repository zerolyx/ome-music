/* ============ 本地歌词格式嗅探与解析 ============
 * sidecar 文件可能是 .lrc / .vtt / .ttml / .qrc / .krc（krc 已在 Rust 侧解密为明文）。
 * 统一策略：嗅探内容 → 解析成字级时间轴 → 合成标准 lrc/yrc 文本，
 * 交给 lyrics.ts 既有解析与渲染链（舞台/桌面歌词零改动复用）。
 */

export interface FmtLine {
  time: number;
  text: string;
}
export interface FmtWord {
  start: number;
  end: number;
  text: string;
}
export interface FmtYrcLine {
  start: number;
  end: number;
  words: FmtWord[];
}
/** 与 lyrics.ts 的 RawLyric 同构（避免类型循环依赖） */
export interface ParsedLyric {
  lrc: string;
  yrc?: string | null;
}

/** 内容嗅探：TTML（XML）→ WebVTT → qrc/krc 族（[ms,ms] 行头）→ 其余按 lrc 直通 */
export function sniffLyricText(text: string): ParsedLyric {
  const withoutBom = text.replace(/^\uFEFF/, "");
  if (/^\s*(<\?xml|<tt[\s>])/i.test(withoutBom)) return ttmlToRaw(withoutBom);
  if (/^\s*WEBVTT(?:[ \t].*)?(?:\r?\n|$)/i.test(withoutBom)) return vttToRaw(withoutBom);
  if (/^\s*\[\d+,\d+\]/m.test(withoutBom)) return qrcToRaw(withoutBom);
  return { lrc: text };
}

/* ---- WebVTT：cue 起始时间 → 标准 lrc 行 ---- */

/** WebVTT 时间戳：MM:SS.mmm 或 HH:MM:SS.mmm */
export function parseVttTimestamp(value: string): number | null {
  const parts = value.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const seconds = /^(\d{2})\.(\d{3})$/.exec(parts[parts.length - 1]);
  if (!seconds) return null;
  const minuteIndex = parts.length - 2;
  const minuteToken = parts[minuteIndex];
  if (parts.length === 2 && !/^\d{2,}$/.test(minuteToken)) return null;
  if (parts.length === 3 && (!/^\d{2,}$/.test(parts[0]) || !/^\d{2}$/.test(minuteToken))) return null;
  const minutes = Number(parts[minuteIndex]);
  const secondValue = Number(seconds[1]);
  if (!Number.isSafeInteger(minutes) || secondValue > 59) return null;
  if (parts.length === 2) return minutes * 60 + secondValue + Number(seconds[2]) / 1000;
  const hours = Number(parts[0]);
  if (!Number.isSafeInteger(hours) || minutes > 59) return null;
  return hours * 3600 + minutes * 60 + secondValue + Number(seconds[2]) / 1000;
}

const VTT_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  lrm: "\u200e",
  rlm: "\u200f",
};

function stripVttMarkup(text: string): string {
  const plain = text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\d{2,}:\d{2}:\d{2}\.\d{3}>/g, "")
    .replace(/<\/?(?:b|i|u|ruby|rt|c|v|lang)(?:\.[^\s>]+)?(?:\s+[^>]*)?>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "");
  return plain.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|lrm|rlm);/gi, (entity, body: string) => {
    if (!body.startsWith("#")) return VTT_NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    const codePoint = body[1]?.toLowerCase() === "x"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return "\ufffd";
    }
    return String.fromCodePoint(codePoint);
  });
}

export function parseVtt(text: string): FmtLine[] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows = source.split("\n");
  const out: FmtLine[] = [];
  let index = 0;

  if (/^WEBVTT(?:[ \t].*)?$/i.test(rows[0]?.trim() ?? "")) {
    index = 1;
    // 文件头元数据直到空行；不把它误认为 cue 内容。
    while (index < rows.length && rows[index].trim()) index++;
  }

  while (index < rows.length) {
    while (index < rows.length && !rows[index].trim()) index++;
    if (index >= rows.length) break;
    if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(rows[index].trim())) {
      while (index < rows.length && rows[index].trim()) index++;
      continue;
    }

    let timing = rows[index].trim();
    if (!timing.includes("-->")) {
      // cue identifier 单独占一行时，时间戳位于下一行。
      index++;
      timing = rows[index]?.trim() ?? "";
    }
    const cue = /^([^\s]+)\s+-->\s+([^\s]+)(?:[ \t]+.*)?$/.exec(timing);
    if (!cue) {
      index++;
      continue;
    }
    const start = parseVttTimestamp(cue[1]);
    const end = parseVttTimestamp(cue[2]);
    index++;
    const cueText: string[] = [];
    while (index < rows.length && rows[index].trim()) cueText.push(rows[index++]);
    const content = stripVttMarkup(cueText.join(" ")).replace(/\s+/g, " ").trim();
    if (start !== null && end !== null && end > start && content) out.push({ time: start, text: content });
  }

  return out.sort((a, b) => a.time - b.time);
}

export function vttToRaw(text: string): ParsedLyric {
  const lines = parseVtt(text);
  return {
    lrc: lines.map((line) => `${toLrcTimestamp(line.time)}${line.text}`).join("\n"),
    yrc: null,
  };
}

/* ---- qrc / krc：[start,dur]行 + <start,dur>字（毫秒） ---- */

const QRC_LINE = /^\[(\d+),(\d+)\](.*)$/;
const QRC_WORD = /<(\d+),(\d+)>([^<]*)/g;

export function parseQrc(text: string): FmtYrcLine[] {
  const out: FmtYrcLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const head = QRC_LINE.exec(raw.trim());
    if (!head) continue;
    const start = Number(head[1]) / 1000;
    const end = start + Number(head[2]) / 1000;
    const words: FmtWord[] = [];
    QRC_WORD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QRC_WORD.exec(head[3]))) {
      const wordStart = Number(match[1]) / 1000;
      const wordText = match[3];
      if (wordText.trim()) {
        words.push({ start: wordStart, end: wordStart + Number(match[2]) / 1000, text: wordText });
      }
    }
    if (words.length === 0) continue; // 元数据/空行
    out.push({ start, end, words });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** qrc → {lrc, yrc}：yrc 文本把 <a,b> 换成 (a,b)，网易云 yrc 解析器可直接复用 */
export function qrcToRaw(text: string): ParsedLyric {
  const lines = parseQrc(text);
  const lrc = lines
    .map((line) => `${toLrcTimestamp(line.start)}${line.words.map((w) => w.text).join("")}`)
    .join("\n");
  const yrc = lines.length > 0 ? text.replace(/<(\d+,\d+)>/g, "($1)") : null;
  return { lrc, yrc };
}

/* ---- TTML（Apple Music 式）：<p begin end> + 词级 <span begin end> ---- */

export function parseTtmlClock(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim().replace(/s$/i, "");
  const clock = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(v);
  if (clock) {
    const frac = clock[4] ? Number(`0.${clock[4]}`) : 0;
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) + frac;
  }
  const short = /^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(v);
  if (short) {
    const frac = short[3] ? Number(`0.${short[3]}`) : 0;
    return Number(short[1]) * 60 + Number(short[2]) + frac;
  }
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

export function parseTtml(text: string): { lines: FmtLine[]; yrc: FmtYrcLine[] } {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const lines: FmtLine[] = [];
  const yrc: FmtYrcLine[] = [];
  for (const p of Array.from(doc.getElementsByTagName("p"))) {
    const start = parseTtmlClock(p.getAttribute("begin"));
    if (start === null) continue;
    const end = parseTtmlClock(p.getAttribute("end")) ?? start + 8;
    const words: FmtWord[] = [];
    for (const span of Array.from(p.getElementsByTagName("span"))) {
      const wStart = parseTtmlClock(span.getAttribute("begin"));
      const wEnd = parseTtmlClock(span.getAttribute("end"));
      const wText = span.textContent ?? "";
      if (wStart === null || wEnd === null || !wText.trim()) continue;
      words.push({ start: wStart, end: wEnd, text: wText });
    }
    const plain = (p.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!plain && words.length === 0) continue;
    // 有词级 span 时以 span 原文拼接为准（span 间缩进换行是 XML 排版不是歌词）
    const text = words.length > 0 ? words.map((w) => w.text).join("") : plain;
    if (words.length > 0) yrc.push({ start, end, words });
    lines.push({ time: start, text });
  }
  return { lines, yrc };
}

export function ttmlToRaw(text: string): ParsedLyric {
  const { lines, yrc } = parseTtml(text);
  const lrc = lines.map((line) => `${toLrcTimestamp(line.time)}${line.text}`).join("\n");
  // 词级时间轴转 yrc 文本格式：[ms,ms](ms,ms)字
  const yrcText =
    yrc.length > 0
      ? yrc
          .map((line) => {
            const head = `[${Math.round(line.start * 1000)},${Math.round((line.end - line.start) * 1000)}]`;
            const body = line.words
              .map(
                (w) =>
                  `(${Math.round(w.start * 1000)},${Math.round((w.end - w.start) * 1000)})${w.text}`,
              )
              .join("");
            return head + body;
          })
          .join("\n")
      : null;
  return { lrc, yrc: yrcText };
}

/* ---- 共用：秒 → [mm:ss.xx] ---- */

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function toLrcTimestamp(sec: number): string {
  const total = Math.round(Math.max(0, sec) * 100); // 厘秒总数，避免 61.999 → [01:61.00] 的进位错
  const minutes = Math.floor(total / 6000);
  const seconds = Math.floor(total / 100) % 60;
  const centis = total % 100;
  return `[${pad(minutes)}:${pad(seconds)}.${pad(centis)}]`;
}
