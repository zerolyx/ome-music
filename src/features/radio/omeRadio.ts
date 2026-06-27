import type { TasteNotes } from "../musicSources/provider";
import type { Track } from "../../types/music";

export type RadioSessionStatus = "idle" | "preparing" | "playing" | "paused" | "ended";

export type RadioSessionSource = "taste_notes" | "user_prompt" | "time_context" | "mood_context";

export type RadioKind =
  "daily" | "lateNight" | "rainyDay" | "youth" | "quietRoom" | "discovery" | "artist" | "memory";

export interface RadioHostNote {
  id: string;
  text: string;
  createdAt: string;
}

export type RadioSegmentType = "cold_open" | "bridge" | "quick_touch" | "silence";
export type RadioSegmentPosition = "before_track" | "between_tracks" | "after_track" | "immediate";

export interface RadioSegment {
  id: string;
  type: RadioSegmentType;
  position: RadioSegmentPosition;
  text: string;
  trackIndex?: number;
  afterTrackIndex?: number;
  beforeTrackIndex?: number;
}

export interface RadioSession {
  id: string;
  title: string;
  theme: string;
  mood: string;
  scene: string;
  createdAt: string;
  source: RadioSessionSource;
  kind: RadioKind;
  tracks: Track[];
  segments: RadioSegment[];
  hostNotes: RadioHostNote[];
  currentTrackIndex: number;
  status: RadioSessionStatus;
}

interface BuildRadioSessionInput {
  tracks: Track[];
  tasteNotes?: TasteNotes | null;
  kind?: RadioKind;
  theme?: string;
  mood?: string;
  scene?: string;
  source?: RadioSessionSource;
  trackCount?: number;
}

const RADIO_TITLES: Record<RadioKind, string> = {
  daily: "Daily Radio",
  lateNight: "Late Room Radio",
  rainyDay: "Rain Window Radio",
  youth: "Youth-Tinted Radio",
  quietRoom: "Quiet Room",
  discovery: "Discovery Radio",
  artist: "Artist Radio",
  memory: "Memory Radio",
};

export function buildOmeRadioSession({
  tracks,
  tasteNotes,
  kind = inferRadioKind(),
  theme,
  mood,
  scene,
  source = tasteNotes ? "taste_notes" : "time_context",
  trackCount = 12,
}: BuildRadioSessionInput): RadioSession {
  const playableTracks = tracks.filter(
    (track) =>
      !track.filePath.startsWith("unavailable:") && track.unavailableReason !== "trial_only",
  );
  const resolvedTheme = theme || themeFromTaste(kind, tasteNotes);
  const resolvedMood = mood || moodFromKind(kind, tasteNotes);
  const resolvedScene = scene || sceneFromKind(kind);
  const selectedTracks = selectRadioTracks(playableTracks, kind, resolvedMood, trackCount);
  const now = new Date().toISOString();
  const segments = buildRadioSegments({
    kind,
    title: RADIO_TITLES[kind],
    theme: resolvedTheme,
    mood: resolvedMood,
    scene: resolvedScene,
    tracks: selectedTracks,
    tasteNotes,
  });

  return {
    id: `radio-${kind}-${Date.now()}`,
    title: RADIO_TITLES[kind],
    theme: resolvedTheme,
    mood: resolvedMood,
    scene: resolvedScene,
    createdAt: now,
    source,
    kind,
    tracks: selectedTracks,
    segments,
    hostNotes: [
      {
        id: `note-${Date.now()}`,
        text: hostNoteFor(kind, tasteNotes, selectedTracks),
        createdAt: now,
      },
    ],
    currentTrackIndex: 0,
    status: selectedTracks.length ? "preparing" : "idle",
  };
}

export function getRadioSegmentsForTrackStart(
  session: RadioSession,
  trackIndex: number,
): RadioSegment[] {
  return session.segments.filter(
    (segment) => segment.position === "before_track" && segment.trackIndex === trackIndex,
  );
}

