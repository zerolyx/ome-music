export type WeatherCondition = "sunny" | "rainy" | "cloudy" | "snowy" | "unknown";

export interface WeatherContext {
  condition: WeatherCondition;
  temperatureCelsius?: number;
  locationLabel: string;
  observedAt: string;
}

export interface WeatherProvider {
  readonly provider: "mock" | "system" | "network";
  getWeather(now: Date): Promise<WeatherContext>;
}

export class MockWeatherProvider implements WeatherProvider {
  readonly provider = "mock" as const;

  async getWeather(now: Date): Promise<WeatherContext> {
    const month = now.getMonth() + 1;
    const hour = now.getHours();
    const daySeed = now.getDate() + hour;
    const condition = pickMockCondition(month, daySeed);

    return {
      condition,
      temperatureCelsius:
        condition === "snowy" ? -2 : condition === "rainy" ? 18 : condition === "sunny" ? 26 : 21,
      locationLabel: "本地天气",
      observedAt: now.toISOString(),
    };
  }
}

function pickMockCondition(month: number, seed: number): WeatherCondition {
  if ((month === 12 || month <= 2) && seed % 5 === 0) {
    return "snowy";
  }
  if (seed % 4 === 0) {
    return "rainy";
  }
  if (seed % 3 === 0) {
    return "cloudy";
  }
  return "sunny";
}
