import { describe, expect, it } from "vitest";
import {
  MAX_THEME_TRANSFER_BYTES,
  parseThemeTransfer,
  serializeThemeTransfer,
  type ThemeTransferPayload,
} from "./theme-transfer";

const payload: ThemeTransferPayload = {
  themeChoice: "custom",
  customColors: {
    bg: "#160E24",
    surface: "#251538",
    text: "#F7ECFF",
    accent: "#FF5C9A",
  },
  accentMode: "fixed",
};

describe("theme transfer", () => {
  it("round-trips the selected theme, custom palette and accent mode", () => {
    expect(parseThemeTransfer(serializeThemeTransfer(payload))).toEqual(payload);
  });

  it("serializes only the theme allowlist", () => {
    const serialized = serializeThemeTransfer(payload);
    expect(serialized).toContain('"format": "ome-theme"');
    expect(serialized).not.toMatch(/apiKey|cookie|musicPath|playlist/i);
  });

  it("rejects unknown versions, malformed colors and oversized inputs", () => {
    expect(() => parseThemeTransfer('{"format":"ome-theme","version":2}')).toThrow(/版本/);
    const invalidColor = serializeThemeTransfer(payload).replace("#160E24", "red");
    expect(() => parseThemeTransfer(invalidColor)).toThrow(/配色/);
    expect(() => parseThemeTransfer(" ".repeat(MAX_THEME_TRANSFER_BYTES + 1))).toThrow(/过大/);
  });

  it("ignores unrecognized fields rather than importing unrelated settings", () => {
    const serialized = serializeThemeTransfer(payload).replace(
      '"themeChoice": "custom",',
      '"themeChoice": "custom",\n    "apiKey": "must-not-be-read",',
    );
    expect(parseThemeTransfer(serialized)).toEqual(payload);
  });
});
