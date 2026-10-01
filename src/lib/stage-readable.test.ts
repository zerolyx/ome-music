import { describe, expect, it } from "vitest";
import {
  chooseStageReadableColors,
  compositeStageLuminances,
  contrastRatio,
  parseCssRgb,
  relativeLuminance,
  type Rgb,
} from "./stage-readable";

describe("歌词舞台可读色", () => {
  it("解析项目使用的十六进制和现代 RGB 色值", () => {
    expect(parseCssRgb("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseCssRgb("rgb(203 131 93)")).toEqual({ r: 203, g: 131, b: 93 });
    expect(parseCssRgb("rgba(10, 20, 30, 0.4)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseCssRgb("not-a-color")).toBeNull();
  });

  it("把封面亮度与当前舞台底色、遮罩合成后再测对比", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    const result = compositeStageLuminances(pixels, { r: 240, g: 240, b: 240 });
    expect(result).toHaveLength(2);
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[1]).toBeGreaterThan(relativeLuminance({ r: 0, g: 0, b: 0 }));
  });

  it("保留已有可读主题色，仅在歌词或强调色对比不足时调整", () => {
    const readableBackground = [0.98, 0.99, 1];
    const darkText = { r: 25, g: 20, b: 32 };
    const readableAccent = { r: 120, g: 25, b: 170 };
    expect(chooseStageReadableColors(readableBackground, darkText, readableAccent)).toBeNull();

    const adjusted = chooseStageReadableColors(
      readableBackground,
      { r: 248, g: 244, b: 255 },
      { r: 236, g: 156, b: 205 },
    );
    expect(adjusted).not.toBeNull();
    expect(adjusted?.foreground).toMatch(/^rgb\(/);
    expect(adjusted?.accent).toMatch(/^rgb\(/);
    expect(adjusted?.shadow).toContain("rgb");
  });

  it("选择深色封面下仍可辨认的浅色歌词", () => {
    const darkBackground = [0.01, 0.02, 0.04];
    const adjusted = chooseStageReadableColors(
      darkBackground,
      { r: 30, g: 25, b: 34 },
      { r: 120, g: 80, b: 150 },
    );
    expect(adjusted?.foreground).toBe("rgb(255 255 255)");
    expect(contrastRatio(relativeLuminance({ r: 255, g: 255, b: 255 }), 0.02)).toBeGreaterThan(4.5);
  });

  it("明暗区域混杂时优先选最能改善可读性的强调色", () => {
    const backgrounds = [0.02, 0.32, 0.62, 0.98];
    const originalAccent = { r: 128, g: 128, b: 128 };
    const adjusted = chooseStageReadableColors(
      backgrounds,
      { r: 150, g: 150, b: 150 },
      originalAccent,
    );
    const adjustedAccent = parseCssRgb(adjusted!.accent)!;
    const worst = (color: Rgb) => Math.min(
      ...backgrounds.map((background) => contrastRatio(relativeLuminance(color), background)),
    );

    expect(worst(adjustedAccent)).toBeGreaterThan(worst(originalAccent));
  });
});
