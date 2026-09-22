/* ============ 私人 DJ 状态 ============
 * 抽屉开合、对话消息、LLM 配置、TTS 播报与动作执行。
 * 动作执行走网易云搜索 + 现有播放器， DJ 本身不碰播放原语。
 */

import { signal, type Signal } from "@preact/signals";
import {
  djChat,
  djGetConfig,
  djGreeting,
  djSaveConfig,
  type DjAction,
  type DjConfigState,
  type DjSaveConfigPayload,
} from "../lib/api";
import { results, search as neteaseSearch } from "./netease";
import { playTracks, queue } from "./player";
import { speak } from "./tts";

export interface DjMsg {
  id: number;
  role: "user" | "dj";
  text: string;
  ts: number;
}

const MOOD_KEY = "ome.dj.mood";

export const drawerOpen = signal(false);
export const messages: Signal<DjMsg[]> = signal([]);
export const djConfig = signal<DjConfigState | null>(null);
export const thinking = signal(false);
export const ttsSpeaking = signal(false);
export const lastError = signal<string | null>(null);

let msgSeq = 0;
const nextMsgId = () => ++msgSeq;

const toMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let configLoaded = false;

export async function loadConfig(): Promise<DjConfigState | null> {
  try {
    const config = await djGetConfig();
    djConfig.value = config;
    configLoaded = true;
    return config;
  } catch {
    // 非 Tauri 环境（浏览器预览）或读取失败：保持 null，按未配置处理
    return null;
  }
}

export async function saveConfig(payload: DjSaveConfigPayload): Promise<DjConfigState | null> {
  lastError.value = null;
  try {
    const config = await djSaveConfig(payload);
    djConfig.value = config;
    configLoaded = true;
    return config;
  } catch (e) {
    lastError.value = toMessage(e);
    return null;
  }
}

export function openDrawer(): void {
  drawerOpen.value = true;
  if (!configLoaded) void loadConfig();
}

export function closeDrawer(): void {
  drawerOpen.value = false;
}

let speakSession = 0;

/** 开播问候：未配置 / 不可用时整体静默，不打扰 */
export async function greet(): Promise<void> {
  const config = configLoaded ? djConfig.value : await loadConfig();
  if (!config?.configured) return;
  try {
    const { say } = await djGreeting();
    if (!say) return;
    messages.value = [...messages.value, { id: nextMsgId(), role: "dj", text: say, ts: Date.now() }];
    speakAside(say);
  } catch {
    // 问候失败保持安静：电台不该以报错开场
  }
}

export async function ask(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || thinking.value) return;
  lastError.value = null;
  messages.value = [...messages.value, { id: nextMsgId(), role: "user", text: trimmed, ts: Date.now() }];
  thinking.value = true;
  try {
    const reply = await djChat(trimmed);
    if (reply.say) {
      messages.value = [...messages.value, { id: nextMsgId(), role: "dj", text: reply.say, ts: Date.now() }];
      speakAside(reply.say);
    }
    await executeActions(reply.actions);
  } catch (e) {
    lastError.value = toMessage(e);
  } finally {
    thinking.value = false;
  }
}

/** 朗读但不阻塞对话流；同一时间只保留最新一句 */
function speakAside(text: string): void {
  const session = ++speakSession;
  ttsSpeaking.value = true;
  void speak(text).finally(() => {
    if (session === speakSession) ttsSpeaking.value = false;
  });
}

/** 逐条执行 LLM 动作；query 走网易云搜索，mood 只记氛围提示 */
async function executeActions(actions: DjAction[]): Promise<void> {
  for (const action of actions ?? []) {
    if (!action || typeof action.type !== "string") continue;
    switch (action.type) {
      case "search_and_play":
      case "play":
        if (action.query) {
          await neteaseSearch(action.query);
          if (results.value.length > 0) playTracks(results.value, 0);
        }
        break;
      case "queue":
        if (action.query) {
          await neteaseSearch(action.query);
          if (results.value.length > 0) queue.value = [...queue.value, ...results.value];
        }
        break;
      case "mood":
        if (action.mood) {
          try {
            localStorage.setItem(MOOD_KEY, action.mood);
          } catch {
            // 存储不可用时放弃氛围记忆，不影响对话
          }
        }
        break;
      default:
        break; // none / 未知类型：只说话，不动作
    }
  }
}
