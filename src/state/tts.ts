/* ============ DJ 人声 ============
 * 双引擎：Edge 神经语音（云端，播客质感，推荐）→ 系统 speechSynthesis 兜底。
 * 单一中文声线、克制语速语调；全模块惰性访问浏览器 API，
 * 顶层只定义常量，保证在 jsdom / 非浏览器环境导入即安全。
 */

export interface TtsConfig {
  voiceURI: string;
  rate: number;
  pitch: number;
  enabled: boolean;
  /** 自定义 OpenAI 兼容 /audio/speech 端点（SiliconFlow CosyVoice2 / 自建 GPT-SoVITS 兼容层等） */
  ttsBaseUrl?: string;
  ttsApiKey?: string;
  ttsModel?: string;
  ttsVoice?: string;
}

export interface ZhVoice {
  uri: string;
  name: string;
}

const STORAGE_KEY = "ome.tts";

/** Edge 神经声线目录（云端合成，无需密钥；港台男声 + 播客质感男声） */
export const EDGE_VOICES: ZhVoice[] = [
  { uri: "zh-CN-YunxiNeural", name: "云希 · 男 · 活力播客感（推荐）" },
  { uri: "zh-HK-WanLungNeural", name: "雲龍 · 男 · 港腔" },
  { uri: "zh-CN-YunjianNeural", name: "云健 · 男 · 沉稳磁性" },
  { uri: "zh-CN-YunyangNeural", name: "云扬 · 男 · 新闻播报" },
];

/** 自定义音色：走用户配置的 OpenAI 兼容 /audio/speech 端点 */
export const CUSTOM_VOICE = "custom";

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  voiceURI: "zh-CN-YunxiNeural",
  rate: 0.88,
  pitch: 0.95,
  enabled: true,
  ttsBaseUrl: "",
  ttsApiKey: "",
  ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
  ttsVoice: "FunAudioLLM/CosyVoice2-0.5B:alex",
};

function synthOrNull(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/** voice 列表在 Chrome 下异步加载：首次为空时挂一次 voiceschanged 触发加载 */
let voicesHooked = false;

/** 列出系统中文语音；不可用或尚未加载完返回空数组 */
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
    ttsBaseUrl: typeof raw?.ttsBaseUrl === "string" ? raw.ttsBaseUrl.trim() : DEFAULT_TTS_CONFIG.ttsBaseUrl,
    ttsApiKey: typeof raw?.ttsApiKey === "string" ? raw.ttsApiKey : DEFAULT_TTS_CONFIG.ttsApiKey,
    ttsModel: typeof raw?.ttsModel === "string" ? raw.ttsModel : DEFAULT_TTS_CONFIG.ttsModel,
    ttsVoice: typeof raw?.ttsVoice === "string" ? raw.ttsVoice : DEFAULT_TTS_CONFIG.ttsVoice,
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

/* ============ Edge 神经语音（wss 直连，参考开源 edge-tts 协议） ============ */

const EDGE_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_WS_BASE =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_GEC_VERSION = "1-130.0.2849.68";

/** Sec-MS-GEC：Windows 文件时间（秒）取 5 分钟窗 + 受信令牌 的 SHA-256 大写十六进制 */
async function edgeSecMsGec(): Promise<string> {
  const ticksSeconds = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticksSeconds - (ticksSeconds % 300);
  const data = new TextEncoder().encode(`${rounded}${EDGE_TRUSTED_TOKEN}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** SSML 百分比：0.88 → "-12%"（慢），1.1 → "+10%" */
export function prosodyPercent(value: number): string {
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function edgeSsml(text: string, voice: string, rate: number, pitch: number): string {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${voice}'><prosody rate='${prosodyPercent(rate)}' pitch='${prosodyPercent(pitch)}'>` +
    `${escapeXml(text)}</prosody></voice></speak>`
  );
}

/** 测试注入点：默认真实 WebSocket；测试替换以避免真实网络 */
type WsFactory = (url: string) => WebSocket;
let wsFactory: WsFactory = (url) => new WebSocket(url);
export function __setEdgeTransportOverride(factory: WsFactory | null): void {
  wsFactory = factory ?? ((url) => new WebSocket(url));
}

/** 用 Audio 元素播放一段音频 URL，结束或出错时 resolve */
function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio playback error"));
    void audio.play().catch(reject);
  });
}

/**
 * Edge 神经语音合成（wss 直连）：成功朗读并 resolve(true)，任何失败 resolve(false)
 * 由调用方降级到系统语音。15 秒看门狗防止 onend 永不来。
 */
