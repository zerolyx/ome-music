export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface StageReadableColors {
  foreground: string;
  accent: string;
  shadow: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function channel(value: string): number | null {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  return clamp(value.endsWith("%") ? numeric * 2.55 : numeric, 0, 255);
}

export function parseCssRgb(value: string): Rgb | null {
  const trimmed = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(trimmed);
  if (hex) {
    const expanded = hex[1].length === 3
      ? hex[1].split("").map((part) => `${part}${part}`).join("")
      : hex[1];
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const body = /^rgba?\((.*)\)$/i.exec(trimmed)?.[1];
  if (!body) return null;
  const parts = body.replace("/", " ").split(/[\s,]+/).filter(Boolean).slice(0, 3);
  if (parts.length !== 3) return null;
  const values = parts.map(channel);
  if (values.some((part) => part === null)) return null;
  return { r: values[0]!, g: values[1]!, b: values[2]! };
}

function linearChannel(value: number): number {
  const normalized = clamp(value, 0, 255) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b);
}

export function contrastRatio(left: number, right: number): number {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Samples the cover as it appears below the stage's brightness filter and veil. */
export function compositeStageLuminances(
  pixels: ArrayLike<number>,
  background: Rgb,
  brightness = 0.42,
  veilOpacity = 0.66,
): number[] {
  const result: number[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = clamp(pixels[i + 3] / 255, 0, 1);
    const cover = [pixels[i], pixels[i + 1], pixels[i + 2]].map((value, channelIndex) => {
      const base = channelIndex === 0 ? background.r : channelIndex === 1 ? background.g : background.b;
      const filteredCover = value * brightness;
      const opaque = filteredCover * alpha + base * (1 - alpha);
      return base * veilOpacity + opaque * (1 - veilOpacity);
    }) as [number, number, number];
    result.push(relativeLuminance({ r: cover[0], g: cover[1], b: cover[2] }));
  }
  return result;
}

function rangeSamples(values: readonly number[]): number[] {
  const sorted = values.filter(Number.isFinite).map((value) => clamp(value, 0, 1)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const at = (percentile: number) => sorted[Math.round((sorted.length - 1) * percentile)];
  return [at(0.1), at(0.5), at(0.9)];
}

function worstContrast(color: Rgb, backgrounds: readonly number[]): number {
  const luminance = relativeLuminance(color);
  return Math.min(...backgrounds.map((background) => contrastRatio(luminance, background)));
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function cssRgb(rgb: Rgb): string {
  return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)})`;
}

function chooseAccent(accent: Rgb, backgrounds: readonly number[]): Rgb {
  if (worstContrast(accent, backgrounds) >= 3) return accent;

  const candidates: Array<{ color: Rgb; amount: number; contrast: number }> = [];
  for (const endpoint of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]) {
    for (let step = 1; step <= 25; step += 1) {
      const amount = step / 25;
      const color = mix(accent, endpoint, amount);
      const contrast = worstContrast(color, backgrounds);
      candidates.push({ color, amount, contrast });
      if (contrast >= 3) break;
    }
  }
  candidates.sort((left, right) =>
    (left.contrast >= 3 ? 0 : 1) - (right.contrast >= 3 ? 0 : 1) ||
    (left.contrast >= 3 ? left.amount - right.amount : right.contrast - left.contrast) ||
    left.amount - right.amount,
  );
  return candidates[0]?.color ?? accent;
}

/** Return an override only when the theme colors miss readable contrast over the sampled stage. */
export function chooseStageReadableColors(
  backgrounds: readonly number[],
  preferredForeground: Rgb,
  preferredAccent: Rgb,
): StageReadableColors | null {
  const samples = rangeSamples(backgrounds);
  if (!samples.length) return null;

  const primaryPasses = worstContrast(preferredForeground, samples) >= 4.5;
  const accentColor = chooseAccent(preferredAccent, samples);
  const accentPasses = accentColor === preferredAccent;
  if (primaryPasses && accentPasses) return null;

  const dark = { r: 18, g: 16, b: 24 };
  const light = { r: 255, g: 255, b: 255 };
  const foreground = primaryPasses
    ? preferredForeground
    : worstContrast(dark, samples) >= worstContrast(light, samples) ? dark : light;
  const shadow = "0 1px 3px rgb(0 0 0 / 48%), 0 0 14px rgb(0 0 0 / 24%)";

  return {
    foreground: cssRgb(foreground),
    accent: cssRgb(accentColor),
    shadow,
  };
}
