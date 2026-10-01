import { useEffect, useRef } from "preact/hooks";

// 「环 + 点」仅作跟随装饰；系统光标始终保留，任何状态下都可继续定位和点击。
const HOVER_SELECTOR = "button, a, input, select, .track-row";
const RING_EASE = 0.16;
const DOT_EASE = 0.55;
const SETTLE_PX = 0.5;

export function ImmersiveCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canUseCursor = () =>
      finePointer.matches &&
      !reducedMotion.matches &&
      document.visibilityState === "visible";

    let targetX = 0;
    let targetY = 0;
    let ringX = 0;
    let ringY = 0;
    let dotX = 0;
    let dotY = 0;
    let raf = 0;
    let active = false;

    const tick = () => {
      ringX += (targetX - ringX) * RING_EASE;
      ringY += (targetY - ringY) * RING_EASE;
      dotX += (targetX - dotX) * DOT_EASE;
      dotY += (targetY - dotY) * DOT_EASE;
      ring.style.translate = `${ringX}px ${ringY}px`;
      dot.style.translate = `${dotX}px ${dotY}px`;
      const settled =
        Math.abs(targetX - ringX) < SETTLE_PX &&
        Math.abs(targetY - ringY) < SETTLE_PX &&
        Math.abs(targetX - dotX) < SETTLE_PX &&
        Math.abs(targetY - dotY) < SETTLE_PX;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf && active) raf = requestAnimationFrame(tick);
    };

    const hideCustomCursor = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      active = false;
      ring.classList.remove("is-visible", "is-hover");
      dot.classList.remove("is-visible");
    };

    const pauseAnimation = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onMove = (event: MouseEvent) => {
      if (!canUseCursor()) {
        hideCustomCursor();
        return;
      }

      targetX = event.clientX;
      targetY = event.clientY;
      if (!active) {
        // 首次定位直接落在真实鼠标位置，避免跟随装饰从屏幕角落滑入。
        active = true;
        ringX = dotX = targetX;
        ringY = dotY = targetY;
        ring.style.translate = `${ringX}px ${ringY}px`;
        dot.style.translate = `${dotX}px ${dotY}px`;
        ring.classList.add("is-visible");
        dot.classList.add("is-visible");
      }
      wake();
    };

    const onOver = (event: MouseEvent) => {
      if (!active) return;
      const element = event.target as Element | null;
      if (element?.closest?.(HOVER_SELECTOR)) ring.classList.add("is-hover");
    };

    const onOut = (event: MouseEvent) => {
      if (!active) return;
      const element = event.target as Element | null;
      const hit = element?.closest?.(HOVER_SELECTOR);
      const related = event.relatedTarget;
      if (hit && !(related instanceof Element && hit.contains(related))) {
        ring.classList.remove("is-hover");
      }
    };

    const onCapabilityChange = () => {
      // 即使系统设置或输入设备变化，也先交还系统光标；移动后再决定是否接管。
      hideCustomCursor();
    };

    const onWindowFocus = () => {
      if (!canUseCursor()) {
        hideCustomCursor();
        return;
      }
      // 重新聚焦时保留当前位置的装饰层；若失焦前动画尚未结束，则继续收敛。
      wake();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        // 页面不可见时暂停动画，但不清除位置；恢复时避免装饰突然消失。
        pauseAnimation();
        return;
      }
      onWindowFocus();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("blur", pauseAnimation);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("mouseleave", hideCustomCursor);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    finePointer.addEventListener("change", onCapabilityChange);
    reducedMotion.addEventListener("change", onCapabilityChange);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", pauseAnimation);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("mouseleave", hideCustomCursor);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      finePointer.removeEventListener("change", onCapabilityChange);
      reducedMotion.removeEventListener("change", onCapabilityChange);
      hideCustomCursor();
    };
  }, []);

  return (
    <>
      <div ref={ringRef} class="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} class="cursor-dot" aria-hidden="true" />
    </>
  );
}
