import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { isTauriRuntime, listLocalTracks } from "../library/libraryApi";
import type { Track } from "../../types/music";

export interface MusicSourceSong {
  id: string;
  source?: string | null;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverUrl: string;
  playableUrl?: string | null;
  unavailable: boolean;
  unavailableReason?: string | null;
  bvid?: string | null;
  aid?: string | null;
  cid?: string | null;
  uploader?: string | null;
  danmakuCount?: number | null;
  playCount?: number | null;
  pageIndex?: number | null;
  sourceUrl?: string | null;
}

export interface MusicSourcePlaylist {
  id: string;
  name: string;
  description: string;
  source: string;
  tracks: MusicSourceSong[];
}

export interface NetEaseUserPlaylist {
  id: string;
  name: string;
  trackCount: number;
  creatorName: string;
  subscribed: boolean;
  coverUrl: string;
  description: string;
}

export interface TasteNotes {
  id: string;
  source: string;
  trackCount: number;
  playlistCount: number;
  musicPersonality: string;
  favoriteArtists: string[];
  favoriteAlbums: string[];
  favoriteLanguages: string[];
  favoriteMoods: string[];
  favoriteScenes: string[];
  hiddenPatterns: string[];
  recommendationStrategy: string;
  confidence: number;
  updatedAt: string;
}

export interface NetEaseTasteSyncPayload {
  includeLikedSongs?: boolean;
  includePlaylists?: boolean;
  playlistIds?: string[];
  likedLimit?: number;
}

export interface NetEaseTasteSyncResult {
  likedCount: number;
  playlistCount: number;
  importedTrackCount: number;
  analyzedTrackCount: number;
  tasteNotes: TasteNotes;
}

export interface MusicSourceConfig {
  enabled: boolean;
  baseUrl: string;
  hasToken: boolean;
  maskedToken: string;
}

export interface BilibiliSourceConfig extends MusicSourceConfig {
  searchScope: "music" | "vocaloid" | "live" | "cover" | "mv" | "all";
}

export interface NetEaseServiceStatus {
  running: boolean;
  started: boolean;
  baseUrl: string;
  message: string;
  nodeAvailable: boolean;
  apiPackageFound: boolean;
}

export interface SaveMusicSourceConfigPayload {
  enabled: boolean;
  baseUrl: string;
  token?: string;
}

export interface SaveBilibiliSourceConfigPayload {
  enabled: boolean;
  baseUrl?: string;
  token?: string;
  searchScope?: BilibiliSourceConfig["searchScope"];
}

export interface PlayableUrlOptions {
  level?: "standard" | "higher" | "exhigh" | "lossless" | "hires";
}

export interface NetEasePlaybackAttempt {
  level: string;
  endpoint: string;
  responseCode?: number | null;
  hasUrl: boolean;
  returnedLevel?: string | null;
  reason?: string | null;
  message?: string | null;
}

export interface NetEasePlaybackDebug {
  isLoggedIn: boolean;
  hasCookie: boolean;
  maskedCookie: string;
  userId?: string | null;
  vipStatus?: string | null;
  requestedSongId: string;
  requestedLevel: string;
  endpoint: string;
  responseCode?: number | null;
  hasUrl: boolean;
  returnedLevel?: string | null;
  fee?: number | null;
  privilege?: string | null;
  reason?: string | null;
  message?: string | null;
  attempts: NetEasePlaybackAttempt[];
}

export interface PlayableUrlResult {
  songId: string;
  url?: string | null;
  videoUrl?: string | null;
  unavailable: boolean;
  reason?: string | null;
  debug?: NetEasePlaybackDebug | null;
}

export interface BilibiliImportResult {
  tracks: Track[];
  playback: PlayableUrlResult;
}

export interface DanmakuItem {
  id: string;
  source: "bilibili";
  cid: string;
  time: number;
  text: string;
  mode: string;
  color: string;
  fontSize: string;
  timestamp: string;
  userHash: string;
  weight: number;
}

