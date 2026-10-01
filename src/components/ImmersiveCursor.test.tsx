import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { ImmersiveCursor } from "./ImmersiveCursor";

function mediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => mediaQueryList(query === "(pointer: fine)"));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("immersive-cursor-active");
});

describe("ImmersiveCursor", () => {
  it("keeps the system cursor available while showing the follow decoration", () => {
    const { container } = render(<ImmersiveCursor />);
    const ring = container.querySelector<HTMLElement>(".cursor-ring")!;
    const dot = container.querySelector<HTMLElement>(".cursor-dot")!;

    fireEvent.mouseMove(window, { clientX: 120, clientY: 80 });

    expect(ring.classList.contains("is-visible")).toBe(true);
    expect(dot.classList.contains("is-visible")).toBe(true);
    expect(ring.style.translate).toBe("120px 80px");
    expect(document.documentElement.classList.contains("immersive-cursor-active")).toBe(false);
  });

  it("keeps the decoration visible across a temporary focus change", () => {
    const { container } = render(<ImmersiveCursor />);
    const ring = container.querySelector<HTMLElement>(".cursor-ring")!;
    const dot = container.querySelector<HTMLElement>(".cursor-dot")!;

    fireEvent.mouseMove(window, { clientX: 120, clientY: 80 });
    fireEvent(window, new Event("blur"));

    expect(ring.classList.contains("is-visible")).toBe(true);
    expect(dot.classList.contains("is-visible")).toBe(true);
    expect(document.documentElement.classList.contains("immersive-cursor-active")).toBe(false);

    fireEvent(window, new Event("focus"));

    expect(ring.classList.contains("is-visible")).toBe(true);
    expect(dot.classList.contains("is-visible")).toBe(true);
  });

  it("pauses while hidden and resumes without clearing the last cursor position", () => {
    const { container } = render(<ImmersiveCursor />);
    const ring = container.querySelector<HTMLElement>(".cursor-ring")!;
    const dot = container.querySelector<HTMLElement>(".cursor-dot")!;

    fireEvent.mouseMove(window, { clientX: 120, clientY: 80 });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));

    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled();
    expect(ring.classList.contains("is-visible")).toBe(true);
    expect(dot.classList.contains("is-visible")).toBe(true);
    expect(ring.style.translate).toBe("120px 80px");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));

    expect(ring.classList.contains("is-visible")).toBe(true);
    expect(dot.classList.contains("is-visible")).toBe(true);
    expect(vi.mocked(requestAnimationFrame)).toHaveBeenCalledTimes(2);
  });
});
