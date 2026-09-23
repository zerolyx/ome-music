import { beforeEach, describe, expect, it } from "vitest";
import { closeViz, openViz, setVizMode, vizMode, vizOpen } from "./visualizer";

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
  });
});
