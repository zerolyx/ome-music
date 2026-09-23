/* ============ 命令面板（Kimi / Folia 式 Ctrl+K） ============
 * 纯逻辑（模糊匹配 / 最近使用排序）与 UI 分离，便于单测。
 */

import { signal } from "@preact/signals";

export interface Command {
  id: string;
  title: string;
  group: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export const paletteOpen = signal(false);

const RECENT_KEY = "ome.palette.recent";
const RECENT_LIMIT = 8;

export function openPalette(): void {
  paletteOpen.value = true;
}

export function closePalette(): void {
  paletteOpen.value = false;
}

/** 子序列模糊匹配：命中返回分数（越高越靠前），未命中返回 null */
export function matchScore(title: string, query: string): number | null {
  const text = title.toLowerCase();
  const want = query.trim().toLowerCase();
  if (!want) return 0;
  let score = 0;
  let last = -1;
  let streak = 0;
  for (const char of want) {
    const index = text.indexOf(char, last + 1);
    if (index === -1) return null;
    streak = index === last + 1 ? streak + 1 : 0;
    score += 1 + streak * 2;
    if (index === 0) score += 3; // 前缀加权
    last = index;
  }
  return score;
}

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** 记录一次执行：去重置顶，截断到上限 */
export function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** 过滤 + 排序：分数优先，同分最近使用靠前 */
export function filterCommands(commands: Command[], query: string, recent: string[]): Command[] {
  const scored: Array<{ command: Command; score: number; recentIndex: number }> = [];
  for (const command of commands) {
    const score = matchScore(command.title, query);
    if (score === null) continue;
    const recentIndex = recent.indexOf(command.id);
    scored.push({ command, score, recentIndex });
  }
  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const ai = a.recentIndex === -1 ? Number.MAX_SAFE_INTEGER : a.recentIndex;
      const bi = b.recentIndex === -1 ? Number.MAX_SAFE_INTEGER : b.recentIndex;
      return ai - bi;
    })
    .map((item) => item.command);
}

/** 执行命令：记录最近使用并关闭面板（run 自身决定后续行为） */
export async function runCommand(command: Command): Promise<void> {
  pushRecent(command.id);
  closePalette();
  await command.run();
}
