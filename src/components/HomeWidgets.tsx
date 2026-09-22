import { activeLine, lyricLines, lyricTrackId } from "../state/lyrics";
import { currentTrack, position, isPlaying } from "../state/player";

/** 沉浸歌词：播放中的网易云歌曲显示当前句（上一句淡出、当前句高亮） */
export function HomeLyrics() {
  const track = currentTrack.value;
  const lines = lyricLines.value;
  const active = activeLine(lines, position.value);
  const has = track && lyricTrackId.value === track.id && lines.length > 0;

  if (!has) {
    return (
      <>
        <h1>电台即将开播</h1>
        <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
      </>
    );
  }

  const prev = active >= 0 ? lines[active - 1] : null;
  const current = active >= 0 ? lines[active] : null;
  const next = active + 1 < lines.length ? lines[active + 1] : null;

  return (
    <div class="home-lyrics" aria-live="polite">
      <p class="lyric-line lyric-prev">{prev?.text ?? ""}</p>
      <p
        key={current?.text ?? "idle"}
        class={`lyric-line lyric-current ${isPlaying.value ? "" : "is-paused"}`}
      >
        {current?.text ?? "…"}
      </p>
      <p class="lyric-line lyric-next">{next?.text ?? ""}</p>
    </div>
  );
}
