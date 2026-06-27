import type { RecommendationItem, Track, UserMusicProfile } from "../../types/music";
import { requestMusicUnderstanding } from "./provider";

interface RefineRecommendationInput {
  tracks: Track[];
  recommendations: RecommendationItem[];
}

interface ReasonPatch {
  trackId: string;
  reason: string;
}

export async function refineRecommendationReasons({
  tracks,
  recommendations,
}: RefineRecommendationInput): Promise<RecommendationItem[]> {
  if (recommendations.length === 0) {
    return [];
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const fallbackPatches = recommendations.map((recommendation) => ({
    trackId: recommendation.trackId,
    reason: recommendation.reason,
  }));
  const compactTracks = recommendations.map((recommendation) => {
    const track = trackById.get(recommendation.trackId);

    return {
      trackId: recommendation.trackId,
      title: track?.title ?? "",
      artist: track?.artist ?? "",
      album: track?.album ?? "",
      genres: track?.genres ?? [],
      moods: track?.moods ?? [],
      lane: recommendation.lane,
      fallbackReason: recommendation.reason,
    };
  });

  const text = await requestMusicUnderstanding({
    purpose: "recommendation_reason",
    systemPrompt:
      "你是一位隐藏在音乐播放器背后的音乐鉴赏家。只写自然、克制、很短的中文推荐理由，不提规则、模型、画像、行为分析或技术来源。",
    userPrompt: [
      "请为下面每首歌各写一句推荐理由。",
      "要求：每句不超过 26 个汉字；像音乐编辑，不像机器人；只返回 JSON 数组。",
      '格式：[{"trackId":"...","reason":"..."}]',
      JSON.stringify(compactTracks),
    ].join("\n"),
    fallbackText: JSON.stringify(fallbackPatches),
    maxTokens: 360,
    temperature: 0.72,
  });
  const patches = parseReasonPatches(text);

  if (patches.length === 0) {
    return recommendations;
  }

  const reasonById = new Map(patches.map((patch) => [patch.trackId, patch.reason.trim()]));
  return recommendations.map((recommendation) => ({
    ...recommendation,
    reason: reasonById.get(recommendation.trackId) || recommendation.reason,
  }));
}

export async function summarizeMusicPreference(profile: UserMusicProfile): Promise<string> {
  const fallbackText = profile.isLearning
    ? "偏好还在慢慢形成，多听几首后会更清楚。"
    : buildLocalPreferenceSummary(profile);

  return requestMusicUnderstanding({
    purpose: "preference_summary",
    systemPrompt: "你是一位音乐鉴赏家。用一句自然中文概括听歌偏好，不提任何技术判断。",
    userPrompt: [
      "请把下面的音乐偏好压缩成一句中文，最多 32 个汉字。",
      JSON.stringify({
        favoriteArtists: profile.favoriteArtists.slice(0, 3),
        favoriteAlbums: profile.favoriteAlbums.slice(0, 2),
        favoriteGenres: profile.favoriteGenres.slice(0, 3),
        favoriteMoods: profile.favoriteMoods.slice(0, 3),
        nightListeningPreference: profile.nightListeningPreference,
        calmMusicPreference: profile.calmMusicPreference,
        energeticMusicPreference: profile.energeticMusicPreference,
        isLearning: profile.isLearning,
      }),
    ].join("\n"),
    fallbackText,
    maxTokens: 120,
    temperature: 0.58,
  });
}

function parseReasonPatches(text: string): ReasonPatch[] {
  const jsonText = extractJsonArray(text);
  if (!jsonText) {
    return [];
  }

  try {
    const value = JSON.parse(jsonText);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => ({
        trackId: typeof item.trackId === "string" ? item.trackId : "",
        reason: typeof item.reason === "string" ? item.reason : "",
      }))
      .filter((item) => item.trackId && item.reason);
  } catch {
    return [];
  }
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start < 0 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function buildLocalPreferenceSummary(profile: UserMusicProfile): string {
  const mood = profile.favoriteMoods[0]?.label;
  const genre = profile.favoriteGenres[0]?.label;
  const artist = profile.favoriteArtists[0]?.label;

  return (
    [
      mood ? `偏爱 ${mood}` : null,
      genre ? `常听 ${genre}` : null,
      artist ? `也常回到 ${artist}` : null,
    ]
      .filter(Boolean)
      .join("，") || "最近的音乐偏好正在变得清晰。"
  );
}
