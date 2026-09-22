import { useEffect, useState } from "preact/hooks";
import { listZhVoices, loadTtsConfig, saveTtsConfig, speak, type TtsConfig } from "../state/tts";

/** 试听台词：DJ 人设开场白（逐字固定） */
const AUDITION_LINE = "嘿，晚上好。欢迎回来，这里是你的私人电台——今晚想听点什么？";

/** 私人 DJ 语音设置：启用 / 声线 / 语速 / 音高 / 试听；任何改动立即持久化 */
export function TtsSettings() {
  const [config, setConfig] = useState<TtsConfig>(loadTtsConfig);
  const [voices, setVoices] = useState(listZhVoices);
  const [speaking, setSpeaking] = useState(false);

  const apply = (patch: Partial<TtsConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveTtsConfig(next);
  };

  // 声线列表在 Chrome 下异步加载（首次为空）：voiceschanged 只挂一次，触发后刷新
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(listZhVoices());
    synth.addEventListener("voiceschanged", refresh, { once: true });
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  // 从未选过声线（空 = 默认）：落到第一个中文声线并持久化
  useEffect(() => {
    if (!config.voiceURI && voices.length > 0) apply({ voiceURI: voices[0].uri });
  }, [config.voiceURI, voices]);

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
      <div class="tts-row">
        <span class="tts-label">启用语音</span>
        <div class="segmented" role="radiogroup" aria-label="启用语音">
          <button
            role="radio"
            aria-checked={config.enabled}
            class={`segment ${config.enabled ? "is-active" : ""}`}
            onClick={() => apply({ enabled: true })}
          >
            开
          </button>
          <button
            role="radio"
            aria-checked={!config.enabled}
            class={`segment ${!config.enabled ? "is-active" : ""}`}
            onClick={() => apply({ enabled: false })}
          >
            关
          </button>
        </div>
      </div>

      <label class="tts-row">
        <span class="tts-label">声线</span>
        <select
          value={config.voiceURI}
          onChange={(event) => apply({ voiceURI: (event.target as HTMLSelectElement).value })}
        >
          {voices.length === 0 ? (
            <option value="">暂无可用中文声线</option>
          ) : (
            voices.map((voice) => (
              <option key={voice.uri} value={voice.uri}>
                {voice.name}
              </option>
            ))
          )}
        </select>
      </label>

      <label class="tts-row">
        <span class="tts-label">语速</span>
        <input
          class="slider"
          type="range"
          min={0.5}
          max={1.3}
          step={0.02}
          value={config.rate}
          aria-label="语速"
          onInput={(event) => apply({ rate: Number((event.target as HTMLInputElement).value) })}
        />
        <span class="tts-value">{config.rate.toFixed(2)}</span>
      </label>

      <label class="tts-row">
        <span class="tts-label">音高</span>
        <input
          class="slider"
          type="range"
          min={0.6}
          max={1.2}
          step={0.02}
          value={config.pitch}
          aria-label="音高"
          onInput={(event) => apply({ pitch: Number((event.target as HTMLInputElement).value) })}
        />
        <span class="tts-value">{config.pitch.toFixed(2)}</span>
      </label>

      <div class="tts-row">
        <button class="btn-primary" disabled={speaking} onClick={() => void audition()}>
          {speaking ? "朗读中…" : "试听"}
        </button>
      </div>

      <div class="settings-label" style="margin-top:14px">自定义音色（可选 · 优先级最高）</div>
      <p class="view-hint">
        填入 OpenAI 兼容 TTS 端点即可使用克隆音色，例如 SiliconFlow 的 CosyVoice2（含预设男声与音色克隆），
        或自建 GPT-SoVITS / Fish-Speech 的兼容服务。未填写时使用上方声线。
      </p>
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
          placeholder="sk-…（留空则不带鉴权）"
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
        <span class="tts-label">音色</span>
        <input
          class="search-input"
          type="text"
          placeholder="FunAudioLLM/CosyVoice2-0.5B:alex"
          value={config.ttsVoice ?? ""}
          onInput={(event) => apply({ ttsVoice: (event.target as HTMLInputElement).value })}
        />
      </label>
      <p class="view-hint">开源方案参考：GPT-SoVITS / CosyVoice2 / IndexTTS / F5-TTS / ChatTTS（自建后填端点即可）</p>
    </div>
  );
}
