import { activeView } from "../state/app";
import { openPalette } from "../state/commands";
import { drawerOpen, djConfig, djTab, hourProfile, memoryFacts, mood } from "../state/dj";
import { activePlaylistId, activePlaylistTracks, playlists } from "../state/playlists";
import { ignoredTracks, importProgress, importing, libraryDiagnostics, tracks, unavailableLocalTracks } from "../state/library";
import { setThemeChoice } from "../state/theme";
import { setRadioEnabled } from "../state/radio";
import { openTrackRemovalConfirm } from "../state/library-removal";
import { connection as jellyfinConnection, catalog as jellyfinCatalog } from "../state/jellyfin";
import {
  albumHasMore,
  albumNextOffset,
  albumTracks,
  albumTruncated,
  albums,
  albumsLoaded,
  connection as subsonicConnection,
  selectedAlbum,
} from "../state/subsonic";
import type { Track } from "../types/music";
import type { LibraryDiagnostics, MediaServerAlbum, MediaServerPlaylist, SubsonicAlbum } from "./api";

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
  { id: "d7", title: "Demo 单曲", artist: "未知艺术家", album: "", durationSeconds: 180, filePath: "", source: "local", coverPath: null, liked: false, playCount: 0, hasMetadataOverride: true, metadataSnapshotAvailable: true },
  { id: "d8", title: "远处的灯", artist: "林桥", album: "夜行", durationSeconds: 202, filePath: "D:/Demo Music/夜行/远处的灯.flac", source: "local", coverPath: null, liked: false, playCount: 0 },
  { id: "d9", title: "远处的灯", artist: "林桥", album: "深夜精选", durationSeconds: 203, filePath: "D:/Demo Music/精选/远处的灯.flac", source: "local", coverPath: null, liked: false, playCount: 0 },
];

const DEMO_IGNORED_TRACKS: Track[] = [
  { id: "ignored-1", title: "后来", artist: "刘若英", album: "我等你", durationSeconds: 292, filePath: "D:/Demo Music/华语/刘若英/我等你/后来.flac", source: "local", coverPath: null, liked: true, playCount: 6 },
  { id: "ignored-2", title: "海阔天空（现场纪念版）", artist: "Beyond", album: "Beyond IV", durationSeconds: 326, filePath: "D:/Demo Music/归档/现场录音/1991/香港红馆/修复版本/海阔天空（现场纪念版）.flac", source: "local", coverPath: null, liked: false, playCount: 2 },
];

const DEMO_UNAVAILABLE_LOCAL_TRACKS: Track[] = [
  { id: "unavailable-1", title: "漂流", artist: "落日飞车", album: "CASSA NOVA", durationSeconds: 254, filePath: "D:/Music/华语收藏/旧位置/漂流.flac", source: "local", coverPath: null, liked: true, playCount: 14 },
  { id: "unavailable-2", title: "夜港", artist: "白昼邮差", album: "潮汐录", durationSeconds: 231, filePath: "D:/Music/华语收藏/旧位置/夜港.flac", source: "local", coverPath: null, liked: false, playCount: 5 },
];

const DEMO_REMOTE_ALBUMS: SubsonicAlbum[] = [
  { id: "demo-album-1", name: "雨后唱片", artist: "林桥", year: 2024, songCount: 8, coverArtId: "demo-cover-1" },
  { id: "demo-album-2", name: "深夜漫游", artist: "白昼邮差", year: 2023, songCount: 11, coverArtId: "demo-cover-2" },
  { id: "demo-album-3", name: "潮汐之间", artist: "落日飞车", year: 2022, songCount: 9, coverArtId: "demo-cover-3" },
  { id: "demo-album-4", name: "微光收集册", artist: "陈绮贞", year: 2021, songCount: 10, coverArtId: "demo-cover-4" },
  { id: "demo-album-5", name: "一封未寄出的信", artist: "林桥", year: 2020, songCount: 7, coverArtId: null },
  { id: "demo-album-6", name: "沿着海岸线", artist: "白昼邮差", year: 2019, songCount: 12, coverArtId: "demo-cover-6" },
];

const DEMO_REMOTE_ALBUM_TRACKS: Track[] = [
  { id: "subsonic:demo-track-1", sourceId: "demo-track-1", title: "潮声慢下来", artist: "林桥", album: "雨后唱片", durationSeconds: 224, filePath: "", source: "subsonic", liked: false, playCount: 0 },
  { id: "subsonic:demo-track-2", sourceId: "demo-track-2", title: "灯火留在窗边", artist: "林桥", album: "雨后唱片", durationSeconds: 207, filePath: "", source: "subsonic", liked: false, playCount: 0 },
  { id: "subsonic:demo-track-3", sourceId: "demo-track-3", title: "雨停之后", artist: "林桥", album: "雨后唱片", durationSeconds: 241, filePath: "", source: "subsonic", liked: false, playCount: 0 },
];

