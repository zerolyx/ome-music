import type { Track } from "../../types/music";

export type AnalyzerProvider = "mock" | "configured";
export type PlaylistAnalysisMode = "direct" | "layered";

export interface PlaylistAnalysisInput {
  id: string;
  name: string;
  tracks: Track[];
}

export interface DistributionItem {
  label: string;
  count: number;
  ratio: number;
  confidence: number;
}

export interface DiversityScore {
  score: number;
  confidence: number;
  explanation: string;
}

export interface PlaylistChunkSummary {
  id: string;
  title: string;
  basis: "artist" | "album" | "language" | "decade" | "genre" | "mood";
  trackCount: number;
  highlights: string[];
  summary: string;
}

export interface PlaylistLayeredChunkResult {
  id: string;
  index: number;
  trackCount: number;
  dominantGenres: string[];
  mainArtists: string[];
  moods: string[];
  listeningScenes: string[];
  notablePatterns: string[];
  possiblePreferences: string[];
}

export interface PlaylistFinalInterpretation {
  musicPersonality: string;
  favoriteMoods: string[];
  favoriteScenes: string[];
  artistPreferences: string[];
  genrePreferences: string[];
  hiddenPatterns: string[];
  recommendationStrategy: string;
}

export interface PlaylistAnalysisReport {
  playlistId: string;
  playlistName: string;
  provider: AnalyzerProvider;
  mode: PlaylistAnalysisMode;
  trackCount: number;
  generatedAt: string;
  mainStyles: DistributionItem[];
  moodDistribution: DistributionItem[];
  suitableScenes: string[];
  representativeArtists: DistributionItem[];
  possibleUserPreferences: string[];
  diversityScore: DiversityScore;
  improvementSuggestions: string[];
  chunkSummaries: PlaylistChunkSummary[];
  layeredChunks: PlaylistLayeredChunkResult[];
  finalInterpretation: PlaylistFinalInterpretation;
}

export interface MusicAnalyzer {
  readonly provider: AnalyzerProvider;
  analyze(input: PlaylistAnalysisInput): Promise<PlaylistAnalysisReport>;
}
