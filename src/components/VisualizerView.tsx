import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { currentTrack, isPlaying, spectrumSnapshot } from "../state/player";
import { coverUrl } from "../lib/api";
import {
  closeViz,
  setVizMode,
  setVizPalette,
  VIZ_MODES,
  VIZ_PALETTES,
  vizMode,
  vizPalette,
  type VizPalette,
} from "../state/visualizer";

/** 从 --accent 解析出 rgb 三元组，供 Canvas 渐变/透明度使用 */
function accentRgb(): [number, number, number] {
  const raw =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
    "#e08763";
  const hex = raw.startsWith("#") ? raw : "#e08763";
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n) || hex.length < 7) return [224, 135, 99];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = ([r, g, b]: [number, number, number], a: number) =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

const PALETTE_HUE_RANGES: Partial<Record<VizPalette, [number, number]>> = {
  ember: [6, 50],
  ocean: [176, 250],
  orchid: [270, 335],
};

function paletteHue(palette: VizPalette, progress: number, time: number): number {
  if (palette === "vivid") return (progress * 360 + time * 5 + 360) % 360;
  const [start, end] = PALETTE_HUE_RANGES[palette] ?? [0, 0];
  return (start + (end - start) * progress + time * 1.6 + 360) % 360;
}

function paletteHsla(
  palette: VizPalette,
  progress: number,
  time: number,
  saturation: number,
  lightness: number,
  alpha: number,
): string {
  return `hsla(${paletteHue(palette, progress, time)}, ${saturation}%, ${lightness}%, ${alpha})`;
}

type Spectrum = Uint8Array | null;

function bandValue(data: Spectrum, from: number, to: number): number {
  if (!data || data.length === 0) return 0;
  let sum = 0;
  let count = 0;
  const start = Math.floor(from * data.length);
  const end = Math.max(start + 1, Math.floor(to * data.length));
  for (let i = start; i < end && i < data.length; i += 1) {
    sum += data[i];
    count += 1;
  }
  return count ? sum / count / 255 : 0;
}

