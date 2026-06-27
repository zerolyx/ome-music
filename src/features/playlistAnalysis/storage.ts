import { invoke } from "@tauri-apps/api/core";
import type { PlaylistAnalysisReport } from "../../musicUnderstanding/analyzer";
import { isTauriRuntime } from "../library/libraryApi";

export interface PlaylistAnalysisRun {
  id: string;
  playlistId: string;
  playlistName: string;
  trackCount: number;
  mode: "direct" | "layered";
  provider: string;
  chunkResultsJson: string;
  finalResultJson: string;
  reportJson: string;
  createdAt: string;
}

const previewRuns = new Map<string, PlaylistAnalysisRun>();

export async function savePlaylistAnalysisReport(report: PlaylistAnalysisReport): Promise<PlaylistAnalysisRun> {
  const payload = {
    playlistId: report.playlistId,
    playlistName: report.playlistName,
    trackCount: report.trackCount,
    mode: report.mode,
    provider: report.provider,
    chunkResultsJson: JSON.stringify(report.layeredChunks),
    finalResultJson: JSON.stringify(report.finalInterpretation),
    reportJson: JSON.stringify(report)
  };

  if (!isTauriRuntime()) {
    const run: PlaylistAnalysisRun = {
      id: `preview-${Date.now()}`,
      playlistId: payload.playlistId,
      playlistName: payload.playlistName,
      trackCount: payload.trackCount,
      mode: payload.mode,
      provider: payload.provider,
      chunkResultsJson: payload.chunkResultsJson,
      finalResultJson: payload.finalResultJson,
      reportJson: payload.reportJson,
      createdAt: new Date().toISOString()
    };
    previewRuns.set(payload.playlistId, run);
    return run;
  }

  return invoke<PlaylistAnalysisRun>("save_playlist_analysis_result", { payload });
}