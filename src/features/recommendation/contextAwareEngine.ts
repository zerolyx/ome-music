import type {
  MoodEntry,
  RecommendationContext,
  RecommendationItem,
  Track,
  UserMusicProfile,
} from "../../types/music";
import { generateRecommendationReason } from "./explanationGenerator";
import type { WeatherContext } from "./weatherProvider";

export interface RecommendationEngineInput {
  now: Date;
  weather: WeatherContext;
  profile: UserMusicProfile;
  recentTracks: Track[];
  moodEntry: MoodEntry;
  library: Track[];
  limit?: number;
}

interface ScoredTrack {
  track: Track;
  lane: RecommendationItem["lane"];
  score: number;
}

const DEFAULT_LIMIT = 10;

export function buildRecommendationContext(
  now: Date,
  weather: WeatherContext,
  moodEntry?: MoodEntry,
): RecommendationContext {
  return {
    timeOfDay: getTimeOfDay(now),
    weather: weather.condition,
    mood: moodEntry?.moodSignal,
  };
}

export function buildContextAwareRecommendations(
  input: RecommendationEngineInput,
): RecommendationItem[] {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const context = buildRecommendationContext(input.now, input.weather, input.moodEntry);
  const scored = input.library.map((track) => scoreTrack(track, input, context));

  const familiarTarget = Math.max(1, Math.round(limit * 0.5));
  const freshTarget = Math.max(1, Math.round(limit * 0.3));
  const exploreTarget = Math.max(1, limit - familiarTarget - freshTarget);
  const selected: ScoredTrack[] = [];

  selected.push(...takeLane(scored, "familiar", familiarTarget, selected));
  selected.push(...takeLane(scored, "fresh", freshTarget, selected));
  selected.push(...takeLane(scored, "explore", exploreTarget, selected));

  if (selected.length < Math.min(limit, input.library.length)) {
    const selectedIds = new Set(selected.map((item) => item.track.id));
    selected.push(
      ...scored
        .filter((item) => !selectedIds.has(item.track.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit - selected.length),
    );
  }

  return selected
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      trackId: item.track.id,
      lane: item.lane,
      score: item.score,
      reason: generateRecommendationReason({
        track: item.track,
        lane: item.lane,
        context,
        weather: input.weather,
        profile: input.profile,
        moodEntry: input.moodEntry,
      }),
    }));
}

function scoreTrack(
  track: Track,
  input: RecommendationEngineInput,
  context: RecommendationContext,
): ScoredTrack {
  const lane = classifyLane(track, input);
  const preferredGenres = new Set(
    input.profile.favoriteGenres.slice(0, 4).map((item) => item.label),
  );
  const preferredMoods = new Set(input.profile.favoriteMoods.slice(0, 4).map((item) => item.label));
  const recentIds = new Set(input.recentTracks.map((recentTrack) => recentTrack.id));
  const hasPreferredGenre = track.genres.some((genre) => preferredGenres.has(genre));
  const hasPreferredMood = track.moods.some((mood) => preferredMoods.has(mood));
  const calmScore = track.moods.includes("calm") || track.genres.some(isCalmGenre) ? 1 : 0;
  const energeticScore =
    track.moods.includes("energetic") || track.genres.some(isEnergeticGenre) ? 1 : 0;
  const familiarityScore = track.liked ? 1 : Math.min(1, track.playCount / 8);
  const noveltyScore =
    track.playCount === 0 ? 1 : track.playCount < 3 ? 0.72 : track.playCount < 8 ? 0.42 : 0.12;
  let score = 0.15;

  score += hasPreferredGenre ? 0.16 : 0;
  score += hasPreferredMood ? 0.14 : 0;
  score += track.moods.includes(input.moodEntry.moodSignal) ? 0.12 : 0;

  if (context.timeOfDay === "evening" || context.timeOfDay === "lateNight") {
    score += calmScore * 0.22;
    score -= energeticScore * 0.08;
    score += familiarityScore * 0.16;
  } else {
    score += energeticScore * 0.16;
    score += noveltyScore * 0.08;
  }

  if (input.weather.condition === "rainy") {
    score += calmScore * 0.18;
    score += track.moods.some((mood) => ["melancholy", "dreamy", "romantic"].includes(mood))
      ? 0.12
      : 0;
  } else if (input.weather.condition === "sunny") {
    score += energeticScore * 0.14;
    score += noveltyScore * 0.12;
  } else if (input.weather.condition === "cloudy") {
    score += calmScore * 0.1;
  } else if (input.weather.condition === "snowy") {
    score += calmScore * 0.2;
    score -= energeticScore * 0.08;
  }

  if (lane === "familiar") {
    score += 0.16;
  } else if (lane === "fresh") {
    score += 0.12;
  } else {
    score += input.weather.condition === "sunny" ? 0.16 : 0.08;
  }

  if (recentIds.has(track.id)) {
    score -= 0.18;
  }
  score -= Math.min(0.18, track.skipCount * 0.04);

  return {
    track,
    lane,
    score: round3(Math.max(0, score)),
  };
}

function classifyLane(track: Track, input: RecommendationEngineInput): RecommendationItem["lane"] {
  const preferredGenres = new Set(
    input.profile.favoriteGenres.slice(0, 4).map((item) => item.label),
  );
  const preferredMoods = new Set(input.profile.favoriteMoods.slice(0, 4).map((item) => item.label));
  const similar =
    track.genres.some((genre) => preferredGenres.has(genre)) ||
    track.moods.some((mood) => preferredMoods.has(mood));

  if (track.liked || track.playCount >= 5) {
    return "familiar";
  }
  if (similar && track.playCount < 5) {
    return "fresh";
  }
  return "explore";
}

function takeLane(
  items: ScoredTrack[],
  lane: RecommendationItem["lane"],
  count: number,
  selected: ScoredTrack[],
): ScoredTrack[] {
  const selectedIds = new Set(selected.map((item) => item.track.id));
  return items
    .filter((item) => item.lane === lane && !selectedIds.has(item.track.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

function getTimeOfDay(now: Date): RecommendationContext["timeOfDay"] {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "lateNight";
}

function isCalmGenre(genre: string): boolean {
  const value = genre.toLowerCase();
  return [
    "ambient",
    "acoustic",
    "ballad",
    "chill",
    "classical",
    "dream",
    "folk",
    "jazz",
    "lo-fi",
    "lofi",
    "piano",
    "soft",
  ].some((keyword) => value.includes(keyword));
}

function isEnergeticGenre(genre: string): boolean {
  const value = genre.toLowerCase();
  return [
    "dance",
    "edm",
    "electronic",
    "funk",
    "hip-hop",
    "house",
    "metal",
    "pop",
    "punk",
    "rock",
    "techno",
    "trap",
  ].some((keyword) => value.includes(keyword));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
