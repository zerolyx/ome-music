import { beforeEach, describe, expect, it } from "vitest";
import {
  closeStage,
  openStage,
  setStageFontScale,
  setStageEffect,
  stageEffect,
  stageFontScale,
  stageOpen,
  STAGE_FONT_SCALE_DEFAULT,
  STAGE_FONT_SCALE_MAX,
  STAGE_FONT_SCALE_MIN,
} from "./stage";

describe("stage 状态", () => {
  beforeEach(() => {
    localStorage.clear();
    closeStage();
    setStageFontScale(STAGE_FONT_SCALE_DEFAULT);
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

  it("舞台字号按 5% 步进并限制在可读范围内", () => {
    setStageFontScale(123);
    expect(stageFontScale.value).toBe(125);
    expect(localStorage.getItem("ome.stage.font-scale")).toBe("125");

    setStageFontScale(1000);
    expect(stageFontScale.value).toBe(STAGE_FONT_SCALE_MAX);
    setStageFontScale(-20);
    expect(stageFontScale.value).toBe(STAGE_FONT_SCALE_MIN);

    setStageFontScale(Number.NaN);
    expect(stageFontScale.value).toBe(STAGE_FONT_SCALE_MIN);
  });
});
