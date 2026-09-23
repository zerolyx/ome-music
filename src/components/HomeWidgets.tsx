import { currentTrack, position, isPlaying } from "../state/player";
import {
  activeLine,
  activeYrcLine,
  lyricLines,
  lyricTrackId,
  tlyricLines,
  translationFor,
  yrcLines,
  yrcWordStates,
} from "../state/lyrics";

/** 沉浸歌词：yrc 逐字点亮 / lrc 行级高亮，歌词即舞台 */
export function HomeLyrics() {
  const track = currentTrack.value;
  const lines = lyricLines.value;
  const hasYrc = track && lyricTrackId.value === track.id && yrcLines.value.length > 0;
  const hasLrc = track && lyricTrackId.value === track.id && lines.length > 0;

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
    const prevText = idx > 0 ? yrc[idx - 1].words.map((w) => w.text).join("") : "";
    const nextText = idx + 1 < yrc.length ? yrc[idx + 1].words.map((w) => w.text).join("") : "";
    return (
      <div class="home-lyrics yrc" aria-live="polite">
        {prevText && <p class="lyric-line lyric-prev">{prevText}</p>}
        <p class="yrc-line">
          {words.map((word, i) => (
            <span key={i} class={`yrc-word yrc-${states[i]}`}>{word.text}</span>
          ))}
        </p>
        {nextText && <p class="lyric-line lyric-next">{nextText}</p>}
      </div>
    );
  }

  if (hasLrc) {
    const active = activeLine(lines, position.value);
    const prev = active >= 0 ? lines[active - 1] : null;
    const current = active >= 0 ? lines[active] : null;
    const next = active + 1 < lines.length ? lines[active + 1] : null;
    const translation = current ? translationFor(current, tlyricLines.value) : null;
    // 行内进度：卡拉OK式亮色扫过（无结束时间的行按 8 秒估算）
    const lineStart = current?.time ?? 0;
    const lineEnd = next?.time ?? (current ? current.time + 8 : 0);
    const progress = current
      ? Math.min(1, Math.max(0, (position.value - lineStart) / Math.max(lineEnd - lineStart, 0.5)))
      : 0;
    return (
      <div class="home-lyrics" aria-live="polite">
        <p class="lyric-line lyric-prev">{prev?.text ?? ""}</p>
        <p
          key={current?.text ?? "idle"}
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
        {translation && <p class="lyric-line lyric-translation">{translation.text}</p>}
        <p class="lyric-line lyric-next">{next?.text ?? ""}</p>
      </div>
    );
  }

  return <p class="lyric-line lyric-next">这首歌曲暂无歌词，尽情聆听</p>;
}