export interface DanmakuResponse {
  source: string;
  id: string;
  cid: string;
  cacheKey: string;
  items: DanmakuItem[];
  debug?: BilibiliDanmakuDebug | null;
}

export interface BilibiliDanmakuDebug {
  bvid: string;
  aid?: string | null;
  cid: string;
  danmakuRequestUrl: string;
  rawDanmakuLoaded: boolean;
  rawDanmakuLength: number;
  parsedDanmakuCount: number;
  firstDanmakuTime?: number | null;
  fromCache: boolean;
  error?: string | null;
}

export interface BilibiliLoginStatus {
  loggedIn: boolean;
  expired: boolean;
  nickname?: string | null;
  userId?: string | null;
  message: string;
}

export interface SourceLyricsResult {
  songId: string;
  source: string;
  cacheKey: string;
  lyrics: string;
  translatedLyrics: string;
}

export interface NetEaseQrLogin {
  key: string;
  qrUrl: string;
  qrImg: string;
}

export interface NetEaseQrCheck {
  status: "waiting" | "confirmed" | "success" | "expired" | "unknown";
  code: number;
  message: string;
  loginStatus?: NetEaseLoginStatus | null;
}

export interface BilibiliQrCheck {
  status: "waiting" | "confirmed" | "success" | "expired" | "unknown";
  code: number;
  message: string;
  loginStatus?: BilibiliLoginStatus | null;
}

export interface NetEaseLoginStatus {
  loggedIn: boolean;
  expired: boolean;
  nickname?: string | null;
  userId?: string | null;
  avatarUrl?: string | null;
  message: string;
}

export interface NetEaseVipStatus {
  isMember: boolean;
  level?: string | null;
  message: string;
}

export interface NetEaseUserProfile {
  loggedIn: boolean;
  nickname?: string | null;
  userId?: string | null;
  avatarUrl?: string | null;
  vip?: NetEaseVipStatus | null;
}

export type LoginMethod = "qr" | "password" | "phone_sms" | "cookie_import" | "webview_login";

export type SourceLoginStatus =
  | "idle"
  | "waiting_for_scan"
  | "waiting_for_confirm"
  | "waiting_for_password"
  | "waiting_for_sms_code"
  | "waiting_for_captcha"
  | "waiting_for_second_factor"
  | "logging_in"
  | "logged_in"
  | "expired"
  | "failed";

export interface SourcePasswordCredentials {
  account: string;
  password: string;
  countryCode?: string;
  loginType?: "phone" | "email";
}

export interface SourceSmsPayload {
  phone: string;
  countryCode?: string;
}

export interface SourceSmsLoginPayload extends SourceSmsPayload {
  code: string;
}

export interface SourceConnectionMessage {
  ok: boolean;
  message: string;
}

export interface SourceAuthProvider<LoginStatus, Profile, Membership> {
  getSupportedLoginMethods(): LoginMethod[];
  createQrLogin?(): Promise<NetEaseQrLogin>;
  checkQrLoginStatus?(key: string): Promise<NetEaseQrCheck>;
  loginWithPassword?(credentials: SourcePasswordCredentials): Promise<LoginStatus>;
  requestSmsCode?(payload: SourceSmsPayload): Promise<SourceConnectionMessage>;
  loginWithSmsCode?(payload: SourceSmsLoginPayload): Promise<LoginStatus>;
  submitCaptcha?(captcha: string): Promise<LoginStatus>;
  submitSecondFactor?(payload: unknown): Promise<LoginStatus>;
  importCookie(cookie: string): Promise<LoginStatus>;
  getLoginStatus(): Promise<LoginStatus>;
  refreshSession(): Promise<LoginStatus>;
  logout(): Promise<LoginStatus>;
  getUserProfile(): Promise<Profile>;
  getMembershipStatus(): Promise<Membership>;
  testConnection(): Promise<SourceConnectionMessage>;
  openSecureWebLogin?(): Promise<SourceConnectionMessage>;
}

