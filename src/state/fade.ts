import { signal } from "@preact/signals";

/** Persisted switch for the lightweight two-deck transition. */
const KEY = "ome.fade";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const fadeEnabled = signal<boolean>(load());

export function setFadeEnabled(enabled: boolean): void {
  fadeEnabled.value = enabled;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* Storage may be unavailable in a restricted webview. */
  }
}
