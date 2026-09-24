/* ============ 本地歌词格式嗅探与解析 ============
 * sidecar 文件可能是 .lrc / .ttml / .qrc / .krc（krc 已在 Rust 侧解密为明文）。
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

/** 内容嗅探：TTML（XML）→ qrc/krc 族（[ms,ms] 行头）→ 其余按 lrc 直通 */
export function sniffLyricText(text: string): ParsedLyric {
  if (/^\s*(<\?xml|<tt[\s>])/i.test(text)) return ttmlToRaw(text);
  if (/^\s*\[\d+,\d+\]/m.test(text)) return qrcToRaw(text);
  return { lrc: text };
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
