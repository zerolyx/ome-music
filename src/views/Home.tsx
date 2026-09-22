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
  const playing = track !== null;

  useEffect(() => {
    void loadLyricFor(track);
  }, [track?.id]);

  // 封面 3D 视差：跟随光标轻微倾斜，离开回正
  const onTiltMove = (event: MouseEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${py * -6}deg) rotateY(${px * 8}deg)`;
  };
  const onTiltLeave = () => {
    const el = tiltRef.current;
    if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <section class="view view-home" onMouseMove={onTiltMove} onMouseLeave={onTiltLeave}>
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
            <div class="home-art-tilt" ref={tiltRef}>
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
            </div>
            <HomeLyrics />
          </>
        ) : (
          <>
            <div class="home-disc-tilt" ref={tiltRef}>
              <div class="home-disc" aria-hidden="true">
                <div class="home-disc-face">
                  <span class="home-disc-label">
                    <Icon name="music-note" size={30} />
                  </span>
                </div>
              </div>
            </div>
            <h1>电台即将开播</h1>
            <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
          </>
        )}
      </div>
    </section>
  );
}