export async function edgeSpeak(
  text: string,
  voice: string,
  rate: number,
  pitch: number
): Promise<boolean> {
  if (typeof WebSocket === "undefined" || typeof crypto?.subtle === "undefined" || !text.trim()) {
    return false;
  }
  const gec = await edgeSecMsGec().catch(() => "");
  const url =
    `${EDGE_WS_BASE}?TrustedClientToken=${EDGE_TRUSTED_TOKEN}` +
    `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}` +
    `&ConnectionId=${crypto.randomUUID()}`;

  let audioUrl: string;
  try {
    audioUrl = await new Promise<string>((resolve, reject) => {
    const ws = wsFactory(url);
    const chunks: Uint8Array[] = [];
    const timer = window.setTimeout(() => {
      try { ws.close(); } catch { /* 已关闭 */ }
      reject(new Error("edge tts timeout"));
    }, 15000);
    const finish = (value: string) => {
      window.clearTimeout(timer);
      try { ws.close(); } catch { /* 已关闭 */ }
      resolve(value);
    };
    ws.binaryType = "arraybuffer";
    ws.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("edge tts error"));
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          if (chunks.length === 0) {
            window.clearTimeout(timer);
            reject(new Error("edge tts empty audio"));
            return;
          }
          const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
          finish(URL.createObjectURL(blob));
        }
        return;
      }
      const buffer = event.data as ArrayBuffer;
      if (buffer.byteLength < 2) return;
      const view = new DataView(buffer);
      const headerLength = view.getUint16(0);
      const header = new TextDecoder().decode(new Uint8Array(buffer, 2, headerLength));
      if (header.includes("Path:audio")) {
        chunks.push(new Uint8Array(buffer.slice(2 + headerLength)));
      }
    };
    ws.onopen = () => {
      const timestamp = new Date().toISOString();
      const requestId = crypto.randomUUID().replace(/-/g, "");
      ws.send(
        `X-Timestamp:${timestamp}
Content-Type:application/json; charset=utf-8
Path:speech.config

` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
      ws.send(
        `X-RequestId:${requestId}
Content-Type:application/ssml+xml
X-Timestamp:${timestamp}Z
Path:ssml

` +
          edgeSsml(text, voice, rate, pitch)
      );
    };
    });
  } catch {
    return false;
  }

  try {
    await playAudioUrl(audioUrl);
    return true;
  } catch {
    return false;
  }
}

/** 自定义 OpenAI 兼容 /audio/speech 端点合成（SiliconFlow CosyVoice2 / 自建 GPT-SoVITS 兼容层等） */
async function customSpeak(text: string, config: TtsConfig): Promise<boolean> {
  if (!config.ttsBaseUrl) return false;
  const base = config.ttsBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.ttsApiKey ? { Authorization: `Bearer ${config.ttsApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.ttsModel || DEFAULT_TTS_CONFIG.ttsModel,
      input: text,
      voice: config.ttsVoice || DEFAULT_TTS_CONFIG.ttsVoice,
      response_format: "mp3",
      speed: config.rate,
    }),
  });
  if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
  const blob = await response.blob();
  await playAudioUrl(URL.createObjectURL(blob));
  return true;
}

/**
 * 朗读一段话；禁用 / 环境不可用 / 出错时 resolve(false)。
 * 链路：Edge 神经语音（若选了云端声线）→ 系统 speechSynthesis 兜底。
 */
export async function speak(text: string): Promise<boolean> {
  const config = loadTtsConfig();
  if (!config.enabled || !text.trim()) return false;

  // 优先：自定义音色端点（用户配置的港台男播客克隆音色等）
  if (config.voiceURI === CUSTOM_VOICE && config.ttsBaseUrl) {
    try {
      if (await customSpeak(text, config)) return true;
    } catch {
      // 失败 → 回落免费云端男声（云希），再回落系统语音
      if (await edgeSpeak(text, "zh-CN-YunxiNeural", config.rate, config.pitch)) return true;
    }
  }

  if (!EDGE_VOICES.some((voice) => voice.uri === config.voiceURI)) {
    // 系统声线
    const synth = synthOrNull();
    if (!synth) return false;
    return new Promise<boolean>((resolve) => {
      try {
        synth.cancel();
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

  // 云端声线：Edge 失败 → 系统兜底
  const edgeOk = await edgeSpeak(text, config.voiceURI, config.rate, config.pitch);
  if (edgeOk) return true;
  const synth = synthOrNull();
  if (!synth) return false;
  return new Promise<boolean>((resolve) => {
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = resolveVoice(synth, "");
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
