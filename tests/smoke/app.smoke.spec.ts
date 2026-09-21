import { expect, test } from "@playwright/test";

/**
 * Minimal frontend smoke (Phase 1A-1c).
 *
 * BOUNDARY: this runs the React app as a plain web page. The Tauri shell is
 * not involved, so the following are explicitly NOT covered here and still
 * need manual QA:
 *   - local file playback / asset protocol / authorized directories
 *   - the NetEase NeteaseCloudMusicApi node sidecar
 *   - keyring + PersonalConfig credentials
 *   - the ome-media:// proxy and QQ Music sign-in
 *
 * What is covered is the crash class that a UI refactor actually introduces:
 * the shell mounts, the overlays open and close, and nothing throws.
 */

// Web-preview mode has no Tauri backend; ignore the resource noise that comes
// from that, but never ignore a real application error.
const EXPECTED_WEB_NOISE = [/favicon/i, /Failed to load resource/i, /net::ERR/i];

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (EXPECTED_WEB_NOISE.some((pattern) => pattern.test(text))) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test.describe("Ome Music frontend smoke", () => {
  test("boots to the player shell without uncaught errors", async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto("/");

    await expect(page).toHaveTitle(/Ome Music/i);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator(".startup-shell")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("the queue drawer opens and closes", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".startup-shell")).toBeVisible();

    // The drawer stays mounted and slides off-canvas, so visibility alone
    // proves nothing — assert the transform state instead.
    const drawer = page.getByLabel("Queue / 播放队列");
    await expect(drawer).toHaveClass(/translate-x-full/);

    await page.getByLabel("Toggle queue").click();
    await expect(drawer).toHaveClass(/translate-x-0/);

    await page.getByLabel("Close queue").click();
    await expect(drawer).toHaveClass(/translate-x-full/);
  });

  test("quick settings opens and closes", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".startup-shell")).toBeVisible();

    const trigger = page.locator(".quick-settings-trigger");
    await trigger.click();
    const panel = page.locator(".quick-settings-panel");
    await expect(panel).toBeVisible();

    await trigger.click();
    await expect(panel).toBeHidden();
  });

  test("the player controls are present and stable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".startup-shell")).toBeVisible();

    // The dock is the one region that must never disappear during a UI
    // refactor; if it unmounts, every playback entry point is gone.
    await expect(page.locator(".player-dock-controls")).toBeAttached();
  });
});
