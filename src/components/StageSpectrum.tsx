import { useEffect, useRef } from "preact/hooks";
import { isPlaying, spectrumSnapshot } from "../state/player";

const BARS = 52;
/** 连续全零帧数超过该值视为 CORS 污染（分析器拿不到数据），静默隐藏 */
const DEAD_FRAMES = 75;

/**
 * 舞台频谱：底部镜像柱状可视化，颜色跟随当前强调色（唱片取色）。
 * 数据不可用时（跨域音频被 Chromium 静默置零）自动隐没，绝不打扰舞台。
 */
export function StageSpectrum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let deadFrames = 0;
    let gone = false;
    let accent = "";
    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      frame += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (gone) return;
      const data = isPlaying.value ? spectrumSnapshot() : null;
      if (!data) {
        deadFrames = 0;
        canvas.style.opacity = "0";
        return;
      }
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      if (sum === 0) {
        deadFrames += 1;
        if (deadFrames > DEAD_FRAMES) {
          gone = true;
          canvas.style.opacity = "0";
          return;
        }
      } else {
        deadFrames = 0;
      }
      if (frame % 45 === 0) {
        accent =
          getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
          "#e08763";
      }
      if (!accent) accent = "#e08763";
      canvas.style.opacity = "";

      const step = Math.max(1, Math.floor(data.length / BARS));
      const barW = w / BARS;
      const mid = h * 0.42;
      const radius = Math.min(barW * 0.32, h * 0.1);
      ctx.fillStyle = accent;
      for (let i = 0; i < BARS; i += 1) {
        const value = data[i * step] / 255;
        const barH = Math.max(h * 0.045, value * mid * 1.9);
        const x = i * barW + barW * 0.26;
        const width = barW * 0.48;
        // 上半柱
        roundRect(ctx, x, mid - barH, width, barH, radius);
        // 镜像倒影（压暗）
        ctx.globalAlpha = 0.28;
        roundRect(ctx, x, mid + h * 0.08, width, barH * 0.55, radius);
        ctx.globalAlpha = 1;
      }
      // 中轴微光
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, mid - 1, w, 2);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} class="stage-spectrum" aria-hidden="true" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
}
