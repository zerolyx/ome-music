import { activeView } from "../state/app";
import { openPalette } from "../state/commands";
import { drawerOpen, djConfig, djTab, hourProfile, memoryFacts, mood } from "../state/dj";
import { activePlaylistId, activePlaylistTracks, playlists } from "../state/playlists";
import { tracks } from "../state/library";
import { setThemeChoice } from "../state/theme";
import type { Track } from "../types/music";

/**
 * 开发/演示模式（?demo=1）：填充一组演示曲库数据，供视觉自查
 * （专辑墙 / 列表视图、封面缺失兜底）。不影响正常使用与测试。
 */
export function isDemoMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
}

function svgCover(c1: string, c2: string, title: string, artist: string, textColor: string): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>` +
        `<rect width='600' height='600' fill='url(#g)'/>` +
        `<circle cx='300' cy='250' r='110' fill='rgba(255,255,255,0.28)'/>` +
        `<text x='300' y='430' text-anchor='middle' font-family='serif' font-size='46' fill='${textColor}'>${title}</text>` +
        `<text x='300' y='478' text-anchor='middle' font-family='sans-serif' font-size='22' fill='${textColor}' opacity='0.72'>${artist}</text>` +
        `</svg>`
    )
  );
}

const DEMO_LIBRARY: Track[] = [
  { id: "d1", title: "情歌", artist: "梁静茹", album: "现在开始我爱你", durationSeconds: 263, filePath: "", source: "netease", coverPath: svgCover("#f6e7d7", "#b97a5e", "情歌", "梁静茹", "#7a4632"), liked: true, playCount: 12 },
  { id: "d2", title: "会呼吸的痛", artist: "梁静茹", album: "现在开始我爱你", durationSeconds: 247, filePath: "", source: "netease", coverPath: svgCover("#f6e7d7", "#b97a5e", "情歌", "梁静茹", "#7a4632"), liked: false, playCount: 8 },
  { id: "d3", title: "宁夏", artist: "梁静茹", album: "燕尾蝶", durationSeconds: 215, filePath: "", source: "netease", coverPath: svgCover("#e3f0e5", "#7fa88a", "燕尾蝶", "梁静茹", "#2f5240"), liked: false, playCount: 5 },
  { id: "d4", title: "燕尾蝶", artist: "梁静茹", album: "燕尾蝶", durationSeconds: 261, filePath: "", source: "netease", coverPath: svgCover("#e3f0e5", "#7fa88a", "燕尾蝶", "梁静茹", "#2f5240"), liked: true, playCount: 20 },
  { id: "d5", title: "华丽的冒险", artist: "陈绮贞", album: "华丽的冒险", durationSeconds: 278, filePath: "", source: "netease", coverPath: svgCover("#f3e2ec", "#a87f9e", "冒险", "陈绮贞", "#5d3a55"), liked: false, playCount: 3 },
  { id: "d6", title: "旅行的意义", artist: "陈绮贞", album: "华丽的冒险", durationSeconds: 257, filePath: "", source: "netease", coverPath: svgCover("#f3e2ec", "#a87f9e", "冒险", "陈绮贞", "#5d3a55"), liked: true, playCount: 31 },
  { id: "d7", title: "Demo 单曲", artist: "未知艺术家", album: "", durationSeconds: 180, filePath: "", source: "local", coverPath: null, liked: false, playCount: 0 },
];

/** 演示曲库数据（?demo=1 视觉自查用） */
export function demoLibraryTracks(): Track[] {
  return DEMO_LIBRARY;
}

export function seedDemoData(): void {
  tracks.value = DEMO_LIBRARY;
  const demo = new URLSearchParams(window.location.search).get("demo");
  if (demo === "dark") {
    // 直接走信号：theme.ts 模块初始化早于本函数，写 localStorage 不会生效
    setThemeChoice("dark");
  }
  if (demo === "library" || demo === "library-grid" || demo === "library-artists" || demo === "library-history" || demo === "library-liked" || demo === "library-playlists" || demo === "playlist-detail") {
    activeView.value = "library";
  }
  try {
    if (demo === "library-grid") localStorage.setItem("ome.library.view", "grid");
    if (demo === "library-artists") localStorage.setItem("ome.library.view", "artists");
    if (demo === "library-history") localStorage.setItem("ome.library.view", "history");
    if (demo === "library-liked") localStorage.setItem("ome.library.likedOnly", "1");
    if (demo === "library-playlists" || demo === "playlist-detail") {
      localStorage.setItem("ome.library.view", "playlists");
      playlists.value = [
        { id: "pl-1", name: "深夜电台", trackCount: 3, createdAt: "" },
        { id: "pl-2", name: "清晨提神", trackCount: 2, createdAt: "" },
      ];
      if (demo === "playlist-detail") {
        activePlaylistId.value = "pl-1";
        activePlaylistTracks.value = DEMO_LIBRARY.slice(0, 3);
      }
    }
  } catch {
    /* ignore */
  }
  if (demo === "search") {
    activeView.value = "search";
  }
  if (demo === "settings") {
    activeView.value = "settings";
  }
  if (demo === "palette") {
    openPalette();
  }
  if (demo === "dj-memory" || demo === "dj-profile") {
    djConfig.value = { configured: true, providerName: "Demo", baseUrl: "", model: "", maskedKey: "" };
    drawerOpen.value = true;
    mood.value = "雨后街道";
    if (demo === "dj-memory") {
      djTab.value = "memory";
      memoryFacts.value = [
        { id: "m1", kind: "pref", content: "喜欢深夜的民谣和独立流行", weight: 3, updatedAt: "" },
        { id: "m2", kind: "habit", content: "睡前半小时会打开电台", weight: 2, updatedAt: "" },
        { id: "m3", kind: "pref", content: "不喜欢太吵的电子乐", weight: 1, updatedAt: "" },
        { id: "m4", kind: "mood", content: "下雨天偏好慢歌", weight: 1.5, updatedAt: "" },
      ];
    } else {
      djTab.value = "profile";
      hourProfile.value = Array.from({ length: 24 }, (_, hour) => {
        const curve = Math.exp(-Math.pow(hour - 21, 2) / 14) * 9 + Math.exp(-Math.pow(hour - 9, 2) / 10) * 4;
        const plays = Math.round(curve + (hour % 3));
        const skips = hour >= 11 && hour <= 13 ? Math.round(plays * 0.6) : Math.round(plays * 0.15);
        const completions = Math.max(0, plays - skips - (hour % 2));
        return { hour, plays, completions, skips };
      });
    }
  }
}
