import { signal } from "@preact/signals";

/** 沉浸模式：true = chrome（侧栏 + 播放条）可见 */
export const chromeVisible = signal(true);

const IDLE_MS = 2800;
const BOOT_GRACE_MS = 3400; // 启动序列播完后再允许首次隐没

let hideTimer = 0;
let overChrome = false;

export function setChromeHover(hovering: boolean): void {
  overChrome = hovering;
  // 指针进入 chrome 时保持常显，离开后重新计时
  if (hovering) chromeVisible.value = true;
}

export function initChromeAutoHide(): () => void {
  const scheduleHide = (delay: number) => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!overChrome) chromeVisible.value = false;
    }, delay);
  };

  const onMouseMove = () => {
    chromeVisible.value = true;
    scheduleHide(IDLE_MS);
  };

  const bootTimer = window.setTimeout(() => {
    scheduleHide(IDLE_MS);
  }, BOOT_GRACE_MS);

  window.addEventListener("mousemove", onMouseMove);

  return () => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(bootTimer);
    window.removeEventListener("mousemove", onMouseMove);
  };
}