export interface MusicSourceProvider {
  searchSongs(query: string): Promise<MusicSourceSong[]>;
  getLikedSongs(limit?: number): Promise<MusicSourceSong[]>;
  getUserPlaylists(): Promise<NetEaseUserPlaylist[]>;
  syncListeningMemory(payload?: NetEaseTasteSyncPayload): Promise<NetEaseTasteSyncResult>;
  getLatestTasteNotes(source?: string): Promise<TasteNotes | null>;
  getPlaylist(playlistId: string): Promise<MusicSourcePlaylist>;
  importPlaylist(playlistId: string): Promise<MusicSourcePlaylist>;
  importSong(songId: string): Promise<Track[]>;
  getSongMetadata(songId: string): Promise<MusicSourceSong>;
  getPlayableUrl(songId: string, options?: PlayableUrlOptions): Promise<PlayableUrlResult>;
  getLyrics(songId: string): Promise<string>;
  testConnection(payload: SaveMusicSourceConfigPayload): Promise<string>;
}

export interface NetEaseAuthProvider {
  getSupportedLoginMethods(): LoginMethod[];
  createQrLogin(): Promise<NetEaseQrLogin>;
  checkQrLoginStatus(key: string): Promise<NetEaseQrCheck>;
  loginWithPassword(credentials: SourcePasswordCredentials): Promise<NetEaseLoginStatus>;
  requestSmsCode(payload: SourceSmsPayload): Promise<SourceConnectionMessage>;
  loginWithSmsCode(payload: SourceSmsLoginPayload): Promise<NetEaseLoginStatus>;
  importCookie(cookie: string): Promise<NetEaseLoginStatus>;
  getLoginStatus(): Promise<NetEaseLoginStatus>;
  refreshLogin(): Promise<NetEaseLoginStatus>;
  refreshSession(): Promise<NetEaseLoginStatus>;
  logout(): Promise<NetEaseLoginStatus>;
  getUserProfile(): Promise<NetEaseUserProfile>;
  getVipStatus(): Promise<NetEaseVipStatus>;
  getMembershipStatus(): Promise<NetEaseVipStatus>;
  testConnection(): Promise<SourceConnectionMessage>;
  openSecureWebLogin(): Promise<SourceConnectionMessage>;
}

const emptyConfig: MusicSourceConfig = {
  enabled: false,
  baseUrl: "",
  hasToken: false,
  maskedToken: "",
};

export async function getNeteaseSourceConfig(): Promise<MusicSourceConfig> {
  if (!isTauriRuntime()) {
    return readPreviewConfig();
  }

  return invoke<MusicSourceConfig>("get_netease_source_config");
}

export async function ensureNeteaseApiService(): Promise<NetEaseServiceStatus> {
  if (!isTauriRuntime()) {
    return {
      running: true,
      started: false,
      baseUrl: "http://127.0.0.1:3000",
      message: "Music source is awake.",
      nodeAvailable: true,
      apiPackageFound: true,
    };
  }

  return invoke<NetEaseServiceStatus>("ensure_netease_api_service");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauriRuntime()) {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke<void>("open_external_url", { payload: { url } });
}

export async function saveNeteaseSourceConfig(
  payload: SaveMusicSourceConfigPayload,
): Promise<MusicSourceConfig> {
  if (!isTauriRuntime()) {
    const nextConfig = {
      enabled: payload.enabled,
      baseUrl: payload.baseUrl,
      hasToken: Boolean(payload.token) || readPreviewConfig().hasToken,
      maskedToken: payload.token
        ? maskTokenPreview(payload.token)
        : readPreviewConfig().maskedToken,
    };
    window.localStorage.setItem("ome.source.netease.preview", JSON.stringify(nextConfig));
    return nextConfig;
  }

  return invoke<MusicSourceConfig>("save_netease_source_config", { payload });
}

export async function testNeteaseSourceConnection(
  payload: SaveMusicSourceConfigPayload,
): Promise<string> {
  if (!isTauriRuntime()) {
    return "Connected. The source is ready.";
  }

  const response = await invoke<{ ok: boolean; message: string }>(
    "test_netease_source_connection",
    { payload },
  );
  return response.message;
}

