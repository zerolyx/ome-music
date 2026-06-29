import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { ChevronDown, Loader2, Music2, RefreshCw, Search, Settings, X } from "lucide-react";
import {
  BilibiliMusicProvider,
  ensureNeteaseApiService,
  getBilibiliSourceConfig,
  getNeteaseSourceConfig,
  NetEaseMusicProvider,
  waitForNeteaseServiceReady,
  type MusicSourceSong,
} from "../features/musicSources/provider";
import type { Track } from "../types/music";
import { formatDuration } from "../utils/format";
import { ArtworkImage } from "./ArtworkImage";

const neteaseProvider = new NetEaseMusicProvider();
const bilibiliProvider = new BilibiliMusicProvider();

// 客户端分页每页条数：首次请求已取到足够结果（NetEase 20 条 / Bilibili 12 条），
// 不实现真正的服务端分页（符合 Lightweight First）。
const SOURCE_PAGE_SIZE = 6;

interface TopSearchProps {
  tracks: Track[];
  onPlayLocal: (track: Track) => void;
  onPlayNetEase: (song: MusicSourceSong) => Promise<void | boolean>;
  onPlayBilibili: (song: MusicSourceSong) => Promise<void | boolean>;
  onOpenSettings?: () => void;
}

export function TopSearch({
  tracks,
  onPlayLocal,
  onPlayNetEase,
  onPlayBilibili,
  onOpenSettings,
}: TopSearchProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bilibiliPlayRequestRef = useRef<number>(0);
  const closeSoonTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [neteaseEnabled, setNeteaseEnabled] = useState(false);
  const [bilibiliEnabled, setBilibiliEnabled] = useState(false);
  const [neteaseResults, setNeteaseResults] = useState<MusicSourceSong[]>([]);
  const [bilibiliResults, setBilibiliResults] = useState<MusicSourceSong[]>([]);
  const [isSearchingSource, setSearchingSource] = useState(false);
  const [isSearchingBilibili, setSearchingBilibili] = useState(false);
  const [neteaseMessage, setNeteaseMessage] = useState<string | null>(null);
  const [bilibiliMessage, setBilibiliMessage] = useState<string | null>(null);
  const [playingBilibiliId, setPlayingBilibiliId] = useState<string | null>(null);
  const [neteaseVisible, setNeteaseVisible] = useState(SOURCE_PAGE_SIZE);
  const [bilibiliVisible, setBilibiliVisible] = useState(SOURCE_PAGE_SIZE);
  // NetEase 服务启动状态门：扫码后立即搜索时服务可能尚未就绪，需要在前端友好等待并提示。
  const [neteaseServiceStarting, setNeteaseServiceStarting] = useState(false);
  const [neteaseServiceError, setNeteaseServiceError] = useState<string | null>(null);
  // 触发重新尝试服务门：自增以重置搜索 effect 走一遍服务等待。
  const [neteaseRetryToken, setNeteaseRetryToken] = useState(0);

  const localResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks.slice(0, 8);
    return tracks
      .filter((track) =>
        `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [query, tracks]);

  useEffect(() => {
    let cancelled = false;
    refreshSourceConfig()
      .then((config) => {
        if (!cancelled) setNeteaseEnabled(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setNeteaseEnabled(false);
      });
    getBilibiliSourceConfig()
      .then((config) => {
        if (!cancelled) setBilibiliEnabled(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setBilibiliEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSourceConfig = () => getNeteaseSourceConfig();

  useEffect(() => {
    const term = query.trim();
    setNeteaseMessage(null);
    setNeteaseServiceError(null);

    if (!isOpen || !neteaseEnabled || term.length < 2) {
      setNeteaseResults([]);
      setNeteaseServiceStarting(false);
      return;
    }

    // 新搜索重置可见数
    setNeteaseVisible(SOURCE_PAGE_SIZE);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      // 服务门：扫码后立即搜索时，NetEase 服务可能尚未就绪。
      // 先检查 stage，未就绪则在前端就近等待并给出友好提示，避免静默失败。
      try {
        const status = await ensureNeteaseApiService();
        if (cancelled) return;
        if (status.stage !== "ready") {
          setNeteaseServiceStarting(true);
          const waited = await waitForNeteaseServiceReady();
          if (cancelled) return;
          setNeteaseServiceStarting(false);
          if (waited.stage !== "ready") {
            setNeteaseResults([]);
            setNeteaseServiceError(
              waited.message || "网易云源暂时不可用 / NetEase source is unavailable right now.",
            );
            return;
          }
        }
      } catch (error) {
        if (cancelled) return;
        setNeteaseServiceStarting(false);
        setNeteaseResults([]);
        setNeteaseServiceError(readNeteaseServiceError(error));
        return;
      }

      if (cancelled) return;
      setSearchingSource(true);
      neteaseProvider
        .searchSongs(term)
        .then((songs) => {
          // 不再 slice(12) 白白丢 8 条 —— 后端已返回 20 条，全部保留供客户端分页
          if (!cancelled) setNeteaseResults(songs);
        })
        .catch((error) => {
          if (!cancelled) {
            setNeteaseResults([]);
            setNeteaseMessage(readNeteaseSearchError(error));
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingSource(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, neteaseEnabled, query, neteaseRetryToken]);

  useEffect(() => {
    const term = query.trim();
    setBilibiliMessage(null);

    if (!isOpen || !bilibiliEnabled || term.length < 2) {
      setBilibiliResults([]);
      return;
    }

    setBilibiliVisible(SOURCE_PAGE_SIZE);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchingBilibili(true);
      bilibiliProvider
        .searchSongs(term)
        .then((songs) => {
          if (!cancelled) setBilibiliResults(songs);
        })
        .catch((error) => {
          if (!cancelled) {
            setBilibiliResults([]);
            setBilibiliMessage(readSourceError(error));
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingBilibili(false);
        });
    }, 480);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bilibiliEnabled, isOpen, query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(
    () => () => {
      if (closeSoonTimerRef.current !== null) window.clearTimeout(closeSoonTimerRef.current);
    },
    [],
  );

  const closeSoon = () => {
    if (closeSoonTimerRef.current !== null) window.clearTimeout(closeSoonTimerRef.current);
    closeSoonTimerRef.current = window.setTimeout(() => {
      closeSoonTimerRef.current = null;
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  };

  return (
    <div
      ref={rootRef}
      data-danmaku-safe-zone="search"
      className="fixed left-1/2 top-5 z-40 w-[min(34vw,560px)] min-w-[300px] max-w-[calc(100vw-8rem)] -translate-x-1/2 max-md:left-6 max-md:right-20 max-md:w-auto max-md:min-w-0 max-md:max-w-none max-md:translate-x-0"
    >
      <div className="search-glass flex h-10 items-center gap-2.5 rounded-full px-3.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[#4a2108]/28" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            setOpen(true);
            void refreshSourceConfig()
              .then((config) => setNeteaseEnabled(config.enabled))
              .catch(() => setNeteaseEnabled(false));
            void getBilibiliSourceConfig()
              .then((config) => setBilibiliEnabled(config.enabled))
              .catch(() => setBilibiliEnabled(false));
          }}
          onBlur={closeSoon}
          placeholder="Find a song for this moment..."
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#4a2108]/68 outline-none placeholder:text-[#4a2108]/24"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setNeteaseResults([]);
              setBilibiliResults([]);
            }}
            className="app-transition flex h-7 w-7 items-center justify-center rounded-full text-[#4a2108]/38 hover:bg-[#4a2108]/10 hover:text-[#4a2108]/72"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && query.trim().length > 0 && (
        <div
          data-testid="search-results"
          className="search-popover search-results-scroll mt-2.5 min-h-0 max-h-[min(62svh,calc(100svh-6.25rem),520px)] touch-pan-y overflow-y-auto overscroll-contain rounded-[24px] p-3 pr-2"
          onWheel={(event) => event.stopPropagation()}
        >
          <SearchGroup title="Local Library">
            {localResults.length ? (
              localResults.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPlayLocal(track);
                    setOpen(false);
                  }}
                  className="search-result-row"
                >
                  <ArtworkImage
                    src={track.coverUrl}
                    alt={track.album}
                    source={track.source}
                    className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]"
                  />
                  <ResultText title={track.title} subtitle={track.artist} />
                </button>
              ))
            ) : (
              <EmptyLine text="No local match yet." />
            )}
          </SearchGroup>

          {query.trim().length >= 2 && (
            <SearchGroup title="NetEase Cloud Music">
              {!neteaseEnabled ? (
                <SourceDisabledHint
                  label="网易云源未启用 / NetEase source is off"
                  onOpenSettings={onOpenSettings}
                />
              ) : neteaseServiceStarting ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#4a2108]/46">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在启动网易云音乐源 / Starting NetEase music source…
                  <span className="ml-auto text-[10px] font-semibold text-[#4a2108]/32">
                    第一次启动可能需要几秒 / 本地音乐可以立即播放
                  </span>
                </div>
              ) : neteaseServiceError ? (
                <div className="flex flex-col gap-2 px-2 py-3">
                  <p className="text-xs font-semibold text-[#4a2108]/56">{neteaseServiceError}</p>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setNeteaseServiceError(null);
                      setNeteaseRetryToken((value) => value + 1);
                    }}
                    className="app-transition inline-flex w-fit items-center gap-1.5 rounded-full bg-[#4a2108]/8 px-2.5 py-1 text-[11px] font-bold text-[#4a2108]/62 hover:bg-[#4a2108]/14 hover:text-[#4a2108]/82"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重试 / Retry
                  </button>
                </div>
              ) : isSearchingSource ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#4a2108]/38">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching NetEase Cloud Music…
                </div>
              ) : neteaseResults.length ? (
                <>
                  {neteaseResults.slice(0, neteaseVisible).map((song) => (
                    <button
                      key={song.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={async () => {
                        await onPlayNetEase(song);
                        setOpen(false);
                      }}
                      className="search-result-row"
                    >
                      {song.coverUrl ? (
                        <ArtworkImage
                          src={song.coverUrl}
                          alt={song.album}
                          source="netease"
                          className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#4a2108]/10 text-[#4a2108]/38">
                          <Music2 className="h-4 w-4" />
                        </div>
                      )}
                      <ResultText title={song.title} subtitle={`${song.artist} · ${song.album}`} />
                      {song.unavailable && (
                        <span className="ml-auto text-xs font-semibold text-[#4a2108]/30">
                          unavailable
                        </span>
                      )}
                    </button>
                  ))}
                  {neteaseResults.length > neteaseVisible && (
                    <ShowMoreButton
                      onClick={() => setNeteaseVisible((v) => v + SOURCE_PAGE_SIZE)}
                    />
                  )}
                </>
              ) : (
                <EmptyLine text={neteaseMessage ?? "No outside match yet."} />
              )}
            </SearchGroup>
          )}

          {query.trim().length >= 2 && (
            <SearchGroup title="Bilibili">
              {!bilibiliEnabled ? (
                <SourceDisabledHint
                  label="Bilibili 源未启用 / Bilibili source is off"
                  onOpenSettings={onOpenSettings}
                />
              ) : isSearchingBilibili ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#4a2108]/38">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching Bilibili…
                </div>
              ) : bilibiliResults.length ? (
                <>
                  {bilibiliResults.slice(0, bilibiliVisible).map((song) => (
                    <button
                      key={song.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={async () => {
                        const requestId = bilibiliPlayRequestRef.current + 1;
                        bilibiliPlayRequestRef.current = requestId;
                        setPlayingBilibiliId(song.id);
                        const started = await onPlayBilibili(song);
                        if (bilibiliPlayRequestRef.current !== requestId) return;
                        setPlayingBilibiliId(null);
                        if (started) setOpen(false);
                      }}
                      className="search-result-row"
                    >
                      <ArtworkImage
                        src={song.coverUrl}
                        alt={song.title}
                        source="bilibili"
                        className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]"
                      />
                      <ResultText
                        title={song.title}
                        subtitle={`${song.uploader ?? song.artist} · ${formatDuration(song.durationSeconds)}`}
                      />
                      {playingBilibiliId === song.id ? (
                        <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-[#4a2108]/38" />
                      ) : typeof song.danmakuCount === "number" ? (
                        <span className="ml-auto text-xs font-semibold text-[#4a2108]/30">
                          {compactNumber(song.danmakuCount)} danmaku
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {bilibiliResults.length > bilibiliVisible && (
                    <ShowMoreButton
                      onClick={() => setBilibiliVisible((v) => v + SOURCE_PAGE_SIZE)}
                    />
                  )}
                </>
              ) : (
                <EmptyLine text={bilibiliMessage ?? "No Bilibili match yet."} />
              )}
            </SearchGroup>
          )}
        </div>
      )}
    </div>
  );
}

function compactNumber(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`;
  return `${value}`;
}

function readSourceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("web verification") || message.includes("paused this search")) {
    return "Bilibili needs a brief pause. Try this search again in a moment.";
  }
  return "Bilibili 搜索失败，请稍后再试 / Bilibili search failed, please try again.";
}

function readNeteaseSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    message.includes("Could not reach") ||
    message.includes("Could not reach") ||
    message.includes("\u65e0\u6cd5\u8fde\u63a5") ||
    message.includes("ECONNREFUSED") ||
    message.includes("connect to") ||
    message.includes("Network Error")
  ) {
    return "NetEase Cloud Music is not ready yet. Try again shortly or reconnect the music source in Settings.";
  }
  return message || "NetEase search failed, please try again.";
}

function readNeteaseServiceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) {
    return "网易云源暂时无法启动 / Could not start the NetEase source.";
  }
  return message;
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-2 pb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#4a2108]/28">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ResultText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="min-w-0 text-left">
      <span className="block truncate text-sm font-black text-[#4a2108]/78">{title}</span>
      <span className="block truncate text-xs font-semibold text-[#4a2108]/36">{subtitle}</span>
    </span>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="px-2 py-3 text-xs font-semibold text-[#4a2108]/34">{text}</p>;
}

function SourceDisabledHint({
  label,
  onOpenSettings,
}: {
  label: string;
  onOpenSettings?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-3">
      <span className="text-xs font-semibold text-[#4a2108]/38">{label}</span>
      {onOpenSettings && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenSettings}
          className="app-transition inline-flex items-center gap-1.5 rounded-full bg-[#4a2108]/8 px-2.5 py-1 text-[11px] font-bold text-[#4a2108]/62 hover:bg-[#4a2108]/14 hover:text-[#4a2108]/82"
        >
          <Settings className="h-3 w-3" />
          启用 / Enable
        </button>
      )}
    </div>
  );
}

function ShowMoreButton({ onClick }: { onClick: () => void }) {
  // 克制版「Show more」：不显示总数，仅暗示可继续展开（符合产品定义的克制气质）
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="app-transition mt-1 flex w-full items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-bold text-[#4a2108]/42 hover:bg-[#4a2108]/6 hover:text-[#4a2108]/68"
    >
      更多 / Show more
      <ChevronDown className="h-3 w-3" />
    </button>
  );
}
