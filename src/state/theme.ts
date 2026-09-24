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
export type ThemeChoice = "system" | PresetTheme;
export type ResolvedTheme = PresetTheme;

/** 主题卡色板：设置页主题卡的三段预览条（bg / elev / accent） */
export const THEME_SWATCHES: Record<ThemeChoice, { bg: string; elev: string; accent: string }> = {
  system: { bg: "#f7f5f1", elev: "#0a0a0c", accent: "#e08763" },
  light: { bg: "#f7f5f1", elev: "#ffffff", accent: "#c96f4a" },
  dark: { bg: "#0a0a0c", elev: "#141417", accent: "#e08763" },
  noir: { bg: "#0b0e17", elev: "#141928", accent: "#8ea2ff" },
  ember: { bg: "#140d10", elev: "#1f1419", accent: "#fb7c9a" },
  jade: { bg: "#0a110f", elev: "#122019", accent: "#5fd3a5" },
  paper: { bg: "#f4f1e8", elev: "#fffdf6", accent: "#4a7d6c" },
  sakura: { bg: "#faf3f4", elev: "#fffafb", accent: "#e0637f" },
  mint: { bg: "#f1f7f4", elev: "#fbfefd", accent: "#2fa381" },
  aurora: { bg: "#070b12", elev: "#0f1622", accent: "#4fd8c2" },
};

const STORAGE_KEY = "ome.theme";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export const themeChoice = signal<ThemeChoice>(loadChoice());
export const systemDark = signal<boolean>(media.matches);

function isPreset(value: string | null): value is PresetTheme {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

function loadChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY);
  return isPreset(saved) ? saved : "system";
}

export function resolvedTheme(choice: ThemeChoice, dark: boolean): ResolvedTheme {
  if (choice === "system") return dark ? "dark" : "light";
  return choice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  themeChoice.value = choice;
  if (choice === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, choice);
}

media.addEventListener("change", (event) => {
  systemDark.value = event.matches;
});

effect(() => {
  document.documentElement.dataset.theme = resolvedTheme(
    themeChoice.value,
    systemDark.value
  );
});
