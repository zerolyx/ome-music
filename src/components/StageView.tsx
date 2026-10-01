import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren, CSSProperties } from "preact";
import { Icon } from "./Icon";
import {
  currentTrack,
  duration,
  isPlaying,
  position,
  seek,
} from "../state/player";
import {
  activeLine,
  activeYrcLine,
  lyricLines,
  lyricTrackId,
  romanizationLines,
  lyricSubtitlesFor,
  lyricSubtitleMode,
  tlyricLines,
  plainLyricText,
  plainRomanizationLines,
  yrcLines,
  yrcWordStates,
  type LyricSubtitle,
  type YrcLine,
} from "../state/lyrics";
import {
  closeStage,
  setStageFontScale,
  setStageEffect,
  stageFontScale,
  STAGE_EFFECTS,
  STAGE_FONT_SCALE_MAX,
  STAGE_FONT_SCALE_MIN,
  STAGE_FONT_SCALE_STEP,
  stageEffect,
} from "../state/stage";
import { coverUrl, isTauriRuntime } from "../lib/api";
import { bilibiliImageProxy } from "../state/bilibili";
import {
  musicVideoCandidates,
  musicVideoError,
  musicVideoLoading,
  localMusicVideoCandidates,
  localMusicVideoSelected,
  musicVideoQuality,
  musicVideoResolvedQuality,
  musicVideoProvider,
  musicVideoLookupSource,
  musicVideoSelected,
  musicVideoSrc,
  reportMusicVideoPlaybackFailure,
  resetMusicVideo,
  searchLocalMusicVideo,
  searchMusicVideo,
  setMusicVideoQuality,
  selectMusicVideo,
  selectLocalMusicVideo,
  stopMusicVideo,
} from "../state/music-video";
import {
  chooseStageReadableColors,
  compositeStageLuminances,
  parseCssRgb,
  relativeLuminance,
  type StageReadableColors,
} from "../lib/stage-readable";
import { customTheme, systemDark, themeChoice } from "../state/theme";

function canSampleCover(url: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin ||
      parsed.hostname === "ome-media.localhost" ||
      parsed.protocol === "ome-media:";
  } catch {
    return false;
  }
}

function themeStageReadableColors(): StageReadableColors | null {
  const root = getComputedStyle(document.documentElement);
  const background = parseCssRgb(root.getPropertyValue("--bg"));
  const foreground = parseCssRgb(root.getPropertyValue("--text"));
  const accent = parseCssRgb(root.getPropertyValue("--accent"));
  if (!background || !foreground || !accent) return null;
  return chooseStageReadableColors([relativeLuminance(background)], foreground, accent);
}

function sampleStageCover(url: string): Promise<StageReadableColors | null> {
  if (!url) return Promise.resolve(themeStageReadableColors());
  if (!canSampleCover(url)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    let timeout = 0;
    const finish = (colors: StageReadableColors | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(colors);
    };
    const sample = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finish(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const root = getComputedStyle(document.documentElement);
        const background = parseCssRgb(root.getPropertyValue("--bg"));
        const foreground = parseCssRgb(root.getPropertyValue("--text"));
        const accent = parseCssRgb(root.getPropertyValue("--accent"));
        if (!background || !foreground || !accent) return finish(null);
        finish(chooseStageReadableColors(
          compositeStageLuminances(pixels, background),
          foreground,
          accent,
        ));
      } catch {
        finish(null);
      }
    };

    if (!url.startsWith("data:") && !url.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = sample;
    image.onerror = () => finish(null);
    timeout = window.setTimeout(() => finish(null), 1800);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) queueMicrotask(sample);
  });
}

/** 卡拉 OK 行内扫光（lrc 无字级时间轴，按行估算进度） */
function KaraokeFill({ text, progress }: { text: string; progress: number }) {
  return (
    <>
      <span class="lyric-base">{text}</span>
      <span
        class="lyric-fill"
        style={{ width: `${Math.round(progress * 10000) / 100}%` }}
        aria-hidden="true"
      >
        {text}
      </span>
    </>
  );
}

