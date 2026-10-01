import { beforeEach, describe, expect, it } from "vitest";
import {
  closeViz,
  openViz,
  setVizMode,
  setVizPalette,
  vizMode,
  vizOpen,
  vizPalette,
  VIZ_PALETTES,
} from "./visualizer";

describe("visualizer 状态", () => {
  beforeEach(() => {
    localStorage.clear();
    closeViz();
  });

  it("开关不持久化", () => {
    openViz();
    expect(vizOpen.value).toBe(true);
    closeViz();
    expect(vizOpen.value).toBe(false);
    expect(localStorage.getItem("ome.viz.open")).toBeNull();
  });

  it("模式选择持久化", () => {
    setVizMode("ring");
    expect(vizMode.value).toBe("ring");
    expect(localStorage.getItem("ome.viz.mode")).toBe("ring");
    setVizMode("pulse");
    expect(vizMode.value).toBe("pulse");
    setVizMode("aurora");
    expect(vizMode.value).toBe("aurora");
    setVizMode("prism");
    expect(vizMode.value).toBe("prism");
    expect(localStorage.getItem("ome.viz.mode")).toBe("prism");
    setVizMode("spectrum");
    expect(vizMode.value).toBe("spectrum");
    expect(localStorage.getItem("ome.viz.mode")).toBe("spectrum");
  });

  it("默认多彩并记忆色彩表现", () => {
    expect(vizPalette.value).toBe("vivid");
    setVizPalette("theme");
    expect(vizPalette.value).toBe("theme");
    expect(localStorage.getItem("ome.viz.palette")).toBe("theme");
    for (const { id } of VIZ_PALETTES) {
      setVizPalette(id);
      expect(vizPalette.value).toBe(id);
      expect(localStorage.getItem("ome.viz.palette")).toBe(id);
    }
  });
});