/* ---- 极光：三条分层正弦光带，加色混合 ---- */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  bass: number,
  mid: number,
  treble: number,
  accent: [number, number, number],
  palette: VizPalette
): void {
  ctx.globalCompositeOperation = "lighter";
  const layers = [
    { y: 0.36, amp: 0.1 + bass * 0.2, freq: 1.6, speed: 0.7, alpha: 0.34, mix: 0 },
    { y: 0.52, amp: 0.08 + mid * 0.16, freq: 2.3, speed: -0.5, alpha: 0.26, mix: 0.5 },
    { y: 0.68, amp: 0.06 + treble * 0.12, freq: 3.1, speed: 0.9, alpha: 0.18, mix: 1 },
  ];
  for (const [index, layer] of layers.entries()) {
    const progress = index / Math.max(1, layers.length - 1);
    const gradient = ctx.createLinearGradient(0, h * (layer.y - 0.3), 0, h * (layer.y + 0.3));
    gradient.addColorStop(0, palette === "theme" ? rgba(accent, 0) : paletteHsla(palette, progress, t, 90, 65, 0));
    gradient.addColorStop(0.5, palette === "theme" ? rgba(accent, layer.alpha) : paletteHsla(palette, progress, t, 90, 65, layer.alpha));
    gradient.addColorStop(1, palette === "theme" ? rgba(accent, 0) : paletteHsla(palette, progress, t, 90, 65, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const steps = 64;
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * w;
      const phase = t * layer.speed + i * 0.24 + layer.mix * 2.1;
      const y =
        h * layer.y +
        Math.sin(phase * layer.freq * 0.35) * h * layer.amp +
        Math.sin(phase * 0.8 + 1.7) * h * layer.amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

/* ---- 圆环：环形频谱 + 余烬粒子 ---- */
interface Ember {
  angle: number;
  radius: number;
  life: number;
  speed: number;
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: Spectrum,
  embers: Ember[],
  accent: [number, number, number],
  palette: VizPalette,
  t: number
): void {
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.26;
  const bars = 72;
  ctx.lineCap = "round";
  for (let i = 0; i < bars; i += 1) {
    const value = data ? data[Math.floor((i / bars) * data.length)] / 255 : 0;
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const inner = base;
    const outer = base + value * Math.min(w, h) * 0.16 + 2;
    const color = palette === "theme"
      ? rgba(accent, 0.25 + value * 0.65)
      : paletteHsla(palette, i / bars, t, 90, 64 + value * 5, 0.3 + value * 0.65);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, (Math.PI * base) / bars * 0.42);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  // 余烬：能量高时出生，沿外环慢漂、渐隐
  if (data && bandValue(data, 0, 0.4) > 0.55 && embers.length < 90 && Math.random() < 0.5) {
    embers.push({
      angle: Math.random() * Math.PI * 2,
      radius: base + Math.random() * 30,
      life: 1,
      speed: 0.2 + Math.random() * 0.5,
    });
  }
  ctx.globalCompositeOperation = "lighter";
  for (let i = embers.length - 1; i >= 0; i -= 1) {
    const ember = embers[i];
    ember.life -= 0.012;
    ember.radius += ember.speed;
    ember.angle += 0.002;
    if (ember.life <= 0) {
      embers.splice(i, 1);
      continue;
    }
    const x = cx + Math.cos(ember.angle) * ember.radius;
    const y = cy + Math.sin(ember.angle) * ember.radius;
    ctx.fillStyle = palette === "theme"
      ? rgba(accent, ember.life * 0.7)
      : paletteHsla(palette, ember.angle / (Math.PI * 2), t * 4, 95, 68, ember.life * 0.75);
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + ember.life * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

/* ---- 脉冲：中心呼吸光球 + 放射光环 ---- */
function drawPulse(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  bass: number,
  accent: [number, number, number],
  palette: VizPalette
): void {
  const cx = w / 2;
  const cy = h / 2;
  const breathe = 1 + bass * 0.35 + Math.sin(t * 1.4) * 0.03;
  const radius = Math.min(w, h) * 0.16 * breathe;

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.6);
  if (palette === "theme") {
    glow.addColorStop(0, rgba(accent, 0.4 + bass * 0.3));
    glow.addColorStop(1, rgba(accent, 0));
  } else {
    glow.addColorStop(0, paletteHsla(palette, 0.12, t, 92, 68, 0.66));
    glow.addColorStop(0.48, paletteHsla(palette, 0.58, t, 92, 62, 0.38));
    glow.addColorStop(1, paletteHsla(palette, 0.94, t, 88, 54, 0));
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = palette === "theme" ? rgba(accent, 0.9) : paletteHsla(palette, 0.2, t * 7, 90, 68, 1);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 外扩光环：随低音一圈圈推开
  for (let ring = 0; ring < 3; ring += 1) {
    const phase = (t * 0.5 + ring / 3) % 1;
    ctx.strokeStyle = palette === "theme"
      ? rgba(accent, (1 - phase) * 0.35)
      : paletteHsla(palette, ring / 3, t * 7, 92, 68, (1 - phase) * 0.48);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1 + phase * 2.2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ---- 棱镜：多色环形频谱；停播时保留低幅度慢呼吸 ---- */
function drawPrism(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  data: Spectrum,
  accent: [number, number, number],
  palette: VizPalette
): void {
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const base = size * 0.23;
  const bars = 112;
  const hasData = data !== null && data.length > 0;

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < bars; i += 1) {
    const value = hasData ? data[Math.floor((i / bars) * data.length)] / 255 : 0;
    const idle = hasData ? 0 : 0.045 + Math.sin(t * 0.7 + i * 0.19) * 0.018;
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const inner = base * 0.72;
    const outer = base + (0.02 + value * 0.15 + idle) * size;
    ctx.strokeStyle = palette === "theme"
      ? rgba(accent, 0.58 + value * 0.42)
      : paletteHsla(palette, i / bars, t * 0.4, 92, 62 + value * 4, 0.58 + value * 0.42);
    ctx.lineWidth = Math.max(1.5, size * 0.0035);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  const glowRadius = base * (0.74 + bandValue(data, 0, 0.2) * 0.16);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  glow.addColorStop(0, palette === "theme" ? rgba(accent, 0.22) : paletteHsla(palette, 0.3, t, 86, 64, 0.22));
  glow.addColorStop(1, palette === "theme" ? rgba(accent, 0) : paletteHsla(palette, 0.92, t, 82, 45, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);
  ctx.globalCompositeOperation = "source-over";
}

/* ---- 频谱：横向低中高频柱镜像扩展，停播时缓慢待机 ---- */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  data: Spectrum,
  accent: [number, number, number],
  palette: VizPalette,
): void {
  const bars = Math.min(104, Math.max(32, Math.floor(w / 12)));
  const midY = h * 0.52;
  const maxHeight = h * 0.34;
  const slot = w / bars;
  const barWidth = Math.max(1, slot * 0.72);

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(accent, 0.18);
  ctx.lineWidth = Math.max(1, h * 0.0015);
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  for (let i = 0; i < bars; i += 1) {
    const progress = i / Math.max(1, bars - 1);
    const index = Math.min((data?.length ?? 1) - 1, Math.floor(Math.pow(progress, 1.35) * (data?.length ?? 1)));
    const sampled = data ? Math.pow(data[index] / 255, 1.2) : 0.025 + (Math.sin(t * 1.2 + i * 0.31) + 1) * 0.022;
    const height = Math.max(2, sampled * maxHeight);
    const x = i * slot + (slot - barWidth) / 2;
    const color = palette === "theme"
      ? rgba(accent, 0.36 + sampled * 0.62)
      : paletteHsla(palette, progress, t * 0.28, 92, 62 + sampled * 10, 0.42 + sampled * 0.56);

    ctx.fillStyle = color;
    ctx.fillRect(x, midY - height, barWidth, height - 1);
    ctx.fillRect(x, midY + 1, barWidth, height - 1);
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * 全屏视觉器（Folia 视觉器的轻量手写版，无 PixiJS）。
 * 数据不可用时进入慢速待机脉动，不闪退不刷屏。
 */
export function VisualizerView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const mode = vizMode.value;
  const palette = vizPalette.value;
  const track = currentTrack.value;
  const cover = track && track.source !== "bilibili" && track.coverPath
    ? coverUrl(track.coverPath)
    : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let frame = 0;
    let accent: [number, number, number] = [224, 135, 99];
    const embers: Ember[] = [];
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (frame % 45 === 0) accent = accentRgb();

      const data = isPlaying.value ? spectrumSnapshot() : null;
      const bass = bandValue(data, 0, 0.15);
      const mid = bandValue(data, 0.15, 0.5);
      const treble = bandValue(data, 0.5, 1);

      if (vizMode.value === "aurora") {
        drawAurora(ctx, w, h, data ? t : t * 0.25, bass, mid, treble, accent, palette);
      } else if (vizMode.value === "ring") {
        drawRing(ctx, w, h, data, embers, accent, palette, data ? t : t * 0.2);
        if (!data) {
          // 待机：缓慢自旋的暗环
          ctx.strokeStyle = palette === "theme"
            ? rgba(accent, 0.12)
            : paletteHsla(palette, (t * 0.03) % 1, t * 2.8, 90, 68, 0.3);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.26 + Math.sin(t) * 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (vizMode.value === "prism") {
        drawPrism(ctx, w, h, data ? t : t * 0.3, data, accent, palette);
      } else if (vizMode.value === "spectrum") {
        drawSpectrum(ctx, w, h, t, data, accent, palette);
      } else {
        drawPulse(ctx, w, h, data ? t : t * 0.3, data ? bass : 0.08, accent, palette);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode, palette]);

  // Esc 退出 + 鼠标静置隐藏
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViz();
    };
    let timer = 0;
    const wake = () => {
      setUiVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setUiVisible(false), 2800);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", wake);
    wake();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", wake);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      class={`viz-view ${uiVisible ? "" : "viz-ui-hidden"}`}
      role="dialog"
      aria-label="视觉器"
    >
      {cover && (
        <img
          key={cover}
          class="viz-cover-backdrop"
          src={cover}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      <canvas ref={canvasRef} class="viz-canvas" aria-hidden="true" />
      <header class={`stage-top ${uiVisible ? "" : "is-hidden"}`}>
        <button class="stage-close" aria-label="退出视觉器 (Esc)" onClick={closeViz}>
          <Icon name="close" size={20} />
        </button>
        <div class="viz-controls">
          <div class="stage-switch" role="radiogroup" aria-label="视觉器模式">
            {VIZ_MODES.map((item) => (
              <button
                key={item.id}
                role="radio"
                aria-checked={mode === item.id}
                class={`chip-toggle ${mode === item.id ? "is-active" : ""}`}
                onClick={() => setVizMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div class="viz-palette-switch" role="radiogroup" aria-label="视觉器色彩">
            {VIZ_PALETTES.map((item) => (
              <button
                key={item.id}
                role="radio"
                aria-checked={palette === item.id}
                class={`chip-toggle ${palette === item.id ? "is-active" : ""}`}
                onClick={() => setVizPalette(item.id)}
              >
                <span class="viz-palette-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>
    </div>
  );
}
