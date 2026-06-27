import type {
  RecommendationContext,
  RecommendationItem,
  Track,
  UserMusicProfile,
} from "../../types/music";

export function buildLocalRecommendations(
  tracks: Track[],
  profile: UserMusicProfile,
  context: RecommendationContext,
): RecommendationItem[] {
  const preferredGenres = new Set(profile.favoriteGenres.slice(0, 3).map((genre) => genre.label));
  const repeatedLabels = new Set(
    profile.repeatPatterns.slice(0, 3).map((pattern) => pattern.label),
  );

  return tracks
    .map((track) => {
      const genreScore = track.genres.some((genre) => preferredGenres.has(genre)) ? 0.25 : 0;
      const moodScore = context.mood && track.moods.includes(context.mood) ? 0.25 : 0;
      const affinityScore = track.liked
        ? 0.3
        : repeatedLabels.has(track.artist) || repeatedLabels.has(track.album)
          ? 0.22
          : 0.08;
      const explorationScore = track.playCount < 10 ? 0.18 : 0;
      const score = genreScore + moodScore + affinityScore + explorationScore;

      return {
        trackId: track.id,
        score,
        lane: track.liked ? "familiar" : track.playCount < 10 ? "explore" : "fresh",
        reason: `${context.timeOfDay} / ${context.weather} 场景下匹配 ${track.moods.join(", ")} 情绪。`,
      } satisfies RecommendationItem;
    })
    .sort((a, b) => b.score - a.score);
}
