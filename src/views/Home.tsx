import { useEffect } from "preact/hooks";
import { Icon } from "../components/Icon";
import { HomeLyrics } from "../components/HomeWidgets";
import { currentTrack } from "../state/player";
import { loadLyricFor } from "../state/lyrics";

export function HomeView() {
  const track = currentTrack.value;

  useEffect(() => {
    void loadLyricFor(track);
  }, [track?.id]);

  return (
    <section class="view view-home">
      <div class="home-glow" aria-hidden="true" />
      <div class="home-empty">
        <p class="home-kicker">OME RADIO · 私人电台</p>
        <div class="home-disc" aria-hidden="true">
          <div class="home-disc-face">
            <span class="home-disc-label">
              <Icon name="music-note" size={30} />
            </span>
          </div>
        </div>
        {track ? (
          <div class="home-now">
            <span class="home-now-title">{track.title}</span>
            <span class="home-now-artist">{track.artist}</span>
          </div>
        ) : null}
        <HomeLyrics />
      </div>
    </section>
  );
}
