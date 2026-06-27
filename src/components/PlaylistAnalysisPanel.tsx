import { Loader2, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import type { PlaylistAnalysisReport } from "../musicUnderstanding/analyzer";

interface PlaylistAnalysisPanelProps {
  report: PlaylistAnalysisReport | null;
  isAnalyzing: boolean;
  trackCount: number;
  onAnalyze: () => void;
}

export function PlaylistAnalysisPanel({
  report,
  isAnalyzing,
  trackCount,
  onAnalyze,
}: PlaylistAnalysisPanelProps) {
  const [isOpen, setOpen] = useState(false);
  const final = report?.finalInterpretation;

  const analyze = () => {
    setOpen(true);
    onAnalyze();
  };

  return (
    <>
      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-32 lg:px-12">
        <div className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/48">歌单解读</p>
            <p className="mt-1 line-clamp-1 text-sm text-white/34">
              {final ? final.musicPersonality : "读一读这批歌的气质。"}
            </p>
          </div>
          <div className="flex gap-2">
            {report && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="app-transition h-10 rounded-full bg-white/[0.06] px-4 text-sm font-medium text-white/58 hover:bg-white/[0.1] hover:text-white/86"
              >
                查看
              </button>
            )}
            <button
              onClick={analyze}
              disabled={isAnalyzing || trackCount === 0}
              className="app-transition inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-white/[0.1] px-4 text-sm font-medium text-white/70 hover:bg-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isAnalyzing ? "解读中" : report ? "重新解读" : "开始解读"}
            </button>
          </div>
        </div>
      </section>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/38 px-5 backdrop-blur-2xl">
          <section className="max-h-[82vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-graphite-950/84 p-6 shadow-[0_28px_96px_rgba(0,0,0,0.46)]">
            <div className="mb-6 flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-white/44">歌单解读</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {report?.playlistName ?? "当前曲库"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="app-transition flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/58 hover:bg-white/[0.12] hover:text-white"
                aria-label="关闭歌单解读"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isAnalyzing && (
              <div className="flex h-48 items-center justify-center text-sm text-white/46">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在解读
              </div>
            )}

            {!isAnalyzing && !final && (
              <p className="text-sm leading-6 text-white/42">只读取曲目信息，不发送音频文件。</p>
            )}

            {!isAnalyzing && final && (
              <div className="space-y-7">
                <p className="max-w-3xl text-2xl font-semibold leading-9 text-white/86">
                  {final.musicPersonality}
                </p>

                <div className="grid gap-6 md:grid-cols-3">
                  <TextGroup title="情绪" items={final.favoriteMoods} />
                  <TextGroup title="场景" items={final.favoriteScenes} />
                  <TextGroup title="风格" items={final.genrePreferences} />
                </div>

                <p className="max-w-3xl text-sm leading-6 text-white/48">
                  {final.recommendationStrategy}
                </p>

                {report.layeredChunks.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-3">
                    {report.layeredChunks.slice(0, 3).map((chunk) => (
                      <div key={chunk.id} className="app-surface-soft p-4">
                        <div className="mb-2 text-xs text-white/34">
                          第 {chunk.index + 1} 段 · {chunk.trackCount} 首
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-white/52">
                          {chunk.notablePatterns[0] || "这一段保留了清晰的听感线索。"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function TextGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-3 text-xs font-medium tracking-[0.12em] text-white/34">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 4).map((item) => (
          <span
            key={item}
            className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm text-white/52"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
