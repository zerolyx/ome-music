import { requestMusicUnderstanding } from "../../features/llm/provider";
import type { Track } from "../../types/music";
import type {
  DistributionItem,
  DiversityScore,
  MusicAnalyzer,
  PlaylistAnalysisInput,
  PlaylistAnalysisMode,
  PlaylistAnalysisReport,
  PlaylistChunkSummary,
  PlaylistFinalInterpretation,
  PlaylistLayeredChunkResult,
} from "./types";

type CountMap = Map<string, number>;

const CHUNK_SIZE = 100;
const UNKNOWN_STYLE = "未知风格";
const UNKNOWN_MOOD = "unknown";
const UNKNOWN_LANGUAGE = "unknown";

export class MockAnalyzer implements MusicAnalyzer {
  readonly provider = "mock" as const;

  async analyze(input: PlaylistAnalysisInput): Promise<PlaylistAnalysisReport> {
    return buildLocalReport(input, this.provider);
  }
}

export class ConfiguredAnalyzer implements MusicAnalyzer {
  readonly provider = "configured" as const;

  async analyze(input: PlaylistAnalysisInput): Promise<PlaylistAnalysisReport> {
    const mode: PlaylistAnalysisMode = input.tracks.length <= CHUNK_SIZE ? "direct" : "layered";
    const localReport = buildLocalReport(input, this.provider);

    if (mode === "direct") {
      const finalInterpretation = await requestFinalInterpretationFromTracks(
        input,
        localReport.finalInterpretation,
      );
      return { ...localReport, finalInterpretation };
    }

    const chunks = chunkTracks(input.tracks, CHUNK_SIZE);
    const layeredChunks: PlaylistLayeredChunkResult[] = [];

    for (const [index, tracks] of chunks.entries()) {
      const fallbackChunk = buildLocalLayeredChunk(tracks, index);
      const interpretedChunk = await requestChunkInterpretation(tracks, index, fallbackChunk);
      layeredChunks.push(interpretedChunk);
    }

    const finalInterpretation = await requestFinalInterpretationFromChunks(
      input,
      layeredChunks,
      localReport.finalInterpretation,
    );
    return {
      ...localReport,
      layeredChunks,
      finalInterpretation,
      chunkSummaries: layeredChunks.map(chunkResultToSummary),
    };
  }
}

function buildLocalReport(
  input: PlaylistAnalysisInput,
  provider: PlaylistAnalysisReport["provider"],
): PlaylistAnalysisReport {
  const mode: PlaylistAnalysisMode = input.tracks.length <= CHUNK_SIZE ? "direct" : "layered";
  const aggregate = aggregateTracks(input.tracks);
  const layeredChunks =
    mode === "layered"
      ? chunkTracks(input.tracks, CHUNK_SIZE).map((tracks, index) =>
          buildLocalLayeredChunk(tracks, index),
        )
      : [];
  const finalInterpretation = buildLocalFinalInterpretation(input.tracks, aggregate, layeredChunks);

  return {
    playlistId: input.id,
    playlistName: input.name,
    provider,
    mode,
    trackCount: input.tracks.length,
    generatedAt: new Date().toISOString(),
    mainStyles: toDistribution(aggregate.genres, input.tracks.length, 5),
    moodDistribution: toDistribution(aggregate.moods, input.tracks.length, 6),
    suitableScenes: inferScenes(aggregate),
    representativeArtists: toDistribution(aggregate.artists, input.tracks.length, 5),
    possibleUserPreferences: inferPossiblePreferences(aggregate, input.tracks.length),
    diversityScore: calculateDiversity(input.tracks, aggregate),
    improvementSuggestions: buildImprovementSuggestions(input.tracks, aggregate),
    chunkSummaries:
      mode === "layered"
        ? layeredChunks.map(chunkResultToSummary)
        : buildDirectChunkSummary(input.tracks),
    layeredChunks,
    finalInterpretation,
  };
}

