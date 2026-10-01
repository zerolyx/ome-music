import {
  EQ_BANDS,
  EQ_MAX,
  EQ_MIN,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
  EQ_PREAMP_STEP,
  EQ_PRESETS,
  type EqPresetId,
} from "../state/equalizer";
import { THEME_PRESETS, type CustomThemeColors, type ThemeChoice } from "../state/theme";
import { VIZ_MODES, VIZ_PALETTES, type VizMode, type VizPalette } from "../state/visualizer";
import { STAGE_EFFECTS, type StageEffect } from "../state/stage";
import type { LyricSubtitleMode } from "../state/lyrics";
import type { AccentMode } from "../state/tint";
import {
  REPLAY_GAIN_PREAMP_MAX,
  REPLAY_GAIN_PREAMP_MIN,
  REPLAY_GAIN_PREAMP_STEP,
  type ReplayGainMode,
} from "../state/replaygain";
import {
  DEFAULT_CHANNEL_TOOLS_SETTINGS,
  isValidChannelToolsComparisonSlots,
  isValidChannelToolsPresetList,
  isValidChannelToolsSettings,
  type ChannelToolsSettings,
  type ChannelToolsPreset,
  type ChannelToolsComparisonSlots,
} from "../state/channel-tools";

export const MAX_PREFERENCES_TRANSFER_BYTES = 64 * 1024;

export interface PreferencesTransferPayload {
  theme: {
    choice: ThemeChoice;
    customColors: CustomThemeColors;
    accentMode: AccentMode;
  };
  playback: {
    radioEnabled: boolean;
    fadeEnabled: boolean;
  };
  sound: {
    eqEnabled: boolean;
    eqPreset: EqPresetId | "custom";
    eqGains: number[];
    eqPreampDb: number;
    replayGainEnabled: boolean;
    replayGainMode: ReplayGainMode;
    replayGainPreventClipping: boolean;
    replayGainPreampDb: number;
    channelTools: ChannelToolsSettings;
    channelToolsPresets: ChannelToolsPreset[];
    channelToolsComparison: ChannelToolsComparisonSlots;
  };
  visual: {
    danmakuEnabled: boolean;
    visualizerMode: VizMode;
    visualizerPalette: VizPalette;
    stageEffect: StageEffect;
    stageFontScale: number;
  };
  lyrics: {
    subtitleMode: LyricSubtitleMode;
    backfillThreshold: number;
  };
}

export interface PreferencesTransferDocument {
  format: "ome-preferences";
  version: 1 | 2 | 3 | 4 | 5;
  exportedAt: string;
  appVersion: string;
  preferences: PreferencesTransferPayload;
}

const THEME_CHOICES = new Set<string>([
  "system",
  "custom",
  ...THEME_PRESETS.map((preset) => preset.id),
]);
const EQ_PRESET_IDS = new Set<string>([...EQ_PRESETS.map((preset) => preset.id), "custom"]);
const VIZ_MODE_IDS = new Set<string>(VIZ_MODES.map((mode) => mode.id));
const VIZ_PALETTE_IDS = new Set<string>(VIZ_PALETTES.map((palette) => palette.id));
const STAGE_EFFECT_IDS = new Set<string>(STAGE_EFFECTS.map((effect) => effect.id));
const SUBTITLE_MODES = new Set<string>(["translation", "romanization", "combined", "none"]);
const THEME_KEYS = ["choice", "customColors", "accentMode"];
const COLOR_KEYS = ["bg", "surface", "text", "accent"];
const PLAYBACK_KEYS = ["radioEnabled", "fadeEnabled"];
const SOUND_V1_V2_KEYS = ["eqEnabled", "eqPreset", "eqGains", "eqPreampDb"];
const SOUND_V3_KEYS = [
  ...SOUND_V1_V2_KEYS,
  "replayGainEnabled",
  "replayGainMode",
  "replayGainPreventClipping",
  "replayGainPreampDb",
];
const SOUND_V4_KEYS = [...SOUND_V3_KEYS, "channelTools"];
const SOUND_V5_KEYS = [...SOUND_V4_KEYS, "channelToolsPresets", "channelToolsComparison"];
const VISUAL_V1_KEYS = ["danmakuEnabled", "visualizerMode", "stageEffect", "stageFontScale"];
const VISUAL_KEYS = [...VISUAL_V1_KEYS, "visualizerPalette"];
const LYRICS_KEYS = ["subtitleMode", "backfillThreshold"];
const PREFERENCES_KEYS = ["theme", "playback", "sound", "visual", "lyrics"];
const DOCUMENT_KEYS = ["format", "version", "exportedAt", "appVersion", "preferences"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && THEME_CHOICES.has(value);
}

