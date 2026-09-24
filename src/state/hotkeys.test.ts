import { describe, expect, it } from "vitest";
import { matchHotkey } from "./hotkeys";

const base = { editable: false, activatable: false, composing: false, paletteOpen: false };

describe("matchHotkey（全局快捷键）", () => {
  it("核心键位映射", () => {
    expect(matchHotkey(" ", base)).toBe("toggle");
    expect(matchHotkey("ArrowLeft", base)).toBe("seek-back");
    expect(matchHotkey("ArrowRight", base)).toBe("seek-forward");
    expect(matchHotkey("ArrowUp", base)).toBe("volume-up");
    expect(matchHotkey("ArrowDown", base)).toBe("volume-down");
    expect(matchHotkey("m", base)).toBe("mute");
    expect(matchHotkey("N", base)).toBe("next");
    expect(matchHotkey("p", base)).toBe("previous");
    expect(matchHotkey("l", base)).toBe("stage");
    expect(matchHotkey("V", base)).toBe("visualizer");
    expect(matchHotkey("q", base)).toBe("queue");
  });

  it("未映射的键返回 null", () => {
    expect(matchHotkey("x", base)).toBeNull();
    expect(matchHotkey("Escape", base)).toBeNull();
    expect(matchHotkey("F5", base)).toBeNull();
  });

  it("输入框聚焦时不劫持", () => {
    expect(matchHotkey(" ", { ...base, editable: true })).toBeNull();
    expect(matchHotkey("ArrowLeft", { ...base, editable: true })).toBeNull();
  });

  it("焦点在按钮/链接上时空格不劫持（保留激活语义）", () => {
    expect(matchHotkey(" ", { ...base, activatable: true })).toBeNull();
    expect(matchHotkey("ArrowRight", { ...base, activatable: true })).toBe("seek-forward");
  });

  it("中文输入法组字时不劫持", () => {
    expect(matchHotkey("n", { ...base, composing: true })).toBeNull();
  });

  it("命令面板打开时不劫持（面板自己处理键盘）", () => {
    expect(matchHotkey(" ", { ...base, paletteOpen: true })).toBeNull();
    expect(matchHotkey("ArrowUp", { ...base, paletteOpen: true })).toBeNull();
  });
});
