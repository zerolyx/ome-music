import { signal } from "@preact/signals";

/**
 * 自动淡变（Folia Automix 的轻量版）：切歌时旧曲 1.2s 淡出、新曲 1.2s 淡入。
 * 用户音量与淡变系数分层相乘，互不干扰；随时打断（手动暂停/再切歌）安全。
 */
const KEY = "ome.fade";
const STEP_MS = 100;
export const FADE_STEPS = 12; // 12 × 100ms = 1.2s

export const fadeEnabled = signal<boolean>(load());

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setFadeEnabled(enabled: boolean): void {
  fadeEnabled.value = enabled;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* 存储不可用忽略 */
  }
}

let factor = 1;
let timer = 0;
let token = 0;

/** 当前淡变系数（0-1），player.ts 用它折算元素实际音量 */
export function fadeFactor(): number {
  return factor;
}

function runRamp(
  myToken: number,
  from: number,
  to: number,
  onStep: (value: number) => void,
  onDone: () => void
): void {
  let step = 0;
  timer = window.setInterval(() => {
    if (myToken !== token) return; // 被新一次淡变/复位接管
    step += 1;
    factor = Math.min(1, Math.max(0, from + ((to - from) * step) / FADE_STEPS));
    onStep(factor);
    if (step >= FADE_STEPS) {
      window.clearInterval(timer);
      if (myToken === token) onDone();
    }
  }, STEP_MS);
}

/**
 * 执行一次「淡出 → 换源 → 淡入」。
 * swap 负责切换 src 并起播（新曲从静音淡入）。
 * 淡变关闭 / 当前无播放 / 元素未出声时直接 swap。
 */
export function fadeSwap(shouldFade: boolean, swap: () => void, onVolume: () => void): void {
  window.clearInterval(timer);
  const myToken = ++token;
  if (!shouldFade) {
    factor = 1;
    onVolume();
    swap();
    return;
  }
  runRamp(
    myToken,
    1,
    0,
    onVolume,
    () => {
      swap(); // 完全静音时换源起播，再淡入
      runRamp(myToken, 0, 1, onVolume, () => undefined);
    }
  );
}

/** 打断并立即复位（清理、测试用） */
export function resetFade(): void {
  token += 1;
  window.clearInterval(timer);
  factor = 1;
}