/** yrc 逐字行：按字状态着色（sung/singing/next） */
function YrcWords({
  line,
  pos,
  variant,
}: {
  line: YrcLine;
  pos: number;
  variant: "fill" | "pop";
}) {
  const states = yrcWordStates(line, pos);
  return (
    <>
      {line.words.map((word, i) => (
        <span key={i} class={`yrc-word yrc-${states[i]} ${variant === "pop" ? "yrc-pop" : ""}`}>
          {word.text}
        </span>
      ))}
    </>
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StageSubtitles({ subtitles }: { subtitles: LyricSubtitle[] }) {
  return (
    <div class="stage-subtitles">
      {subtitles.map(({ kind, text }) => (
        <p key={kind} class={`stage-line stage-translation ${kind === "romanization" ? "stage-romanization" : ""}`}>
          {text}
        </p>
      ))}
    </div>
  );
}

function SeekableStageLine({
  time,
  text,
  className,
  children,
}: {
  time: number;
  text: string;
  className: string;
  children?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={`stage-line stage-seek ${className}`}
      aria-label={`定位到歌词：${text}`}
      title="点击定位到这句歌词"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => seek(time)}
    >
      {children ?? text}
    </button>
  );
}

function scaledClamp(minPx: number, viewportVw: number, maxPx: number, scale: number): string {
  const ratio = scale / 100;
  return `clamp(${(minPx * ratio).toFixed(1)}px, ${(viewportVw * ratio).toFixed(2)}vw, ${(maxPx * ratio).toFixed(1)}px)`;
}

/**
 * 全屏歌词舞台（Folia 式文字 PV）。
 * 三种动效共用同一套 yrc/lrc 数据；鼠标静置 2.8s 后 UI 与光标隐没。
 */
export function StageView() {
  const track = currentTrack.value;
  const pos = position.value;
  const effect = stageEffect.value;
  const cover = track?.coverPath ? coverUrl(track.coverPath) : "";
  const currentThemeChoice = themeChoice.value;
  const currentSystemDark = systemDark.value;
  const currentCustomTheme = customTheme.value;
  const [readableColors, setReadableColors] = useState<StageReadableColors | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [showAllLyrics, setShowAllLyrics] = useState(false);
  const [mvPanelOpen, setMvPanelOpen] = useState(false);
  const allLyricsToggleRef = useRef<HTMLButtonElement>(null);
  const allLyricsListRef = useRef<HTMLDivElement>(null);
  const mvVideoRef = useRef<HTMLVideoElement>(null);
  const mvPlayFailedRef = useRef(false);
  const mvSrc = musicVideoSrc.value;
  const desktopRuntime = isTauriRuntime();
  const paused = !isPlaying.value;

  // Esc 先收起全曲歌词；舞台开着时保留其操作控件。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showAllLyrics) {
        setShowAllLyrics(false);
        allLyricsToggleRef.current?.focus();
      } else if (mvPanelOpen) {
        setMvPanelOpen(false);
      } else {
        closeStage();
      }
    };
    let timer = 0;
    const wake = () => {
      setUiVisible(true);
      window.clearTimeout(timer);
      if (!showAllLyrics) timer = window.setTimeout(() => setUiVisible(false), 2800);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", wake);
    wake();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", wake);
      window.clearTimeout(timer);
    };
  }, [showAllLyrics, mvPanelOpen]);

  useEffect(() => {
    setShowAllLyrics(false);
    setMvPanelOpen(false);
    resetMusicVideo(track?.id ?? null);
  }, [track?.id]);

  useEffect(() => () => resetMusicVideo(null), []);

  // The player remains the clock and the audible source. Correct small drift on
  // the normal audio timeupdate cadence; never let the muted video drive seek.
  useEffect(() => {
    const video = mvVideoRef.current;
    if (!video || !mvSrc) return;

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(pos)) {
      const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.2) : pos;
      const target = Math.max(0, Math.min(pos, maxTime));
      if (Math.abs(video.currentTime - target) > 0.85) {
        try { video.currentTime = target; } catch { /* Wait for a seekable range. */ }
      }
    }

    if (paused) {
      video.pause();
    } else if (video.paused && !mvPlayFailedRef.current) {
      void video.play().catch(() => {
        mvPlayFailedRef.current = true;
        reportMusicVideoPlaybackFailure();
        setMvPanelOpen(true);
      });
    }
  }, [mvSrc, pos, paused]);

  useEffect(() => {
    mvPlayFailedRef.current = false;
  }, [mvSrc]);

  useEffect(() => {
    let active = true;
    setReadableColors(null);
    void sampleStageCover(cover).then((colors) => {
      if (active) setReadableColors(colors);
    });
    return () => {
      active = false;
    };
  }, [cover, currentThemeChoice, currentSystemDark, currentCustomTheme.bg, currentCustomTheme.text, currentCustomTheme.accent]);

  const typography = {
    "--stage-main-size": scaledClamp(28, 5.6, 62, stageFontScale.value),
    "--stage-plain-size": scaledClamp(15, 2.1, 22, stageFontScale.value),
    "--stage-context-size": scaledClamp(15, 2, 20, stageFontScale.value),
    "--stage-secondary-size": scaledClamp(14, 1.8, 18, stageFontScale.value),
    "--stage-ghost-size": scaledClamp(16, 2.2, 22, stageFontScale.value),
  } as CSSProperties;
  const stageStyle = {
    ...typography,
    ...(readableColors ? {
      "--stage-readable-foreground": readableColors.foreground,
      "--stage-readable-accent": readableColors.accent,
      "--stage-readable-shadow": readableColors.shadow,
    } : {}),
  } as CSSProperties;

  const hasYrc = Boolean(track && lyricTrackId.value === track.id && yrcLines.value.length > 0);
  const hasLrc = Boolean(track && lyricTrackId.value === track.id && lyricLines.value.length > 0);
  const hasPlainLyrics = Boolean(track && lyricTrackId.value === track.id && plainLyricText.value.length > 0);
  let plainContentIndex = 0;
  const plainRows = plainLyricText.value.split("\n").map((line) => {
    const romanization = line.trim() ? plainRomanizationLines.value[plainContentIndex++] ?? "" : "";
    return { line, romanization };
  });

  // 行级数据（lrc）
  const lines = lyricLines.value;
  const active = activeLine(lines, pos);
  const current = active >= 0 ? lines[active] : null;
  const prevLine = active >= 0 ? lines[active - 1] : null;
  const nextLine = active + 1 < lines.length ? lines[active + 1] : null;
  const subtitles = current ? lyricSubtitlesFor(current) : [];
  const lineEnd = nextLine?.time ?? (current ? current.time + 8 : 0);
  const lineProgress = current
    ? Math.min(1, Math.max(0, (pos - current.time) / Math.max(lineEnd - current.time, 0.5)))
    : 0;

  // 字级数据（yrc）
  const yrc = yrcLines.value;
  const yIdx = activeYrcLine(yrc, pos);
  const yLine = yIdx >= 0 ? yrc[yIdx] : null;
  const yPrev = yIdx > 0 ? yrc[yIdx - 1] : null;
  const yNext = yIdx + 1 < yrc.length ? yrc[yIdx + 1] : null;
  const join = (line: YrcLine | null) => line?.words.map((w) => w.text).join("") ?? "";
  const ySubtitles = yLine
    ? lyricSubtitlesFor({ time: yLine.start, text: join(yLine) })
    : [];

  const hasTimedLyrics = hasYrc || hasLrc;
  const allLyricRows = useMemo(() => {
    if (!showAllLyrics) return [];
    if (hasYrc) {
      return yrc.map((line, sourceIndex) => {
        const text = join(line);
        return {
          sourceIndex,
          time: line.start,
          text,
          subtitles: lyricSubtitlesFor({ time: line.start, text }),
        };
      }).filter((line) => line.text.trim());
    }
    return lines.map((line, sourceIndex) => ({
      sourceIndex,
      time: line.time,
      text: line.text,
      subtitles: lyricSubtitlesFor(line),
    })).filter((line) => line.text.trim());
  }, [
    showAllLyrics,
    hasYrc,
    yrc,
    lines,
    lyricSubtitleMode.value,
    tlyricLines.value,
    romanizationLines.value,
  ]);

  useEffect(() => {
    if (!showAllLyrics) return;
    const frame = window.requestAnimationFrame(() => {
      const activeRow = allLyricsListRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!activeRow?.scrollIntoView) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      activeRow.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showAllLyrics, track?.id]);

  if (!track) return null;

  return (
    <div
      class={`stage-view fx-${effect} ${uiVisible ? "" : "stage-ui-hidden"}`}
      style={stageStyle}
      data-readable-contrast={readableColors ? "true" : undefined}
      role="dialog"
      aria-label="歌词舞台"
    >
      {cover && (
        <div
          key={cover}
          class="stage-backdrop"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden="true"
        />
      )}
      {mvSrc && (
        <video
          ref={mvVideoRef}
          class="stage-mv-video"
          src={mvSrc}
          muted
          autoPlay
          playsInline
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.2) : pos;
            try { video.currentTime = Math.max(0, Math.min(pos, maxTime)); } catch { /* Browser will retry at canplay. */ }
            if (!paused) {
              void video.play().catch(() => {
                mvPlayFailedRef.current = true;
                reportMusicVideoPlaybackFailure();
                setMvPanelOpen(true);
              });
            }
          }}
          onError={() => {
            reportMusicVideoPlaybackFailure();
            setMvPanelOpen(true);
          }}
        />
      )}
      <div class="stage-veil" aria-hidden="true" />

      <header class={`stage-top ${uiVisible ? "" : "is-hidden"}`}>
        <button class="stage-close" aria-label="退出舞台 (Esc)" onClick={closeStage}>
          <Icon name="close" size={20} />
        </button>
        <div class="stage-switch" role="radiogroup" aria-label="舞台动效">
          {STAGE_EFFECTS.map((item) => (
            <button
              key={item.id}
              role="radio"
              aria-checked={effect === item.id}
              class={`chip-toggle ${effect === item.id ? "is-active" : ""}`}
              onClick={() => setStageEffect(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label class="stage-font-scale-control stage-font-scale-control-inline">
          <span class="stage-font-scale-label">字号</span>
          <input
            type="range"
            min={STAGE_FONT_SCALE_MIN}
            max={STAGE_FONT_SCALE_MAX}
            step={STAGE_FONT_SCALE_STEP}
            value={stageFontScale.value}
            aria-label="舞台歌词字号"
            aria-valuetext={`${stageFontScale.value}%`}
            onInput={(event) => setStageFontScale(Number((event.target as HTMLInputElement).value))}
          />
          <output class="stage-font-scale-value">{stageFontScale.value}%</output>
        </label>
        <div class="stage-utility-actions">
          <button
            type="button"
            class={`stage-lyrics-toggle stage-mv-toggle ${mvPanelOpen || mvSrc ? "is-active" : ""}`}
            aria-label={mvPanelOpen ? "关闭 MV 面板" : "打开 MV 面板"}
            aria-expanded={mvPanelOpen}
            title={mvSrc ? "管理当前静音 MV" : "按需搜索并播放 MV"}
            onClick={() => {
              setMvPanelOpen((open) => !open);
              setUiVisible(true);
            }}
          >
            <Icon name="video" size={17} />
            <span>MV</span>
          </button>
          {hasTimedLyrics && (
            <button
              ref={allLyricsToggleRef}
              type="button"
              class="stage-lyrics-toggle"
              aria-label={showAllLyrics ? "关闭全曲歌词" : "浏览全曲歌词"}
              aria-expanded={showAllLyrics}
              title={showAllLyrics ? "返回舞台歌词" : "查看本曲全曲歌词"}
              onClick={() => {
                setShowAllLyrics((open) => !open);
                setUiVisible(true);
              }}
            >
              <Icon name="lyrics" size={17} />
              <span>{showAllLyrics ? "返回舞台" : "全曲歌词"}</span>
            </button>
          )}
        </div>
      </header>

      {mvPanelOpen && (
        <section class={`stage-mv-panel ${uiVisible ? "" : "is-hidden"}`} aria-label="音乐视频">
          <header class="stage-mv-panel-heading">
            <div>
              <span class="stage-mv-kicker">随当前音乐</span>
              <strong>MV 影像</strong>
            </div>
            <button class="stage-mv-panel-close" type="button" aria-label="关闭 MV 面板" onClick={() => setMvPanelOpen(false)}>
              <Icon name="close" size={17} />
            </button>
          </header>
          <p class="stage-mv-hint">视频静音跟随歌曲进度；查找只在你点击后进行。B 站会联网，本地查找只检查已授权曲库目录。</p>
          {!desktopRuntime && <p class="stage-mv-notice" role="status">MV 搜索与播放仅在 Ome Music 桌面版可用。</p>}
          <div class="stage-mv-actions">
            <button
              class="btn-primary"
              type="button"
              disabled={!desktopRuntime || musicVideoLoading.value}
              onClick={() => void searchMusicVideo(track)}
            >
              {musicVideoLoading.value && musicVideoLookupSource.value === "bilibili" ? "正在查找…" : "搜索 B 站 MV"}
            </button>
            {track.source === "local" && (
              <button
                class="btn-secondary"
                type="button"
                disabled={!desktopRuntime || musicVideoLoading.value}
                onClick={() => void searchLocalMusicVideo(track)}
              >
                {musicVideoLoading.value && musicVideoLookupSource.value === "local" ? "正在查找…" : "在本地找 MV"}
              </button>
            )}
            {musicVideoLookupSource.value === "bilibili" && (
              <label class="stage-mv-quality-control">
                <span>最高画质</span>
                <select
                  aria-label="MV 画质上限"
                  value={musicVideoQuality.value}
                  disabled={!desktopRuntime || musicVideoLoading.value}
                  onChange={(event) => void setMusicVideoQuality(Number(event.currentTarget.value))}
                >
                  <option value={16}>360p</option>
                  <option value={32}>480p</option>
                  <option value={64}>720p</option>
                </select>
              </label>
            )}
            {mvSrc && (
              <button class="btn-secondary" type="button" onClick={stopMusicVideo}>
                停止 MV
              </button>
            )}
          </div>
          {musicVideoError.value && <p class="stage-mv-error" role="status">{musicVideoError.value}</p>}
          {musicVideoLookupSource.value === "local" && localMusicVideoCandidates.value.length > 0 ? (
            <div class="stage-mv-results" role="group" aria-label="本地 MV 候选">
              {localMusicVideoCandidates.value.map((candidate) => {
                const selected = musicVideoProvider.value === "local"
                  && localMusicVideoSelected.value?.id === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    class={`stage-mv-result ${selected ? "is-selected" : ""}`}
                    type="button"
                    disabled={!desktopRuntime || musicVideoLoading.value}
                    aria-pressed={selected}
                    onClick={async () => {
                      await selectLocalMusicVideo(track, candidate);
                      if (musicVideoSrc.value) setMvPanelOpen(false);
                    }}
                  >
                    <span class="stage-mv-result-placeholder"><Icon name="video" size={19} /></span>
                    <span class="stage-mv-result-copy">
                      <strong>{candidate.title}</strong>
                      <span>{formatFileSize(candidate.sizeBytes)} · {candidate.reasons.join(" · ")}</span>
                    </span>
                    {selected && <span class="stage-mv-selected-mark" aria-label="正在播放">播放中</span>}
                  </button>
                );
              })}
            </div>
          ) : musicVideoLookupSource.value === "bilibili" && musicVideoCandidates.value.length > 0 ? (
            <div class="stage-mv-results" role="group" aria-label="B 站 MV 候选">
              {musicVideoCandidates.value.map((candidate) => {
                const image = bilibiliImageProxy(candidate.coverUrl);
                const selected = musicVideoSelected.value?.bvid === candidate.bvid;
                return (
                  <button
                    key={candidate.bvid}
                    class={`stage-mv-result ${selected ? "is-selected" : ""}`}
                    type="button"
                    disabled={!desktopRuntime || musicVideoLoading.value}
                    aria-pressed={selected}
                    onClick={async () => {
                      await selectMusicVideo(track, candidate);
                      if (musicVideoSrc.value) setMvPanelOpen(false);
                    }}
                  >
                    {image ? <img src={image} alt="" loading="lazy" /> : <span class="stage-mv-result-placeholder"><Icon name="video" size={19} /></span>}
                    <span class="stage-mv-result-copy">
                      <strong>{candidate.name}</strong>
                      <span>{candidate.artist} · {formatTime(candidate.durationSeconds)}</span>
                    </span>
                    {selected && <span class="stage-mv-selected-mark" aria-label="正在播放">播放中</span>}
                  </button>
                );
              })}
            </div>
          ) : !musicVideoLoading.value && !musicVideoError.value ? (
            <p class="stage-mv-empty" role="status">
              {musicVideoLookupSource.value === "local"
                ? "没有找到匹配的本地视频；只检查了当前歌曲附近的已授权曲库目录。"
                : "搜索结果会出现在这里。选择后才会加载视频。"}
            </p>
          ) : null}
          {musicVideoLoading.value && <p class="stage-mv-loading" role="status">
            {musicVideoLookupSource.value === "local" ? "正在检查已授权的本地曲库目录…" : "正在连接 B 站…"}
          </p>}
        </section>
      )}

      {mvSrc && (
        <div class={`stage-mv-caption ${uiVisible ? "" : "is-hidden"}`} role="status" aria-live="polite">
          <span>
            静音 MV · {musicVideoSelected.value?.name ?? localMusicVideoSelected.value?.title ?? "已选择视频"}
            {musicVideoResolvedQuality.value ? ` · ${musicVideoResolvedQuality.value}` : ""}
          </span>
          <button type="button" aria-label="关闭当前 MV" onClick={stopMusicVideo}><Icon name="close" size={15} /></button>
        </div>
      )}

      <div class="stage-body" aria-live={showAllLyrics ? "off" : "polite"}>
        {showAllLyrics && hasTimedLyrics && (
          <section class="stage-full-lyrics" aria-label="全曲歌词">
            <header class="stage-full-lyrics-heading">
              <div>
                <h2>全曲歌词</h2>
                <p>点击任一句，跳转到对应位置</p>
              </div>
              <span>{allLyricRows.length} 句</span>
            </header>
            <div
              ref={allLyricsListRef}
              class="stage-full-lyrics-list"
              role="region"
              aria-label="全曲歌词列表"
              tabIndex={0}
            >
              {allLyricRows.map((line) => {
                const isActive = line.sourceIndex === (hasYrc ? yIdx : active);
                return (
                  <button
                    key={`${line.time}-${line.sourceIndex}`}
                    type="button"
                    class={`stage-full-lyrics-row ${isActive ? "is-active" : ""}`}
                    aria-label={`定位到歌词：${line.text}`}
                    aria-current={isActive ? "true" : undefined}
                    title="点击定位到这句歌词"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => seek(line.time)}
                  >
                    <span class="stage-full-lyrics-primary">{line.text}</span>
                    {line.subtitles.map(({ kind, text }) => (
                      <span key={kind} class={`stage-full-lyrics-subtitle ${kind === "romanization" ? "stage-romanization" : ""}`}>
                        {text}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <div class="stage-original-content" hidden={showAllLyrics && hasTimedLyrics}>
            {!hasYrc && !hasLrc && !hasPlainLyrics && <p class="stage-empty">这首歌曲暂无歌词，尽情聆听</p>}

            {hasPlainLyrics && (
              <div class="stage-lines stage-plain" role="region" aria-label="未同步歌词" tabIndex={0}>
                {plainRows.map(({ line, romanization }, index) => (
                  <p key={index} class="stage-line stage-plain-line">
                    <span>{line || "\u00a0"}</span>
                    {(lyricSubtitleMode.value === "romanization" || lyricSubtitleMode.value === "combined") && romanization && (
                      <span class="stage-translation stage-romanization stage-plain-romanization">{romanization}</span>
                    )}
                  </p>
                ))}
              </div>
            )}

            {hasYrc &&
              (effect === "flow" ? (
                <div class="stage-lines">
                  {yPrev && <SeekableStageLine text={join(yPrev)} time={yPrev.start} className="stage-dim" />}
                  {yLine ? (
                    <SeekableStageLine key={yIdx} text={join(yLine)} time={yLine.start} className={`stage-hero ${paused ? "is-paused" : ""}`}>
                      <YrcWords line={yLine} pos={pos} variant="fill" />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={ySubtitles} />
                  {yNext && <SeekableStageLine text={join(yNext)} time={yNext.start} className="stage-dim" />}
                </div>
              ) : effect === "chorus" ? (
                <div class="stage-lines stage-chorus">
                  {yPrev && <SeekableStageLine text={join(yPrev)} time={yPrev.start} className="stage-dim" />}
                  {yLine ? (
                    <SeekableStageLine key={yIdx} text={join(yLine)} time={yLine.start} className={`stage-hero ${paused ? "is-paused" : ""}`}>
                      <YrcWords line={yLine} pos={pos} variant="pop" />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={ySubtitles} />
                  {yNext && <SeekableStageLine text={join(yNext)} time={yNext.start} className="stage-dim" />}
                </div>
              ) : (
                <div class="stage-lines stage-muse">
                  {yPrev && <SeekableStageLine text={join(yPrev)} time={yPrev.start} className="stage-ghost" />}
                  {yLine ? (
                    <SeekableStageLine key={yIdx} text={join(yLine)} time={yLine.start} className={`stage-hero ${paused ? "is-paused" : ""}`}>
                      <YrcWords line={yLine} pos={pos} variant="fill" />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={ySubtitles} />
                </div>
              ))}

            {hasLrc && !hasYrc &&
              (effect === "flow" ? (
                <div class="stage-lines">
                  {prevLine && <SeekableStageLine text={prevLine.text} time={prevLine.time} className="stage-dim" />}
                  {current ? (
                    <SeekableStageLine key={active} text={current.text} time={current.time} className={`stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                      <KaraokeFill text={current.text} progress={lineProgress} />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={subtitles} />
                  {nextLine && <SeekableStageLine text={nextLine.text} time={nextLine.time} className="stage-dim" />}
                </div>
              ) : effect === "chorus" ? (
                <div class="stage-lines stage-chorus">
                  {prevLine && <SeekableStageLine text={prevLine.text} time={prevLine.time} className="stage-dim" />}
                  {current ? (
                    <SeekableStageLine key={active} text={current.text} time={current.time} className={`stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                      <KaraokeFill text={current.text} progress={lineProgress} />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={subtitles} />
                  {nextLine && <SeekableStageLine text={nextLine.text} time={nextLine.time} className="stage-dim" />}
                </div>
              ) : (
                <div class="stage-lines stage-muse">
                  {prevLine && <SeekableStageLine text={prevLine.text} time={prevLine.time} className="stage-ghost" />}
                  {current ? (
                    <SeekableStageLine key={active} text={current.text} time={current.time} className={`stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                      <KaraokeFill text={current.text} progress={lineProgress} />
                    </SeekableStageLine>
                  ) : <p class="stage-line stage-hero">…</p>}
                  <StageSubtitles subtitles={subtitles} />
                </div>
              ))}
        </div>
      </div>

      <footer class={`stage-bottom ${uiVisible ? "" : "is-hidden"}`}>
        <span class="stage-time">{formatTime(pos)}</span>
        <input
          class="slider stage-progress"
          type="range"
          min={0}
          max={Math.max(duration.value, 1)}
          step={0.1}
          value={pos}
          aria-label="播放进度"
          onInput={(event) => seek(Number((event.target as HTMLInputElement).value))}
        />
        <span class="stage-time">{formatTime(duration.value)}</span>
      </footer>
    </div>
  );
}
