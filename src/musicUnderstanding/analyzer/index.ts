export type {
  AnalyzerProvider,
  DistributionItem,
  DiversityScore,
  MusicAnalyzer,
  PlaylistAnalysisInput,
  PlaylistAnalysisMode,
  PlaylistAnalysisReport,
  PlaylistChunkSummary,
} from "./types";
export { ConfiguredAnalyzer, MockAnalyzer } from "./mockAnalyzer";

import { ConfiguredAnalyzer } from "./mockAnalyzer";

export function createMusicAnalyzer() {
  return new ConfiguredAnalyzer();
}
