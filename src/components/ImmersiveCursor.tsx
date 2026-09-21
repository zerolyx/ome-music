import { useEffect, useRef } from "preact/hooks";

// 与 moonshot.cn 同构的「环 + 点」双光标：
// 环慢速 lerp（重量感）、点快速跟随（精度）；rAF 收敛后自停省电；
// 交互目标 hover 时环放大 + 填充；触屏 / 减少动效环境整体禁用。
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

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;

    let targetX = 0;
    let targetY = 0;
    let ringX = 0;
    let ringY = 0;
    let dotX = 0;
    let dotY = 0;
    let raf = 0;
    let seen = false;

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
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (event: MouseEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!seen) {
        seen = true;
        ringX = dotX = targetX;
        ringY = dotY = targetY;
        ring.style.opacity = "1";
        dot.style.opacity = "1";
      }
      wake();
    };

    const onLeave = () => {
      seen = false;
      ring.style.opacity = "0";
      dot.style.opacity = "0";
    };

    const onOver = (event: MouseEvent) => {
      const element = event.target as Element | null;
      if (element?.closest?.(HOVER_SELECTOR)) ring.classList.add("is-hover");
    };

    const onOut = (event: MouseEvent) => {
      const element = event.target as Element | null;
      const hit = element?.closest?.(HOVER_SELECTOR);
      const related = event.relatedTarget;
      if (hit && !(related instanceof Element && hit.contains(related))) {
        ring.classList.remove("is-hover");
      }
    };

    // 隐藏原生光标（点/环即指针本体）
    const style = document.createElement("style");
    style.textContent = "* { cursor: none !important; }";
    document.head.appendChild(style);

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      style.remove();
    };
  }, []);

  return (
    <>
      <div ref={ringRef} class="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} class="cursor-dot" aria-hidden="true" />
    </>
  );
}
