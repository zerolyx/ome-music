import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Loader2, Music2, Search, X } from "lucide-react";
import {
  BilibiliMusicProvider,
  getBilibiliSourceConfig,
  getNeteaseSourceConfig,
  NetEaseMusicProvider,
  type MusicSourceSong
} from "../features/musicSources/provider";
import type { Track } from "../types/music";
import { ArtworkImage } from "./ArtworkImage";

const neteaseProvider = new NetEaseMusicProvider();
const bilibiliProvider = new BilibiliMusicProvider();

interface TopSearchProps {
  tracks: Track[];
  onPlayLocal: (track: Track) => void;
  onPlayNetEase: (song: MusicSourceSong) => Promise<void | boolean>;
  onPlayBilibili: (song: MusicSourceSong) => Promise<void | boolean>;
}

export function TopSearch({ tracks, onPlayLocal, onPlayNetEase, onPlayBilibili }: TopSearchProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bilibiliPlayRequestRef = useRef(0);
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

  const localResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks.slice(0, 8);
    return tracks
      .filter((track) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle))
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

    if (!isOpen || !neteaseEnabled || term.length < 2) {
      setNeteaseResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchingSource(true);
      neteaseProvider
        .searchSongs(term)
        .then((songs) => {
          if (!cancelled) setNeteaseResults(songs.slice(0, 12));
        })
        .catch(() => {
          if (!cancelled) {
            setNeteaseResults([]);
            setNeteaseMessage("The outside source is quiet just now.");
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
  }, [isOpen, neteaseEnabled, query]);

  useEffect(() => {
    const term = query.trim();
    setBilibiliMessage(null);

    if (!isOpen || !bilibiliEnabled || term.length < 2) {
      setBilibiliResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchingBilibili(true);
      bilibiliProvider
        .searchSongs(term)
        .then((songs) => {
          if (!cancelled) setBilibiliResults(songs.slice(0, 12));
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

  useEffect(() => () => {
    if (closeSoonTimerRef.current !== null) window.clearTimeout(closeSoonTimerRef.current);
  }, []);

  const closeSoon = () => {
    if (closeSoonTimerRef.current !== null) window.clearTimeout(closeSoonTimerRef.current);
    closeSoonTimerRef.current = window.setTimeout(() => {
      closeSoonTimerRef.current = null;
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  };

  return (
    <div ref={rootRef} data-danmaku-safe-zone="search" className="fixed left-1/2 top-5 z-40 w-[min(34vw,560px)] min-w-[300px] max-w-[calc(100vw-8rem)] -translate-x-1/2 max-md:left-6 max-md:right-20 max-md:w-auto max-md:min-w-0 max-md:max-w-none max-md:translate-x-0">
      <div className="search-glass flex h-10 items-center gap-2.5 rounded-full px-3.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[#4a2108]/28" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            setOpen(true);
            void refreshSourceConfig().then((config) => setNeteaseEnabled(config.enabled)).catch(() => setNeteaseEnabled(false));
            void getBilibiliSourceConfig().then((config) => setBilibiliEnabled(config.enabled)).catch(() => setBilibiliEnabled(false));
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

      {isOpen && (query.trim() || localResults.length > 0) && (
        <div data-testid="search-results" className="search-popover search-results-scroll mt-2.5 min-h-0 max-h-[min(62svh,calc(100svh-6.25rem),520px)] touch-pan-y overflow-y-auto overscroll-contain rounded-[24px] p-3 pr-2" onWheel={(event) => event.stopPropagation()}>
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
                  <ArtworkImage src={track.coverUrl} alt={track.album} source={track.source} className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]" />
                  <ResultText title={track.title} subtitle={track.artist} />
                </button>
              ))
            ) : (
              <EmptyLine text="No local match yet." />
            )}
          </SearchGroup>

          {neteaseEnabled && query.trim().length >= 2 && (
            <SearchGroup title="NetEase Cloud Music">
              {isSearchingSource ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#4a2108]/38">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Listening outside the room
                </div>
              ) : neteaseResults.length ? (
                neteaseResults.map((song) => (
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
                      <ArtworkImage src={song.coverUrl} alt={song.album} source="netease" className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#4a2108]/10 text-[#4a2108]/38">
                        <Music2 className="h-4 w-4" />
                      </div>
                    )}
                    <ResultText title={song.title} subtitle={`${song.artist} · ${song.album}`} />
                    {song.unavailable && <span className="ml-auto text-xs font-semibold text-[#4a2108]/30">unavailable</span>}
                  </button>
                ))
              ) : (
                <EmptyLine text={neteaseMessage ?? "No outside match yet."} />
              )}
            </SearchGroup>
          )}

          {bilibiliEnabled && query.trim().length >= 2 && (
            <SearchGroup title="Bilibili">
              {isSearchingBilibili ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#4a2108]/38">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Tuning the outside room
                </div>
              ) : bilibiliResults.length ? (
                bilibiliResults.map((song) => (
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
                    <ArtworkImage src={song.coverUrl} alt={song.title} source="bilibili" className="h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.18)]" />
                    <ResultText title={song.title} subtitle={`${song.uploader ?? song.artist} · ${formatDuration(song.durationSeconds)}`} />
                    {playingBilibiliId === song.id ? (
                      <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-[#4a2108]/38" />
                    ) : typeof song.danmakuCount === "number" ? (
                      <span className="ml-auto text-xs font-semibold text-[#4a2108]/30">{compactNumber(song.danmakuCount)} danmaku</span>
                    ) : null}
                  </button>
                ))
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

function formatDuration(seconds: number): string {
  if (!seconds) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function compactNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return `${value}`;
}

function readSourceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("web verification") || message.includes("paused this search")) {
    return "Bilibili needs a brief pause. Try this search again in a moment.";
  }
  return "Bilibili is quiet just now. Please try again.";
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-2 pb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#4a2108]/28">{title}</p>
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
