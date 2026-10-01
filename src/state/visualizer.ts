import { signal } from "@preact/signals";

/**
 * 全屏视觉器：极光 / 圆环 / 脉冲 三种手写 Canvas 模式。
 * 模式选择按设备记忆；开关不持久化。
 */
export type VizMode = "aurora" | "ring" | "pulse" | "prism" | "spectrum";
export type VizPalette = "vivid" | "theme" | "ember" | "ocean" | "orchid";

export const VIZ_MODES: ReadonlyArray<{ id: VizMode; label: string }> = [
  { id: "aurora", label: "极光" },
  { id: "ring", label: "圆环" },
  { id: "pulse", label: "脉冲" },
  { id: "prism", label: "棱镜" },
  { id: "spectrum", label: "频谱" },
];

export const VIZ_PALETTES: ReadonlyArray<{ id: VizPalette; label: string; swatch: string }> = [
  { id: "vivid", label: "多彩", swatch: "linear-gradient(115deg, #ff60a4, #4cd6e8, #ab7eff)" },
  { id: "theme", label: "主题色", swatch: "linear-gradient(115deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #f7dfad))" },
  { id: "ember", label: "熔岩", swatch: "linear-gradient(115deg, #ff594f, #ff9c52, #ffd166)" },
  { id: "ocean", label: "海潮", swatch: "linear-gradient(115deg, #38d7ce, #398bff, #7669ff)" },
  { id: "orchid", label: "幻紫", swatch: "linear-gradient(115deg, #ff65b9, #bd72ff, #788bff)" },
];

const KEY = "ome.viz.mode";
const PALETTE_KEY = "ome.viz.palette";

export const vizOpen = signal(false);
export const vizMode = signal<VizMode>(loadMode());
export const vizPalette = signal<VizPalette>(loadPalette());

function loadMode(): VizMode {
  const saved = localStorage.getItem(KEY);
  return VIZ_MODES.some((mode) => mode.id === saved) ? (saved as VizMode) : "prism";
}

function loadPalette(): VizPalette {
  try {
    const saved = localStorage.getItem(PALETTE_KEY);
    return VIZ_PALETTES.some((palette) => palette.id === saved) ? (saved as VizPalette) : "vivid";
  } catch {
    return "vivid";
  }
}

export function openViz(): void {
  vizOpen.value = true;
}

export function closeViz(): void {
  vizOpen.value = false;
}

export function setVizMode(mode: VizMode): void {
  vizMode.value = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 存储不可用忽略 */
  }
}

export function setVizPalette(palette: VizPalette): void {
  vizPalette.value = palette;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    /* 存储不可用忽略 */
  }
}