const emptyBilibiliConfig: BilibiliSourceConfig = {
  enabled: false,
  baseUrl: "https://api.bilibili.com",
  hasToken: false,
  maskedToken: "",
  searchScope: "music",
};

export async function getBilibiliSourceConfig(): Promise<BilibiliSourceConfig> {
  if (!isTauriRuntime()) {
    return readPreviewBilibiliConfig();
  }
  return invoke<BilibiliSourceConfig>("get_bilibili_source_config");
}

export async function saveBilibiliSourceConfig(
  payload: SaveBilibiliSourceConfigPayload,
): Promise<BilibiliSourceConfig> {
  if (!isTauriRuntime()) {
    const nextConfig: BilibiliSourceConfig = {
      ...readPreviewBilibiliConfig(),
      enabled: payload.enabled,
      baseUrl: payload.baseUrl || "https://api.bilibili.com",
      hasToken: Boolean(payload.token) || readPreviewBilibiliConfig().hasToken,
      maskedToken: payload.token ? "••••••••••••" : readPreviewBilibiliConfig().maskedToken,
      searchScope: payload.searchScope ?? "music",
    };
    window.localStorage.setItem("ome.source.bilibili.preview", JSON.stringify(nextConfig));
    return nextConfig;
  }
  return invoke<BilibiliSourceConfig>("save_bilibili_source_config", { payload });
}

export async function testBilibiliSourceConnection(
  payload: SaveBilibiliSourceConfigPayload,
): Promise<string> {
  if (!isTauriRuntime()) return "Connected. Bilibili is ready.";
  const response = await invoke<{ ok: boolean; message: string }>(
    "test_bilibili_source_connection",
    { payload },
  );
  return response.message;
}

export class BilibiliMusicProvider {
  private readonly searchCache = new Map<string, { expiresAt: number; songs: MusicSourceSong[] }>();
  private readonly searchRequests = new Map<string, Promise<MusicSourceSong[]>>();

  async searchSongs(query: string): Promise<MusicSourceSong[]> {
    if (!isTauriRuntime()) return previewBilibiliSongs(query);
    const cacheKey = query.trim().toLocaleLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.songs;

    const inFlight = this.searchRequests.get(cacheKey);
    if (inFlight) return inFlight;

    const request = invoke<MusicSourceSong[]>("search_bilibili_songs", {
      payload: { query: query.trim() },
    })
      .then((songs) => {
        this.searchCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60_000, songs });
        return songs;
      })
      .finally(() => this.searchRequests.delete(cacheKey));
    this.searchRequests.set(cacheKey, request);
    return request;
  }

  async searchVideos(query: string): Promise<MusicSourceSong[]> {
    return this.searchSongs(query);
  }

  async getVideoMetadata(bvidOrAid: string): Promise<MusicSourceSong> {
    if (!isTauriRuntime()) return previewBilibiliSongs(bvidOrAid)[0];
    return invoke<MusicSourceSong>("get_bilibili_song_metadata", {
      payload: { songId: bvidOrAid },
    });
  }

  async getPlayableUrl(songId: string): Promise<PlayableUrlResult> {
    if (!isTauriRuntime()) {
      return { songId, url: null, unavailable: true, reason: "api_failed", debug: null };
    }
    return invoke<PlayableUrlResult>("get_bilibili_playable_url", { payload: { songId } });
  }

  async importSong(songId: string): Promise<BilibiliImportResult> {
    if (!isTauriRuntime()) {
      return {
        tracks: await listLocalTracks(),
        playback: {
          songId,
          url: null,
          videoUrl: null,
          unavailable: true,
          reason: "api_failed",
          debug: null,
        },
      };
    }
    return invoke<BilibiliImportResult>("import_bilibili_song", { payload: { songId } });
  }

  async getDanmaku(sourceId: string, cid?: string | null): Promise<DanmakuResponse> {
    if (!isTauriRuntime()) {
      return {
        source: "bilibili",
        id: sourceId,
        cid: cid ?? "preview",
        cacheKey: `bilibili:${cid ?? "preview"}:danmaku`,
        items: previewDanmaku(),
      };
    }
    return invoke<DanmakuResponse>("get_bilibili_danmaku", {
      payload: { source: "bilibili", id: sourceId, cid },
    });
  }

  async clearDanmakuCache(): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke("clear_danmaku_cache");
  }
}

