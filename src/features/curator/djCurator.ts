import type { DesiredMusicVibe, JournalMood, Track, TrackMood } from "../../types/music";
import { saveMoodEntry } from "../library/libraryApi";
import { requestMusicUnderstanding } from "../llm/provider";
import { cleanCuratorText, guardCuratorReply } from "./curatorLanguageGuard";

export interface DjNote {
  id: string;
  role: "listener" | "curator";
  text: string;
  createdAt: string;
}

export interface CuratorSignal {
  mood: JournalMood;
  moodSignal: TrackMood;
  desiredVibe?: DesiredMusicVibe;
}

const CURATOR_SYSTEM_PROMPT = [
  "You are a private late-night music curator and radio DJ.",
  "You understand both Chinese and English input.",
  "You must always reply in English.",
  "Your voice is warm, nostalgic, elegant, slightly British, like an old Hong Kong radio host with a vintage English tone.",
  "Never mention AI, model, algorithm, or user profile.",
  "Your job is to listen, sense the user's mood, understand their music taste, and recommend songs with taste and restraint.",
  "Do not write stage directions, markdown, roleplay actions, or sound effects.",
  "Keep replies concise, intimate, and musical."
].join(" ");

const CJK_TEXT = /[\u3400-\u9fff]/;

export async function askCurator(input: string, track: Track | null, notes: DjNote[]): Promise<string> {
  const fallbackText = buildFallbackReply(input, track);
  const recentNotes = notes.slice(-5).map((note) => `${note.role}: ${note.text}`);
  const trackContext = track
    ? {
        title: track.title,
        artist: track.artist,
        album: track.album,
        genres: track.genres,
        moods: track.moods
      }
    : null;

  const text = await requestMusicUnderstanding({
    purpose: "recommendation_reason",
    systemPrompt: CURATOR_SYSTEM_PROMPT,
    userPrompt: [
      "Reply to the listener in English only.",
      "Do not use bullet points unless the listener asks for a list.",
      "Stay under 45 words.",
      `Current track: ${JSON.stringify(trackContext)}`,
      `Recent exchange: ${recentNotes.join("\n")}`,
      `Listener: ${input}`
    ].join("\n"),
    fallbackText,
    maxTokens: 120,
    temperature: 0.78
  });

  const reply = sanitizeCuratorReply(text);
  return reply && !CJK_TEXT.test(reply) ? reply : fallbackText;
}

export async function recordCuratorSignal(input: string): Promise<void> {
  const signal = inferCuratorSignal(input);
  const today = new Date().toISOString().slice(0, 10);

  await saveMoodEntry({
    date: today,
    mood: signal.mood,
    moodSignal: signal.moodSignal,
    desiredVibe: signal.desiredVibe,
    note: buildPrivateNote(input, signal)
  });
}

export function sanitizeCuratorReply(text: string): string {
  return cleanCuratorText(text);
}

function buildFallbackReply(input: string, track: Track | null): string {
  const signal = inferCuratorSignal(input);
  const title = track?.title ? ` ${guardCuratorReply("Let this track keep the room softly lit.", { track }).spokenText}` : "";

  if (signal.moodSignal === "melancholy" || signal.moodSignal === "sad") {
    return `Easy now. We will keep the needle low and let the night take its time.${title}`;
  }

  if (signal.moodSignal === "anxious" || signal.moodSignal === "tired") {
    return `Take the slower lane, darling. Something warm, unhurried, and a little worn at the edges will do.${title}`;
  }

  if (signal.moodSignal === "energetic" || signal.moodSignal === "excited" || signal.moodSignal === "happy") {
    return `There is a little gold in the air tonight. Keep it bright, but never too loud.${title}`;
  }

  return `Stay with the room a moment longer. A good song should arrive like a soft lamp in the rain.${title}`;
}

function inferCuratorSignal(input: string): CuratorSignal {
  const text = input.toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

  if (hasAny(["焦虑", "慌", "anxious", "nervous", "overwhelmed"])) {
    return { mood: "焦虑" as JournalMood, moodSignal: "anxious", desiredVibe: "安静氛围" as DesiredMusicVibe };
  }

  if (hasAny(["累", "疲惫", "困", "tired", "exhausted", "drained"])) {
    return { mood: "疲惫" as JournalMood, moodSignal: "tired", desiredVibe: "安静氛围" as DesiredMusicVibe };
  }

  if (hasAny(["伤感", "难过", "sad", "blue", "melancholy", "lonely"])) {
    return { mood: "伤感" as JournalMood, moodSignal: "melancholy", desiredVibe: "情绪陪伴" as DesiredMusicVibe };
  }

  if (hasAny(["兴奋", "激动", "excited", "electric", "alive"])) {
    return { mood: "兴奋" as JournalMood, moodSignal: "excited", desiredVibe: "能量提升" as DesiredMusicVibe };
  }

  if (hasAny(["开心", "快乐", "happy", "good mood", "bright"])) {
    return { mood: "开心" as JournalMood, moodSignal: "happy", desiredVibe: "轻快明亮" as DesiredMusicVibe };
  }

  if (hasAny(["专注", "工作", "学习", "focus", "study", "work"])) {
    return { mood: "平静" as JournalMood, moodSignal: "focused", desiredVibe: "专注背景" as DesiredMusicVibe };
  }

  return { mood: "平静" as JournalMood, moodSignal: "calm", desiredVibe: "安静氛围" as DesiredMusicVibe };
}

function buildPrivateNote(input: string, signal: CuratorSignal): string {
  const compactInput = input.replace(/\s+/g, " ").trim().slice(0, 160);
  return `Curator signal: ${signal.moodSignal}. Listener said: ${compactInput}`;
}