export function getRadioSegmentsBetweenTracks(
  session: RadioSession,
  afterTrackIndex: number,
  beforeTrackIndex: number,
): RadioSegment[] {
  return session.segments.filter(
    (segment) =>
      segment.position === "between_tracks" &&
      segment.afterTrackIndex === afterTrackIndex &&
      segment.beforeTrackIndex === beforeTrackIndex,
  );
}

export function refillOmeRadioSession(
  session: RadioSession,
  tracks: Track[],
  tasteNotes?: TasteNotes | null,
  trackCount = 4,
): RadioSession {
  const existingIds = new Set(session.tracks.map((track) => track.id));
  const playableTracks = tracks.filter(
    (track) =>
      !existingIds.has(track.id) &&
      !track.filePath.startsWith("unavailable:") &&
      track.unavailableReason !== "trial_only",
  );
  const newTracks = selectRadioTracks(playableTracks, session.kind, session.mood, trackCount);
  if (newTracks.length === 0) return session;

  const offset = session.tracks.length;
  const refillSegments = buildRadioSegments({
    kind: session.kind,
    title: session.title,
    theme: session.theme,
    mood: session.mood,
    scene: session.scene,
    tracks: newTracks,
    tasteNotes,
    startIndex: offset,
    includeColdOpen: false,
  });

  return {
    ...session,
    tracks: [...session.tracks, ...newTracks],
    segments: [...session.segments, ...refillSegments],
    hostNotes: [
      ...session.hostNotes,
      {
        id: `note-refill-${Date.now()}`,
        text: "I have placed a few more records quietly behind the current one.",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function updateRadioSessionPlayback(
  session: RadioSession | null,
  currentTrackId: string | null,
  isPlaying: boolean,
): RadioSession | null {
  if (!session) return null;
  const currentTrackIndex = session.tracks.findIndex((track) => track.id === currentTrackId);
  const hasCurrentTrack = currentTrackIndex >= 0;

  return {
    ...session,
    currentTrackIndex: hasCurrentTrack ? currentTrackIndex : session.currentTrackIndex,
    status: hasCurrentTrack ? (isPlaying ? "playing" : "paused") : session.status,
  };
}

export function radioStatusLabel(status: RadioSessionStatus): string {
  switch (status) {
    case "preparing":
      return "Tuning the room";
    case "playing":
      return "On Air";
    case "paused":
      return "Paused";
    case "ended":
      return "Ended";
    default:
      return "Idle";
  }
}

function selectRadioTracks(tracks: Track[], kind: RadioKind, mood: string, limit: number): Track[] {
  return [...tracks]
    .sort((a, b) => scoreTrackForRadio(b, kind, mood) - scoreTrackForRadio(a, kind, mood))
    .slice(0, limit);
}

function buildRadioSegments({
  kind,
  title,
  theme,
  mood,
  scene,
  tracks,
  tasteNotes,
  startIndex = 0,
  includeColdOpen = true,
}: {
  kind: RadioKind;
  title: string;
  theme: string;
  mood: string;
  scene: string;
  tracks: Track[];
  tasteNotes?: TasteNotes | null;
  startIndex?: number;
  includeColdOpen?: boolean;
}): RadioSegment[] {
  if (tracks.length === 0) return [];
  const now = Date.now();
  const segments: RadioSegment[] = [];
  const first = tracks[0];
  const favoriteArtist = tasteNotes?.favoriteArtists[0];

  if (includeColdOpen) {
    segments.push(
      {
        id: `segment-${now}-open-anchor`,
        type: "cold_open",
        position: "before_track",
        trackIndex: startIndex,
        text: coldOpenAnchor(kind, title, scene),
      },
      {
        id: `segment-${now}-open-heart`,
        type: "cold_open",
        position: "before_track",
        trackIndex: startIndex,
        text: coldOpenHeart(kind, first, favoriteArtist, theme, mood),
      },
      {
        id: `segment-${now}-open-invitation`,
        type: "cold_open",
        position: "before_track",
        trackIndex: startIndex,
        text: `We begin with ${formatTrack(first)}, and let the room find its temperature.`,
      },
    );
  } else {
    segments.push({
      id: `segment-${now}-refill-touch-${startIndex}`,
      type: "quick_touch",
      position: "before_track",
      trackIndex: startIndex,
      text: "I have found another small shelf nearby. We will keep moving without raising our voice.",
    });
  }

  for (let index = 0; index < tracks.length - 1; index += 1) {
    const absoluteAfter = startIndex + index;
    const absoluteBefore = startIndex + index + 1;
    const after = tracks[index];
    const before = tracks[index + 1];

    if ((index + startIndex) % 3 === 2) {
      segments.push({
        id: `segment-${now}-silence-${absoluteAfter}-${absoluteBefore}`,
        type: "silence",
        position: "between_tracks",
        afterTrackIndex: absoluteAfter,
        beforeTrackIndex: absoluteBefore,
        text: "",
      });
      continue;
    }

    segments.push({
      id: `segment-${now}-bridge-${absoluteAfter}-${absoluteBefore}`,
      type: "bridge",
      position: "between_tracks",
      afterTrackIndex: absoluteAfter,
      beforeTrackIndex: absoluteBefore,
      text: bridgeText(kind, after, before),
    });
  }

  return segments;
}

function coldOpenAnchor(kind: RadioKind, title: string, scene: string): string {
  if (kind === "lateNight")
    return "Good evening. The hour is low, and the station is taking its coat off slowly.";
  if (kind === "rainyDay")
    return "There is rain at the window tonight, real or imagined, and the records know what to do with it.";
  if (kind === "youth")
    return "We are opening a younger drawer tonight, the one with bright sleeves and slightly blurred photographs.";
  if (kind === "memory")
    return "Tonight we stay close to the private archive, where familiar records still change shape in the dark.";
  if (kind === "quietRoom")
    return "Let us lower the lamp and keep the needle close to the softer part of the room.";
  if (kind === "discovery")
    return "I have left one hand on the familiar shelf, and opened a small side door beside it.";
  return `${title} is on the air from ${scene.toLowerCase()}, warm and unhurried.`;
}

function coldOpenHeart(
  kind: RadioKind,
  first: Track,
  favoriteArtist: string | undefined,
  theme: string,
  mood: string,
): string {
  if (kind === "memory" && favoriteArtist) {
    return `The first turn stays near ${favoriteArtist}, then lets ${formatTrack(first)} pull the thread a little further.`;
  }
  if (kind === "discovery") {
    return `${formatTrack(first)} has just enough new air in it, without taking you too far from home.`;
  }
  if (kind === "quietRoom" || kind === "lateNight") {
    return `${formatTrack(first)} keeps its edges soft, which suits this ${mood || theme} beautifully.`;
  }
  return `${formatTrack(first)} feels like the right first page for ${theme || mood || "this little broadcast"}.`;
}

function bridgeText(kind: RadioKind, after: Track, before: Track): string {
  if (kind === "quietRoom" || kind === "lateNight") {
    return `${after.title} leaves the room gently. ${before.title} can come in without switching on the ceiling lights.`;
  }
  if (kind === "rainyDay") {
    return `${after.title} keeps the glass misted for a moment; ${before.title} follows like another streetlamp in the rain.`;
  }
  if (kind === "youth") {
    return `${after.title} had that old photograph glow. ${before.title} keeps the colors moving.`;
  }
  if (kind === "memory") {
    return `${after.title} stays on the sleeve a little longer. ${before.title} is waiting on the next shelf.`;
  }
  if (kind === "discovery") {
    return `${after.title} was the familiar doorway. ${before.title} is the small turn after it.`;
  }
  return `${after.title} settles back into the stack. ${before.title} is ready when you are.`;
}

function formatTrack(track: Track): string {
  return track.artist ? `${track.title} by ${track.artist}` : track.title;
}

function scoreTrackForRadio(track: Track, kind: RadioKind, mood: string): number {
  const text =
    `${track.title} ${track.artist} ${track.album} ${track.genres.join(" ")} ${track.moods.join(" ")}`.toLowerCase();
  let score = 0;

  if (track.liked) score += 3;
  score += Math.min(2.2, track.playCount * 0.22);
  if (track.skipCount > 0) score -= Math.min(1.4, track.skipCount * 0.22);

  if (kind === "discovery") {
    score += track.liked ? -0.8 : 1.4;
    score += track.playCount <= 2 ? 1.2 : 0;
  }
  if (kind === "quietRoom" || kind === "lateNight") {
    if (hasAny(text, ["calm", "quiet", "soft", "jazz", "lofi", "ambient", "night", "晚", "夜"]))
      score += 2.6;
    if (hasAny(text, ["rock", "dance", "edm", "metal", "party"])) score -= 1.4;
  }
  if (kind === "rainyDay") {
    if (hasAny(text, ["rain", "blue", "sad", "melancholy", "雨", "泪", "伤"])) score += 2.4;
  }
  if (kind === "youth") {
    if (hasAny(text, ["youth", "young", "school", "青春", "少年", "夏"])) score += 2.3;
  }
  if (kind === "memory") {
    if (track.liked || track.playCount >= 3) score += 1.8;
  }
  if (mood && text.includes(mood.toLowerCase())) score += 1.2;

  return score;
}

function inferRadioKind(): RadioKind {
  const hour = new Date().getHours();
  if (hour >= 22 || hour <= 4) return "lateNight";
  if (hour >= 18) return "memory";
  return "daily";
}

function themeFromTaste(kind: RadioKind, tasteNotes?: TasteNotes | null): string {
  if (kind === "memory" && tasteNotes?.favoriteArtists[0]) {
    return `${tasteNotes.favoriteArtists[0]} and the nearby shelves`;
  }
  if (kind === "lateNight") return "soft records after dark";
  if (kind === "quietRoom") return "low light and gentle edges";
  if (kind === "discovery") return "new air from familiar corners";
  return tasteNotes?.musicPersonality || "a private shelf of familiar records";
}

function moodFromKind(kind: RadioKind, tasteNotes?: TasteNotes | null): string {
  if (tasteNotes?.favoriteMoods[0]) return tasteNotes.favoriteMoods[0];
  if (kind === "lateNight" || kind === "quietRoom") return "late-night calm";
  if (kind === "rainyDay") return "rainy melancholy";
  if (kind === "discovery") return "soft discovery";
  return "familiar warmth";
}

function sceneFromKind(kind: RadioKind): string {
  switch (kind) {
    case "lateNight":
      return "A late room";
    case "rainyDay":
      return "Rain on the window";
    case "quietRoom":
      return "A softer room";
    case "discovery":
      return "A small detour";
    case "youth":
      return "A younger light";
    case "memory":
      return "The private archive";
    default:
      return "Today";
  }
}

function hostNoteFor(
  kind: RadioKind,
  tasteNotes: TasteNotes | null | undefined,
  tracks: Track[],
): string {
  const firstArtist = tasteNotes?.favoriteArtists[0] || tracks[0]?.artist;
  if (tracks.length === 0) {
    return "The radio is waiting for a few records before it can go on air.";
  }
  if (kind === "lateNight") {
    return "This little set comes from the softer corners of your library.";
  }
  if (kind === "discovery") {
    return "I kept one hand on the familiar shelf, and opened a smaller door beside it.";
  }
  if (kind === "memory" && firstArtist) {
    return `I started near ${firstArtist}, then let the room drift toward nearby memories.`;
  }
  return "A private broadcast, tuned from your listening memory.";
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
