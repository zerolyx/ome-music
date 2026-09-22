import { useEffect, useState } from "preact/hooks";
import {
  loadTtsConfig,
  saveTtsConfig,
  speak,
  type TtsConfig,
} from "../state/tts";

/** 试听台词：DJ 人格开场白（逐字固定） */
const AUDITION_LINE = "嘿，晚上好。欢迎回来，这里是你的私人电台——今晚想听点什么？";

const CUSTOM_VOICE = "custom";

/** 音色预设：免费云端男声 × 2 + 自定义克隆 */
const PRESETS: Array<{ uri: string; name: string; desc: string }> = [
  { uri: "zh-CN-YunxiNeural", name: "云希", desc: "慵懒青年男声 · 免费" },
  { uri: "zh-HK-WanLungNeural", name: "雲龍", desc: "港腔男声 · 免费" },
  { uri: CUSTOM_VOICE, name: "我的音色", desc: "克隆你喜欢的播客声音 · 需 TTS 服务" },
];

export function TtsSettings() {
  const [config, setConfig] = useState<TtsConfig>(loadTtsConfig);
  const [speaking, setSpeaking] = useState(false);

  const apply = (patch: Partial<TtsConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveTtsConfig(next);
  };

  const isCustom = config.voiceURI === CUSTOM_VOICE;

  // 声线在系统侧异步加载：voiceschanged 触发一次重渲染让兜底声线可见
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => setConfig((current) => ({ ...current }));
    synth.addEventListener("voiceschanged", refresh, { once: true });
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  const audition = async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      await speak(AUDITION_LINE);
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <div class="tts-settings">
      <div class="voice-list" role="radiogroup" aria-label="DJ 音色">
        {PRESETS.map((preset) => (
          <button
            key={preset.uri}
            role="radio"
            aria-checked={config.voiceURI === preset.uri}
            class={`voice-card ${config.voiceURI === preset.uri ? "is-active" : ""}`}
            onClick={() => apply({ voiceURI: preset.uri })}
          >
            <span class="voice-name">{preset.name}</span>
            <span class="voice-desc">{preset.desc}</span>
          </button>
        ))}
      </div>

      {isCustom && (
        <div class="voice-custom">
          <label class="tts-row">
            <span class="tts-label">端点</span>
            <input
              class="search-input"
              type="text"
              placeholder="https://api.siliconflow.cn/v1"
              value={config.ttsBaseUrl ?? ""}
              onInput={(event) => apply({ ttsBaseUrl: (event.target as HTMLInputElement).value })}
            />
          </label>
          <label class="tts-row">
            <span class="tts-label">密钥</span>
            <input
              class="search-input"
              type="password"
              placeholder="sk-…"
              value={config.ttsApiKey ?? ""}
              onInput={(event) => apply({ ttsApiKey: (event.target as HTMLInputElement).value })}
            />
          </label>
          <label class="tts-row">
            <span class="tts-label">模型</span>
            <input
              class="search-input"
              type="text"
              placeholder="FunAudioLLM/CosyVoice2-0.5B"
              value={config.ttsModel ?? ""}
              onInput={(event) => apply({ ttsModel: (event.target as HTMLInputElement).value })}
            />
          </label>
          <label class="tts-row">
            <span class="tts-label">音色 ID</span>
            <input
              class="search-input"
              type="text"
              placeholder="FunAudioLLM/CosyVoice2-0.5B:alex 或克隆音色 ID"
              value={config.ttsVoice ?? ""}
              onInput={(event) => apply({ ttsVoice: (event.target as HTMLInputElement).value })}
            />
          </label>
          <p class="view-hint">
            兼容 OpenAI /audio/speech 形态：SiliconFlow 的 CosyVoice2 支持音色克隆（上传一段喜欢的播客音频即可），
            自建 GPT-SoVITS / Fish-Speech 也可用。
          </p>
        </div>
      )}

      <div class="tts-row">
        <button class="btn-primary" disabled={speaking} onClick={() => void audition()}>
          {speaking ? "朗读中…" : "试听"}
        </button>
      </div>
    </div>
  );
}
