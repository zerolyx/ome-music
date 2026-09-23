import { useEffect, useState } from "preact/hooks";
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
  tlyricLines,
  translationFor,
  yrcLines,
  yrcWordStates,
  type YrcLine,
} from "../state/lyrics";
import {
  closeStage,
  setStageEffect,
  STAGE_EFFECTS,
  stageEffect,
} from "../state/stage";
import { coverUrl } from "../lib/api";

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

/**
 * 全屏歌词舞台（Folia 式文字 PV）。
 * 三种动效共用同一套 yrc/lrc 数据；鼠标静置 2.8s 后 UI 与光标隐没。
 */
export function StageView() {
  const track = currentTrack.value;
  const pos = position.value;
  const effect = stageEffect.value;
  const [uiVisible, setUiVisible] = useState(true);

  // Esc 退出 + 鼠标静置自动隐藏
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStage();
    };
    let timer = 0;
    const wake = () => {
      setUiVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setUiVisible(false), 2800);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", wake);
    wake();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", wake);
      window.clearTimeout(timer);
    };
  }, []);

  if (!track) return null;

  const cover = track.coverPath ? coverUrl(track.coverPath) : "";
  const hasYrc = lyricTrackId.value === track.id && yrcLines.value.length > 0;
  const hasLrc = lyricTrackId.value === track.id && lyricLines.value.length > 0;

  // 行级数据（lrc）
  const lines = lyricLines.value;
  const active = activeLine(lines, pos);
  const current = active >= 0 ? lines[active] : null;
  const prevLine = active >= 0 ? lines[active - 1] : null;
  const nextLine = active + 1 < lines.length ? lines[active + 1] : null;
  const translation = current ? translationFor(current, tlyricLines.value) : null;
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

  const paused = !isPlaying.value;

  return (
    <div
      class={`stage-view fx-${effect} ${uiVisible ? "" : "stage-ui-hidden"}`}
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
      </header>

      <div class="stage-body" aria-live="polite">
        {!hasYrc && !hasLrc && <p class="stage-empty">这首歌曲暂无歌词，尽情聆听</p>}

        {hasYrc &&
          (effect === "flow" ? (
            <div class="stage-lines">
              {yPrev && <p class="stage-line stage-dim">{join(yPrev)}</p>}
              <p key={yIdx} class={`stage-line stage-hero ${paused ? "is-paused" : ""}`}>
                {yLine ? <YrcWords line={yLine} pos={pos} variant="fill" /> : "…"}
              </p>
              {yNext && <p class="stage-line stage-dim">{join(yNext)}</p>}
            </div>
          ) : effect === "chorus" ? (
            <div class="stage-lines stage-chorus">
              {yPrev && <p class="stage-line stage-dim">{join(yPrev)}</p>}
              <p key={yIdx} class={`stage-line stage-hero ${paused ? "is-paused" : ""}`}>
                {yLine ? <YrcWords line={yLine} pos={pos} variant="pop" /> : "…"}
              </p>
              {yNext && <p class="stage-line stage-dim">{join(yNext)}</p>}
            </div>
          ) : (
            <div class="stage-lines stage-muse">
              {yPrev && <p class="stage-line stage-ghost">{join(yPrev)}</p>}
              <p key={yIdx} class={`stage-line stage-hero ${paused ? "is-paused" : ""}`}>
                {yLine ? <YrcWords line={yLine} pos={pos} variant="fill" /> : "…"}
              </p>
            </div>
          ))}

        {hasLrc && !hasYrc &&
          (effect === "flow" ? (
            <div class="stage-lines">
              {prevLine && <p class="stage-line stage-dim">{prevLine.text}</p>}
              <p key={active} class={`stage-line stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                {current ? <KaraokeFill text={current.text} progress={lineProgress} /> : "…"}
              </p>
              {translation && <p class="stage-line stage-translation">{translation.text}</p>}
              {nextLine && <p class="stage-line stage-dim">{nextLine.text}</p>}
            </div>
          ) : effect === "chorus" ? (
            <div class="stage-lines stage-chorus">
              {prevLine && <p class="stage-line stage-dim">{prevLine.text}</p>}
              <p key={active} class={`stage-line stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                {current ? <KaraokeFill text={current.text} progress={lineProgress} /> : "…"}
              </p>
              {nextLine && <p class="stage-line stage-dim">{nextLine.text}</p>}
            </div>
          ) : (
            <div class="stage-lines stage-muse">
              {prevLine && <p class="stage-line stage-ghost">{prevLine.text}</p>}
              <p key={active} class={`stage-line stage-hero stage-karaoke ${paused ? "is-paused" : ""}`}>
                {current ? <KaraokeFill text={current.text} progress={lineProgress} /> : "…"}
              </p>
              {translation && <p class="stage-line stage-translation">{translation.text}</p>}
            </div>
          ))}
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
