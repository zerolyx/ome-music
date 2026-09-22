import { useEffect } from "preact/hooks";
import { Icon } from "../components/Icon";
import { HomeLyrics } from "../components/HomeWidgets";
import { currentTrack } from "../state/player";
import { coverUrl } from "../lib/api";
import { loadLyricFor } from "../state/lyrics";
import { djConfig } from "../state/dj";
import { startRadioIfIdle } from "../state/radio";

export function HomeView() {
  const track = currentTrack.value;
  const cover = track?.coverPath ? coverUrl(track.coverPath) : "";
  const playing = track !== null;

  useEffect(() => {
    void loadLyricFor(track);
  }, [track?.id]);

  return (
    <section class="view view-home">
      {/* 氛围背景：当前封面高斯模糊铺满全窗（fixed 脱离滚动区） */}
      {cover && (
        <div
          key={cover}
          class="home-backdrop"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden="true"
        />
      )}
      <div class="home-glow" aria-hidden="true" />
      <div class="home-empty">
        <p class="home-kicker">OME RADIO · 私人电台</p>

        {playing ? (
          <>
            <div class="home-now">
              <span class="home-now-title">{track.title}</span>
              <span class="home-now-artist">{track.artist}</span>
            </div>
            {cover ? (
              <img class="home-art" key={cover} src={cover} alt="" />
            ) : (
              <div class="home-disc" aria-hidden="true">
                <div class="home-disc-face">
                  <span class="home-disc-label">
                    <Icon name="music-note" size={30} />
                  </span>
                </div>
              </div>
            )}
            <HomeLyrics />
          </>
        ) : (
          <>
            <div class="home-disc" aria-hidden="true">
              <div class="home-disc-face">
                <span class="home-disc-label">
                  <Icon name="music-note" size={30} />
                </span>
              </div>
            </div>
            <h1>电台即将开播</h1>
            <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
            {djConfig.value?.configured && (
              <button class="btn-primary home-radio-cta" onClick={() => void startRadioIfIdle()}>
                不必选歌，按下播放就好
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