export class BilibiliAccountSessionProvider {
  getSupportedLoginMethods(): LoginMethod[] {
    return ["qr", "password", "phone_sms", "cookie_import", "webview_login"];
  }

  async createQrLogin(): Promise<NetEaseQrLogin> {
    if (!isTauriRuntime()) {
      return { key: "preview", qrUrl: "https://passport.bilibili.com/login", qrImg: "" };
    }
    const qr = await invoke<NetEaseQrLogin>("create_bilibili_qr_login");
    return {
      ...qr,
      qrImg: await QRCode.toDataURL(qr.qrUrl, {
        width: 256,
        margin: 1,
        color: { dark: "#20120b", light: "#ffffff" },
      }),
    };
  }

  async checkQrLoginStatus(key: string): Promise<BilibiliQrCheck> {
    if (!isTauriRuntime()) {
      return { status: "waiting", code: 86101, message: "Waiting for scan." };
    }
    return invoke<BilibiliQrCheck>("check_bilibili_qr_login", { payload: { key } });
  }

  async loginWithPassword(): Promise<BilibiliLoginStatus> {
    await this.openSecureWebLogin();
    throw new Error(
      "Password sign-in opened in Bilibili's secure page. Complete verification there; Ome Music never stores your password.",
    );
  }

  async requestSmsCode(): Promise<SourceConnectionMessage> {
    return this.openSecureWebLogin();
  }

  async loginWithSmsCode(): Promise<BilibiliLoginStatus> {
    await this.openSecureWebLogin();
    throw new Error("SMS sign-in opened in Bilibili's secure page. Complete verification there.");
  }

  async importCookie(cookie: string): Promise<BilibiliLoginStatus> {
    if (!isTauriRuntime())
      return { loggedIn: true, expired: false, message: "Connected to Bilibili." };
    return invoke<BilibiliLoginStatus>("import_bilibili_cookie", { payload: { cookie } });
  }

  async getLoginStatus(): Promise<BilibiliLoginStatus> {
    if (!isTauriRuntime())
      return { loggedIn: false, expired: false, message: "Public content is available." };
    return invoke<BilibiliLoginStatus>("get_bilibili_login_status");
  }

  async refreshSession(): Promise<BilibiliLoginStatus> {
    return this.getLoginStatus();
  }

  async logout(): Promise<BilibiliLoginStatus> {
    if (!isTauriRuntime()) return { loggedIn: false, expired: false, message: "Signed out." };
    return invoke<BilibiliLoginStatus>("logout_bilibili");
  }

  async getUserProfile(): Promise<BilibiliLoginStatus> {
    return this.getLoginStatus();
  }

  async getMembershipStatus(): Promise<{
    isMember: boolean;
    level?: string | null;
    message: string;
  }> {
    const status = await this.getLoginStatus();
    return {
      isMember: status.loggedIn,
      level: status.loggedIn ? "connected" : null,
      message: status.loggedIn ? "Connected." : status.message,
    };
  }

  async testConnection(): Promise<SourceConnectionMessage> {
    if (!isTauriRuntime()) return { ok: true, message: "Connected. Bilibili is ready." };
    return invoke<SourceConnectionMessage>("test_bilibili_source_connection", {
      payload: { enabled: true, baseUrl: "https://api.bilibili.com" },
    });
  }

  async openSecureWebLogin(): Promise<SourceConnectionMessage> {
    if (!isTauriRuntime())
      return { ok: true, message: "Open Bilibili in your browser, then import Cookie." };
    return invoke<SourceConnectionMessage>("open_source_web_login", {
      payload: { source: "bilibili" },
    });
  }
}