const DEMO_JELLYFIN_ALBUMS: MediaServerAlbum[] = [
  { id: "album-demo-1", name: "玻璃海岸", artist: "雾灯计划", year: 2025, songCount: 9, coverId: "cover-demo-1" },
  { id: "album-demo-2", name: "凌晨四点的房间", artist: "林桥", year: 2024, songCount: 11, coverId: "cover-demo-2" },
  { id: "album-demo-3", name: "潮汐之间", artist: "落日飞车", year: 2023, songCount: 8, coverId: null },
  { id: "album-demo-4", name: "回声花园", artist: "白昼邮差", year: 2022, songCount: 10, coverId: "cover-demo-4" },
  { id: "album-demo-5", name: "留给夜晚", artist: "陈绮贞", year: 2021, songCount: 7, coverId: "cover-demo-5" },
  { id: "album-demo-6", name: "未完成的信", artist: "雾灯计划", year: 2020, songCount: 12, coverId: "cover-demo-6" },
];

const DEMO_JELLYFIN_PLAYLISTS: MediaServerPlaylist[] = [
  { id: "playlist-demo-1", name: "雨声里的慢歌", songCount: 18 },
  { id: "playlist-demo-2", name: "开车去海边", songCount: 26 },
  { id: "playlist-demo-3", name: "不想睡的夜", songCount: 14 },
];

const DEMO_JELLYFIN_TRACKS: Track[] = [
  { id: "jellyfin:demo-track-1", sourceId: "demo-track-1", title: "海面没有风", artist: "雾灯计划", album: "玻璃海岸", durationSeconds: 231, filePath: "", source: "jellyfin", liked: false, playCount: 0 },
  { id: "jellyfin:demo-track-2", sourceId: "demo-track-2", title: "把灯留到天亮", artist: "雾灯计划", album: "玻璃海岸", durationSeconds: 207, filePath: "", source: "jellyfin", liked: false, playCount: 0 },
  { id: "jellyfin:demo-track-3", sourceId: "demo-track-3", title: "远方的回信", artist: "雾灯计划", album: "玻璃海岸", durationSeconds: 248, filePath: "", source: "jellyfin", liked: false, playCount: 0 },
];

const DEMO_LIBRARY_DIAGNOSTICS: LibraryDiagnostics = {
  checkedAt: "2026-09-24 23:30:00",
  totalIndexedTrackCount: 168,
  localTrackCount: 42,
  otherSourceTrackCount: 124,
  excludedTrackCount: 2,
  quickIdentityPendingTrackCount: 12,
  accessibleTrackCount: 38,
  unavailableTrackCount: 2,
  offlineDirectoryTrackCount: 1,
  outsideDirectoryTrackCount: 1,
  artistCount: 31,
  albumCount: 56,
  playlistCount: 8,
  playbackEventCount: 342,
  integrityCheck: "ok",
  directories: [
    { path: "D:/Music/华语收藏", available: true, indexedTrackCount: 42 },
    { path: "E:/Archive/Live", available: false, indexedTrackCount: 1 },
  ],
  databasePath: "C:/Users/Demo/AppData/Local/Ome Music/ome-music.db",
  databaseSizeBytes: 3_145_728,
  coversPath: "C:/Users/Demo/AppData/Local/Ome Music/covers",
  coversAvailable: true,
  coversFileCount: 156,
  coversSizeBytes: 24_117_248,
  lastScan: {
    completedAt: "2026-09-24 22:16:31",
    added: 3,
    updated: 6,
    total: 168,
    skipped: 2,
    scanErrors: 1,
  },
};

/** 演示曲库数据（?demo=1 视觉自查用） */
export function demoLibraryTracks(): Track[] {
  return DEMO_LIBRARY;
}

