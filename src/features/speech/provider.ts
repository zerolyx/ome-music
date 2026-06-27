import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../library/libraryApi";

export type SpeechProviderName = "off" | "browser" | "curator";

export interface SpeechProviderConfig {
  sttProvider: SpeechProviderName;
  ttsProvider: SpeechProviderName;
  voice: string;
  languageDetection: boolean;
  sttModel?: string;
  ttsModel?: string;
}

export interface SpeechVoiceOption {
  id: string;
  name: string;
  lang: string;
}

export interface SpeechPlaybackCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export interface SpeechRecordingClip {
  base64: string;
  mimeType: string;
  durationMs: number;
}

export interface SpeechRecordingSession {
  startedAt: number;
  stop: () => Promise<SpeechRecordingClip>;
  cancel: () => void;
}

interface SpeechTranscriptionResponse {
  text: string;
}

interface SpeechSynthesisResponse {
  audioDataUrl: string;
  mimeType: string;
}

const STORAGE_KEY = "ome.speech.provider";

const defaultSpeechConfig: SpeechProviderConfig = {
  sttProvider: "curator",
  ttsProvider: "curator",
  voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
  languageDetection: true,
  sttModel: "FunAudioLLM/SenseVoiceSmall",
  ttsModel: "FunAudioLLM/CosyVoice2-0.5B"
};

export function getSpeechProviderConfig(): SpeechProviderConfig {
  if (typeof window === "undefined") {
    return defaultSpeechConfig;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSpeechConfig;
    const parsed = JSON.parse(raw) as Partial<SpeechProviderConfig>;
    const sttProvider = normalizeProvider(parsed.sttProvider);
    const ttsProvider = normalizeProvider(parsed.ttsProvider);

    const ttsModel = typeof parsed.ttsModel === "string" && parsed.ttsModel.trim() ? parsed.ttsModel : defaultSpeechConfig.ttsModel;
    const rawVoice = typeof parsed.voice === "string" && parsed.voice.trim() ? parsed.voice : defaultSpeechConfig.voice;

    return {
      sttProvider: sttProvider === "off" ? "curator" : sttProvider,
      ttsProvider: ttsProvider === "off" ? "curator" : ttsProvider,
      voice: normalizeCuratorVoice(rawVoice, ttsModel),
      languageDetection: parsed.languageDetection !== false,
      sttModel: typeof parsed.sttModel === "string" && parsed.sttModel.trim() ? parsed.sttModel : defaultSpeechConfig.sttModel,
      ttsModel
    };
  } catch {
    return defaultSpeechConfig;
  }
}

export function saveSpeechProviderConfig(config: SpeechProviderConfig): SpeechProviderConfig {
  const ttsModel = config.ttsModel?.trim() || defaultSpeechConfig.ttsModel;
  const normalized: SpeechProviderConfig = {
    sttProvider: normalizeProvider(config.sttProvider),
    ttsProvider: normalizeProvider(config.ttsProvider),
    voice: normalizeCuratorVoice(config.voice, ttsModel),
    languageDetection: config.languageDetection,
    sttModel: config.sttModel?.trim() || defaultSpeechConfig.sttModel,
    ttsModel
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function listSpeechVoices(): Promise<SpeechVoiceOption[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const readVoices = () => {
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
        .map((voice) => ({
          id: voice.name,
          name: voice.name,
          lang: voice.lang
        }));
      resolve(voices);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      readVoices();
      return;
    }

    window.speechSynthesis.onvoiceschanged = readVoices;
    window.setTimeout(readVoices, 800);
  });
}

export async function startSpeechRecording(onLevel: (level: number) => void): Promise<SpeechRecordingSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("No microphone was found.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("No microphone was found.");
    }
    throw new Error("Microphone permission is required.");
  }

  const mimeType = pickRecordingMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const startedAt = performance.now();
  let animationFrame = 0;
  let lastLevelAt = 0;
  let stopped = false;
  let smoothedLevel = 0;

  const updateLevel = (now: number) => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      energy += normalized * normalized;
    }
    const rms = Math.sqrt(energy / samples.length);
    const gated = Math.max(0, Math.min(1, (rms - 0.025) * 5.5));
    smoothedLevel += (gated - smoothedLevel) * (gated > smoothedLevel ? 0.34 : 0.12);
    if (now - lastLevelAt >= 50) {
      onLevel(smoothedLevel);
      lastLevelAt = now;
    }
    animationFrame = window.requestAnimationFrame(updateLevel);
  };

  const cleanup = () => {
    window.cancelAnimationFrame(animationFrame);
    onLevel(0);
    stream.getTracks().forEach((track) => track.stop());
    source.disconnect();
    void audioContext.close().catch(() => undefined);
  };

  let stopResolve: ((clip: SpeechRecordingClip) => void) | null = null;
  let stopReject: ((error: Error) => void) | null = null;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    cleanup();
    const error = new Error("The microphone line went quiet.");
    if (stopReject) {
      stopReject(error);
      stopResolve = null;
      stopReject = null;
    }
  };
  recorder.start(250);
  animationFrame = window.requestAnimationFrame(updateLevel);

  return {
    startedAt,
    stop: () => {
      if (stopped || recorder.state === "inactive") {
        return Promise.reject(new Error("The recording has already stopped."));
      }
      stopped = true;
      return new Promise<SpeechRecordingClip>((resolve, reject) => {
        stopResolve = resolve;
        stopReject = reject;
        recorder.onstop = async () => {
          cleanup();
          const durationMs = performance.now() - startedAt;
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          if (durationMs < 500 || blob.size < 300) {
            reject(new Error("The recording is too short."));
            stopResolve = null;
            stopReject = null;
            return;
          }
          resolve({
            base64: await blobToBase64(blob),
            mimeType: blob.type || "audio/webm",
            durationMs
          });
          stopResolve = null;
          stopReject = null;
        };
        recorder.stop();
      });
    },
    cancel: () => {
      if (stopped) return;
      stopped = true;
      stopResolve = null;
      stopReject = null;
      recorder.onerror = null;
      recorder.onstop = cleanup;
      if (recorder.state === "inactive") cleanup();
      else recorder.stop();
    }
  };
}