export class NetEaseMusicProvider implements MusicSourceProvider {
  async searchSongs(query: string): Promise<MusicSourceSong[]> {
    if (!isTauriRuntime()) return previewSongs(query);
    return invoke<MusicSourceSong[]>("search_netease_songs", { payload: { query } });
  }

  async getLikedSongs(limit = 100): Promise<MusicSourceSong[]> {
    if (!isTauriRuntime()) return previewSongs("liked");
    return invoke<MusicSourceSong[]>("get_netease_liked_songs", { limit });
  }

  async getUserPlaylists(): Promise<NetEaseUserPlaylist[]> {
    if (!isTauriRuntime()) return [previewUserPlaylist()];
    return invoke<NetEaseUserPlaylist[]>("get_netease_user_playlists");
  }

  async syncListeningMemory(
    payload: NetEaseTasteSyncPayload = {},
  ): Promise<NetEaseTasteSyncResult> {
    if (!isTauriRuntime()) {
      return {
        likedCount: 1,
        playlistCount: payload.includePlaylists ? 1 : 0,
        importedTrackCount: 1,
        analyzedTrackCount: 1,
        tasteNotes: previewTasteNotes(),
      };
    }
    return invoke<NetEaseTasteSyncResult>("sync_netease_listening_memory", { payload });
  }

  async getLatestTasteNotes(source = "netease"): Promise<TasteNotes | null> {
    if (!isTauriRuntime()) return previewTasteNotes();
    return invoke<TasteNotes | null>("get_latest_taste_notes", { source });
  }

  async getPlaylist(playlistId: string): Promise<MusicSourcePlaylist> {
    if (!isTauriRuntime()) return previewPlaylist(playlistId);
    return invoke<MusicSourcePlaylist>("get_netease_playlist", { payload: { playlistId } });
  }

  async importPlaylist(playlistId: string): Promise<MusicSourcePlaylist> {
    if (!isTauriRuntime()) return previewPlaylist(playlistId);
    return invoke<MusicSourcePlaylist>("import_netease_playlist", { payload: { playlistId } });
  }

  async importSong(songId: string): Promise<Track[]> {
    if (!isTauriRuntime()) return [previewTrack(songId)];
    return invoke<Track[]>("import_netease_song", { payload: { songId } });
  }

  async getSongMetadata(songId: string): Promise<MusicSourceSong> {
    if (!isTauriRuntime()) return previewSongs(songId)[0];
    return invoke<MusicSourceSong>("get_netease_song_metadata", { payload: { songId } });
  }

  async getPlayableUrl(songId: string, options?: PlayableUrlOptions): Promise<PlayableUrlResult> {
    if (!isTauriRuntime()) {
      return {
        songId,
        url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
        unavailable: false,
        reason: null,
        debug: null,
      };
    }
    return invoke<PlayableUrlResult>("get_netease_playable_url", {
      payload: { songId, level: options?.level },
    });
  }

  async getLyrics(songId: string): Promise<string> {
    if (!isTauriRuntime()) return `[00:00.00]A quiet line for ${songId}`;
    const response = await invoke<SourceLyricsResult>("get_netease_lyrics", {
      payload: { songId },
    });
    return response.lyrics;
  }

  async testConnection(payload: SaveMusicSourceConfigPayload): Promise<string> {
    return testNeteaseSourceConnection(payload);
  }
}

export class NetEaseAccountSessionProvider implements NetEaseAuthProvider {
  getSupportedLoginMethods(): LoginMethod[] {
    return ["qr", "password", "phone_sms", "cookie_import", "webview_login"];
  }

  async createQrLogin(): Promise<NetEaseQrLogin> {
    if (!isTauriRuntime()) {
      return { key: "preview", qrUrl: "", qrImg: "" };
    }
    return invoke<NetEaseQrLogin>("create_netease_qr_login");
  }

  async checkQrLoginStatus(key: string): Promise<NetEaseQrCheck> {
    if (!isTauriRuntime()) {
      return { status: "waiting", code: 801, message: "Waiting for scan." };
    }
    return invoke<NetEaseQrCheck>("check_netease_qr_login", { payload: { key } });
  }

