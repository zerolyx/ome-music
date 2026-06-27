export type TrackMood =
  | "calm"
  | "focused"
  | "romantic"
  | "melancholy"
  | "energetic"
  | "dreamy"
  | "happy"
  | "tired"
  | "anxious"
  | "sad"
  | "excited"
  | "unknown";

export type JournalMood = "开心" | "平静" | "疲惫" | "焦虑" | "伤感" | "兴奋";

export type DesiredMusicVibe =
  | "安静氛围"
  | "轻快明亮"
  | "专注背景"
  | "情绪陪伴"
  | "能量提升"
  | "探索新歌";

export type LoopMode = "off" | "one" | "all";

export type MusicSource = "local" | "netease" | "bilibili";

export type MusicLanguage = "zh" | "en" | "jp" | "kr" | "instrumental" | "unknown";

export interface Artist {
  id: string;
  name: string;
  aliases?: string[];
  genres: string[];
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  year?: number;
  coverUrl?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  filePath: string;
  source: MusicSource;
  sourceId?: string | null;
  unavailableReason?: string | null;
  coverUrl: string;
  genres: string[];
  moods: TrackMood[];
  language: MusicLanguage;
  year?: number;
  playCount: number;
  skipCount: number;
  liked: boolean;
  importedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  source: "local" | "imported" | "ai";
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackState {
  queue: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  progressSeconds: number;
  volume: number;
  loopMode: LoopMode;
  shuffle: boolean;
}

export interface ListeningStats {
  hourOfDay: number;
  plays: number;
  completions: number;
  skips: number;
}

export interface ProfileRank {
  label: string;
  weight: number;
  confidence: number;
}

export interface HourPreference {
  hour: number;
  weight: number;
  confidence: number;
}

export interface ScoreConfidence {
  score: number;
  confidence: number;
}

export interface UserMusicProfile {
  favoriteArtists: ProfileRank[];
  favoriteAlbums: ProfileRank[];
  favoriteGenres: ProfileRank[];
  favoriteMoods: ProfileRank[];
  preferredListeningHours: HourPreference[];
  nightListeningPreference: ScoreConfidence;
  skipPatterns: ProfileRank[];
  repeatPatterns: ProfileRank[];
  likedSongPatterns: ProfileRank[];
  explorationScore: ScoreConfidence;
  calmMusicPreference: ScoreConfidence;
  energeticMusicPreference: ScoreConfidence;
  eventCount: number;
  confidence: number;
  isLearning: boolean;
  updatedAt: string;
}

export interface MoodEntry {
  id: string;
  date: string;
  mood: JournalMood;
  moodSignal: TrackMood;
  note: string;
  desiredVibe?: DesiredMusicVibe;
  privateTags: string[];
  recommendedTrackIds: string[];
  createdAt: string;
}