export async function transcribeRecordedSpeech(
  recording: SpeechRecordingClip,
  config = getSpeechProviderConfig()
): Promise<string> {
  if (config.sttProvider !== "curator" || !isTauriRuntime()) {
    throw new Error("Voice transcription needs a configured speech source.");
  }
  const response = await invoke<SpeechTranscriptionResponse>("transcribe_speech_audio", {
    payload: {
      audioBase64: recording.base64,
      mimeType: recording.mimeType,
      model: config.sttModel,
      language: config.languageDetection ? undefined : "en"
    }
  });
  const text = response.text.trim();
  if (!text) throw new Error("Transcription failed. Please try again.");
  return text;
}

export async function speakCuratorText(
  text: string,
  config = getSpeechProviderConfig(),
  callbacks: SpeechPlaybackCallbacks = {}
): Promise<boolean> {
  if (!text.trim()) return false;

  if (config.ttsProvider === "curator" && isTauriRuntime()) {
    try {
      const response = await invoke<SpeechSynthesisResponse>("synthesize_curator_speech", {
        payload: {
          text,
          model: config.ttsModel,
          voice: config.voice || defaultSpeechConfig.voice
        }
      });
      await playAudioDataUrl(response.audioDataUrl, callbacks);
      return true;
    } catch (error) {
      console.info("curator voice source fallback", error);
    }
  }

  if (config.ttsProvider === "off") {
    return false;
  }

  return speakWithBrowser(text, config, callbacks);
}

function pickRecordingMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function speakWithBrowser(text: string, config: SpeechProviderConfig, callbacks: SpeechPlaybackCallbacks): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = findVoice(voices, config.voice);
  utterance.lang = utterance.voice?.lang || "en-GB";
  utterance.rate = 0.86;
  utterance.pitch = 0.88;
  utterance.volume = 0.88;
  utterance.onstart = () => callbacks.onStart?.();
  utterance.onend = () => callbacks.onEnd?.();
  utterance.onerror = () => {
    callbacks.onError?.();
    callbacks.onEnd?.();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

function playAudioDataUrl(dataUrl: string, callbacks: SpeechPlaybackCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(dataUrl);
    const release = () => {
      audio.pause();
      audio.src = "";
    };
    audio.onplay = () => callbacks.onStart?.();
    audio.onended = () => {
      release();
      callbacks.onEnd?.();
      resolve();
    };
    audio.onerror = () => {
      release();
      callbacks.onError?.();
      callbacks.onEnd?.();
      reject(new Error("The curator voice could not be played."));
    };
    void audio.play().catch((error) => {
      release();
      callbacks.onError?.();
      callbacks.onEnd?.();
      reject(error);
    });
  });
}

function findVoice(voices: SpeechSynthesisVoice[], selectedVoice: string): SpeechSynthesisVoice | null {
  if (selectedVoice) {
    const exact = voices.find((voice) => voice.name === selectedVoice);
    if (exact) return exact;
  }

  return (
    voices.find((voice) => /uk|british|england|daniel|serena|george|arthur/i.test(`${voice.name} ${voice.lang}`)) ??
    voices.find((voice) => voice.lang.toLowerCase() === "en-gb") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

function normalizeProvider(value: unknown): SpeechProviderName {
  return value === "browser" || value === "curator" || value === "off" ? value : "curator";
}

function normalizeCuratorVoice(voice: string, ttsModel?: string): string {
  const trimmed = voice.trim();
  if (!trimmed) return defaultSpeechConfig.voice;
  if (trimmed.includes(":") || !ttsModel?.includes("CosyVoice")) return trimmed;
  return `${ttsModel}:${trimmed}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.readAsDataURL(blob);
  });
}
