import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { Track } from "../types/music";
import type { LyricLine } from "../features/lyrics/lyricsResolver";
import type { BilibiliDanmakuDebug, DanmakuItem } from "../features/musicSources/provider";
import { ArtworkImage } from "./ArtworkImage";
import { DanmakuAtmosphereLayer } from "./DanmakuAtmosphereLayer";

interface NowPlayingHeroProps {
  track: Track | null;
  lyrics: LyricLine[];
  currentLyricIndex: number;
  lyricWarning?: string | null;
  isPlaying: boolean;
  isLyricsLoading: boolean;
  videoAtmosphereSrc: string;
  progressSeconds: number;
  danmakuItems: DanmakuItem[];
  danmakuDebug?: BilibiliDanmakuDebug | null;
  isImporting: boolean;
  error: string | null;
  onImport: () => void;
}

export function NowPlayingHero({
  track,
  lyrics,
  currentLyricIndex,
  lyricWarning,
  isPlaying,
  isLyricsLoading,
  videoAtmosphereSrc,
  progressSeconds,
  danmakuItems,
  danmakuDebug,
  isImporting,
  error,
  onImport
}: NowPlayingHeroProps) {
  const [isTitleExpanded, setTitleExpanded] = useState(false);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitleExpanded(false);
  }, [track?.id]);

  useEffect(() => {
    if (!isTitleExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTitleExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isTitleExpanded]);

  useEffect(() => {
    const container = lyricsScrollRef.current;
    const activeLine = container?.querySelector<HTMLElement>(`[data-lyric-index="${currentLyricIndex}"]`);
    if (!container || !activeLine) return;
    const targetTop = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: isPlaying ? "smooth" : "auto" });
  }, [currentLyricIndex, isPlaying, track?.id]);

  if (!track) {
    return (
      <section className="relative flex min-h-screen items-center justify-center px-8">
        <div className="max-w-xl text-center">
          <p className="mb-5 text-sm font-medium text-[#4a2108]/[0.38]">OME</p>
          <h1 className="text-5xl font-black leading-tight text-[#4a2108]/[0.82] sm:text-7xl">
            Let the record wake first
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-8 text-[#4a2108]/[0.42]">
            Choose a music folder, then let the room fill with cover light, sound, and words.
          </p>
          {error && <p className="mt-5 text-sm text-[#7a2d1c]/70">{error}</p>}
          <button
            onClick={onImport}
            disabled={isImporting}
            className="app-transition mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#4a2108]/[0.86] px-6 text-sm font-semibold text-[#efe4d8] shadow-[0_18px_46px_rgba(74,33,8,0.22)] hover:scale-[1.015] hover:bg-[#4a2108] disabled:cursor-wait disabled:opacity-70"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {isImporting ? "Waking the records" : "Choose Music Folder"}
          </button>
        </div>
      </section>
    );
  }

  const isBilibiliStage = track.source === "bilibili" && !isLyricsLoading && lyrics.length === 0;

  return (
    <section className="now-playing-stage relative mx-auto grid min-h-screen w-full max-w-[1780px] grid-cols-1 items-center gap-12 px-[clamp(2rem,5vw,6rem)] md:grid-cols-[minmax(280px,0.82fr)_minmax(500px,1.38fr)] md:gap-[clamp(3rem,5.6vw,6.5rem)]">
      <div data-danmaku-safe-zone="left-visual" className="left-visual-stack relative z-10 flex min-w-0 flex-col items-center md:items-start">
        <div className="record-sleeve">
          <ArtworkImage src={track.coverUrl} alt={track.album || track.title} source={track.source} className="h-full w-full rounded-[18px] object-cover" />
        </div>

        <div className="mt-6 w-[min(70vw,390px)] text-center md:w-[min(29vw,420px)] md:text-left">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setTitleExpanded((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setTitleExpanded((value) => !value);
              }
            }}
            className="block w-full cursor-pointer text-left"
            aria-expanded={isTitleExpanded}
          >
            <h1 title={track.title} className="line-clamp-2 max-h-[2.12em] text-[clamp(1.18rem,1.65vw,1.72rem)] font-bold leading-[1.06] text-[#4a2108]/88 transition-opacity duration-300 hover:opacity-70">
              {track.title}
            </h1>
          </div>
          <div className="mt-4 space-y-1.5 text-[13px] font-semibold leading-5 text-[#4a2108]/[0.3]">
            <p>{track.artist}</p>
            <p>{track.album}</p>
          </div>
        </div>
      </div>

      <div
        data-danmaku-safe-zone={isBilibiliStage ? undefined : "lyrics"}
        className={clsx("right-atmosphere-column relative z-10 min-h-0 min-w-0 overflow-hidden", isBilibiliStage ? "flex w-full items-center" : "lyric-stage h-full min-h-[58vh] py-10")}
      >
        {!isBilibiliStage && <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#d0c6ba]/38 to-transparent" />}
        {!isBilibiliStage && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#d0c6ba]/38 to-transparent" />}

        {isLyricsLoading ? (
          <div className="flex h-[58vh] items-center text-3xl font-black text-[#4a2108]/25">
            <Loader2 className="mr-3 h-6 w-6 animate-spin" />
            Finding the words
          </div>
        ) : lyrics.length > 0 ? (
          <div ref={lyricsScrollRef} className="lyrics-scroll h-[58vh] touch-pan-y overflow-y-auto overscroll-contain py-[24vh] pr-8" onWheel={(event) => event.stopPropagation()}>
            {lyrics.map((line, index) => {
              const offset = index - currentLyricIndex;
              const distance = Math.abs(offset);
              const isCurrent = index === currentLyricIndex;
              const isNeighbor = distance === 1;
              const scale = isCurrent ? 1 : isNeighbor ? 0.92 : 0.84;
              const xOffset = isCurrent ? 0 : isNeighbor ? -12 : -24;

              return (
                <p
                  key={line.id}
                  data-lyric-index={index}
                  style={{
                    transform: `translateX(${xOffset}px) scale(${scale})`
                  }}
                  className={clsx(
                    "flex min-h-[7.75rem] origin-left items-center text-balance text-4xl font-black leading-[1.04] transition-[opacity,filter,transform,color] duration-500 ease-out lg:text-5xl xl:text-7xl",
                    isCurrent && "text-[#4a2108] opacity-100 blur-0",
                    isNeighbor && "text-[#4a2108]/[0.30] opacity-70 blur-[2.5px]",
                    distance > 1 && "text-[#4a2108]/[0.18] opacity-45 blur-[5px]"
                  )}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : track.source === "bilibili" ? (
          <BilibiliVideoAtmosphere
            track={track}
            src={videoAtmosphereSrc}
            isPlaying={isPlaying}
            progressSeconds={progressSeconds}
            danmakuItems={danmakuItems}
            danmakuDebug={danmakuDebug}
          />
        ) : (
          <div className="flex h-[58vh] flex-col justify-center">
            <p className="text-5xl font-black leading-tight text-[#4a2108]/70 xl:text-7xl">
              No matched lyrics for this version.
            </p>
            <p className="mt-8 max-w-xl text-2xl font-black leading-tight text-[#4a2108]/25 xl:text-4xl">
              Let the room breathe for a moment.
            </p>
            {lyricWarning && <p className="mt-6 max-w-md text-sm font-semibold text-[#4a2108]/35">{lyricWarning}</p>}
          </div>
        )}
      </div>

      <div
        className={clsx(
          "fixed inset-0 z-30 bg-[#31180b]/10 backdrop-blur-[3px] transition-opacity duration-300",
          isTitleExpanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setTitleExpanded(false)}
        aria-hidden={!isTitleExpanded}
      >
        <div
          data-danmaku-safe-zone="title-dialog"
          className={clsx(
            "title-reveal-panel fixed bottom-28 left-[5vw] w-[min(520px,88vw)] rounded-[24px] border border-white/18 bg-[#e4d2c4]/55 px-7 py-6 shadow-[0_28px_80px_rgba(74,33,8,0.24)] backdrop-blur-[28px] transition-[opacity,transform] duration-300",
            isTitleExpanded ? "translate-y-0 scale-100 opacity-100" : "translate-y-5 scale-[0.97] opacity-0"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4a2108]/34">Now Playing</p>
          <p className="mt-3 text-balance text-[clamp(1.3rem,2.2vw,2rem)] font-extrabold leading-[1.08] text-[#4a2108]/88">{track.title}</p>
          <p className="mt-4 text-sm font-semibold text-[#4a2108]/42">{track.artist}{track.source === "bilibili" ? " · Bilibili" : ""} · {formatTime(track.durationSeconds)}</p>
        </div>
      </div>
    </section>
  );
}

function BilibiliVideoAtmosphere({
  track,
  src,
  isPlaying,
  progressSeconds,
  danmakuItems,
  danmakuDebug
}: {
  track: Track;
  src: string;
  isPlaying: boolean;
  progressSeconds: number;
  danmakuItems: DanmakuItem[];
  danmakuDebug?: BilibiliDanmakuDebug | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setVideoReady(false);
    setVideoFailed(false);
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    if (src) video.src = src;
    video.load();
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || videoFailed) return;
    if (isPlaying) void video.play().catch(() => undefined);
    else video.pause();
  }, [isPlaying, src, videoFailed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || video.readyState < 1 || Math.abs(video.currentTime - progressSeconds) < 0.85) return;
    video.currentTime = progressSeconds;
  }, [progressSeconds, src]);

  return (
    <div className="bilibili-atmosphere-stage relative aspect-video w-full max-h-[50vh] overflow-hidden rounded-[24px] bg-[#32190f]/12 shadow-[0_30px_86px_rgba(74,33,8,0.18)]">
      <ArtworkImage src={track.coverUrl} alt="" source="bilibili" className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-45 blur-[3px] saturate-75" />
      {src && !videoFailed && (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoReady(true)}
          onError={() => {
            setVideoReady(false);
            setVideoFailed(true);
          }}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = Math.min(progressSeconds, Math.max(0, event.currentTarget.duration || progressSeconds));
          }}
          className={clsx(
            "absolute inset-0 z-[1] h-full w-full object-cover blur-[1.4px] saturate-[0.92] contrast-[0.97] sepia-[0.08] transition-opacity duration-700",
            videoReady ? "opacity-[0.82]" : "opacity-0"
          )}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(74,38,21,0.08),rgba(74,38,21,0.24)),radial-gradient(circle_at_center,transparent_38%,rgba(45,20,11,0.32)_100%)]" />
      <DanmakuAtmosphereLayer
        items={danmakuItems}
        currentTime={progressSeconds}
        isPlaying={isPlaying}
        hasLyrics={false}
        trackId={track.id}
        debug={danmakuDebug}
      />
      <div className="pointer-events-none absolute bottom-6 left-7 right-7 z-30 flex items-end justify-between gap-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/56">
          Bilibili · {videoReady ? "Video Atmosphere" : videoFailed ? "Cover Atmosphere" : "Preparing Atmosphere"}
        </p>
        {videoFailed && <p className="text-[10px] font-semibold text-white/42">Video stream unavailable</p>}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
