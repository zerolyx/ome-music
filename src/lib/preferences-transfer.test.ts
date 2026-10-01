import { describe, expect, it } from "vitest";
import {
  MAX_PREFERENCES_TRANSFER_BYTES,
  parsePreferencesTransfer,
  serializePreferencesTransfer,
  type PreferencesTransferPayload,
} from "./preferences-transfer";
import { DEFAULT_CHANNEL_TOOLS_SETTINGS, type ChannelToolsSettings } from "../state/channel-tools";

const preferences: PreferencesTransferPayload = {
  theme: {
    choice: "aurora",
    customColors: { bg: "#160E24", surface: "#251538", text: "#F7ECFF", accent: "#FF5C9A" },
    accentMode: "fixed",
  },
  playback: { radioEnabled: false, fadeEnabled: true },
  sound: {
    eqEnabled: true,
    eqPreset: "custom",
    eqGains: [1, 2, 0, -2, 3, 0, 0, 1, -1, 0],
    eqPreampDb: -3.5,
    replayGainEnabled: true,
    replayGainMode: "album",
    replayGainPreventClipping: false,
    replayGainPreampDb: 1.5,
    channelTools: {
      ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS),
      enabled: true,
      balance: -0.25,
      monoMode: "off",
      bandGains: {
        low: { leftGainDb: 1, rightGainDb: 0 },
        mid: { leftGainDb: 0, rightGainDb: -1 },
        high: { leftGainDb: 0, rightGainDb: 0 },
      },
    } satisfies ChannelToolsSettings,
    channelToolsPresets: [{
      id: "ctp-studio",
      name: "播客清晰度",
      settings: {
        ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS),
        enabled: true,
        leftGainDb: -1,
        rightGainDb: 0.5,
      },
    }],
    channelToolsComparison: {
      A: structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS),
      B: {
        ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS),
        enabled: true,
        monoMode: "sum",
      },
    },
  },
  visual: {
    danmakuEnabled: false,
    visualizerMode: "prism",
    visualizerPalette: "vivid",
    stageEffect: "muse",
    stageFontScale: 115,
  },
  lyrics: { subtitleMode: "romanization", backfillThreshold: 91 },
};