  async loginWithPassword(credentials: SourcePasswordCredentials): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) {
      return { loggedIn: true, expired: false, message: "Connected." };
    }
    return invoke<NetEaseLoginStatus>("login_netease_with_password", { payload: credentials });
  }

  async requestSmsCode(payload: SourceSmsPayload): Promise<SourceConnectionMessage> {
    if (!isTauriRuntime()) return { ok: true, message: "Code sent." };
    return invoke<SourceConnectionMessage>("request_netease_sms_code", { payload });
  }

  async loginWithSmsCode(payload: SourceSmsLoginPayload): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) {
      return { loggedIn: true, expired: false, message: "Connected." };
    }
    return invoke<NetEaseLoginStatus>("login_netease_with_sms_code", { payload });
  }

  async importCookie(cookie: string): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) {
      return { loggedIn: true, expired: false, message: "Connected." };
    }
    return invoke<NetEaseLoginStatus>("import_netease_cookie", { payload: { cookie } });
  }

  async getLoginStatus(): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) {
      return {
        loggedIn: false,
        expired: false,
        message: "Sign in to your music source to try again.",
      };
    }
    return invoke<NetEaseLoginStatus>("get_netease_login_status");
  }

  async refreshLogin(): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) return this.getLoginStatus();
    return invoke<NetEaseLoginStatus>("refresh_netease_login");
  }

  async refreshSession(): Promise<NetEaseLoginStatus> {
    return this.refreshLogin();
  }

  async logout(): Promise<NetEaseLoginStatus> {
    if (!isTauriRuntime()) {
      return { loggedIn: false, expired: false, message: "Signed out." };
    }
    return invoke<NetEaseLoginStatus>("logout_netease");
  }

  async getUserProfile(): Promise<NetEaseUserProfile> {
    if (!isTauriRuntime()) {
      return { loggedIn: false };
    }
    return invoke<NetEaseUserProfile>("get_netease_user_profile");
  }

  async getVipStatus(): Promise<NetEaseVipStatus> {
    if (!isTauriRuntime()) {
      return { isMember: false, message: "Sign in to view membership status." };
    }
    return invoke<NetEaseVipStatus>("get_netease_vip_status");
  }

  async getMembershipStatus(): Promise<NetEaseVipStatus> {
    return this.getVipStatus();
  }

  async testConnection(): Promise<SourceConnectionMessage> {
    if (!isTauriRuntime()) return { ok: true, message: "Connected. The source is ready." };
    return invoke<SourceConnectionMessage>("test_netease_source_connection", {
      payload: { enabled: true, baseUrl: "http://127.0.0.1:3000" },
    });
  }

  async openSecureWebLogin(): Promise<SourceConnectionMessage> {
    if (!isTauriRuntime())
      return { ok: true, message: "Open NetEase in your browser, then import Cookie." };
    return invoke<SourceConnectionMessage>("open_source_web_login", {
      payload: { source: "netease" },
    });
  }
}

export async function refreshLocalTracksAfterSourceImport(): Promise<Track[]> {
  return listLocalTracks();
}

function readPreviewConfig(): MusicSourceConfig {
  try {
    const raw = window.localStorage.getItem("ome.source.netease.preview");
    return raw ? { ...emptyConfig, ...JSON.parse(raw) } : emptyConfig;
  } catch {
    return emptyConfig;
  }
}

function readPreviewBilibiliConfig(): BilibiliSourceConfig {
  try {
    const raw = window.localStorage.getItem("ome.source.bilibili.preview");
    return raw ? { ...emptyBilibiliConfig, ...JSON.parse(raw) } : emptyBilibiliConfig;
  } catch {
    return emptyBilibiliConfig;
  }
}

function maskTokenPreview(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  const musicU = trimmed.match(/MUSIC_U=([^;]+)/i)?.[1] ?? trimmed;
  if (musicU.length <= 8) return "****";
  return `MUSIC_U=${musicU.slice(0, 4)}****${musicU.slice(-4)}`;
}

