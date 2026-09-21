import { effect, signal } from "@preact/signals";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ome.theme";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export const themeChoice = signal<ThemeChoice>(loadChoice());
export const systemDark = signal<boolean>(media.matches);

function loadChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
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
