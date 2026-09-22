import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../components/Icon";
import { HomeLyrics } from "../components/HomeWidgets";
import { currentTrack } from "../state/player";
import { coverUrl } from "../lib/api";
import { loadLyricFor } from "../state/lyrics";

export function HomeView() {
  const track = currentTrack.value;
  const tiltRef = useRef<HTMLDivElement>(null);
  const cover = track?.coverPath ? coverUrl(track.coverPath) : "";

  useEffect(() => {
    void loadLyricFor(track);
  }, [track?.id]);

  // 唱片 3D 视差：跟随光标轻微倾斜，离开回正
  const onTiltMove = (event: MouseEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${py * -7}deg) rotateY(${px * 9}deg)`;
  };
  const onTiltLeave = () => {
    const el = tiltRef.current;
    if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <section class="view view-home" onMouseMove={onTiltMove} onMouseLeave={onTiltLeave}>
      {/* Apple Music 式氛围背景：当前封面高斯模糊铺满全窗，缓慢漂移 */}
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
        <div class="home-disc-tilt" ref={tiltRef}>
          <div class="home-disc" aria-hidden="true">
            <div class="home-disc-face">
              <span class="home-disc-label">
                {cover ? (
                  <img class="home-disc-cover" src={cover} alt="" />
                ) : (
                  <Icon name="music-note" size={30} />
                )}
              </span>
            </div>
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
