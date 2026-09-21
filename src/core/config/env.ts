/**
 * 1.0 Foundation — configuration.
 *
 * Why this exists: settings and source base URLs are currently read ad hoc
 * from localStorage, the database and hardcoded literals. A single place that
 * reads Vite env, validates it and fails fast keeps "which endpoint am I
 * actually talking to?" answerable.
 *
 * Rule: nothing here may hold a secret. Credentials stay in the OS keyring /
 * PersonalConfig and are read through the existing Rust commands.
 *
 * Not wired through the app yet — Phase 1A only establishes the primitive.
 */

export interface AppConfig {
  /** True when the React app runs inside the Tauri shell. */
  isDesktop: boolean;
  /** True for `vite dev`, false for a production bundle. */
  isDev: boolean;
  /** Optional external NetEase API base URL override. */
  neteaseBaseUrl: string | null;
}

const DEFAULT_NETEASE_BASE_URL = "http://127.0.0.1:3000";

function readEnv(key: string): string | null {
  const value = import.meta.env?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readAppConfig(): AppConfig {
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return {
    isDesktop,
    isDev: Boolean(import.meta.env?.DEV),
    neteaseBaseUrl:
      readEnv("VITE_NETEASE_BASE_URL") ?? (isDesktop ? null : DEFAULT_NETEASE_BASE_URL),
  };
}

/**
 * Validate a user-supplied base URL before it reaches a fetch call.
 *
 * Rejecting anything but http(s) keeps `javascript:` and `file:` out of the
 * request path; the caller stays responsible for the localhost allowlist.
 */
export function isValidBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
