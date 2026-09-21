import { act, cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chromeVisible, initChromeAutoHide, setChromeHover } from "./chrome";
import { App } from "../app";

vi.useFakeTimers();

beforeEach(() => {
  chromeVisible.value = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});

describe("initChromeAutoHide", () => {
  it("启动宽限期 + 空闲后隐没", () => {
    const cleanup = initChromeAutoHide();
    vi.advanceTimersByTime(3400 + 2800 + 50);
    expect(chromeVisible.value).toBe(false);
    cleanup();
  });

  it("鼠标活动恢复显示并重置计时", () => {
    const cleanup = initChromeAutoHide();
    vi.advanceTimersByTime(3400 + 2800 + 50);
    expect(chromeVisible.value).toBe(false);
    window.dispatchEvent(new Event("mousemove"));
    expect(chromeVisible.value).toBe(true);
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(2000);
    expect(chromeVisible.value).toBe(true); // 距上次活动仅 2s，未到 2.8s
    vi.advanceTimersByTime(900);
    expect(chromeVisible.value).toBe(false);
    cleanup();
  });

  it("指针停在 chrome 上时不隐没；移开后随 mousemove 重新计时", () => {
    const cleanup = initChromeAutoHide();
    setChromeHover(true);
    vi.advanceTimersByTime(3400 + 2800 + 50);
    expect(chromeVisible.value).toBe(true); // 悬停 chrome：保持常显
    setChromeHover(false);
    window.dispatchEvent(new Event("mousemove")); // 现实中移开指针必然触发 mousemove
    vi.advanceTimersByTime(2800 + 50);
    expect(chromeVisible.value).toBe(false);
    cleanup();
  });
});

describe("App 沉浸模式类名", () => {
  it("chromeVisible=false 时应用 chrome-hidden 类", async () => {
    render(<App />);
    const shell = document.querySelector(".app-shell")!;
    expect(shell.classList.contains("chrome-hidden")).toBe(false);
    await act(async () => {
      chromeVisible.value = false;
    });
    expect(shell.classList.contains("chrome-hidden")).toBe(true);
    await act(async () => {
      chromeVisible.value = true;
    });
    expect(shell.classList.contains("chrome-hidden")).toBe(false);
  });
});
