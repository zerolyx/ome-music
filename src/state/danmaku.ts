/* ============ 弹幕氛围（Plan 4 Task 2）============
 * B站曲目播放时漂浮的同屏弹幕（默认关闭）。氛围向：
 * 打乱顺序、限上限，不追求与播放进度对齐；拉取失败安静降级，绝不影响播放。
 */

import { signal } from "@preact/signals";
import { bilibiliDanmaku, type DanmakuItemDto } from "../lib/api";
import type { Track } from "../types/music";

const DANMAKU_KEY = "ome.danmaku";
const MAX_ITEMS = 120;

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(DANMAKU_KEY) === "1";
  } catch {
    return false; // 存储不可用（隐私模式等）：默认关闭
  }
}

/** 弹幕氛围总开关；默认关闭 */
export const danmakuEnabled = signal<boolean>(readStoredEnabled());

export function setDanmakuEnabled(value: boolean): void {
  danmakuEnabled.value = value;
  try {
    localStorage.setItem(DANMAKU_KEY, value ? "1" : "0");
  } catch {
    // 存储不可用：仅当前会话生效
  }
}

export const items = signal<DanmakuItemDto[]>([]);

/** 纯逻辑：Fisher–Yates 打乱顺序并截断到上限（弹幕氛围不需要严格时间轴） */
export function shuffleCap(list: DanmakuItemDto[], cap = MAX_ITEMS): DanmakuItemDto[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, cap);
}

/** B站曲目加载弹幕；其他源 / 拉取失败一律清空 */
export async function loadDanmakuFor(track: Track | null): Promise<void> {
  if (!track || track.source !== "bilibili" || !track.sourceId) {
    items.value = [];
    return;
  }
  try {
    items.value = shuffleCap(await bilibiliDanmaku(track.sourceId));
  } catch {
    items.value = [];
  }
}
