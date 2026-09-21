import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal smoke configuration (Phase 1A-1c).
 *
 * SCOPE BOUNDARY — read before adding cases.
 *
 * This runs the React frontend as a plain web app served by `vite preview`.
 * It deliberately does NOT launch the Tauri shell, so everything that depends
 * on the native runtime is out of reach here:
 *
 *   - local music file playback / asset protocol / directory authorization
 *   - the NetEase `NeteaseCloudMusicApi` node sidecar
 *   - keyring + PersonalConfig credential storage
 *   - the `ome-media://` proxy and QQ Music login flows
 *
 * What IS covered: the app boots, the shell renders, the queue and settings
 * overlays open and close, and no uncaught error escapes. That is the crash
 * class a UI refactor actually introduces.
 *
 * Tauri-native behaviour still requires manual QA (docs/QA_CHECKLIST_v0.4.0.md).
 */
export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 860 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