function previewSongs(query: string): MusicSourceSong[] {
  const isSunYanzi = query.includes("\u5b59\u71d5\u59ff") || query.includes("\u9047\u89c1");
  return [
    {
      id: isSunYanzi ? "287319" : `preview-${query || "song"}`,
      source: "netease",
      title: isSunYanzi ? "\u9047\u89c1" : query || "Preview Song",
      artist: isSunYanzi ? "\u5b59\u71d5\u59ff" : "NetEase Cloud Music",
      album: isSunYanzi ? "The Moment" : "Preview Source",
      durationSeconds: 212,
      coverUrl: "",
      playableUrl: null,
      unavailable: true,
      unavailableReason: "api_failed",
    },
  ];
}

function previewTrack(songId: string): Track {
  const song =
    songId === "287319"
      ? previewSongs("\u5b59\u71d5\u59ff \u9047\u89c1")[0]
      : previewSongs(songId)[0];
  return {
    id: `preview-netease-${song.id}`,
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationSeconds: song.durationSeconds ?? 212,
    filePath: `preview://netease/${song.id}`,
    source: "netease",
    sourceId: song.id,
    unavailableReason: null,
    coverUrl: song.coverUrl ?? "",
    genres: ["Mandopop"],
    moods: ["calm", "dreamy"],
    language: "zh",
    year: 2003,
    playCount: 0,
    skipCount: 0,
    liked: false,
    importedAt: new Date().toISOString(),
  };
}

function previewBilibiliSongs(query: string): MusicSourceSong[] {
  return [
    {
      id: query.startsWith("BV") ? query : "BV1xx411c7mD",
      source: "bilibili",
      title: query || "Bilibili Preview",
      artist: "Bilibili",
      album: "Bilibili",
      durationSeconds: 205,
      coverUrl: "",
      playableUrl: null,
      unavailable: false,
      bvid: query.startsWith("BV") ? query : "BV1xx411c7mD",
      cid: "62131",
      uploader: "Bilibili",
      danmakuCount: 120,
      playCount: 12000,
      sourceUrl: "https://www.bilibili.com",
    },
  ];
}

function previewDanmaku(): DanmakuItem[] {
  return [
    {
      id: "dm-1",
      source: "bilibili",
      cid: "preview",
      time: 3,
      text: "\u8fd9\u6bb5\u597d\u6709\u7a7a\u6c14\u611f",
      mode: "1",
      color: "ffffff",
      fontSize: "25",
      timestamp: "",
      userHash: "",
      weight: 1,
    },
    {
      id: "dm-2",
      source: "bilibili",
      cid: "preview",
      time: 8,
      text: "\u591c\u91cc\u542c\u521a\u521a\u597d",
      mode: "1",
      color: "ffffff",
      fontSize: "25",
      timestamp: "",
      userHash: "",
      weight: 1,
    },
  ];
}
function previewPlaylist(playlistId: string): MusicSourcePlaylist {
  return {
    id: playlistId,
    name: `Playlist ${playlistId}`,
    description: "",
    source: "netease",
    tracks: previewSongs(playlistId),
  };
}

function previewUserPlaylist(): NetEaseUserPlaylist {
  return {
    id: "preview-playlist",
    name: "Preview Playlist",
    trackCount: 12,
    creatorName: "Local Preview",
    subscribed: false,
    coverUrl: "",
    description: "",
  };
}

function previewTasteNotes(): TasteNotes {
  return {
    id: "preview-taste-notes",
    source: "netease",
    trackCount: 1,
    playlistCount: 0,
    musicPersonality: "A quiet private shelf, waiting for more records.",
    favoriteArtists: ["NetEase Cloud Music"],
    favoriteAlbums: ["Preview Source"],
    favoriteLanguages: ["International"],
    favoriteMoods: ["late-night calm"],
    favoriteScenes: ["Late-night radio"],
    hiddenPatterns: ["The first layer is still forming."],
    recommendationStrategy:
      "Start with familiar voices, then bring in adjacent songs with restraint.",
    confidence: 0.12,
    updatedAt: new Date().toISOString(),
  };
}
