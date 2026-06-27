import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../library/libraryApi";

export type MusicUnderstandingPurpose =
  "playlist_analysis" | "preference_summary" | "recommendation_reason";

export interface LlmProviderConfig {
  providerName: string;
  baseUrl: string;
  model: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  configured: boolean;
}

export interface SaveLlmProviderConfigPayload {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface FetchLlmModelsPayload {
  baseUrl: string;
  apiKey?: string;
}

export interface LlmModelListResponse {
  models: string[];
}

export interface LlmTextRequest {
  purpose: MusicUnderstandingPurpose;
  systemPrompt: string;
  userPrompt: string;
  fallbackText: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmTextResponse {
  providerName: string;
  model: string;
  text: string;
}

export interface MusicUnderstandingProvider {
  readonly providerName: string;
  generateText(request: LlmTextRequest): Promise<string>;
}

const emptyProviderConfig: LlmProviderConfig = {
  providerName: "",
  baseUrl: "",
  model: "",
  maskedApiKey: "",
  hasApiKey: false,
  configured: false,
};

let devPreviewConfig = emptyProviderConfig;

export async function getLlmProviderConfig(): Promise<LlmProviderConfig> {
  if (!isTauriRuntime()) {
    return devPreviewConfig;
  }

  return invoke<LlmProviderConfig>("get_llm_provider_config");
}

export async function saveLlmProviderConfig(
  payload: SaveLlmProviderConfigPayload,
): Promise<LlmProviderConfig> {
  if (!isTauriRuntime()) {
    devPreviewConfig = {
      providerName: payload.providerName,
      baseUrl: payload.baseUrl,
      model: payload.model,
      maskedApiKey: payload.apiKey ? "••••••••••••" : devPreviewConfig.maskedApiKey,
      hasApiKey: Boolean(payload.apiKey) || devPreviewConfig.hasApiKey,
      configured: false,
    };
    return devPreviewConfig;
  }

  return invoke<LlmProviderConfig>("save_llm_provider_config", { payload });
}

export async function fetchLlmModels(payload: FetchLlmModelsPayload): Promise<string[]> {
  if (!isTauriRuntime()) {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    return ["gpt-4.1-mini", "deepseek-chat", "qwen-plus"];
  }

  const response = await invoke<LlmModelListResponse>("fetch_llm_models", { payload });
  return response.models;
}

export class ConfiguredLlmProvider implements MusicUnderstandingProvider {
  readonly providerName = "configured";

  async generateText(request: LlmTextRequest): Promise<string> {
    if (!isTauriRuntime()) {
      throw new Error("Provider calls are only available in the desktop app.");
    }

    const response = await invoke<LlmTextResponse>("generate_llm_text", {
      payload: {
        purpose: request.purpose,
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      },
    });

    return response.text;
  }
}

export class MockLlmProvider implements MusicUnderstandingProvider {
  readonly providerName = "local";

  async generateText(request: LlmTextRequest): Promise<string> {
    return request.fallbackText;
  }
}

export async function requestMusicUnderstanding(request: LlmTextRequest): Promise<string> {
  const configuredProvider = new ConfiguredLlmProvider();

  try {
    return await configuredProvider.generateText(request);
  } catch (error) {
    console.info("music understanding fallback", error);
    return new MockLlmProvider().generateText(request);
  }
}