async function requestChunkInterpretation(
  tracks: Track[],
  index: number,
  fallbackChunk: PlaylistLayeredChunkResult,
): Promise<PlaylistLayeredChunkResult> {
  const text = await requestMusicUnderstanding({
    purpose: "playlist_analysis",
    systemPrompt:
      "你是一位音乐鉴赏家。请根据曲目元数据做分段歌单解读，只返回 JSON，不提技术、模型或数据处理过程。",
    userPrompt: [
      "分析这一段曲目，输出结构必须是：",
      '{"dominantGenres":[],"mainArtists":[],"moods":[],"listeningScenes":[],"notablePatterns":[],"possiblePreferences":[]}',
      "语气自然，像音乐鉴赏家。数组每项使用简短中文或原始音乐标签。",
      JSON.stringify({
        chunkIndex: index + 1,
        trackCount: tracks.length,
        tracks: compactTracks(tracks),
      }),
    ].join("\n"),
    fallbackText: JSON.stringify(stripChunkIdentity(fallbackChunk)),
    maxTokens: 640,
    temperature: 0.58,
  });
  const parsed = parseObject<Partial<PlaylistLayeredChunkResult>>(text);

  return normalizeChunkResult({
    ...fallbackChunk,
    ...parsed,
    id: fallbackChunk.id,
    index,
    trackCount: tracks.length,
  });
}

async function requestFinalInterpretationFromTracks(
  input: PlaylistAnalysisInput,
  fallbackFinal: PlaylistFinalInterpretation,
): Promise<PlaylistFinalInterpretation> {
  const text = await requestMusicUnderstanding({
    purpose: "playlist_analysis",
    systemPrompt:
      "你是一位音乐鉴赏家。请把歌单元数据整理成最终解读，只返回 JSON，不提技术、模型或数据处理过程。",
    userPrompt: [
      "歌曲数量不超过 100，请直接完整解读。输出结构必须是：",
      '{"musicPersonality":"","favoriteMoods":[],"favoriteScenes":[],"artistPreferences":[],"genrePreferences":[],"hiddenPatterns":[],"recommendationStrategy":""}',
      "语气像音乐鉴赏家，克制、自然。",
      JSON.stringify({
        playlistName: input.name,
        trackCount: input.tracks.length,
        tracks: compactTracks(input.tracks),
      }),
    ].join("\n"),
    fallbackText: JSON.stringify(fallbackFinal),
    maxTokens: 720,
    temperature: 0.62,
  });

  return normalizeFinalInterpretation(
    parseObject<Partial<PlaylistFinalInterpretation>>(text),
    fallbackFinal,
  );
}

async function requestFinalInterpretationFromChunks(
  input: PlaylistAnalysisInput,
  chunks: PlaylistLayeredChunkResult[],
  fallbackFinal: PlaylistFinalInterpretation,
): Promise<PlaylistFinalInterpretation> {
  const text = await requestMusicUnderstanding({
    purpose: "playlist_analysis",
    systemPrompt:
      "你是一位音乐鉴赏家。请只根据分段摘要做总解读，不要要求完整曲目，不提技术、模型或数据处理过程。",
    userPrompt: [
      "这些是每 100 首生成的分段摘要。请合并成歌单总解读。",
      "输出结构必须是：",
      '{"musicPersonality":"","favoriteMoods":[],"favoriteScenes":[],"artistPreferences":[],"genrePreferences":[],"hiddenPatterns":[],"recommendationStrategy":""}',
      JSON.stringify({ playlistName: input.name, trackCount: input.tracks.length, chunks }),
    ].join("\n"),
    fallbackText: JSON.stringify(fallbackFinal),
    maxTokens: 820,
    temperature: 0.62,
  });

  return normalizeFinalInterpretation(
    parseObject<Partial<PlaylistFinalInterpretation>>(text),
    fallbackFinal,
  );
}

function buildLocalLayeredChunk(tracks: Track[], index: number): PlaylistLayeredChunkResult {
  const aggregate = aggregateTracks(tracks);

  return {
    id: `chunk-${index + 1}`,
    index,
    trackCount: tracks.length,
    dominantGenres: topLabels(aggregate.genres, 5, UNKNOWN_STYLE),
    mainArtists: topLabels(aggregate.artists, 5, "Unknown Artist"),
    moods: topLabels(aggregate.moods, 5, UNKNOWN_MOOD),
    listeningScenes: inferScenes(aggregate),
    notablePatterns: buildNotablePatterns(tracks, aggregate),
    possiblePreferences: inferPossiblePreferences(aggregate, tracks.length),
  };
}

