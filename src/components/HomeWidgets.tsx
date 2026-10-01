import { currentTrack, position, isPlaying } from "../state/player";
import {
  activeLine,
  activeYrcLine,
  lyricLines,
  lyricTrackId,
  lyricSubtitlesFor,
  lyricSubtitleMode,
  plainLyricText,
  plainRomanizationLines,
  yrcLines,
  yrcWordStates,
  type LyricSubtitle,
} from "../state/lyrics";

function HomeSubtitles({ subtitles }: { subtitles: LyricSubtitle[] }) {
  return (
    <>
      {subtitles.map(({ kind, text }) => (
        <p key={kind} class={`lyric-line lyric-translation ${kind === "romanization" ? "lyric-romanization" : ""}`}>
          {text}
        </p>
      ))}
    </>
  );
}

/** 沉浸歌词：yrc 逐字点亮 / lrc 行级高亮，歌词即舞台 */
export function HomeLyrics() {
  const track = currentTrack.value;
  const lines = lyricLines.value;
  const hasYrc = track && lyricTrackId.value === track.id && yrcLines.value.length > 0;
  const hasLrc = track && lyricTrackId.value === track.id && lines.length > 0;
  const hasPlainLyrics = track && lyricTrackId.value === track.id && plainLyricText.value.length > 0;
  let plainContentIndex = 0;
  const plainRows = plainLyricText.value.split("\n").map((line) => {
    const romanization = line.trim() ? plainRomanizationLines.value[plainContentIndex++] ?? "" : "";
    return { line, romanization };
  });

  if (!track) {
    return (
      <>
        <h1>电台即将开播</h1>
        <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
      </>
    );
  }
  // 歌词尚未加载完成：留白等待，绝不误显"即将开播"

  // 逐字点亮（网易云 yrc 逐字歌词，Folia 式）
  if (hasYrc) {
    const yrc = yrcLines.value;
    const idx = activeYrcLine(yrc, position.value);
    const line = yrc[idx];
    const words = line?.words ?? [];
    const states = yrcWordStates(line ?? { start: 0, end: 0, words: [] }, position.value);
    const subtitles = line
      ? lyricSubtitlesFor({ time: line.start, text: words.map((word) => word.text).join("") })
      : null;
    const prevText = idx > 0 ? yrc[idx - 1].words.map((w) => w.text).join("") : "";
    const nextText = idx + 1 < yrc.length ? yrc[idx + 1].words.map((w) => w.text).join("") : "";
    return (
      <div key={`${track?.id ?? ""}:${idx}`} class="home-lyrics yrc lyric-flow" aria-live="polite">
        {prevText && <p class="lyric-line lyric-prev">{prevText}</p>}
        <p class="yrc-line">
          {words.map((word, i) => (
            <span key={i} class={`yrc-word yrc-${states[i]}`}>{word.text}</span>
          ))}
        </p>
        {subtitles && <HomeSubtitles subtitles={subtitles} />}
        {nextText && <p class="lyric-line lyric-next">{nextText}</p>}
      </div>
    );
  }

  if (hasLrc) {
    const active = activeLine(lines, position.value);
    const prev = active >= 0 ? lines[active - 1] : null;
    const current = active >= 0 ? lines[active] : null;
    const next = active + 1 < lines.length ? lines[active + 1] : null;
    const subtitles = current ? lyricSubtitlesFor(current) : [];
    // 行内进度：卡拉OK式亮色扫过（无结束时间的行按 8 秒估算）
    const lineStart = current?.time ?? 0;
    const lineEnd = next?.time ?? (current ? current.time + 8 : 0);
    const progress = current
      ? Math.min(1, Math.max(0, (position.value - lineStart) / Math.max(lineEnd - lineStart, 0.5)))
      : 0;
    return (
      <div key={`${track?.id ?? ""}:${active}`} class="home-lyrics lyric-flow" aria-live="polite">
        <p class="lyric-line lyric-prev">{prev?.text ?? ""}</p>
        <p
          class={`lyric-line lyric-current lyric-karaoke ${isPlaying.value ? "" : "is-paused"}`}
        >
          <span class="lyric-base">{current?.text ?? "…"}</span>
          <span
            class="lyric-fill"
            style={{ width: `${Math.round(progress * 10000) / 100}%` }}
            aria-hidden="true"
          >
            {current?.text ?? ""}
          </span>
        </p>
        <HomeSubtitles subtitles={subtitles} />
        <p class="lyric-line lyric-next">{next?.text ?? ""}</p>
      </div>
    );
  }

  if (hasPlainLyrics) {
    return (
      <div class="home-lyrics home-lyrics-plain">
        <div class="home-plain-lyrics" role="region" aria-label="未同步歌词" tabIndex={0}>
          {plainRows.map(({ line, romanization }, index) => (
            <p key={index} class="home-plain-line">
              <span>{line || "\u00a0"}</span>
              {(lyricSubtitleMode.value === "romanization" || lyricSubtitleMode.value === "combined") && romanization && (
                <span class="lyric-translation lyric-romanization home-plain-romanization">{romanization}</span>
              )}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return <p class="lyric-line lyric-next">这首歌曲暂无歌词，尽情聆听</p>;
}
