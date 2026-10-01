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

export const STAGE_FONT_SCALE_MIN = 75;
export const STAGE_FONT_SCALE_MAX = 145;
export const STAGE_FONT_SCALE_STEP = 5;
export const STAGE_FONT_SCALE_DEFAULT = 100;

const EFFECT_KEY = "ome.stage.effect";
const FONT_SCALE_KEY = "ome.stage.font-scale";

export const stageOpen = signal(false);
export const stageEffect = signal<StageEffect>(loadEffect());
export const stageFontScale = signal<number>(loadFontScale());

function loadEffect(): StageEffect {
  const saved = localStorage.getItem(EFFECT_KEY);
  return STAGE_EFFECTS.some((effect) => effect.id === saved)
    ? (saved as StageEffect)
    : "flow";
}

function normalizeFontScale(value: number): number {
  const stepped = Math.round(value / STAGE_FONT_SCALE_STEP) * STAGE_FONT_SCALE_STEP;
  return Math.min(STAGE_FONT_SCALE_MAX, Math.max(STAGE_FONT_SCALE_MIN, stepped));
}

function loadFontScale(): number {
  try {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    if (saved === null) return STAGE_FONT_SCALE_DEFAULT;
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? normalizeFontScale(parsed) : STAGE_FONT_SCALE_DEFAULT;
  } catch {
    return STAGE_FONT_SCALE_DEFAULT;
  }
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
    localStorage.setItem(EFFECT_KEY, effect);
  } catch {
    /* 存储不可用忽略 */
  }
}

/** Scale all lyric text in the immersive stage while preserving responsive sizing. */
export function setStageFontScale(scale: number): void {
  if (!Number.isFinite(scale)) return;
  const next = normalizeFontScale(scale);
  stageFontScale.value = next;
  try {
    localStorage.setItem(FONT_SCALE_KEY, String(next));
  } catch {
    /* 存储不可用时仍允许本次会话预览 */
  }
}
