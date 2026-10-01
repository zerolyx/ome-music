import { effect, signal } from "@preact/signals";

/**
 * 主题预设：浅色 / 深色 + Folia Theme Park 式手工预设
 * （月夜/茜影/青川/纸墨 + ECHO 式预设扩充：樱雪/薄荷/极光）。
 * "system" 只解析到浅色或深色；显式预设直接落到对应 data-theme。
 */
export const THEME_PRESETS = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "noir", label: "月夜" },
  { id: "ember", label: "茜影" },
  { id: "jade", label: "青川" },
  { id: "paper", label: "纸墨" },
  { id: "sakura", label: "樱雪" },
  { id: "mint", label: "薄荷" },
  { id: "aurora", label: "极光" },
] as const;

export type PresetTheme = (typeof THEME_PRESETS)[number]["id"];
export type ThemeChoice = "system" | "custom" | PresetTheme;
export type ResolvedTheme = PresetTheme | "custom";

export interface CustomThemeColors {
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

/** 自由配色的初始值：夜紫底色搭配莓粉强调色。 */
export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  bg: "#160E24",
  surface: "#251538",
  text: "#F7ECFF",
  accent: "#FF5C9A",
};

/** 主题卡色板：设置页主题卡的三段预览条（bg / elev / accent） */
export const THEME_SWATCHES: Record<ThemeChoice, { bg: string; elev: string; accent: string }> = {
  system: { bg: "#efe7ff", elev: "#fff2f8", accent: "#713eff" },
  custom: {
    bg: DEFAULT_CUSTOM_THEME.bg,
    elev: DEFAULT_CUSTOM_THEME.surface,
    accent: DEFAULT_CUSTOM_THEME.accent,
  },
  light: { bg: "#efe7ff", elev: "#fff2f8", accent: "#713eff" },
  dark: { bg: "#0d1026", elev: "#21193f", accent: "#ff62a7" },
  noir: { bg: "#0b0e17", elev: "#141928", accent: "#8ea2ff" },
  ember: { bg: "#140d10", elev: "#1f1419", accent: "#fb7c9a" },
  jade: { bg: "#0a110f", elev: "#122019", accent: "#5fd3a5" },
  paper: { bg: "#f4f1e8", elev: "#fffdf6", accent: "#4a7d6c" },
  sakura: { bg: "#faf3f4", elev: "#fffafb", accent: "#e0637f" },
  mint: { bg: "#f1f7f4", elev: "#fbfefd", accent: "#2fa381" },
  aurora: { bg: "#070b12", elev: "#0f1622", accent: "#4fd8c2" },
};

const STORAGE_KEY = "ome.theme";
const CUSTOM_THEME_STORAGE_KEY = "ome.theme.custom";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export const themeChoice = signal<ThemeChoice>(loadChoice());
export const customTheme = signal<CustomThemeColors>(loadCustomTheme());
export const systemDark = signal<boolean>(media.matches);

function isPreset(value: string | null): value is PresetTheme {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

function loadChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "custom" ? "custom" : isPreset(saved) ? saved : "system";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function loadCustomTheme(): CustomThemeColors {
  try {
    const saved = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_CUSTOM_THEME };
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CUSTOM_THEME };
    const colors = parsed as Partial<Record<keyof CustomThemeColors, unknown>>;
    return {
      bg: isHexColor(colors.bg) ? colors.bg : DEFAULT_CUSTOM_THEME.bg,
      surface: isHexColor(colors.surface) ? colors.surface : DEFAULT_CUSTOM_THEME.surface,
      text: isHexColor(colors.text) ? colors.text : DEFAULT_CUSTOM_THEME.text,
      accent: isHexColor(colors.accent) ? colors.accent : DEFAULT_CUSTOM_THEME.accent,
    };
  } catch {
    return { ...DEFAULT_CUSTOM_THEME };
  }
}

export function resolvedTheme(choice: ThemeChoice, dark: boolean): ResolvedTheme {
  if (choice === "system") return dark ? "dark" : "light";
  return choice;
}

export function setCustomThemeColor(key: keyof CustomThemeColors, value: string): void {
  if (!isHexColor(value)) return;
  const next = { ...customTheme.value, [key]: value };
  customTheme.value = next;
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 存储不可用时仍允许本次会话预览 */
  }
}

/** Validate and replace a complete palette (used by theme import). */
export function setCustomTheme(colors: CustomThemeColors): void {
  if (
    !colors ||
    !isHexColor(colors.bg) ||
    !isHexColor(colors.surface) ||
    !isHexColor(colors.text) ||
    !isHexColor(colors.accent)
  ) return;
  const next = {
    bg: colors.bg,
    surface: colors.surface,
    text: colors.text,
    accent: colors.accent,
  };
  customTheme.value = next;
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 存储不可用时仍允许本次会话预览 */
  }
}

export function resetCustomTheme(): void {
  const next = { ...DEFAULT_CUSTOM_THEME };
  customTheme.value = next;
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 存储不可用时仍允许本次会话预览 */
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  themeChoice.value = choice;
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* 存储不可用时仍允许本次会话预览 */
  }
}

media.addEventListener("change", (event) => {
  systemDark.value = event.matches;
});

effect(() => {
  const root = document.documentElement;
  const choice = themeChoice.value;
  root.dataset.theme = resolvedTheme(
    choice,
    systemDark.value
  );
  if (choice === "custom") {
    const colors = customTheme.value;
    root.style.setProperty("--custom-bg", colors.bg);
    root.style.setProperty("--custom-surface", colors.surface);
    root.style.setProperty("--custom-text", colors.text);
    root.style.setProperty("--custom-accent", colors.accent);
  } else {
    root.style.removeProperty("--custom-bg");
    root.style.removeProperty("--custom-surface");
    root.style.removeProperty("--custom-text");
    root.style.removeProperty("--custom-accent");
  }
});
