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
