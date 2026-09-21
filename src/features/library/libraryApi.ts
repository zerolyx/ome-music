import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { mockProfile, mockTracks } from "../../data/mockLibrary";
import type {
  DesiredMusicVibe,
  JournalMood,
  MoodEntry,
  Track,
  TrackMood,
  UserMusicProfile,
} from "../../types/music";

export type PlaybackEventType =
  "play" | "pause" | "skip" | "completed" | "liked" | "unliked" | "replayed";

export interface ImportResult {
  directory: string | null;
  importedCount: number;
  skippedCount: number;
  tracks: Track[];
}

export interface PlaybackEventPayload {
  trackId: string;
  eventType: PlaybackEventType;
  positionSeconds: number;
}

export interface SaveMoodEntryPayload {
  date: string;
  mood: JournalMood;
  moodSignal: TrackMood;
  note: string;
  desiredVibe?: DesiredMusicVibe;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function listLocalTracks(): Promise<Track[]> {
  if (!isTauriRuntime()) {
    return mockTracks;
  }

  return invoke<Track[]>("list_tracks");
}

export async function getUserProfile(): Promise<UserMusicProfile> {
  if (!isTauriRuntime()) {
    return mockProfile;
  }

  return invoke<UserMusicProfile>("get_user_profile");
}

export async function getTodayMoodEntry(): Promise<MoodEntry | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<MoodEntry | null>("get_today_mood_entry");
}

export async function listMoodEntries(limit = 30): Promise<MoodEntry[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  return invoke<MoodEntry[]>("list_mood_entries", { limit });
}

export async function saveMoodEntry(payload: SaveMoodEntryPayload): Promise<MoodEntry> {
  if (!isTauriRuntime()) {
    return {
      id: `mock-${payload.date}`,
      date: payload.date,
      mood: payload.mood,
      moodSignal: payload.moodSignal,
      note: payload.note,
      desiredVibe: payload.desiredVibe,
      privateTags: [payload.moodSignal],
      recommendedTrackIds: [],
      createdAt: new Date().toISOString(),
    };
  }

  return invoke<MoodEntry>("save_mood_entry", { payload });
}

export async function importMusicFolder(): Promise<ImportResult> {
  if (!isTauriRuntime()) {
    return {
      directory: null,
      importedCount: mockTracks.length,
      skippedCount: 0,
      tracks: mockTracks,
    };
  }

  return invoke<ImportResult>("import_music_folder");
}

export async function recordPlaybackEvent(payload: PlaybackEventPayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("record_playback_event", { payload });
}

export async function setTrackLiked(
  trackId: string,
  liked: boolean,
  positionSeconds: number,
): Promise<Track[]> {
  if (!isTauriRuntime()) {
    return mockTracks.map((track) => (track.id === trackId ? { ...track, liked } : track));
  }

  return invoke<Track[]>("set_track_liked", { trackId, liked, positionSeconds });
}

export function toPlayableSrc(track: Track): string {
  if (track.filePath.startsWith("unavailable:")) {
    return "";
  }

  if (/^https?:\/\//i.test(track.filePath)) {
    return track.filePath;
  }

  if (!isTauriRuntime()) {
    return track.filePath;
  }

  return convertFileSrc(track.filePath);
}

export function isTrackUnavailable(track: Track): boolean {
  return track.filePath.startsWith("unavailable:");
}
