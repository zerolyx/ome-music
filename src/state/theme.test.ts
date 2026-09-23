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
  it("手工预设（月夜/茜影/青川/纸墨）不随系统变化", () => {
    expect(resolvedTheme("noir", true)).toBe("noir");
    expect(resolvedTheme("noir", false)).toBe("noir");
    expect(resolvedTheme("ember", true)).toBe("ember");
    expect(resolvedTheme("jade", false)).toBe("jade");
    expect(resolvedTheme("paper", true)).toBe("paper");
  });
});

describe("setThemeChoice", () => {
  it("持久化显式选择，system 时清除", () => {
    setThemeChoice("dark");
    expect(themeChoice.value).toBe("dark");
    expect(localStorage.getItem("ome.theme")).toBe("dark");
    setThemeChoice("jade");
    expect(localStorage.getItem("ome.theme")).toBe("jade");
    setThemeChoice("system");
    expect(localStorage.getItem("ome.theme")).toBeNull();
    expect(themeChoice.value).toBe("system");
  });
});
