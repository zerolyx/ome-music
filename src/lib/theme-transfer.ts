import { THEME_PRESETS, type CustomThemeColors, type ThemeChoice } from "../state/theme";
import type { AccentMode } from "../state/tint";

export const MAX_THEME_TRANSFER_BYTES = 32 * 1024;

export interface ThemeTransferPayload {
  themeChoice: ThemeChoice;
  customColors: CustomThemeColors;
  accentMode: AccentMode;
}

interface ThemeTransferDocument {
  format: "ome-theme";
  version: 1;
  theme: ThemeTransferPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return (
    value === "system" ||
    value === "custom" ||
    (typeof value === "string" && THEME_PRESETS.some((preset) => preset.id === value))
  );
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function parsePayload(value: unknown): ThemeTransferPayload | null {
  if (!isRecord(value) || !isThemeChoice(value.themeChoice)) return null;
  if (value.accentMode !== "cover" && value.accentMode !== "fixed") return null;
  if (!isRecord(value.customColors)) return null;
  const { bg, surface, text, accent } = value.customColors;
  if (!isHexColor(bg) || !isHexColor(surface) || !isHexColor(text) || !isHexColor(accent)) return null;
  return {
    themeChoice: value.themeChoice,
    customColors: { bg, surface, text, accent },
    accentMode: value.accentMode,
  };
}

/** Serialize only the explicit theme allowlist; no other local preferences are read. */
export function serializeThemeTransfer(payload: ThemeTransferPayload): string {
  const validated = parsePayload(payload);
  if (!validated) throw new Error("主题内容无效，无法导出");
  const document: ThemeTransferDocument = {
    format: "ome-theme",
    version: 1,
    theme: validated,
  };
  return JSON.stringify(document, null, 2);
}

export function parseThemeTransfer(serialized: string): ThemeTransferPayload {
  if (serialized.length > MAX_THEME_TRANSFER_BYTES) {
    throw new Error("主题文件过大，无法导入");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("主题文件不是有效的 JSON");
  }

  if (!isRecord(parsed) || parsed.format !== "ome-theme" || parsed.version !== 1) {
    throw new Error("主题文件格式或版本不受支持");
  }
  const payload = parsePayload(parsed.theme);
  if (!payload) throw new Error("主题文件缺少有效的配色信息");
  return payload;
}
