import { effect, signal } from "@preact/signals";

/**
 * 主题预设：浅色 / 深色 + Folia Theme Park 式手工预设（月夜/茜影/青川/纸墨）。
 * "system" 只解析到浅色或深色；显式预设直接落到对应 data-theme。
 */
export const THEME_PRESETS = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "noir", label: "月夜" },
  { id: "ember", label: "茜影" },
  { id: "jade", label: "青川" },
  { id: "paper", label: "纸墨" },
] as const;

export type PresetTheme = (typeof THEME_PRESETS)[number]["id"];
export type ThemeChoice = "system" | PresetTheme;
export type ResolvedTheme = PresetTheme;

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
