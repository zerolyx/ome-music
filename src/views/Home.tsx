import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { HomeLyrics } from "../components/HomeWidgets";
import { WelcomeCard } from "../components/WelcomeCard";
import { StageSpectrum } from "../components/StageSpectrum";
import { currentTrack, currentIndex, duration, isPlaying, position, queue } from "../state/player";
import { coverUrl } from "../lib/api";
import {
  loadLyricFor,
  lyricLines,
  lyricSubtitleMode,
  lyricTrackId,
  plainLyricText,
  plainRomanizationLines,
  romanizationLines,
  tlyricLines,
  yrcLines,
  parseLocalLyricPayload,
  parsePlainRomanizationRows,
} from "../state/lyrics";
import { adjustTrackOffset, getTrackOffset, OFFSET_STEP } from "../state/lyrics";
import { parseLrc } from "../state/lyrics";
import { applyCoverAccent } from "../state/tint";
import { loadDanmakuFor } from "../state/danmaku";
import { DanmakuLayer } from "../components/DanmakuLayer";
import { startRadioIfIdle, canStartRadioFromHome, radioEnabled } from "../state/radio";
import { tracks } from "../state/library";
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

const homeDemoKind =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("demo") : null;
const demo = homeDemoKind !== null && homeDemoKind !== "radio-idle";
const demoPlainLyrics =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "plain-lyrics";
const demoPlainRomanizationLyrics =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "plain-romanization";
const demoPlainCombinedLyrics =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "plain-combined";
const demoRomanizationLyrics =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "romanization";
const demoCombinedLyrics =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "combined";

/**
 * 黑胶旋转驱动：rAF 角度积分，播放渐起、暂停指数衰减真缓停
 * （CSS animation-play-state 只能冻结；folia 的 MotionValue 同思路）。
 * reduced-motion 完全静止；缓停到位后自动停表省电。
 */
function useRecordSpin(playing: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let angle = 0;
    let velocity = 0; // deg/s
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const target = playing ? 26 : 0; // ≈14s/圈，与原碟面转速一致
      velocity += (target - velocity) * Math.min(1, dt * (playing ? 2.2 : 1.5));
      angle = (angle + velocity * dt) % 360;
      const el = ref.current;
      if (el) el.style.transform = `rotate(${angle}deg)`;
      if (!playing && velocity < 0.02) return; // 已缓停：不再空转 rAF
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return ref;
}

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

