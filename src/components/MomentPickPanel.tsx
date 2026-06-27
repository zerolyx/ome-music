import type { RecommendationItem, Track } from "../types/music";

interface MomentPickPanelProps {
  tracks: Track[];
  recommendations: RecommendationItem[];
}

export function MomentPickPanel({ tracks, recommendations }: MomentPickPanelProps) {
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const picks = recommendations
    .slice(0, 3)
    .map((recommendation) => ({
      recommendation,
      track: trackById.get(recommendation.trackId),
    }))
    .filter((item): item is { recommendation: RecommendationItem; track: Track } =>
      Boolean(item.track),
    );
  const primaryPick = picks[0];
  const heading = getMomentHeading();

  return (
    <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 lg:px-12">
      <div>
        <h2 className="mb-4 text-sm font-medium text-white/62">{heading}</h2>

        {!primaryPick ? (
          <div className="px-1 text-sm leading-6 text-white/42">
            多听几首歌后，这里会慢慢长出适合此刻的下一首。
          </div>
        ) : (
          <div className="app-transition group flex max-w-2xl gap-4 rounded-[24px] bg-white/[0.035] p-3 hover:bg-white/[0.06]">
            <img
              src={primaryPick.track.coverUrl}
              alt={primaryPick.track.album}
              className="app-transition h-16 w-16 shrink-0 rounded-[18px] object-cover shadow-[0_12px_32px_rgba(0,0,0,0.28)] group-hover:scale-[1.02]"
            />
            <div className="min-w-0 pt-1">
              <h3 className="truncate text-sm font-semibold text-white">
                {primaryPick.track.title}
              </h3>
              <p className="mt-1 truncate text-xs text-white/45">{primaryPick.track.artist}</p>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/52">
                {primaryPick.recommendation.reason}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function getMomentHeading(): string {
  const hour = new Date().getHours();

  if (hour >= 23 || hour < 5) return "深夜播放";
  if (hour >= 18) return "今晚适合听";
  if (hour >= 12) return "为此刻挑选";
  return "最近你可能会喜欢";
}
