import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TTS_CONFIG, listZhVoices, loadTtsConfig, saveTtsConfig, speak } from "./tts";

beforeEach(() => {
  localStorage.removeItem("ome.tts");
});

describe("loadTtsConfig / saveTtsConfig", () => {
  it("无存档时返回默认配置（rate 0.92 / pitch 0.95 / enabled true）", () => {
    expect(loadTtsConfig()).toEqual({
      voiceURI: "",
      rate: 0.92,
      pitch: 0.95,
      enabled: true,
    });
  });

  it("保存后读取往返一致", () => {
    saveTtsConfig({ voiceURI: "zh-voice-1", rate: 1.05, pitch: 0.85, enabled: false });
    expect(loadTtsConfig()).toEqual({
      voiceURI: "zh-voice-1",
      rate: 1.05,
      pitch: 0.85,
      enabled: false,
    });
  });

  it("部分字段缺省时与默认值合并", () => {
    localStorage.setItem("ome.tts", JSON.stringify({ rate: 1.2 }));
    expect(loadTtsConfig()).toEqual({ ...DEFAULT_TTS_CONFIG, rate: 1.2 });
  });

  it("损坏的存档回退默认配置", () => {
    localStorage.setItem("ome.tts", "{not-json");
    expect(loadTtsConfig()).toEqual(DEFAULT_TTS_CONFIG);
  });
});

describe("jsdom 无 speechSynthesis：全部静默降级", () => {
  it("speak() resolve false", async () => {
    await expect(speak("晚安，电台刚开播。")).resolves.toBe(false);
  });

  it("listZhVoices() 返回空数组", () => {
    expect(listZhVoices()).toEqual([]);
  });
});
