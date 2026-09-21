export type DanmakuDensity = "low" | "medium" | "high";
export type DanmakuSpeed = "slow" | "normal" | "fast";
export type DanmakuDirection = "rtl" | "ltr" | "mixed";
export type DanmakuDisplayMode = "off" | "video" | "ambient";
export type DanmakuFontSize = "small" | "medium" | "large";
export type DanmakuMotionStyle =
  "classic" | "drift" | "meteor" | "float" | "pulse" | "arc" | "mixed";
export type DanmakuEntranceStyle = "fade" | "slide" | "soft-rise" | "glow-drift";
export type DanmakuEmotionalIntensity = "quiet" | "balanced" | "expressive";

export interface DanmakuSettings {
  enabled: boolean;
  displayMode: DanmakuDisplayMode;
  opacity: number;
  density: DanmakuDensity;
  speed: DanmakuSpeed;
  direction: DanmakuDirection;
  fontSize: DanmakuFontSize;
  motionStyle: DanmakuMotionStyle;
  entranceStyle: DanmakuEntranceStyle;
  emotionalIntensity: DanmakuEmotionalIntensity;
  filterRepeated: boolean;
  hideLongComments: boolean;
  avoidLyricsArea: boolean;
}

const STORAGE_KEY = "ome.danmaku.settings";

export const defaultDanmakuSettings: DanmakuSettings = {
  enabled: true,
  displayMode: "ambient",
  opacity: 0.6,
  density: "low",
  speed: "slow",
  direction: "rtl",
  fontSize: "medium",
  // Arc is the default — it's the softest, most curved motion, reading as
  // "emotion drifting across the room" rather than a flat ticker. Drift /
  // classic stay available for users who want a straighter rail; arc is the
  // calm default that matches the product's immersive tone.
  motionStyle: "arc",
  entranceStyle: "fade",
  emotionalIntensity: "quiet",
  filterRepeated: true,
  hideLongComments: true,
  avoidLyricsArea: true,
};

export function getDanmakuSettings(): DanmakuSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw
      ? normalizeDanmakuSettings({ ...defaultDanmakuSettings, ...JSON.parse(raw) })
      : defaultDanmakuSettings;
  } catch {
    return defaultDanmakuSettings;
  }
}

export function saveDanmakuSettings(settings: DanmakuSettings): DanmakuSettings {
  const normalized = normalizeDanmakuSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("ome:danmaku-settings", { detail: normalized }));
  return normalized;
}

function normalizeDanmakuSettings(settings: DanmakuSettings): DanmakuSettings {
  const displayMode = ["off", "video", "ambient"].includes(settings.displayMode)
    ? settings.displayMode
    : settings.enabled === false
      ? "off"
      : "ambient";
  return {
    enabled: displayMode !== "off",
    displayMode,
    opacity: Math.max(
      0.12,
      Math.min(0.72, Number(settings.opacity) || defaultDanmakuSettings.opacity),
    ),
    density: ["low", "medium", "high"].includes(settings.density) ? settings.density : "low",
    speed: ["slow", "normal", "fast"].includes(settings.speed) ? settings.speed : "slow",
    direction: ["rtl", "ltr", "mixed"].includes(settings.direction) ? settings.direction : "rtl",
    fontSize: ["small", "medium", "large"].includes(settings.fontSize)
      ? settings.fontSize
      : "medium",
    motionStyle: ["classic", "drift", "meteor", "float", "pulse", "arc", "mixed"].includes(
      settings.motionStyle,
    )
      ? settings.motionStyle
      : "drift",
    entranceStyle: ["fade", "slide", "soft-rise", "glow-drift"].includes(settings.entranceStyle)
      ? settings.entranceStyle
      : "fade",
    emotionalIntensity: ["quiet", "balanced", "expressive"].includes(settings.emotionalIntensity)
      ? settings.emotionalIntensity
      : "quiet",
    filterRepeated: Boolean(settings.filterRepeated),
    hideLongComments: Boolean(settings.hideLongComments),
    avoidLyricsArea: Boolean(settings.avoidLyricsArea),
  };
}