function encodeLyricText(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

export function HomeView() {
  const demoTrack = demo ? DEMO_TRACK : null;
  const track = demo ? demoTrack : currentTrack.value;
  const cover = track?.coverPath ? coverUrl(track.coverPath) : "";
  const [coverBroken, setCoverBroken] = useState(false);
  const spinRef = useRecordSpin(isPlaying.value);
  const radioCtaVisible = canStartRadioFromHome(
    radioEnabled.value,
    tracks.value.length > 0,
    isPlaying.value,
    queue.value.length,
  );

  // 换封面时重置加载失败标记
  useEffect(() => setCoverBroken(false), [cover]);
  const showCover = !!cover && !coverBroken;

  useEffect(() => {
    void applyCoverAccent(cover || null); // 唱片取色：强调色跟随封面（demo 分支 return 之前）
    if (demo) {
      const previousSubtitleMode = lyricSubtitleMode.value;
      if (demoPlainLyrics || demoPlainRomanizationLyrics || demoPlainCombinedLyrics) {
        const sample = "街灯落在湿润的路面\n晚风把旧日轻轻吹远\n我在熟悉的旋律之间\n听见心跳慢慢回到从前\n\n如果明天仍然很遥远\n就把此刻唱给夜听见\n每一句都不需要时间\n你会在歌声里认出我\n\n天色慢慢靠近窗前\n钟声穿过安静房间\n我把没说完的话语\n藏进一首小小诗篇\n\n某天你若忽然想念\n不必回头寻找从前\n这首歌会停在这里\n等晚风再次经过你";
        const embeddedLrc = btoa(String.fromCharCode(...new TextEncoder().encode(sample)));
        const romanization = "Jie deng luo zai shi run de lu mian\nWan feng ba jiu ri qing qing chui yuan\nWo zai shu xi de xuan lv zhi jian\nTing jian xin tiao man man hui dao cong qian\n\nRu guo ming tian reng ran hen yao yuan\nJiu ba ci ke chang gei ye ting jian\nMei yi ju dou bu xu yao shi jian\nNi hui zai ge sheng li ren chu wo\n\nTian se man man kao jin chuang qian\nZhong sheng chuan guo an jing fang jian\nWo ba mei shuo wan de hua yu\nCang jin yi shou xiao xiao shi pian\n\nMou tian ni ruo hu ran xiang nian\nBu bi hui tou xun zhao cong qian\nZhe shou ge hui ting zai zhe li\nDeng wan feng zai ci jing guo ni";
        const parsed = parseLocalLyricPayload({
          lrc: "",
          tlyric: null,
          embeddedLrc,
          rlyric: demoPlainRomanizationLyrics || demoPlainCombinedLyrics
            ? btoa(String.fromCharCode(...new TextEncoder().encode(romanization)))
            : null,
        });
        lyricLines.value = [];
        yrcLines.value = [];
        romanizationLines.value = [];
        plainLyricText.value = parsed?.plainLyrics ?? "";
        plainRomanizationLines.value = parsePlainRomanizationRows(parsed?.rlyric);
        if (demoPlainRomanizationLyrics) lyricSubtitleMode.value = "romanization";
        if (demoPlainCombinedLyrics) lyricSubtitleMode.value = "combined";
        tlyricLines.value = [];
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
          yrcLines.value = [];
          romanizationLines.value = [];
          plainLyricText.value = "";
          plainRomanizationLines.value = [];
          tlyricLines.value = [];
          lyricSubtitleMode.value = previousSubtitleMode;
          lyricTrackId.value = null;
        };
      }
      // 演示：样例歌词 + 假播放进度驱动扫光/逐字
      const romanizationFixture = demoRomanizationLyrics || demoCombinedLyrics
        ? parseLocalLyricPayload({
            lrc: encodeLyricText("[00:00.00]夜色渐深\n[00:04.00]晚风穿过"),
            tlyric: null,
            rlyric: encodeLyricText("[00:00.00]Ye se jian shen\n[00:04.00]Wan feng chuan guo"),
          })
        : null;
      lyricLines.value = romanizationFixture
        ? parseLrc(romanizationFixture.lrc)
        : [
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
      romanizationLines.value = romanizationFixture
        ? parseLrc(romanizationFixture.rlyric ?? "")
        : [];
      if (demoRomanizationLyrics) lyricSubtitleMode.value = "romanization";
      if (demoCombinedLyrics) lyricSubtitleMode.value = "combined";
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
        yrcLines.value = [];
        romanizationLines.value = [];
        plainLyricText.value = "";
        plainRomanizationLines.value = [];
        tlyricLines.value = [];
        lyricSubtitleMode.value = previousSubtitleMode;
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
              /* 封面 = 唱片套：黑胶自右侧探出 1/3，播放时旋转、暂停缓停 */
              <div class="home-vinyl-rig" key={cover}>
                <img
                  class="home-art"
                  src={cover}
                  alt=""
                  onError={() => setCoverBroken(true)}
                />
                <div class="home-vinyl" aria-hidden="true">
                  <div class="home-vinyl-disc" ref={spinRef}>
                    <div
                      class="home-vinyl-label"
                      style={{ backgroundImage: `url("${cover}")` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div class="home-disc" aria-hidden="true">
                <div class="home-disc-texture" ref={spinRef} />
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
        <div class={`home-empty ${radioCtaVisible ? "home-radio-ready" : ""}`}>
          <p class="home-kicker">OME RADIO · 私人电台</p>
          <div class="home-disc" aria-hidden="true">
            <div class="home-disc-texture" />
            <div class="home-disc-face">
              <span class="home-disc-label">
                <Icon name="music-note" size={30} />
              </span>
            </div>
          </div>
          <h1>{radioCtaVisible ? "你的私人电台已准备好" : "电台即将开播"}</h1>
          <p class="home-hint">
            {radioCtaVisible ? "按下播放，从本地曲库开始下一段聆听" : "导入音乐后，这里会成为你的私人电台"}
          </p>
          {!demo && !radioCtaVisible && <WelcomeCard />}
          {radioCtaVisible && (
            <button class="btn-primary home-radio-cta" onClick={() => void startRadioIfIdle()}>
              不必选歌，按下播放就好
            </button>
          )}
        </div>
      )}
    </section>
  );
}
