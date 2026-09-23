import { signal } from "@preact/signals";

/**
 * 全屏视觉器：极光 / 圆环 / 脉冲 三种手写 Canvas 模式。
 * 模式选择按设备记忆；开关不持久化。
 */
export type VizMode = "aurora" | "ring" | "pulse";

export const VIZ_MODES: ReadonlyArray<{ id: VizMode; label: string }> = [
  { id: "aurora", label: "极光" },
  { id: "ring", label: "圆环" },
  { id: "pulse", label: "脉冲" },
];

const KEY = "ome.viz.mode";

export const vizOpen = signal(false);
export const vizMode = signal<VizMode>(loadMode());

function loadMode(): VizMode {
  const saved = localStorage.getItem(KEY);
  return VIZ_MODES.some((mode) => mode.id === saved) ? (saved as VizMode) : "aurora";
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
