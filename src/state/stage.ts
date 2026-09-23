import { signal } from "@preact/signals";

/**
 * 全屏歌词舞台（Folia 式文字 PV）：浮流 / 群唱 / 心象 三种动效。
 * 动效选择按设备记忆；开关不持久化（关闭即回主界面）。
 */
export type StageEffect = "flow" | "chorus" | "muse";

export const STAGE_EFFECTS: ReadonlyArray<{ id: StageEffect; label: string }> = [
  { id: "flow", label: "浮流" },
  { id: "chorus", label: "群唱" },
  { id: "muse", label: "心象" },
];

const KEY = "ome.stage.effect";

export const stageOpen = signal(false);
export const stageEffect = signal<StageEffect>(loadEffect());

function loadEffect(): StageEffect {
  const saved = localStorage.getItem(KEY);
  return STAGE_EFFECTS.some((effect) => effect.id === saved)
    ? (saved as StageEffect)
    : "flow";
}

export function openStage(): void {
  stageOpen.value = true;
}

export function closeStage(): void {
  stageOpen.value = false;
}

export function setStageEffect(effect: StageEffect): void {
  stageEffect.value = effect;
  try {
    localStorage.setItem(KEY, effect);
  } catch {
    /* 存储不可用忽略 */
  }
}
