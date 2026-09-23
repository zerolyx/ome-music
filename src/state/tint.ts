import { signal } from "@preact/signals";

/**
 * 唱片取色：从当前封面提取主色，把 --accent / --accent-soft 覆盖到 <html>，
 * 全站强调色（按钮、歌词辉光、导航选中、红心…）随之跟随唱片气质；
 * 同时写入 --ambient-a / --ambient-b 两团氛围光（Folia 式沉浸背景）。
 * 任何一步失败都静默回退到主题默认色，绝不影响使用。
 */
export type AccentMode = "cover" | "fixed";

const KEY = "ome.accent";
export const accentMode = signal<AccentMode>(loadMode());

let lastCover: string | null = null;

function loadMode(): AccentMode {
  try {
    return localStorage.getItem(KEY) === "fixed" ? "fixed" : "cover";
  } catch {
    return "cover";
  }
}

export function setAccentMode(mode: AccentMode): void {
  accentMode.value = mode;
  try {
    if (mode === "fixed") localStorage.setItem(KEY, "fixed");
    else localStorage.removeItem(KEY);
  } catch {
    /* 存储不可用忽略 */
  }
  if (mode === "fixed") resetAccent();
  else if (lastCover) void applyCoverAccent(lastCover);
}

/** 封面 URL 变化时调用；null = 无封面，回到主题默认色 */
export async function applyCoverAccent(url: string | null): Promise<void> {
  lastCover = url;
  if (accentMode.value === "fixed" || !url) {
    resetAccent();
    return;
  }
  try {
    const colors = await extractPalette(url);
    // 等待取色期间封面又换了：丢弃过期结果
    if (!colors || lastCover !== url) return;
    setAccentVars(colors);
  } catch {
    if (lastCover === url) resetAccent();
  }
}

function resetAccent(): void {
  const style = document.documentElement.style;
  style.removeProperty("--accent");
  style.removeProperty("--accent-soft");
  style.removeProperty("--ambient-a");
  style.removeProperty("--ambient-b");
}

/** 提亮/压暗到适合做文字与控件的亮度区间，保证双主题下对比度 */
function setAccentVars({ accent, ambient }: CoverPalette): void {
  const [r, g, b] = accent;
  const [h, s, l] = rgbToHsl(r, g, b);
  const targetL = Math.min(0.58, Math.max(0.42, l));
  const targetS = Math.max(0.3, s);
  const [rr, gg, bb] = hslToRgb(h, targetS, targetL);
  const style = document.documentElement.style;
  style.setProperty("--accent", `rgb(${rr} ${gg} ${bb})`);
  style.setProperty("--accent-soft", `rgba(${rr}, ${gg}, ${bb}, 0.16)`);
  // 氛围光：主色亮团 + 全图均值冷团，饱和度压低避免荧光感
  const [ar, ag, ab] = ambient;
  const [ah, as] = rgbToHsl(ar, ag, ab);
  const [ca, cb2, cc] = hslToRgb(ah, as * 0.7, 0.5);
  style.setProperty("--ambient-a", `rgba(${rr}, ${gg}, ${bb}, 0.5)`);
  style.setProperty("--ambient-b", `rgba(${ca}, ${cb2}, ${cc}, 0.32)`);
}

interface CoverPalette {
  /** 强调色：高饱和像素均值（兜底全图均值） */
  accent: [number, number, number];
  /** 氛围底色：全图平均 */
  ambient: [number, number, number];
}

/** 缩样 32px：高饱和像素均值作强调色，全图平均作氛围底色 */
async function extractPalette(url: string): Promise<CoverPalette | null> {
  const image = await loadImage(url);
  if (!image) return null;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sn = 0;
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let an = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    ar += r;
    ag += g;
    ab += b;
    an += 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > 32 && max > 48 && max < 248) {
      sr += r;
      sg += g;
      sb += b;
      sn += 1;
    }
  }
  if (an < 1) return null;
  const ambient = [ar / an, ag / an, ab / an].map(Math.round) as [number, number, number];
  const accent = sn >= 8
    ? ([sr / sn, sg / sn, sb / sn].map(Math.round) as [number, number, number])
    : ambient;
  return { accent, ambient };
}

/** 加载图片：优先 <img crossOrigin>（data: 与带 CORS 的代理封面都干净），失败返回 null */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
    // 极端环境下的兜底：onload 永不触发时 10 秒后放弃
    window.setTimeout(() => resolve(null), 10_000);
  });
}

/* ---- 颜色换算（0-255 rgb ↔ 0-1 hsl） ---- */

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}
