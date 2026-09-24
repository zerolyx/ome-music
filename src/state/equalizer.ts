import { signal } from "@preact/signals";

/**
 * 均衡器（ECHO DSP Center 的轻量版）：10 段参数 EQ，Peaking 滤波器串在
 * 播放链 source → …filters… → analyser 之间。关闭 = 所有增益归零（链路透明，无爆音）。
 */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MIN = -12;
export const EQ_MAX = 12;

export type EqPresetId = "flat" | "pop" | "rock" | "classical" | "vocal" | "bass";

export const EQ_PRESETS: ReadonlyArray<{ id: EqPresetId; label: string; gains: number[] }> = [
  { id: "flat", label: "默认", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "pop", label: "流行", gains: [-1, 2, 4, 4, 2, 0, -1, -1, 2, 3] },
  { id: "rock", label: "摇滚", gains: [3, 2, 1, 0, -1, 1, 2, 3, 3, 3] },
  { id: "classical", label: "古典", gains: [3, 2, 0, 0, 0, 0, -2, -2, 0, 3] },
  { id: "vocal", label: "人声", gains: [-3, -2, 0, 2, 4, 4, 2, 0, -1, -2] },
  { id: "bass", label: "低音", gains: [6, 5, 3, 1, 0, 0, 0, 0, 0, 0] },
];

const GAINS_KEY = "ome.eq.gains";
const ENABLED_KEY = "ome.eq.enabled";
const PRESET_KEY = "ome.eq.preset";

export const eqEnabled = signal<boolean>(loadEnabled());
export const eqGains = signal<number[]>(loadGains());
/** 当前预设 id；手动改动后变为 "custom" */
export const eqPreset = signal<string>(loadPreset());

let filters: BiquadFilterNode[] = [];

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function loadGains(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GAINS_KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      return EQ_BANDS.map((_, i) => clampGain(Number(parsed[i]) || 0));
    }
  } catch {
    /* 坏数据按默认 */
  }
  return EQ_BANDS.map(() => 0);
}

function loadPreset(): string {
  try {
    return localStorage.getItem(PRESET_KEY) ?? "flat";
  } catch {
    return "flat";
  }
}

export function clampGain(db: number): number {
  return Math.min(EQ_MAX, Math.max(EQ_MIN, Math.round(db * 10) / 10));
}

/** player.ts 建链时注册滤波器；此后增益变化实时生效 */
export function registerEqFilters(nodes: BiquadFilterNode[]): void {
  filters = nodes;
  applyGains();
}

function applyGains(): void {
  const gains = eqGains.value;
  for (let i = 0; i < filters.length; i += 1) {
    filters[i].gain.value = eqEnabled.value ? clampGain(gains[i] ?? 0) : 0;
  }
}

function persist(): void {
  try {
    localStorage.setItem(GAINS_KEY, JSON.stringify(eqGains.value));
    localStorage.setItem(ENABLED_KEY, eqEnabled.value ? "1" : "0");
    localStorage.setItem(PRESET_KEY, eqPreset.value);
  } catch {
    /* 存储不可用忽略 */
  }
}

export function setEqEnabled(enabled: boolean): void {
  eqEnabled.value = enabled;
  applyGains();
  persist();
}

export function setEqBand(index: number, db: number): void {
  if (index < 0 || index >= EQ_BANDS.length) return;
  const gains = [...eqGains.value];
  gains[index] = clampGain(db);
  eqGains.value = gains;
  eqPreset.value = "custom";
  applyGains();
  persist();
}

export function applyEqPreset(id: EqPresetId): void {
  const preset = EQ_PRESETS.find((item) => item.id === id);
  if (!preset) return;
  eqGains.value = preset.gains.map(clampGain);
  eqPreset.value = id;
  applyGains();
  persist();
}

/** 建链：10 个 Peaking 滤波器串联（gains 由注册后的状态接管） */
export function createEqChain(ctx: AudioContext): BiquadFilterNode[] {
  const nodes = EQ_BANDS.map((frequency) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = 0.9;
    filter.gain.value = 0;
    return filter;
  });
  for (let i = 0; i < nodes.length - 1; i += 1) {
    nodes[i].connect(nodes[i + 1]);
  }
  return nodes;
}

/** 频段标签（UI 展示：1k → 1K 等） */
export function bandLabel(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}K` : String(frequency);
}

/* ---- 频响曲线（ECHO EqCurveView 思路）：RBJ peaking 幅频响应求和 ---- */

const EQ_FS = 48000; // 曲线只是可视化近似；实际滤波在 WebAudio 里按真实采样率工作
export const EQ_Q = 0.9; // 与 createEqChain 的滤波器一致
/** 曲线绘制范围（Hz，对数轴） */
export const EQ_FREQ_MIN = 20;
export const EQ_FREQ_MAX = 20000;
/** 曲线纵轴范围（dB），略大于 ±12 的调节范围 */
export const EQ_DB_RANGE = 15;

/** 单个 peaking 滤波器在 freq 处的增益（dB，RBJ 系数取模） */
export function peakingResponseDb(freq: number, f0: number, gainDb: number, q: number): number {
  if (gainDb === 0) return 0;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / EQ_FS;
  const alpha = Math.sin(w0) / (2 * q);
  const cw0 = Math.cos(w0);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cw0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cw0;
  const a2 = 1 - alpha / A;
  const w = (2 * Math.PI * freq) / EQ_FS;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cw2 = Math.cos(2 * w);
  const sw2 = Math.sin(2 * w);
  const numRe = b0 + b1 * cw + b2 * cw2;
  const numIm = -(b1 * sw + b2 * sw2);
  const denRe = a0 + a1 * cw + a2 * cw2;
  const denIm = -(a1 * sw + a2 * sw2);
  const mag2 = (numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm);
  return 20 * Math.log10(Math.sqrt(mag2));
}

/** 全链总响应：各频段 dB 线性叠加（dB 域串联即相加） */
export function eqResponseDb(freq: number, gains: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < EQ_BANDS.length; i += 1) {
    total += peakingResponseDb(freq, EQ_BANDS[i], gains[i] ?? 0, EQ_Q);
  }
  return total;
}

/** 采样 N 个对数频点的总响应，供 SVG 画线 */
export function eqCurvePoints(gains: readonly number[], samples = 96): number[] {
  const points: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const freq =
      EQ_FREQ_MIN * Math.pow(EQ_FREQ_MAX / EQ_FREQ_MIN, i / (samples - 1));
    points.push(eqResponseDb(freq, gains));
  }
  return points;
}
