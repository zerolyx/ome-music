import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { HomeLyrics } from "../components/HomeWidgets";
import { WelcomeCard } from "../components/WelcomeCard";
import { StageSpectrum } from "../components/StageSpectrum";
import { currentTrack, currentIndex, duration, isPlaying, position, queue } from "../state/player";
import { coverUrl } from "../lib/api";
import { loadLyricFor, lyricLines, lyricTrackId, tlyricLines } from "../state/lyrics";
import { adjustTrackOffset, getTrackOffset, OFFSET_STEP } from "../state/lyrics";
import { applyCoverAccent } from "../state/tint";
import { loadDanmakuFor } from "../state/danmaku";
import { DanmakuLayer } from "../components/DanmakuLayer";
import { djConfig } from "../state/dj";
import { startRadioIfIdle } from "../state/radio";
import { openStage } from "../state/stage";
import { openViz } from "../state/visualizer";
import type { Track } from "../types/music";

/** 开发/演示模式：?demo=1 伪造播放态，供视觉自查（不影响正常使用） */
/** 歌词时间偏移微调节（Folia：按歌曲记忆，±0.5s 步进） */
function LyricOffsetControl({ trackId }: { trackId: string }) {
  const offset = getTrackOffset(trackId);
  return (
    <div class="lyric-offset" aria-label="歌词时间微调">
      <button
        class="lyric-offset-btn"
        aria-label="歌词提前 0.5 秒"
        title="歌词提前 0.5 秒"
        onClick={() => adjustTrackOffset(trackId, -OFFSET_STEP)}
      >
        −0.5s
      </button>
      <span class="lyric-offset-value">{offset > 0 ? `+${offset}` : offset}s</span>
      <button
        class="lyric-offset-btn"
        aria-label="歌词延后 0.5 秒"
        title="歌词延后 0.5 秒"
        onClick={() => adjustTrackOffset(trackId, OFFSET_STEP)}
      >
        +0.5s
      </button>
      {offset !== 0 && (
        <button
          class="lyric-offset-btn"
          aria-label="重置歌词偏移"
          title="重置"
          onClick={() => adjustTrackOffset(trackId, -offset)}
        >
          重置
        </button>
      )}
    </div>
  );
}

const demo =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

const DEMO_COVER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='#f6e7d7'/><stop offset='.55' stop-color='#e8c3ae'/>` +
      `<stop offset='1' stop-color='#b97a5e'/></linearGradient></defs>` +
      `<rect width='600' height='600' fill='url(#g)'/>` +
      `<circle cx='300' cy='258' r='118' fill='#c96f4a'/>` +
      `<text x='300' y='420' text-anchor='middle' font-family='serif' font-size='44' fill='#7a4632'>情歌</text>` +
      `<text x='300' y='470' text-anchor='middle' font-family='sans-serif' font-size='22' fill='#9a6a52'>梁静茹</text>` +
      `</svg>`
  );

const DEMO_TRACK: Track = {
  id: "demo-1",
  title: "情歌",
  artist: "梁静茹",
  album: "现在开始我爱你",
  durationSeconds: 263,
  filePath: "",
  source: "netease",
  sourceId: "186016",
  coverPath: DEMO_COVER,
  liked: false,
  playCount: 0,
};

export function HomeView() {
  const demoTrack = demo ? DEMO_TRACK : null;
  const track = demo ? demoTrack : currentTrack.value;
  const cover = track?.coverPath ? coverUrl(track.coverPath) : "";
  const [coverBroken, setCoverBroken] = useState(false);

  // 换封面时重置加载失败标记
  useEffect(() => setCoverBroken(false), [cover]);
  const showCover = !!cover && !coverBroken;

  useEffect(() => {
    void applyCoverAccent(cover || null); // 唱片取色：强调色跟随封面（demo 分支 return 之前）
    if (demo) {
      // 演示：样例歌词 + 假播放进度驱动扫光/逐字
      lyricLines.value = [
        { time: 0, text: "一整个宇宙" },
        { time: 4, text: "换一颗红豆" },
        { time: 8, text: "回忆如困兽" },
        { time: 12, text: "寂寞太长时间里发着呆" },
        { time: 16, text: "时间能证明爱能穿越人海" },
        { time: 20, text: "情歌深爱着的人啊" },
      ];
      tlyricLines.value = [
        { time: 0, text: "A whole universe" },
        { time: 4, text: "for a single red bean" },
        { time: 8, text: "Memories like caged beasts" },
        { time: 12, text: "lost in loneliness for too long" },
        { time: 16, text: "Time proves love crosses oceans of people" },
        { time: 20, text: "The one this love song cherishes" },
      ];
      lyricTrackId.value = DEMO_TRACK.id;
      queue.value = [DEMO_TRACK];
      currentIndex.value = 0;
      duration.value = DEMO_TRACK.durationSeconds;
      isPlaying.value = true;
      const timer = setInterval(() => {
        position.value = (position.value + 0.25) % 24;
      }, 250);
      return () => {
        clearInterval(timer);
        position.value = 0;
        isPlaying.value = false;
        queue.value = [];
        currentIndex.value = -1;
        lyricLines.value = [];
        tlyricLines.value = [];
        lyricTrackId.value = null;
      };
    }
    void loadLyricFor(track);
    void loadDanmakuFor(track); // 仅 B站曲目有弹幕；其他源清空
  }, [track?.id, demo]);

  return (
    <section class={`view view-home ${track ? "is-cinema" : ""}`}>
      {/* 氛围背景：当前封面高斯模糊铺满全窗（fixed 脱离滚动区） */}
      {showCover && (
        <div
          key={cover}
          class="home-backdrop"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden="true"
        />
      )}
      <div class="home-glow" aria-hidden="true" />
      <DanmakuLayer />
      {track && <StageSpectrum />}

      {track ? (
        /* 宽屏：左盘右词（Folia pendolo 式）；窄屏：居中堆叠（CSS 断点） */
        <div class="home-stage">
          <div class="home-art-col">
            {showCover ? (
              <img
                class="home-art"
                key={cover}
                src={cover}
                alt=""
                onError={() => setCoverBroken(true)}
              />
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
          <div class="home-info-col">
            <p class="home-kicker">OME RADIO · 私人电台</p>
            <div class="home-now">
              <span class="home-now-title">{track.title}</span>
              <span class="home-now-artist">{track.artist}</span>
            </div>
            <LyricOffsetControl trackId={track.id} />
            <div class="home-cta-row">
              <button class="chip-toggle home-stage-cta" onClick={openStage}>
                <Icon name="lyrics" size={14} />
                歌词舞台
              </button>
              <button class="chip-toggle home-stage-cta" onClick={openViz}>
                <Icon name="play" size={14} />
                视觉器
              </button>
            </div>
            <HomeLyrics />
          </div>
        </div>
      ) : (
        <div class="home-empty">
          <p class="home-kicker">OME RADIO · 私人电台</p>
          <div class="home-disc" aria-hidden="true">
            <div class="home-disc-face">
              <span class="home-disc-label">
                <Icon name="music-note" size={30} />
              </span>
            </div>
          </div>
          <h1>电台即将开播</h1>
          <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
          {!demo && <WelcomeCard />}
          {djConfig.value?.configured && (
            <button class="btn-primary home-radio-cta" onClick={() => void startRadioIfIdle()}>
              不必选歌，按下播放就好
            </button>
          )}
        </div>
      )}
    </section>
  );
}
