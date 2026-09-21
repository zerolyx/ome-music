import { describe, expect, it } from "vitest";
import { resolvedTheme, setThemeChoice, themeChoice } from "./theme";

describe("resolvedTheme", () => {
  it("system 跟随系统偏好", () => {
    expect(resolvedTheme("system", true)).toBe("dark");
    expect(resolvedTheme("system", false)).toBe("light");
  });
  it("显式选择覆盖系统", () => {
    expect(resolvedTheme("light", true)).toBe("light");
    expect(resolvedTheme("dark", false)).toBe("dark");
  });
});

describe("setThemeChoice", () => {
  it("持久化显式选择，system 时清除", () => {
    setThemeChoice("dark");
    expect(themeChoice.value).toBe("dark");
    expect(localStorage.getItem("ome.theme")).toBe("dark");
    setThemeChoice("system");
    expect(localStorage.getItem("ome.theme")).toBeNull();
    expect(themeChoice.value).toBe("system");
  });
});