function normalizePayload(value: unknown, version: 1 | 2 | 3 | 4 | 5 = 5): PreferencesTransferPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, PREFERENCES_KEYS)) return null;
  const { theme, playback, sound, visual, lyrics } = value;
  if (
    !isRecord(theme) || !isRecord(playback) || !isRecord(sound) ||
    !isRecord(visual) || !isRecord(lyrics)
  ) return null;
  if (
    !hasExactKeys(theme, THEME_KEYS) ||
    !hasExactKeys(playback, PLAYBACK_KEYS) ||
    !hasExactKeys(sound, version >= 5 ? SOUND_V5_KEYS : version >= 4 ? SOUND_V4_KEYS : version === 3 ? SOUND_V3_KEYS : SOUND_V1_V2_KEYS) ||
    !hasExactKeys(visual, version === 1 ? VISUAL_V1_KEYS : VISUAL_KEYS) ||
    !hasExactKeys(lyrics, LYRICS_KEYS)
  ) return null;

  const replayGainEnabled = version >= 3 ? sound.replayGainEnabled : false;
  const replayGainMode = version >= 3 ? sound.replayGainMode : "track";
  const replayGainPreventClipping = version >= 3 ? sound.replayGainPreventClipping : true;
  const replayGainPreampDb = version >= 3 ? sound.replayGainPreampDb : 0;
  const channelTools = version >= 4 ? sound.channelTools : { ...DEFAULT_CHANNEL_TOOLS_SETTINGS };
  const channelToolsPresets = version >= 5 ? sound.channelToolsPresets : [];
  const channelToolsComparison = version >= 5 ? sound.channelToolsComparison : { A: null, B: null };

  const colors = theme.customColors;
  if (!isRecord(colors) || !hasExactKeys(colors, COLOR_KEYS)) return null;
  if (
    !isThemeChoice(theme.choice) ||
    (theme.accentMode !== "cover" && theme.accentMode !== "fixed") ||
    !COLOR_KEYS.every((key) => isHexColor(colors[key]))
  ) return null;

  if (!isBoolean(playback.radioEnabled) || !isBoolean(playback.fadeEnabled)) return null;

  if (
    !isBoolean(sound.eqEnabled) ||
    typeof sound.eqPreset !== "string" || !EQ_PRESET_IDS.has(sound.eqPreset) ||
    !Array.isArray(sound.eqGains) || sound.eqGains.length !== EQ_BANDS.length ||
    !sound.eqGains.every((gain) => isFiniteNumber(gain) && gain >= EQ_MIN && gain <= EQ_MAX) ||
    !isFiniteNumber(sound.eqPreampDb) ||
    sound.eqPreampDb < EQ_PREAMP_MIN || sound.eqPreampDb > EQ_PREAMP_MAX ||
    Math.abs(sound.eqPreampDb / EQ_PREAMP_STEP - Math.round(sound.eqPreampDb / EQ_PREAMP_STEP)) > 1e-8 ||
    !isBoolean(replayGainEnabled) ||
    (replayGainMode !== "track" && replayGainMode !== "album") ||
    !isBoolean(replayGainPreventClipping) || !isFiniteNumber(replayGainPreampDb) ||
    replayGainPreampDb < REPLAY_GAIN_PREAMP_MIN || replayGainPreampDb > REPLAY_GAIN_PREAMP_MAX ||
    Math.abs(replayGainPreampDb / REPLAY_GAIN_PREAMP_STEP - Math.round(replayGainPreampDb / REPLAY_GAIN_PREAMP_STEP)) > 1e-8 ||
    !isValidChannelToolsSettings(channelTools) ||
    !isValidChannelToolsPresetList(channelToolsPresets) ||
    !isValidChannelToolsComparisonSlots(channelToolsComparison)
  ) return null;

  if (
    !isBoolean(visual.danmakuEnabled) ||
    typeof visual.visualizerMode !== "string" || !VIZ_MODE_IDS.has(visual.visualizerMode) ||
    (version >= 2 && (typeof visual.visualizerPalette !== "string" || !VIZ_PALETTE_IDS.has(visual.visualizerPalette))) ||
    typeof visual.stageEffect !== "string" || !STAGE_EFFECT_IDS.has(visual.stageEffect) ||
    !isFiniteNumber(visual.stageFontScale) ||
    visual.stageFontScale < 75 || visual.stageFontScale > 145 || visual.stageFontScale % 5 !== 0
  ) return null;

  if (
    typeof lyrics.subtitleMode !== "string" || !SUBTITLE_MODES.has(lyrics.subtitleMode) ||
    !isFiniteNumber(lyrics.backfillThreshold) ||
    !Number.isInteger(lyrics.backfillThreshold) || lyrics.backfillThreshold < 82 || lyrics.backfillThreshold > 95
  ) return null;

  return {
    theme: {
      choice: theme.choice,
      customColors: {
        bg: colors.bg as string,
        surface: colors.surface as string,
        text: colors.text as string,
        accent: colors.accent as string,
      },
      accentMode: theme.accentMode,
    },
    playback: {
      radioEnabled: playback.radioEnabled,
      fadeEnabled: playback.fadeEnabled,
    },
    sound: {
      eqEnabled: sound.eqEnabled,
      eqPreset: sound.eqPreset as EqPresetId | "custom",
      eqGains: [...sound.eqGains] as number[],
      eqPreampDb: sound.eqPreampDb,
      replayGainEnabled,
      replayGainMode: replayGainMode as ReplayGainMode,
      replayGainPreventClipping,
      replayGainPreampDb,
      channelTools: structuredClone(channelTools),
      channelToolsPresets: structuredClone(channelToolsPresets),
      channelToolsComparison: structuredClone(channelToolsComparison),
    },
    visual: {
      danmakuEnabled: visual.danmakuEnabled,
      visualizerMode: visual.visualizerMode as VizMode,
      // v1 exported the original single-theme-color visualizer behavior.
      visualizerPalette: version === 1 ? "theme" : visual.visualizerPalette as VizPalette,
      stageEffect: visual.stageEffect as StageEffect,
      stageFontScale: visual.stageFontScale,
    },
    lyrics: {
      subtitleMode: lyrics.subtitleMode as LyricSubtitleMode,
      backfillThreshold: lyrics.backfillThreshold,
    },
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Build a versioned document from the explicit preference allowlist only. */
export function serializePreferencesTransfer(
  preferences: PreferencesTransferPayload,
  appVersion: string,
  exportedAt = new Date().toISOString(),
): string {
  const safePreferences = normalizePayload(preferences);
  if (!safePreferences) throw new Error("偏好内容无效，无法导出");
  if (typeof appVersion !== "string" || appVersion.length > 64 || !appVersion.trim()) {
    throw new Error("应用版本信息无效，无法导出");
  }
  if (typeof exportedAt !== "string" || !Number.isFinite(Date.parse(exportedAt))) {
    throw new Error("导出时间无效，无法导出");
  }

  const document: PreferencesTransferDocument = {
    format: "ome-preferences",
    version: 5,
    exportedAt,
    appVersion,
    preferences: safePreferences,
  };
  const serialized = JSON.stringify(document, null, 2);
  if (utf8ByteLength(serialized) > MAX_PREFERENCES_TRANSFER_BYTES) {
    throw new Error("偏好文件过大，无法导出");
  }
  return serialized;
}

/** Validate the complete file before exposing any preference for import. */
export function parsePreferencesTransfer(serialized: string): PreferencesTransferDocument {
  if (utf8ByteLength(serialized) > MAX_PREFERENCES_TRANSFER_BYTES) {
    throw new Error("偏好文件过大，无法导入");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("偏好文件不是有效的 JSON");
  }

  if (
    !isRecord(parsed) || !hasExactKeys(parsed, DOCUMENT_KEYS) ||
    parsed.format !== "ome-preferences" ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5)
  ) throw new Error("偏好文件格式或版本不受支持");
  if (
    typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt)) ||
    typeof parsed.appVersion !== "string" || !parsed.appVersion.trim() || parsed.appVersion.length > 64
  ) throw new Error("偏好文件缺少有效的导出信息");

  const preferences = normalizePayload(parsed.preferences, parsed.version);
  if (!preferences) throw new Error("偏好文件内容无效或包含不支持的字段");
  return {
    format: "ome-preferences",
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    preferences,
  };
}
