/* ============ 全局键盘快捷键（ECHO/播放器惯例） ============
 * Space 播放暂停 · ←→ 快退/快进 5s · ↑↓ 音量 ±5% · M 静音
 * N/P 下一首/上一首 · L 歌词舞台 · V 视觉器 · Q 播放队列
 * 输入框/组合键/命令面板/中文输入法组字时不劫持。
 */

import { paletteOpen } from "./commands";
import {
  next,
  position,
  previous,
  queueOpen,
  seek,
  setVolume,
  togglePlayback,
  volume,
} from "./player";
import { stageOpen } from "./stage";
import { vizOpen } from "./visualizer";

export type HotkeyAction =
  | "toggle"
  | "seek-back"
  | "seek-forward"
  | "volume-up"
  | "volume-down"
  | "mute"
  | "next"
  | "previous"
  | "stage"
  | "visualizer"
  | "queue";

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;

/** 纯逻辑：这次按键是否映射到快捷键（可单测） */
export function matchHotkey(
  key: string,
  opts: { editable: boolean; activatable: boolean; composing: boolean; paletteOpen: boolean },
): HotkeyAction | null {
  if (opts.composing || opts.paletteOpen) return null;
  if (opts.editable) return null; // 输入框里不打架
  // 焦点在按钮/链接上时空格应激活它，不劫持播放
  if (opts.activatable && key === " ") return null;
  switch (key) {
    case " ":
      return "toggle";
    case "ArrowLeft":
      return "seek-back";
    case "ArrowRight":
      return "seek-forward";
    case "ArrowUp":
      return "volume-up";
    case "ArrowDown":
      return "volume-down";
    case "m":
    case "M":
      return "mute";
    case "n":
    case "N":
      return "next";
    case "p":
    case "P":
      return "previous";
    case "l":
    case "L":
      return "stage";
    case "v":
    case "V":
      return "visualizer";
    case "q":
    case "Q":
      return "queue";
    default:
      return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
}

function runAction(action: HotkeyAction, event: KeyboardEvent): void {
  switch (action) {
    case "toggle":
      togglePlayback();
      break;
    case "seek-back":
      seek(Math.max(0, position.value - SEEK_STEP));
      break;
    case "seek-forward":
      seek(position.value + SEEK_STEP);
      break;
    case "volume-up":
      setVolume(volume.value + VOLUME_STEP);
      break;
    case "volume-down":
      setVolume(volume.value - VOLUME_STEP);
      break;
    case "mute":
      setVolume(volume.value === 0 ? 0.9 : 0);
      break;
    case "next":
      next(true);
      break;
    case "previous":
      previous();
      break;
    case "stage":
      stageOpen.value = !stageOpen.value;
      break;
    case "visualizer":
      vizOpen.value = !vizOpen.value;
      break;
    case "queue":
      queueOpen.value = !queueOpen.value;
      break;
  }
  event.preventDefault();
}

/** 应用挂载时接线；返回清理函数 */
export function initHotkeys(): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = matchHotkey(event.key, {
      editable: isEditable(event.target),
      activatable: isActivatable(event.target),
      composing: event.isComposing,
      paletteOpen: paletteOpen.value,
    });
    if (action) runAction(action, event);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
