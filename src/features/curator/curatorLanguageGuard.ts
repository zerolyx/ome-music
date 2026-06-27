import type { Track } from "../../types/music";

export interface CuratorReply {
  displayText: string;
  spokenText: string;
  originalTrackTitle?: string;
  translatedTrackTitle?: string;
  languageChecked: boolean;
}

export interface CuratorLanguageGuardContext {
  track?: Track | null;
  originalTrackTitle?: string | null;
}

const CJK_TEXT = /[\u3400-\u9fff]/;
const CJK_CHARS = /[\u3400-\u9fff]+/g;
export const FORBIDDEN_REPLY_WORDS = /\b(a\.?i\.?|assistant|algorithm|model|user profile|tool call)\b/gi;

const TITLE_TRANSLATIONS: Record<string, string> = {
  蝴蝶: "Butterfly",
  晴天: "Sunny Day",
  稻香: "Rice Field",
  夜曲: "Nocturne",
  那些年: "Those Years",
  小幸运: "A Little Happiness",
  后来: "Later",
  红豆: "Red Bean",
  倒带: "Rewind",
  江南: "River South",
  她说: "She Says",
  可惜没如果: "If Only",
  修炼爱情: "Practice Love"
};

export function guardCuratorReply(text: string, context: CuratorLanguageGuardContext = {}): CuratorReply {
  const originalTrackTitle = context.originalTrackTitle || context.track?.title || undefined;
  const translatedTrackTitle = originalTrackTitle ? translateTrackTitle(originalTrackTitle) : undefined;
  const displayText = normalizeDisplayText(text, originalTrackTitle, translatedTrackTitle);
  const spokenText = normalizeSpokenText(displayText, originalTrackTitle, translatedTrackTitle);

  return {
    displayText,
    spokenText,
    originalTrackTitle,
    translatedTrackTitle,
    languageChecked: true
  };
}

export function isMostlyEnglishForSpeech(text: string): boolean {
  if (!text.trim()) return false;
  return !CJK_TEXT.test(text);
}

export function englishTrackReference(track: Track | null): string {
  if (!track) return "the first record";
  if (CJK_TEXT.test(track.title)) return "a Chinese track";
  return track.title;
}

function normalizeDisplayText(text: string, originalTrackTitle?: string, translatedTrackTitle?: string): string {
  const cleaned = cleanCuratorText(text);
  if (!CJK_TEXT.test(cleaned)) return cleaned || fallbackLine(originalTrackTitle);

  let normalized = cleaned;
  if (originalTrackTitle && normalized.includes(originalTrackTitle)) {
    const replacement = translatedTrackTitle && translatedTrackTitle !== originalTrackTitle
      ? `${translatedTrackTitle}`
      : "this Chinese track";
    normalized = normalized.split(originalTrackTitle).join(replacement);
  }

  if (!CJK_TEXT.test(normalized)) return normalized;
  return fallbackLine(originalTrackTitle);
}

function normalizeSpokenText(text: string, originalTrackTitle?: string, translatedTrackTitle?: string): string {
  let spoken = cleanCuratorText(text);

  if (originalTrackTitle) {
    const replacement = translatedTrackTitle && translatedTrackTitle !== originalTrackTitle
      ? translatedTrackTitle
      : "this Chinese track";
    spoken = spoken.split(originalTrackTitle).join(replacement);
  }

  const hadCjk = CJK_TEXT.test(spoken);
  spoken = spoken
    .replace(/《[^》]{1,80}》/g, translatedTrackTitle || "this track")
    .replace(CJK_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!isMostlyEnglishForSpeech(spoken) || (hadCjk && spoken.length < 24)) {
    return fallbackLine(originalTrackTitle);
  }

  return spoken || fallbackLine(originalTrackTitle);
}

export function cleanCuratorText(text: string): string {
  return text
    .replace(FORBIDDEN_REPLY_WORDS, "the old booth")
    .replace(/\*[^*]{1,120}\*/g, "")
    .replace(/\([^)]{1,120}\)/g, "")
    .replace(/["“”]/g, "")
    .replace(/^[\s:;,-]+/, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateTrackTitle(title: string): string {
  const trimmed = title.trim();
  if (!CJK_TEXT.test(trimmed)) return trimmed;
  return TITLE_TRANSLATIONS[trimmed] || "";
}

function fallbackLine(originalTrackTitle?: string): string {
  if (originalTrackTitle && CJK_TEXT.test(originalTrackTitle)) {
    return "I have found a Chinese track with the right feeling. Let it breathe in the room for a while.";
  }

  return "I have found something that suits the room. Let it play for a while.";
}
