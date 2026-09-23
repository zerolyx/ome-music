/* ============ 睡眠定时（Folia 定时关闭） ============
 * 两种模式：N 分钟后暂停（可跨曲）、播完当前这首停止。
 * 纯逻辑（格式化/状态机）与调度分离，便于单测。
 */

import { signal } from "@preact/signals";

export type SleepMode = "timer" | "track";

export const sleepMode = signal<SleepMode | null>(null);
/** timer 模式：到点的 epoch 毫秒 */
export const sleepEndAt = signal<number | null>(null);
/** 秒级心跳：驱动倒计时显示（仅定时器激活期间跳动） */
export const sleepTick = signal(0);

let timerHandle: ReturnType<typeof setTimeout> | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;

/** 纯逻辑：剩余毫秒 → "m:ss"（到点显示 0:00） */
export function formatSleepRemaining(endAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((endAt - now) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clearHandles(): void {
  if (timerHandle !== null) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

/** 动态引入 player，避免模块环（player 的 onEnded 会调用本模块） */
async function pausePlayback(): Promise<void> {
  try {
    const player = await import("./player");
    if (player.isPlaying.value) player.togglePlayback();
  } catch {
    /* 暂停失败不阻塞复位 */
  }
}

/** 到点出口：定时器与外部触发共用——暂停播放并复位状态 */
export function fireSleepEnd(): void {
  clearHandles();
  sleepMode.value = null;
  sleepEndAt.value = null;
  void pausePlayback();
}

export function cancelSleepTimer(): void {
  clearHandles();
  sleepMode.value = null;
  sleepEndAt.value = null;
}

/** N 分钟后暂停；分钟数须为正整数 */
export function setSleepTimer(minutes: number, now: number = Date.now()): void {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  clearHandles();
  const endAt = now + Math.round(minutes * 60_000);
  sleepMode.value = "timer";
  sleepEndAt.value = endAt;
  sleepTick.value = 0;
  tickHandle = setInterval(() => {
    sleepTick.value += 1;
  }, 1000);
  timerHandle = setTimeout(() => fireSleepEnd(), endAt - now);
}

/** 播完当前这首就停（在 player onEnded 最前面消费） */
export function setSleepAtTrackEnd(): void {
  clearHandles();
  sleepMode.value = "track";
  sleepEndAt.value = null;
}

/**
 * player onEnded 钩子：命中「播完当前」返回 true（调用方应停止推进队列，
 * 本函数已复位定时状态）；未命中返回 false，调用方走正常切歌。
 */
export function consumeTrackEndSleep(): boolean {
  if (sleepMode.value !== "track") return false;
  clearHandles();
  sleepMode.value = null;
  sleepEndAt.value = null;
  return true;
}