function buildLocalFinalInterpretation(
  tracks: Track[],
  aggregate: ReturnType<typeof aggregateTracks>,
  chunks: PlaylistLayeredChunkResult[],
): PlaylistFinalInterpretation {
  const topMood = topLabel(aggregate.moods, UNKNOWN_MOOD);
  const topGenre = topLabel(aggregate.genres, UNKNOWN_STYLE);
  const topArtist = topLabel(aggregate.artists, "Unknown Artist");
  const scenes = inferScenes(aggregate);
  const hiddenPatterns =
    chunks.length > 0
      ? chunks.flatMap((chunk) => chunk.notablePatterns).slice(0, 5)
      : buildNotablePatterns(tracks, aggregate).slice(0, 5);

  return {
    musicPersonality:
      tracks.length === 0
        ? "这张歌单还在等待第一首歌。"
        : `这张歌单以 ${topGenre} 为骨架，情绪更靠近 ${topMood}，整体像一段有主线的私人聆听路线。`,
    favoriteMoods: topLabels(aggregate.moods, 6, UNKNOWN_MOOD),
    favoriteScenes: scenes,
    artistPreferences: topLabels(aggregate.artists, 6, topArtist),
    genrePreferences: topLabels(aggregate.genres, 6, topGenre),
    hiddenPatterns,
    recommendationStrategy: `围绕 ${topGenre} 与 ${topMood} 延展，保留熟悉歌手，同时加入少量相邻风格作为过渡。`,
  };
}

function normalizeChunkResult(value: PlaylistLayeredChunkResult): PlaylistLayeredChunkResult {
  return {
    id: value.id,
    index: value.index,
    trackCount: value.trackCount,
    dominantGenres: asStringArray(value.dominantGenres),
    mainArtists: asStringArray(value.mainArtists),
    moods: asStringArray(value.moods),
    listeningScenes: asStringArray(value.listeningScenes),
    notablePatterns: asStringArray(value.notablePatterns),
    possiblePreferences: asStringArray(value.possiblePreferences),
  };
}

function normalizeFinalInterpretation(
  value: Partial<PlaylistFinalInterpretation> | null,
  fallback: PlaylistFinalInterpretation,
): PlaylistFinalInterpretation {
  return {
    musicPersonality:
      typeof value?.musicPersonality === "string" && value.musicPersonality.trim()
        ? value.musicPersonality
        : fallback.musicPersonality,
    favoriteMoods: asStringArray(value?.favoriteMoods, fallback.favoriteMoods),
    favoriteScenes: asStringArray(value?.favoriteScenes, fallback.favoriteScenes),
    artistPreferences: asStringArray(value?.artistPreferences, fallback.artistPreferences),
    genrePreferences: asStringArray(value?.genrePreferences, fallback.genrePreferences),
    hiddenPatterns: asStringArray(value?.hiddenPatterns, fallback.hiddenPatterns),
    recommendationStrategy:
      typeof value?.recommendationStrategy === "string" && value.recommendationStrategy.trim()
        ? value.recommendationStrategy
        : fallback.recommendationStrategy,
  };
}

function chunkResultToSummary(chunk: PlaylistLayeredChunkResult): PlaylistChunkSummary {
  return {
    id: chunk.id,
    title: `第 ${chunk.index + 1} 段`,
    basis: "genre",
    trackCount: chunk.trackCount,
    highlights: [...chunk.dominantGenres.slice(0, 2), ...chunk.moods.slice(0, 2)],
    summary:
      chunk.notablePatterns[0] || chunk.possiblePreferences[0] || "这一段呈现出较稳定的聆听倾向。",
  };
}

