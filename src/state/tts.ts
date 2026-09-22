/* ============ DJ 人声（Web Speech TTS） ============
 * 单一中文声线、克制语速语调；全模块惰性访问 speechSynthesis，
 * 顶层只定义常量，保证在 jsdom / 非浏览器环境导入即安全。
 */

export interface TtsConfig {
  voiceURI: string;
  rate: number;
  pitch: number;
  enabled: boolean;
}

export interface ZhVoice {
  uri: string;
  name: string;
}

const STORAGE_KEY = "ome.tts";

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  voiceURI: "",
  rate: 0.92,
  pitch: 0.95,
  enabled: true,
};

function synthOrNull(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/** voice 列表在 Chrome 下异步加载：首次为空时挂一次 voiceschanged 触发加载 */
let voicesHooked = false;

/** 列出中文语音；不可用或尚未加载完返回空数组 */
export function listZhVoices(): ZhVoice[] {
  const synth = synthOrNull();
  if (!synth) return [];
  const voices = synth.getVoices();
  if (voices.length === 0 && !voicesHooked) {
    voicesHooked = true;
    synth.addEventListener("voiceschanged", () => synth.getVoices(), { once: true });
  }
  return voices
    .filter((voice) => (voice.lang || "").toLowerCase().startsWith("zh"))
    .map((voice) => ({ uri: voice.voiceURI, name: voice.name }));
}

function sanitize(raw: Partial<TtsConfig> | null | undefined): TtsConfig {
  const rate = typeof raw?.rate === "number" && Number.isFinite(raw.rate) ? raw.rate : DEFAULT_TTS_CONFIG.rate;
  const pitch =
    typeof raw?.pitch === "number" && Number.isFinite(raw.pitch) ? raw.pitch : DEFAULT_TTS_CONFIG.pitch;
  return {
    voiceURI: typeof raw?.voiceURI === "string" ? raw.voiceURI : DEFAULT_TTS_CONFIG.voiceURI,
    rate: Math.min(2, Math.max(0.5, rate)),
    pitch: Math.min(2, Math.max(0, pitch)),
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_TTS_CONFIG.enabled,
  };
}

export function loadTtsConfig(): TtsConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_TTS_CONFIG };
    return sanitize(JSON.parse(saved) as Partial<TtsConfig>);
  } catch {
    return { ...DEFAULT_TTS_CONFIG };
  }
}

export function saveTtsConfig(config: TtsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(config)));
  } catch {
    // 存储不可用（隐私模式等）：静默跳过，不阻塞说话
  }
}

/** 先按保存的 voiceURI 精确匹配，否则回退第一个中文声线 */
function resolveVoice(synth: SpeechSynthesis, savedUri: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  const exact = voices.find((voice) => voice.voiceURI === savedUri);
  if (exact) return exact;
  return voices.find((voice) => (voice.lang || "").toLowerCase().startsWith("zh")) ?? null;
}

/** 朗读一段话；禁用 / 环境不可用 / 出错时 resolve(false)，结束或出错 resolve */
export function speak(text: string): Promise<boolean> {
  const synth = synthOrNull();
  const config = loadTtsConfig();
  if (!synth || !config.enabled || !text.trim()) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    try {
      synth.cancel(); // 单声线：先掐掉正在说的话
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = resolveVoice(synth, config.voiceURI);
      if (voice) utterance.voice = voice;
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      let settled = false;
      const done = (value: boolean) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      utterance.onend = () => done(true);
      utterance.onerror = () => done(false);
      synth.speak(utterance);
    } catch {
      resolve(false);
    }
  });
}
