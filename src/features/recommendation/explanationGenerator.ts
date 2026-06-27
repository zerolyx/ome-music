import type {
  MoodEntry,
  RecommendationContext,
  RecommendationItem,
  Track,
  UserMusicProfile,
} from "../../types/music";
import type { WeatherContext } from "./weatherProvider";

const timeLabel: Record<RecommendationContext["timeOfDay"], string> = {
  morning: "清晨",
  afternoon: "下午",
  evening: "晚上",
  lateNight: "深夜",
};

const weatherLabel: Record<WeatherContext["condition"], string> = {
  sunny: "晴天",
  rainy: "雨天",
  cloudy: "阴天",
  snowy: "雪天",
  unknown: "此刻",
};

export interface ExplanationInput {
  track: Track;
  lane: RecommendationItem["lane"];
  context: RecommendationContext;
  weather: WeatherContext;
  profile: UserMusicProfile;
  moodEntry: MoodEntry;
}

export function generateRecommendationReason({
  track,
  lane,
  context,
  weather,
  moodEntry,
}: ExplanationInput): string {
  const hasCalmTone =
    track.moods.includes("calm") ||
    track.moods.includes("dreamy") ||
    track.moods.includes("romantic");
  const hasBrightTone =
    track.moods.includes("energetic") ||
    track.moods.includes("happy") ||
    track.genres.some(isBrightGenre);

  if (context.timeOfDay === "lateNight") {
    return hasCalmTone
      ? "这首歌有一点夜晚的空气感，适合现在慢慢听。"
      : "深夜需要一点轻的起伏，这首刚好不会太用力。";
  }

  if (context.timeOfDay === "evening") {
    return hasCalmTone
      ? "今晚可以慢下来，它的声音会把空间留得很柔和。"
      : "夜色已经落下，这首还能保留一点温热的节奏。";
  }

  if (weather.condition === "rainy") {
    return "雨天适合留一点空间，这首不会打断情绪。";
  }

  if (moodEntry.moodSignal && track.moods.includes(moodEntry.moodSignal)) {
    if (track.moods.includes("melancholy")) {
      return "它贴着今天的心绪，留了一点温柔的暗面。";
    }

    if (track.moods.includes("energetic")) {
      return "它让今天的状态多一点速度感，但不会显得吵。";
    }

    if (hasCalmTone) {
      return "它把此刻放得很轻，适合安静地顺着听。";
    }

    if (lane === "fresh") {
      return "它接住今天的心情，又多了一点新的颜色。";
    }

    if (lane === "explore") {
      return "它贴着今天的状态，也把氛围轻轻往外带一点。";
    }

    return "它和今天的心情贴得很近，适合顺着听下去。";
  }

  if (lane === "fresh") {
    return weather.condition === "sunny" && hasBrightTone
      ? "有熟悉的质感，也有一点清亮的新鲜感。"
      : "熟悉的质感里带一点新鲜，适合接在现在这首后面。";
  }

  if (lane === "explore") {
    return weather.condition === "sunny" && hasBrightTone
      ? "这首像把窗打开一点，适合换换空气。"
      : "给当前的氛围留一个新的方向，但不会突然跳开。";
  }

  if (weather.condition === "sunny" && hasBrightTone) {
    return "天气很亮，这首歌也有干净的光感。";
  }

  if (hasCalmTone) {
    return "它的轮廓很轻，适合留在此刻的背景里。";
  }

  return "这首的节奏很稳，可以自然地把下一段时间带起来。";
}

export function weatherDisplayName(condition: WeatherContext["condition"]): string {
  return weatherLabel[condition];
}

export function timeDisplayName(timeOfDay: RecommendationContext["timeOfDay"]): string {
  return timeLabel[timeOfDay];
}

function isBrightGenre(genre: string): boolean {
  const value = genre.toLowerCase();
  return ["dance", "funk", "indie", "pop", "rock", "synth"].some((keyword) =>
    value.includes(keyword),
  );
}