function buildDirectChunkSummary(tracks: Track[]): PlaylistChunkSummary[] {
  if (tracks.length === 0) {
    return [];
  }

  const aggregate = aggregateTracks(tracks);
  return [
    {
      id: "direct-overview",
      title: "整体解读",
      basis: "genre",
      trackCount: tracks.length,
      highlights: [
        topLabel(aggregate.genres, UNKNOWN_STYLE),
        topLabel(aggregate.moods, UNKNOWN_MOOD),
        topLabel(aggregate.artists, "Unknown Artist"),
      ],
      summary: "曲目数量适中，已直接基于全部曲目信息形成整体解读。",
    },
  ];
}

function aggregateTracks(tracks: Track[]) {
  const artists: CountMap = new Map();
  const albums: CountMap = new Map();
  const genres: CountMap = new Map();
  const moods: CountMap = new Map();
  const languages: CountMap = new Map();
  const decades: CountMap = new Map();

  for (const track of tracks) {
    addCount(artists, track.artist || "Unknown Artist");
    addCount(albums, track.album || "Unknown Album");
    addCount(languages, track.language || UNKNOWN_LANGUAGE);
    addCount(decades, decadeLabel(track.year));

    const trackGenres = track.genres.length > 0 ? track.genres : [UNKNOWN_STYLE];
    const trackMoods = track.moods.length > 0 ? track.moods : [UNKNOWN_MOOD];

    trackGenres.forEach((genre) => addCount(genres, genre));
    trackMoods.forEach((mood) => addCount(moods, mood));
  }

  return { artists, albums, genres, moods, languages, decades };
}

function compactTracks(tracks: Track[]) {
  return tracks.map((track) => ({
    title: track.title,
    artist: track.artist,
    album: track.album,
    genres: track.genres,
    moods: track.moods,
    language: track.language,
    year: track.year,
  }));
}

function stripChunkIdentity(chunk: PlaylistLayeredChunkResult) {
  return {
    dominantGenres: chunk.dominantGenres,
    mainArtists: chunk.mainArtists,
    moods: chunk.moods,
    listeningScenes: chunk.listeningScenes,
    notablePatterns: chunk.notablePatterns,
    possiblePreferences: chunk.possiblePreferences,
  };
}

function inferScenes(aggregate: ReturnType<typeof aggregateTracks>): string[] {
  const labels = new Set([
    ...Array.from(aggregate.genres.keys()).map((value) => value.toLowerCase()),
    ...Array.from(aggregate.moods.keys()).map((value) => value.toLowerCase()),
  ]);
  const scenes = new Set<string>();

  if (hasAny(labels, ["calm", "focused", "ambient", "jazz", "lo-fi", "lofi", "classical"])) {
    scenes.add("夜间阅读");
    scenes.add("专注工作");
  }
  if (hasAny(labels, ["energetic", "rock", "pop", "electronic", "dance", "house"])) {
    scenes.add("通勤提神");
    scenes.add("步行路上");
  }
  if (hasAny(labels, ["romantic", "melancholy", "dreamy", "folk", "ballad"])) {
    scenes.add("雨天慢听");
    scenes.add("独处放松");
  }
  if (scenes.size === 0) {
    scenes.add("日常播放");
    scenes.add("轻量背景");
  }

  return Array.from(scenes).slice(0, 5);
}

function inferPossiblePreferences(
  aggregate: ReturnType<typeof aggregateTracks>,
  totalTracks: number,
): string[] {
  if (totalTracks === 0) {
    return ["导入歌曲后再形成偏好判断。"];
  }

  return [
    `可能偏好 ${topLabel(aggregate.genres, UNKNOWN_STYLE)} 的声音质感。`,
    `情绪上更接近 ${topLabel(aggregate.moods, UNKNOWN_MOOD)}。`,
    `对 ${topLabel(aggregate.artists, "Unknown Artist")} 或相近创作者接受度较高。`,
  ];
}