describe("preference transfer allowlist", () => {
  it("round-trips the supported preference categories and version metadata", () => {
    const serialized = serializePreferencesTransfer(preferences, "0.7.0", "2026-09-26T02:00:00.000Z");
    expect(parsePreferencesTransfer(serialized)).toEqual({
      format: "ome-preferences",
      version: 5,
      exportedAt: "2026-09-26T02:00:00.000Z",
      appVersion: "0.7.0",
      preferences,
    });
  });

  it("accepts the combined lyric subtitle preference", () => {
    const combined = structuredClone(preferences);
    combined.lyrics.subtitleMode = "combined";
    const serialized = serializePreferencesTransfer(combined, "0.7.0");
    expect(parsePreferencesTransfer(serialized).preferences.lyrics.subtitleMode).toBe("combined");
  });

  it("rejects unknown or credential-shaped fields before import", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.theme.apiKey = "must-not-import";
    expect(() => parsePreferencesTransfer(JSON.stringify(document)))
      .toThrow("偏好文件内容无效或包含不支持的字段");
  });

  it("rejects invalid enum values, incomplete EQ data, and unsupported versions", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.visual.visualizerMode = "unknown";
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.visual.visualizerMode = "prism";
    document.preferences.sound.eqGains.pop();
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.eqGains = preferences.sound.eqGains;
    document.version = 6;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("格式或版本不受支持");
  });

  it("imports the additional visualizer color palettes", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.visual.visualizerPalette = "ocean";
    expect(parsePreferencesTransfer(JSON.stringify(document)).preferences.visual.visualizerPalette).toBe("ocean");
  });

  it("imports v1 and v2 files with safe ReplayGain defaults", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.version = 1;
    delete document.preferences.visual.visualizerPalette;
    delete document.preferences.sound.replayGainEnabled;
    delete document.preferences.sound.replayGainMode;
    delete document.preferences.sound.replayGainPreventClipping;
    delete document.preferences.sound.replayGainPreampDb;
    delete document.preferences.sound.channelTools;
    delete document.preferences.sound.channelToolsPresets;
    delete document.preferences.sound.channelToolsComparison;
    const v1 = parsePreferencesTransfer(JSON.stringify(document));
    expect(v1.version).toBe(1);
    expect(v1.preferences.visual.visualizerPalette).toBe("theme");
    expect(v1.preferences.sound).toMatchObject({
      replayGainEnabled: false,
      replayGainMode: "track",
      replayGainPreventClipping: true,
      replayGainPreampDb: 0,
      channelTools: { enabled: false, balance: 0, monoMode: "off" },
    });

    document.version = 2;
    document.preferences.visual.visualizerPalette = "vivid";
    const v2 = parsePreferencesTransfer(JSON.stringify(document));
    expect(v2.version).toBe(2);
    expect(v2.preferences.visual.visualizerPalette).toBe("vivid");
    expect(v2.preferences.sound.replayGainEnabled).toBe(false);

    document.version = 3;
    document.preferences.sound.replayGainEnabled = true;
    document.preferences.sound.replayGainMode = "album";
    document.preferences.sound.replayGainPreventClipping = false;
    document.preferences.sound.replayGainPreampDb = 1.5;
    const v3 = parsePreferencesTransfer(JSON.stringify(document));
    expect(v3.version).toBe(3);
    expect(v3.preferences.sound.channelTools).toMatchObject({ enabled: false, balance: 0, monoMode: "off" });

    document.version = 4;
    document.preferences.sound.channelTools = structuredClone(preferences.sound.channelTools);
    const v4 = parsePreferencesTransfer(JSON.stringify(document));
    expect(v4.version).toBe(4);
    expect(v4.preferences.sound.channelTools).toEqual(preferences.sound.channelTools);
    expect(v4.preferences.sound.channelToolsPresets).toEqual([]);
    expect(v4.preferences.sound.channelToolsComparison).toEqual({ A: null, B: null });
  });

  it("rejects invalid ReplayGain mode and preamp values", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.sound.replayGainMode = "artist";
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.replayGainMode = "album";
    document.preferences.sound.replayGainPreampDb = 1.25;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");
  });

  it("rejects unsupported channel-tool routes, ranges, and unknown nested keys", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.sound.channelTools.monoMode = "surround";
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.channelTools.monoMode = "off";
    document.preferences.sound.channelTools.bandGains.low.leftGainDb = 6;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.channelTools.bandGains.low.leftGainDb = 0;
    document.preferences.sound.channelTools.extra = true;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");
  });

  it("rejects malformed, duplicate, and oversized channel profiles", () => {
    const document = JSON.parse(serializePreferencesTransfer(preferences, "0.7.0"));
    document.preferences.sound.channelToolsPresets[0].name = ` ${preferences.sound.channelToolsPresets[0].name}`;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.channelToolsPresets[0] = structuredClone(preferences.sound.channelToolsPresets[0]);
    document.preferences.sound.channelToolsPresets[0].settings.extra = true;
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.channelToolsPresets[0] = structuredClone(preferences.sound.channelToolsPresets[0]);
    document.preferences.sound.channelToolsPresets.push({
      ...structuredClone(document.preferences.sound.channelToolsPresets[0]),
      id: "ctp-second",
    });
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");

    document.preferences.sound.channelToolsPresets = Array.from({ length: 25 }, (_, index) => ({
      ...structuredClone(preferences.sound.channelToolsPresets[0]),
      id: `ctp-${index}`,
      name: `Preset ${index}`,
    }));
    expect(() => parsePreferencesTransfer(JSON.stringify(document))).toThrow("偏好文件内容无效");
  });

  it("enforces the size cap in UTF-8 bytes, not JavaScript characters", () => {
    const oversized = `"${"🎼".repeat(MAX_PREFERENCES_TRANSFER_BYTES / 4)}"`;
    expect(oversized.length).toBeLessThan(MAX_PREFERENCES_TRANSFER_BYTES);
    expect(() => parsePreferencesTransfer(oversized)).toThrow("偏好文件过大");
  });

  it("rejects malformed JSON and invalid export metadata", () => {
    expect(() => parsePreferencesTransfer("{" )).toThrow("不是有效的 JSON");
    expect(() => serializePreferencesTransfer(preferences, "  ")).toThrow("应用版本信息无效");
    expect(() => serializePreferencesTransfer(preferences, "0.7.0", "not-a-date")).toThrow("导出时间无效");
  });
});