export function seedDemoData(): void {
  tracks.value = DEMO_LIBRARY;
  const demo = new URLSearchParams(window.location.search).get("demo");
  if (demo === "radio-idle") {
    tracks.value = DEMO_LIBRARY.filter((track) => track.source === "local");
    setRadioEnabled(true);
  }
  if (demo === "library-ignored") ignoredTracks.value = DEMO_IGNORED_TRACKS;
  if (demo === "dark") {
    // 直接走信号：theme.ts 模块初始化早于本函数，写 localStorage 不会生效
    setThemeChoice("dark");
  }
  if (demo === "library" || demo === "library-grid" || demo === "library-artists" || demo === "library-history" || demo === "library-duplicates" || demo === "library-import-progress" || demo === "library-liked" || demo === "library-playlists" || demo === "library-ignored" || demo === "playlist-detail" || demo === "library-removal" || demo === "library-removal-confirm") {
    activeView.value = "library";
  }
  try {
    if (demo === "library-import-progress") localStorage.setItem("ome.library.view", "list");
    if (demo === "library-grid") localStorage.setItem("ome.library.view", "grid");
    if (demo === "library-artists") localStorage.setItem("ome.library.view", "artists");
    if (demo === "library-history") localStorage.setItem("ome.library.view", "history");
    if (demo === "library-duplicates") localStorage.setItem("ome.library.view", "duplicates");
    if (demo === "library-removal" || demo === "library-removal-confirm") {
      localStorage.setItem("ome.library.view", "list");
      tracks.value = DEMO_LIBRARY.filter((track) => track.source === "local");
    }
    if (demo === "library-liked") localStorage.setItem("ome.library.likedOnly", "1");
    if (demo === "library-ignored") localStorage.setItem("ome.library.view", "ignored");
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
  if (demo === "library-removal-confirm") {
    const localTrack = DEMO_LIBRARY.find((track) => track.source === "local");
    if (localTrack) openTrackRemovalConfirm(localTrack);
  }
  if (demo === "library-import-progress") {
    importing.value = true;
    importProgress.value = {
      phase: "reading",
      examinedEntries: 1260,
      discoveredFiles: 64,
      processedFiles: 33,
      totalFiles: 64,
      added: 28,
      updated: 3,
      skipped: 2,
      scanErrors: 1,
    };
  }
  if (demo === "search") {
    activeView.value = "search";
  }
  if (
    demo === "settings" || demo === "settings-diagnostics" ||
    demo === "settings-preferences" || demo === "settings-preferences-preview"
  ) {
    activeView.value = "settings";
  }
  if (demo === "remote-albums" || demo === "remote-album-detail") {
    activeView.value = "search";
    subsonicConnection.value = { connected: true, serverLabel: "music.example" };
    albums.value = DEMO_REMOTE_ALBUMS;
    albumsLoaded.value = true;
    albumHasMore.value = true;
    albumNextOffset.value = 24;
    selectedAlbum.value = demo === "remote-album-detail" ? DEMO_REMOTE_ALBUMS[0] : null;
    albumTracks.value = demo === "remote-album-detail" ? DEMO_REMOTE_ALBUM_TRACKS : [];
    albumTruncated.value = false;
  }
  if (demo?.startsWith("remote-jellyfin-")) {
    activeView.value = "search";
    jellyfinConnection.value = { connected: true, serverLabel: "media.example" };
    jellyfinCatalog.clear();
    if (demo.includes("album")) {
      jellyfinCatalog.albums.value = DEMO_JELLYFIN_ALBUMS;
      jellyfinCatalog.albumsTotalCount.value = 24;
      jellyfinCatalog.albumNextOffset.value = 24;
      jellyfinCatalog.albumHasMore.value = true;
      jellyfinCatalog.albumsLoaded.value = true;
      if (demo === "remote-jellyfin-album-detail") {
        jellyfinCatalog.selectedAlbum.value = DEMO_JELLYFIN_ALBUMS[0];
        jellyfinCatalog.albumTracks.value = DEMO_JELLYFIN_TRACKS;
        jellyfinCatalog.albumTotalSongs.value = 9;
      }
    } else {
      jellyfinCatalog.playlists.value = DEMO_JELLYFIN_PLAYLISTS;
      jellyfinCatalog.playlistsTotalCount.value = 3;
      jellyfinCatalog.playlistsLoaded.value = true;
      if (demo === "remote-jellyfin-playlist-detail") {
        jellyfinCatalog.selectedPlaylist.value = DEMO_JELLYFIN_PLAYLISTS[0];
        jellyfinCatalog.playlistTracks.value = DEMO_JELLYFIN_TRACKS;
        jellyfinCatalog.playlistTotalSongs.value = 18;
      }
    }
  }
  if (demo === "settings-diagnostics") {
    libraryDiagnostics.value = DEMO_LIBRARY_DIAGNOSTICS;
    unavailableLocalTracks.value = DEMO_UNAVAILABLE_LOCAL_TRACKS;
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
        return { hour, plays, completions, skips, genrePreferences: [] };
      });
    }
  }
}
