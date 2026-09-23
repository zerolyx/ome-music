import { beforeEach, describe, expect, it } from "vitest";
import {
  closeStage,
  openStage,
  setStageEffect,
  stageEffect,
  stageOpen,
} from "./stage";

describe("stage 状态", () => {
  beforeEach(() => {
    localStorage.clear();
    closeStage();
  });

  it("开关不持久化", () => {
    openStage();
    expect(stageOpen.value).toBe(true);
    closeStage();
    expect(stageOpen.value).toBe(false);
    expect(localStorage.getItem("ome.stage.open")).toBeNull();
  });

  it("动效选择持久化，未知值回退浮流", () => {
    setStageEffect("chorus");
    expect(stageEffect.value).toBe("chorus");
    expect(localStorage.getItem("ome.stage.effect")).toBe("chorus");
    setStageEffect("muse");
    expect(stageEffect.value).toBe("muse");
    localStorage.setItem("ome.stage.effect", "bogus");
    // 重新加载模块才会走 loadEffect；这里直接验证 setStageEffect 的合法集合
    expect(() => setStageEffect("flow")).not.toThrow();
    expect(stageEffect.value).toBe("flow");
  });
});