function buildNotablePatterns(
  tracks: Track[],
  aggregate: ReturnType<typeof aggregateTracks>,
): string[] {
  if (tracks.length === 0) {
    return ["还没有足够曲目形成稳定脉络。"];
  }

  const patterns = [
    `${topLabel(aggregate.genres, UNKNOWN_STYLE)} 是这一段最明显的骨架。`,
    `${topLabel(aggregate.moods, UNKNOWN_MOOD)} 情绪反复出现，形成了连续的听感。`,
  ];

  if (aggregate.artists.size <= Math.max(2, Math.ceil(tracks.length * 0.18))) {
    patterns.push("歌手集中度较高，像是在围绕少数声音反复靠近。");
  } else {
    patterns.push("歌手分布较散，整体更接近探索型歌单。");
  }

  return patterns;
}

function calculateDiversity(
  tracks: Track[],
  aggregate: ReturnType<typeof aggregateTracks>,
): DiversityScore {
  if (tracks.length === 0) {
    return {
      score: 0,
      confidence: 0,
      explanation: "暂无曲目，无法评估多样性。",
    };
  }

  const total = tracks.length;
  const artistVariety = aggregate.artists.size / total;
  const albumVariety = aggregate.albums.size / total;
  const genreVariety = aggregate.genres.size / Math.max(total, 4);
  const moodVariety = aggregate.moods.size / Math.max(total, 4);
  const languageVariety = aggregate.languages.size / Math.max(total, 3);
  const score = clamp01(
    artistVariety * 0.32 +
      albumVariety * 0.22 +
      genreVariety * 0.24 +
      moodVariety * 0.14 +
      languageVariety * 0.08,
  );

  return {
    score: round2(score),
    confidence: round2(clamp01(total / 24)),
    explanation:
      score >= 0.7
        ? "歌手、专辑与标签分布较分散。"
        : score >= 0.42
          ? "有变化，但仍保留清晰的中心。"
          : "聚合度较高，适合做主题歌单。",
  };
}

function buildImprovementSuggestions(
  tracks: Track[],
  aggregate: ReturnType<typeof aggregateTracks>,
): string[] {
  if (tracks.length === 0) {
    return ["先导入歌曲，再生成歌单解读。"];
  }

  const suggestions: string[] = [];
  const diversity = calculateDiversity(tracks, aggregate).score;

  if (diversity < 0.42) {
    suggestions.push("可以加入几位相近但不同的歌手，让听感更有呼吸。");
  }
  if (aggregate.moods.size <= 2) {
    suggestions.push("补充少量不同情绪的曲目，让歌单起伏更自然。");
  }
  if (aggregate.genres.size <= 2) {
    suggestions.push("在主风格之外加入邻近风格，避免听感过于单一。");
  }
  if (suggestions.length === 0) {
    suggestions.push("整体结构已经均衡，可以继续补充近期喜欢的新歌。");
  }

  return suggestions;
}

function toDistribution(map: CountMap, totalTracks: number, limit: number): DistributionItem[] {
  return sortedEntries(map)
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      ratio: round2(count / Math.max(totalTracks, 1)),
      confidence: round2(clamp01(count / Math.max(3, totalTracks * 0.28))),
    }));
}

function addCount(map: CountMap, label: string, amount = 1) {
  const normalized = label.trim() || "unknown";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function sortedEntries(map: CountMap): Array<[string, number]> {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topLabels(map: CountMap, limit: number, fallback: string): string[] {
  const labels = sortedEntries(map)
    .slice(0, limit)
    .map(([label]) => label);

  return labels.length > 0 ? labels : [fallback];
}

function topLabel(map: CountMap, fallback: string): string {
  return sortedEntries(map)[0]?.[0] ?? fallback;
}

function decadeLabel(year?: number): string {
  if (!year) {
    return "未知年代";
  }

  return `${Math.floor(year / 10) * 10}s`;
}

function hasAny(labels: Set<string>, keywords: string[]): boolean {
  return keywords.some((keyword) => Array.from(labels).some((label) => label.includes(keyword)));
}

function chunkTracks(tracks: Track[], size: number): Track[][] {
  const chunks: Track[][] = [];

  for (let index = 0; index < tracks.length; index += size) {
    chunks.push(tracks.slice(index, index + size));
  }

  return chunks;
}

function parseObject<T>(text: string): T | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.map((item) => String(item).trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
