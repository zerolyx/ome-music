import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { TtsSettings } from "../components/TtsSettings";
import { EqCurve } from "../components/EqCurve";
import { ChannelToolsPresetManager } from "../components/ChannelToolsPresetManager";
import { Icon } from "../components/Icon";
import {
  exportDataBackup,
  getAppVersion,
  hasLastRestorePoint,
  inspectDataBackup,
  isTauriRuntime,
  restoreDataBackup,
  restoreLastImport,
  type DataBackupPreview,
  type DataRestoreResult,
  type QuickIdentityBackfillResult,
} from "../lib/api";
import {
  customTheme,
  resetCustomTheme,
  setCustomTheme,
  setCustomThemeColor,
  setThemeChoice,
  systemDark,
  THEME_PRESETS,
  THEME_SWATCHES,
  themeChoice,
  type CustomThemeColors,
  type ThemeChoice,
} from "../state/theme";
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  requestedSettingsSection,
  searchSections,
  type SectionId,
} from "../state/settings-nav";
import { SHORTCUTS } from "../state/hotkeys";
import { djConfig, lastError, loadConfig, saveConfig } from "../state/dj";
import { radioEnabled, setRadioEnabled } from "../state/radio";
import { danmakuEnabled, setDanmakuEnabled } from "../state/danmaku";
import { accentMode, setAccentMode } from "../state/tint";
import { MAX_THEME_TRANSFER_BYTES, parseThemeTransfer, serializeThemeTransfer } from "../lib/theme-transfer";
import {
  MAX_PREFERENCES_TRANSFER_BYTES,
  parsePreferencesTransfer,
  serializePreferencesTransfer,
  type PreferencesTransferDocument,
  type PreferencesTransferPayload,
} from "../lib/preferences-transfer";
import { parseQueueSessionSnapshot } from "../lib/queue-session";
import { closeDeskLyrics, deskLyricsLocked, deskLyricsOpen, openDeskLyrics, setDeskLyricsLocked } from "../state/desklyrics";
import {
  applyEqPreset,
  bandLabel,
  EQ_BANDS,
  EQ_MAX,
  EQ_MIN,
  EQ_PRESETS,
  eqEnabled,
  eqGains,
  eqPreampDb,
  eqPreset,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
  EQ_PREAMP_STEP,
  estimateEqPeakWithPreampDb,
  recommendedEqPreampDb,
  restoreEqSettings,
  setEqBand,
  setEqEnabled,
  setEqPreampDb,
} from "../state/equalizer";
import { fadeEnabled, setFadeEnabled } from "../state/fade";
import { lyricSubtitleMode, setLyricSubtitleMode } from "../state/lyrics";
import {
  cancelLyricsBackfillJob,
  isLyricsBackfillRunning,
  loadLyricsBackfillStatus,
  lyricsBackfillBusy,
  lyricsBackfillError,
  lyricsBackfillJob,
  lyricsBackfillThreshold,
  resumeLyricsBackfillJob,
  setLyricsBackfillThreshold,
  startLyricsBackfillJob,
} from "../state/lyrics-backfill";
import {
  setStageEffect,
  setStageFontScale,
  stageEffect,
  stageFontScale,
  STAGE_FONT_SCALE_MAX,
  STAGE_FONT_SCALE_MIN,
  STAGE_FONT_SCALE_STEP,
} from "../state/stage";
import {
  setStartupLibraryRescanEnabled,
  startupLibraryRescanEnabled,
  startupLibraryRescanRunning,
  startupLibraryRescanStatus,
} from "../state/library-automation";
import { setVizMode, setVizPalette, vizMode, vizPalette } from "../state/visualizer";
import {
  replayGainEnabled,
  replayGainMode,
  replayGainPreampDb,
  replayGainPreventClipping,
  REPLAY_GAIN_PREAMP_MAX,
  REPLAY_GAIN_PREAMP_MIN,
  REPLAY_GAIN_PREAMP_STEP,
  restoreReplayGainSettings,
  setReplayGainEnabled,
  setReplayGainMode,
  setReplayGainPreampDb,
  setReplayGainPreventClipping,
} from "../state/replaygain";
import {
  CHANNEL_TOOL_BANDS,
  CHANNEL_BAND_MAX_DB,
  CHANNEL_BAND_MIN_DB,
  CHANNEL_DELAY_MAX_MS,
  CHANNEL_DELAY_MIN_MS,
  CHANNEL_GAIN_MAX_DB,
  CHANNEL_GAIN_MIN_DB,
  channelToolsSettings,
  channelToolsComparisonSlots,
  channelToolsPresets,
  patchChannelToolsSettings,
  restoreChannelToolsProfiles,
  restoreChannelToolsSettings,
  resetChannelToolsSettings,
} from "../state/channel-tools";
import {
  authorizedMusicDirectories,
  authorizedMusicDirectoriesError,
  authorizedMusicDirectoriesLoading,
  libraryDiagnostics,
  libraryDiagnosticsError,
  libraryDiagnosticsLoading,
  libraryMoveCandidates,
  libraryMoveCandidatesError,
  libraryMoveCandidatesLoading,
  unavailableLocalTracks,
  unavailableLocalTracksError,
  unavailableLocalTracksLoading,
  unavailableLocalTracksNotice,
  importFolder,
  importNotice,
  importing,
  refreshAuthorizedMusicDirectories,
  refreshLibraryDiagnostics,
  backfillLibraryQuickIdentity,
  loadUnavailableLocalTracks,
  loadLibraryMoveCandidates,
  repairUnavailableLocalTrack,
  rescanAuthorizedMusicDirectory,
  revokeAuthorizedMusicDirectory,
} from "../state/library";
import {
  outputDevices,
  outputDeviceId,
  refreshOutputDevices,
  setOutputDevice,
} from "../state/audioout";
import {
  cancelQrLogin,
  loginError as neteaseLoginError,
  logout,
  qrLoading,
  qrState,
  refreshStatus,
  startQrLogin,
  status,
} from "../state/netease";
import { lastManualQueueSession, queue, removeTracksFromQueue, replaceLastManualQueueSession } from "../state/player";
import {
  connectSubsonic,
  connection as subsonicConnection,
  connecting as subsonicConnecting,
  disconnectSubsonic,
  error as subsonicError,
  refreshSubsonicStatus,
} from "../state/subsonic";
import {
  connectJellyfin,
  connection as jellyfinConnection,
  connecting as jellyfinConnecting,
  disconnectJellyfin,
  error as jellyfinError,
  refreshJellyfinStatus,
} from "../state/jellyfin";
import {
  connectEmby,
  connection as embyConnection,
  connecting as embyConnecting,
  disconnectEmby,
  error as embyError,
  refreshEmbyStatus,
} from "../state/emby";
import {
  connectWebDav,
  connection as webdavConnection,
  connecting as webdavConnecting,
  disconnectWebDav,
  error as webdavError,
  refreshWebDavStatus,
} from "../state/webdav";
import {
  connectSmb,
  connection as smbConnection,
  connecting as smbConnecting,
  disconnectSmb,
  error as smbError,
  refreshSmbStatus,
} from "../state/smb";

const CHOICES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "custom", label: "自由配色" },
  ...THEME_PRESETS.map((preset) => ({ value: preset.id as ThemeChoice, label: preset.label })),
];

const CUSTOM_COLOR_FIELDS: Array<{ key: keyof CustomThemeColors; label: string }> = [
  { key: "bg", label: "背景" },
  { key: "surface", label: "面板" },
  { key: "text", label: "文字" },
  { key: "accent", label: "强调色" },
];

const QR_PHASE_TEXT: Record<string, string> = {
  idle: "正在获取二维码…",
  waiting: "请打开网易云音乐 App → 右上角 ＋ → 扫一扫（微信/相机扫码会提示“暂不支持该类型”）",
  scanned: "已扫描，请在手机上确认",
  success: "登录成功",
  expired: "二维码已过期",
};

/* ---- 统一设置行：左标题+描述，右控件（ECHO SettingRow 式节奏） ---- */
function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="setting-row">
      <div class="setting-row-text">
        <span class="setting-row-title">{title}</span>
        {hint && <span class="setting-row-hint">{hint}</span>}
      </div>
      {children !== undefined && children !== null && (
        <div class="setting-row-control">{children}</div>
      )}
    </div>
  );
}

/** 二值偏好开关 */
function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      class={`switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span class="switch-knob" />
    </button>
  );
}

/** 多选 segmented（强调色等非二值选项） */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          class={`segment ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** 可折叠分区：标题行点击收起/展开（受控：侧栏导航也能展开并定位） */
function Card({
  title,
  id,
  open,
  onToggle,
  children,
}: {
  title: string;
  id: string;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class="settings-card" id={`settings-${id}`}>
      <button
        class="settings-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "收起" : "展开"}${title}`}
      >
        <span class="settings-label">{title}</span>
        <span class={`settings-chevron ${open ? "is-open" : ""}`}>
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {open && <div class="settings-inner">{children}</div>}
    </div>
  );
}

/** 私人 DJ：OpenAI 兼容语言模型配置；空 apiKey 表示保留旧密钥 */
function DjConfigBody() {
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMaskedKey, setSavedMaskedKey] = useState<string | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  // 配置信号更新（首次载入 / 保存成功）时同步表单
  useEffect(() => {
    const config = djConfig.value;
    if (!config) return;
    setProviderName(config.providerName);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setSavedMaskedKey(config.configured ? config.maskedKey : null);
  }, [djConfig.value]);

  const save = async () => {
    setSaving(true);
    const result = await saveConfig({
      providerName: providerName.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey,
    });
    setSaving(false);
    if (result) {
      setApiKey(""); // 密钥不回显，清空输入框
      setSavedMaskedKey(result.maskedKey);
    }
  };

  const canSave = providerName.trim() !== "" && baseUrl.trim() !== "" && model.trim() !== "" && !saving;
  const config = djConfig.value;
  const maskedKey = savedMaskedKey ?? (config?.configured ? config.maskedKey : "");

  return (
    <>
      <p class="dj-config-state">
        {config?.configured ? `已配置：${config.providerName} · ${config.model}` : "未配置"}
      </p>
      <div class="dj-config-grid">
        <label class="dj-field">
          服务商名称
          <input
            value={providerName}
            placeholder="DeepSeek"
            onInput={(event) => setProviderName((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          接口地址
          <input
            value={baseUrl}
            placeholder="https://api.deepseek.com"
            onInput={(event) => setBaseUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          模型
          <input
            value={model}
            placeholder="deepseek-chat"
            onInput={(event) => setModel((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          API 密钥
          <input
            type="password"
            value={apiKey}
            placeholder="留空保持不变"
            autoComplete="off"
            onInput={(event) => setApiKey((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button class="btn-primary" disabled={!canSave} onClick={() => void save()}>
          {saving ? "保存中…" : "保存"}
        </button>
        {maskedKey && <span class="view-hint">密钥：{maskedKey}</span>}
        {lastError.value && <span class="dj-config-error">{lastError.value}</span>}
      </div>
      <p class="view-hint">
        兼容 OpenAI 接口（如 DeepSeek）。是否自动接播在「播放 → 自动电台」；语音音色在下方语音设置。
      </p>
      <TtsSettings />
    </>
  );
}

function NetEaseBody() {
  const previewMode = new URLSearchParams(window.location.search).has("demo");
  if (!isTauriRuntime() || previewMode) {
    return (
      <div class="netease-row">
        <span class="view-hint" id="netease-desktop-only" role="status">
          {previewMode
            ? "当前是界面预览，不会连接网易云登录服务。请打开 Ome Music 桌面版正式页面生成二维码后扫码。"
            : "当前是浏览器预览，无法连接网易云登录服务。请打开 Ome Music 桌面版，在这里生成二维码后用网易云 App 扫码。"}
        </span>
        <button class="btn-primary" disabled aria-describedby="netease-desktop-only">
          {previewMode ? "预览不可登录" : "仅桌面版可用"}
        </button>
      </div>
    );
  }

  return (
    <>
      {status.value?.loggedIn ? (
        <div class="netease-row">
          <span>已登录：{status.value.nickname ?? "网易云用户"}</span>
          <button class="btn-secondary" onClick={() => void logout()}>
            登出
          </button>
        </div>
      ) : qrState.value ? (
        <div class="netease-qr">
          <div
            class="qr-box"
            // 后端生成的可信 SVG（仅含二维码路径）
            dangerouslySetInnerHTML={{ __html: qrState.value.qrSvg }}
          />
          <p class="view-hint" role="status" aria-live="polite">
            {QR_PHASE_TEXT[qrState.value.phase] ?? ""}
          </p>
          {qrState.value.phase === "expired" && (
            <button class="btn-primary" disabled={qrLoading.value} onClick={() => void startQrLogin()}>
              {qrLoading.value ? "正在获取二维码…" : "重新获取"}
            </button>
          )}
        </div>
      ) : (
        <div class="netease-row">
          <span class="view-hint">扫码登录后可搜索与播放网易云曲库</span>
          <button class="btn-primary" disabled={qrLoading.value} onClick={() => void startQrLogin()}>
            {qrLoading.value ? "正在获取二维码…" : "扫码登录"}
          </button>
        </div>
      )}
      {neteaseLoginError.value && (
        <p class="dj-config-error" role="alert">获取网易云登录二维码失败：{neteaseLoginError.value}</p>
      )}
    </>
  );
}

function SubsonicSettingsBody() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void refreshSubsonicStatus();
  }, []);

  const connect = async () => {
    const connected = await connectSubsonic({
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
    });
    if (connected) setPassword("");
  };

  const disconnect = async () => {
    const remoteTrackIds = queue.value
      .filter((track) => track.source === "subsonic")
      .map((track) => track.id);
    if (await disconnectSubsonic()) removeTracksFromQueue(remoteTrackIds);
  };

  return (
    <div class="remote-library-settings">
      <Row
        title="Navidrome / Subsonic 曲库"
        hint="连接你自己的音乐服务器，在搜索中找到并播放曲目。连接仅对本次运行有效。"
      >
        <span class={`local-directory-status ${subsonicConnection.value.connected ? "is-available" : "is-missing"}`} role="status" aria-live="polite">
          <span class="local-directory-status-dot" aria-hidden="true" />
          {subsonicConnection.value.connected
            ? `已连接 · ${subsonicConnection.value.serverLabel ?? "远程曲库"}`
            : "尚未连接"}
        </span>
      </Row>
      <div class="dj-config-grid">
        <label class="dj-field">
          服务器地址
          <input
            type="url"
            value={serverUrl}
            placeholder="https://music.example.com"
            autoComplete="off"
            onInput={(event) => setServerUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          用户名
          <input
            value={username}
            autoComplete="off"
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          密码
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button
          class="btn-primary"
          disabled={!isTauriRuntime() || subsonicConnecting.value || !serverUrl.trim() || !username.trim() || !password}
          onClick={() => void connect()}
        >
          {subsonicConnecting.value ? "连接中…" : subsonicConnection.value.connected ? "重新连接" : "连接曲库"}
        </button>
        {subsonicConnection.value.connected && (
          <button class="btn-secondary" disabled={subsonicConnecting.value} onClick={() => void disconnect()}>
            断开
          </button>
        )}
        {subsonicError.value && <span class="dj-config-error" role="alert">{subsonicError.value}</span>}
      </div>
      <p class="view-hint">
        密码只保存在桌面应用本次运行的内存中；退出应用后需重新连接。公网服务器必须使用 HTTPS，HTTP 仅允许本机或局域网地址。断开会移除队列里的远程曲目，其他曲目会保留。
      </p>
      {!isTauriRuntime() && <p class="view-hint">远程曲库连接仅在桌面应用中可用。</p>}
    </div>
  );
}

function JellyfinSettingsBody() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void refreshJellyfinStatus();
  }, []);

  const connect = async () => {
    const connected = await connectJellyfin({
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
    });
    if (connected) setPassword("");
  };

  const disconnect = async () => {
    const remoteTrackIds = queue.value
      .filter((track) => track.source === "jellyfin")
      .map((track) => track.id);
    if (await disconnectJellyfin()) removeTracksFromQueue(remoteTrackIds);
  };

  return (
    <div class="remote-library-settings">
      <Row
        title="Jellyfin 曲库"
        hint="连接你自己的 Jellyfin 服务器，按需搜索并播放曲目。曲目只读，不会加入本地电台画像。"
      >
        <span class={`local-directory-status ${jellyfinConnection.value.connected ? "is-available" : "is-missing"}`} role="status" aria-live="polite">
          <span class="local-directory-status-dot" aria-hidden="true" />
          {jellyfinConnection.value.connected
            ? `已连接 · ${jellyfinConnection.value.serverLabel ?? "Jellyfin 曲库"}`
            : "尚未连接"}
        </span>
      </Row>
      <div class="dj-config-grid">
        <label class="dj-field">
          服务器地址
          <input
            type="url"
            value={serverUrl}
            placeholder="https://music.example.com/jellyfin"
            autoComplete="off"
            onInput={(event) => setServerUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          用户名
          <input
            value={username}
            autoComplete="off"
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          密码
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button
          class="btn-primary"
          disabled={!isTauriRuntime() || jellyfinConnecting.value || !serverUrl.trim() || !username.trim() || !password}
          onClick={() => void connect()}
        >
          {jellyfinConnecting.value ? "连接中…" : jellyfinConnection.value.connected ? "重新连接" : "连接曲库"}
        </button>
        {jellyfinConnection.value.connected && (
          <button class="btn-secondary" disabled={jellyfinConnecting.value} onClick={() => void disconnect()}>
            断开
          </button>
        )}
        {jellyfinError.value && <span class="dj-config-error" role="alert">{jellyfinError.value}</span>}
      </div>
      <p class="view-hint">
        密码与服务器令牌只保存在桌面应用本次运行的内存中；退出后需重新连接。公网服务器必须使用 HTTPS，HTTP 仅允许本机或局域网地址。断开会移除队列里的 Jellyfin 曲目。
      </p>
      {!isTauriRuntime() && <p class="view-hint">Jellyfin 连接与播放仅在 Ome Music 桌面应用中可用。</p>}
    </div>
  );
}

function EmbySettingsBody() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void refreshEmbyStatus();
  }, []);

  const connect = async () => {
    const connected = await connectEmby({
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
    });
    if (connected) setPassword("");
  };

  const disconnect = async () => {
    const remoteTrackIds = queue.value
      .filter((track) => track.source === "emby")
      .map((track) => track.id);
    if (await disconnectEmby()) removeTracksFromQueue(remoteTrackIds);
  };

  return (
    <div class="remote-library-settings">
      <Row
        title="Emby 曲库"
        hint="连接你自己的 Emby 服务器，按需搜索并播放曲目。曲目只读，不会加入本地电台画像。"
      >
        <span class={`local-directory-status ${embyConnection.value.connected ? "is-available" : "is-missing"}`} role="status" aria-live="polite">
          <span class="local-directory-status-dot" aria-hidden="true" />
          {embyConnection.value.connected
            ? `已连接 · ${embyConnection.value.serverLabel ?? "Emby 曲库"}`
            : "尚未连接"}
        </span>
      </Row>
      <div class="dj-config-grid">
        <label class="dj-field">
          服务器地址
          <input
            type="url"
            value={serverUrl}
            placeholder="https://media.example.com"
            autoComplete="off"
            onInput={(event) => setServerUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          用户名
          <input
            value={username}
            autoComplete="off"
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          密码
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button
          class="btn-primary"
          disabled={!isTauriRuntime() || embyConnecting.value || !serverUrl.trim() || !username.trim() || !password}
          onClick={() => void connect()}
        >
          {embyConnecting.value ? "连接中…" : embyConnection.value.connected ? "重新连接" : "连接曲库"}
        </button>
        {embyConnection.value.connected && (
          <button class="btn-secondary" disabled={embyConnecting.value} onClick={() => void disconnect()}>
            断开
          </button>
        )}
        {embyError.value && <span class="dj-config-error" role="alert">{embyError.value}</span>}
      </div>
      <p class="view-hint">
        密码与服务器令牌只保存在桌面应用本次运行的内存中；退出后需重新连接。公网服务器必须使用 HTTPS，HTTP 仅允许本机或局域网地址。断开会移除队列里的 Emby 曲目。
      </p>
      {!isTauriRuntime() && <p class="view-hint">Emby 连接与播放仅在 Ome Music 桌面应用中可用。</p>}
    </div>
  );
}

function WebDavSettingsBody() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void refreshWebDavStatus();
  }, []);

  const connect = async () => {
    const connected = await connectWebDav({
      serverUrl: serverUrl.trim(),
      username: username.trim() || undefined,
      password: password || undefined,
    });
    if (connected) {
      setPassword("");
      const previousTracks = queue.value
        .filter((track) => track.source === "webdav")
        .map((track) => track.id);
      removeTracksFromQueue(previousTracks);
    }
  };

  const disconnect = async () => {
    const remoteTrackIds = queue.value
      .filter((track) => track.source === "webdav")
      .map((track) => track.id);
    if (await disconnectWebDav()) removeTracksFromQueue(remoteTrackIds);
  };

  const incompleteCredentials = Boolean(username.trim()) !== Boolean(password);

  return (
    <div class="remote-library-settings">
      <Row
        title="WebDAV 只读曲库"
        hint="按需浏览你自己的 WebDAV 音乐目录，在搜索页筛选并播放；不会导入曲库或加入私人电台画像。"
      >
        <span class={`local-directory-status ${webdavConnection.value.connected ? "is-available" : "is-missing"}`} role="status" aria-live="polite">
          <span class="local-directory-status-dot" aria-hidden="true" />
          {webdavConnection.value.connected
            ? `已连接 · ${webdavConnection.value.serverLabel ?? "WebDAV 曲库"}`
            : "尚未连接"}
        </span>
      </Row>
      <div class="dj-config-grid">
        <label class="dj-field">
          WebDAV 根地址
          <input
            type="url"
            value={serverUrl}
            placeholder="https://dav.example.com/music/"
            autoComplete="off"
            onInput={(event) => setServerUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          用户名（可留空）
          <input
            value={username}
            autoComplete="off"
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          密码（可留空）
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button
          class="btn-primary"
          disabled={!isTauriRuntime() || webdavConnecting.value || !serverUrl.trim() || incompleteCredentials}
          onClick={() => void connect()}
        >
          {webdavConnecting.value ? "连接中…" : webdavConnection.value.connected ? "重新连接" : "连接曲库"}
        </button>
        {webdavConnection.value.connected && (
          <button class="btn-secondary" disabled={webdavConnecting.value} onClick={() => void disconnect()}>
            断开
          </button>
        )}
        {webdavError.value && <span class="dj-config-error" role="alert">{webdavError.value}</span>}
      </div>
      <p class="view-hint">
        仅发送只读 PROPFIND 与音频 Range 请求；每次只读取当前目录，最多显示 500 项。账号仅保存在桌面应用本次运行的内存中，断开或退出后清除。公网服务器须使用 HTTPS；HTTP 仅允许本机或局域网地址。
      </p>
      {!isTauriRuntime() && <p class="view-hint">WebDAV 连接与播放仅在 Ome Music 桌面应用中可用。</p>}
    </div>
  );
}

function SmbSettingsBody() {
  const [host, setHost] = useState("");
  const [share, setShare] = useState("");
  const [subPath, setSubPath] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void refreshSmbStatus();
  }, []);

  const connect = async () => {
    const connected = await connectSmb({
      host,
      share,
      subPath: subPath || undefined,
      username,
      password,
    });
    if (connected) {
      setPassword("");
      const previousTracks = queue.value
        .filter((track) => track.source === "smb")
        .map((track) => track.id);
      removeTracksFromQueue(previousTracks);
    }
  };

  const disconnect = async () => {
    const remoteTrackIds = queue.value
      .filter((track) => track.source === "smb")
      .map((track) => track.id);
    if (await disconnectSmb()) removeTracksFromQueue(remoteTrackIds);
  };

  const complete = Boolean(host.trim() && share.trim() && username.trim() && password);

  return (
    <div class="remote-library-settings">
      <Row
        title="SMB 只读曲库"
        hint="按需浏览你自己的 SMB 音乐共享，在搜索页筛选并播放；不会导入曲库或加入私人电台画像。"
      >
        <span class={`local-directory-status ${smbConnection.value.connected ? "is-available" : "is-missing"}`} role="status" aria-live="polite">
          <span class="local-directory-status-dot" aria-hidden="true" />
          {smbConnection.value.connected
            ? `已连接 · ${smbConnection.value.serverLabel ?? "SMB 曲库"}`
            : "尚未连接"}
        </span>
      </Row>
      <div class="dj-config-grid">
        <label class="dj-field">
          主机名或 IPv4 地址
          <input
            value={host}
            placeholder="192.168.1.10 或 nas.local"
            autoComplete="off"
            spellcheck={false}
            onInput={(event) => setHost((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          共享名
          <input
            value={share}
            placeholder="Music"
            autoComplete="off"
            onInput={(event) => setShare((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          子目录（可选）
          <input
            value={subPath}
            placeholder="Library/Classical"
            autoComplete="off"
            onInput={(event) => setSubPath((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          用户名（可写 DOMAIN\\用户名）
          <input
            value={username}
            autoComplete="off"
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          密码
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button
          class="btn-primary"
          disabled={!isTauriRuntime() || smbConnecting.value || !complete}
          onClick={() => void connect()}
        >
          {smbConnecting.value ? "连接中…" : smbConnection.value.connected ? "重新连接" : "连接曲库"}
        </button>
        {smbConnection.value.connected && (
          <button class="btn-secondary" disabled={smbConnecting.value} onClick={() => void disconnect()}>
            断开
          </button>
        )}
        {smbError.value && <span class="dj-config-error" role="alert">{smbError.value}</span>}
      </div>
      <p class="view-hint">
        仅连接填写的单个 SMB2/3 主机与共享，使用 TCP 445；只列目录并按需读取音频，不会写入服务器。账号只保存在桌面应用本次运行的内存中，断开或退出后清除。每个目录最多显示 500 项，每次音频读取最多 4 MiB。
      </p>
      {!isTauriRuntime() && <p class="view-hint">SMB 连接与播放仅在 Ome Music 桌面应用中可用。</p>}
    </div>
  );
}

function formatDiagnosticBytes(bytes: number | null): string {
  if (bytes === null) return "无法读取";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function LibraryDiagnosticsReport() {
  const report = libraryDiagnostics.value;
  if (!report) return null;
  const integrityOk = report.integrityCheck === "ok";

  return (
    <div class="library-diagnostics-report" aria-live="polite">
      <div class="library-diagnostics-result-heading">
        <span class={`local-directory-status ${integrityOk ? "is-available" : "is-missing"}`}>
          <span class="local-directory-status-dot" aria-hidden="true" />
          {integrityOk ? "SQLite 完整性正常" : "SQLite 检查发现异常"}
        </span>
        <span class="library-diagnostics-checked-at">检查于 {report.checkedAt}</span>
      </div>
      {!integrityOk && (
        <p class="local-directory-message is-error">{report.integrityCheck}</p>
      )}

      <dl class="library-diagnostics-counts">
        <div><dt>曲库索引</dt><dd>{report.totalIndexedTrackCount} 首</dd></div>
        <div><dt>本地 / 其他音源</dt><dd>{report.localTrackCount} / {report.otherSourceTrackCount} 首</dd></div>
        <div><dt>待补建快速摘要</dt><dd>{report.quickIdentityPendingTrackCount} 首</dd></div>
        <div><dt>可访问的本地文件</dt><dd>{report.accessibleTrackCount} 首</dd></div>
        <div><dt>文件缺失或不可访问</dt><dd>{report.unavailableTrackCount} 首</dd></div>
        <div><dt>所在目录离线</dt><dd>{report.offlineDirectoryTrackCount} 首</dd></div>
        <div><dt>不在登记目录内</dt><dd>{report.outsideDirectoryTrackCount} 首</dd></div>
        <div><dt>规则排除</dt><dd>{report.excludedTrackCount} 首</dd></div>
        <div><dt>艺人 / 专辑</dt><dd>{report.artistCount} / {report.albumCount}</dd></div>
        <div><dt>歌单 / 播放记录</dt><dd>{report.playlistCount} / {report.playbackEventCount}</dd></div>
      </dl>

      {(report.unavailableTrackCount > 0
        || unavailableLocalTracksNotice.value
        || unavailableLocalTracksLoading.value
        || unavailableLocalTracksError.value)
        && <UnavailableLocalTrackRecovery />}

      <QuickIdentityBackfill />

      <div class="library-diagnostics-section">
        <span class="library-diagnostics-section-title">已登记目录</span>
        {report.directories.length === 0 ? (
          <span class="local-directory-message">暂无登记目录</span>
        ) : report.directories.map((directory) => (
          <div class="library-diagnostics-directory" key={directory.path}>
            <span class="library-diagnostics-path" title={directory.path}>{directory.path}</span>
            <span class={`local-directory-status ${directory.available ? "is-available" : "is-missing"}`}>
              {directory.available ? "可用" : "离线"} · {directory.indexedTrackCount} 首
            </span>
          </div>
        ))}
      </div>

      <details class="library-diagnostics-storage">
        <summary>数据库与封面缓存</summary>
        <div class="library-diagnostics-storage-row">
          <span>数据库及 WAL · {formatDiagnosticBytes(report.databaseSizeBytes)}</span>
          <code title={report.databasePath}>{report.databasePath}</code>
        </div>
        <div class="library-diagnostics-storage-row">
          <span>封面缓存 · {report.coversAvailable ? `${report.coversFileCount} 个文件 · ${formatDiagnosticBytes(report.coversSizeBytes)}` : "目录不存在"}</span>
          <code title={report.coversPath}>{report.coversPath}</code>
        </div>
      </details>

      <div class="library-diagnostics-last-scan">
        <span class="library-diagnostics-section-title">最近完成的扫描</span>
        {report.lastScan ? (
          <span>
            {report.lastScan.completedAt} · 新增 {report.lastScan.added} · 更新 {report.lastScan.updated}
            · 索引 {report.lastScan.total} · 跳过 {report.lastScan.skipped} · 错误 {report.lastScan.scanErrors}
          </span>
        ) : (
          <span>尚无扫描摘要</span>
        )}
      </div>
      <p class="local-directory-message">文件状态仅检查文件系统元数据；没有读取音频内容，也没有扫描或修改曲库。</p>
    </div>
  );
}

function QuickIdentityBackfill() {
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [result, setResult] = useState<QuickIdentityBackfillResult | null>(null);
  const [error, setError] = useState("");
  const report = libraryDiagnostics.value;
  const isDemo = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "settings-diagnostics";

  if (!report || (report.quickIdentityPendingTrackCount <= 0 && !result)) return null;

  const runBatch = async () => {
    setRunning(true);
    setError("");
    try {
      const batch = await backfillLibraryQuickIdentity(cursor);
      setResult(batch);
      setCursor(batch.nextCursor);
      if (!batch.nextCursor && !isDemo) await refreshLibraryDiagnostics();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div class="library-diagnostics-section library-quick-identity">
      <div class="library-quick-identity-heading">
        <span class="library-diagnostics-section-title">旧曲目快速摘要</span>
        <span>{report.quickIdentityPendingTrackCount > 0
          ? `${report.quickIdentityPendingTrackCount} 首本地曲目缺少当前版本的摘要`
          : "当前没有待补建曲目"}</span>
      </div>
      {report.quickIdentityPendingTrackCount > 0 && (
        <>
          <p class="library-quick-identity-note">
            只采样当前已授权、仍可读取音频的开头与结尾；每批最多 100 首。摘要只用于缩小移动候选范围，不会调整路径或授权。
          </p>
          <div class="library-quick-identity-actions">
            <button
              class="btn-secondary"
              disabled={running || (!isTauriRuntime() && !isDemo)}
              onClick={() => void runBatch()}
            >
              {running ? "正在生成摘要…" : cursor ? "继续下一批" : result ? "重新检查未补建曲目" : "补建快速摘要"}
            </button>
            {isDemo && <span>演示操作不会访问实际音频或数据库。</span>}
          </div>
        </>
      )}
      {result && (
        <p class="library-quick-identity-result" role="status" aria-live="polite">
          本批检查 {result.examinedCount} 首，补建 {result.updatedCount} 首，跳过 {result.skippedCount} 首。
          {result.remainingCount > 0
            ? `还有 ${result.remainingCount} 条待检查记录。`
            : "本轮检查完成；未能读取的曲目保持未修改。"}
        </p>
      )}
      {error && <p class="local-directory-message is-error" role="alert">{error}</p>}
    </div>
  );
}

function UnavailableLocalTrackRecovery() {
  const [opened, setOpened] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [batchRepairing, setBatchRepairing] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [moveCandidatesChecked, setMoveCandidatesChecked] = useState(false);
  const selectedCount = unavailableLocalTracks.value
    .filter((track) => selectedTrackIds.includes(track.id)).length;
  const isDemo = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "settings-diagnostics";

  const load = async () => {
    setOpened(true);
    setSelectedTrackIds([]);
    setActionMessage("");
    setMoveCandidatesChecked(false);
    await loadUnavailableLocalTracks();
  };

  const checkMoveCandidates = async () => {
    setActionMessage("");
    setMoveCandidatesChecked(false);
    const count = await loadLibraryMoveCandidates();
    setMoveCandidatesChecked(true);
    if (!libraryMoveCandidatesError.value) {
      setActionMessage(count > 0
        ? `找到 ${count} 个可能位置；候选只供检查，曲库没有改变。`
        : "没有找到可按已保存快速摘要确认的候选；你仍可逐首选择文件。曲目未保存摘要时不会按同名歌曲猜测。替换旧位置前重扫过的曲目才可参与此检查。");
    }
  };

  const toggleAllSelected = () => {
    const tracks = unavailableLocalTracks.value;
    const allSelected = tracks.length > 0 && tracks.every((track) => selectedTrackIds.includes(track.id));
    setSelectedTrackIds(allSelected ? [] : tracks.map((track) => track.id));
  };

  const toggleTrackSelected = (trackId: string) => {
    setSelectedTrackIds((current) => current.includes(trackId)
      ? current.filter((id) => id !== trackId)
      : [...current, trackId]);
  };

  const repair = async (trackId: string, title: string) => {
    setRepairingId(trackId);
    setActionMessage("");
    try {
      const repaired = await repairUnavailableLocalTrack(trackId, title);
      if (repaired) setSelectedTrackIds((current) => current.filter((id) => id !== trackId));
      setActionMessage(repaired
        ? ""
        : "已取消选择，曲库没有改变。");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRepairingId(null);
    }
  };

  const repairSelected = async () => {
    const pendingTracks = unavailableLocalTracks.value
      .filter((track) => selectedTrackIds.includes(track.id));
    if (pendingTracks.length === 0) return;

    setBatchRepairing(true);
    setActionMessage("");
    let repairedCount = 0;
    let stoppedMessage = "";

    try {
      for (let index = 0; index < pendingTracks.length; index += 1) {
        const track = pendingTracks[index];
        setRepairingId(track.id);
        setBatchProgress(`正在处理 ${index + 1}/${pendingTracks.length}：${track.title}`);
        try {
          const repaired = await repairUnavailableLocalTrack(track.id, track.title);
          if (!repaired) {
            stoppedMessage = `已完成 ${repairedCount}/${pendingTracks.length} 首；已取消下一首文件选择，剩余曲目仍保留选中。`;
            break;
          }
          repairedCount += 1;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          stoppedMessage = `已完成 ${repairedCount}/${pendingTracks.length} 首；「${track.title}」修复失败：${detail}`;
          break;
        }
      }
    } finally {
      setRepairingId(null);
      setBatchRepairing(false);
      setBatchProgress("");
    }

    const remainingIds = pendingTracks
      .map((track) => track.id)
      .filter((trackId) => unavailableLocalTracks.value.some((track) => track.id === trackId));
    setSelectedTrackIds(remainingIds);
    setActionMessage(stoppedMessage || `批量修复完成：已重新关联 ${repairedCount} 首；歌单与播放历史保持不变。`);
  };

  const candidatesForTrack = (trackId: string) => libraryMoveCandidates.value
    .filter((candidate) => candidate.missingTrackId === trackId);

  return (
    <section class="library-recovery" aria-label="失联曲目修复">
      <div class="local-directory-heading">
        <div class="local-directory-heading-copy">
          <span class="local-directory-title">失联曲目</span>
          <span class="local-directory-hint">可逐首或多选处理；每首都由你选择新文件。只更新曲库路径并授权该文件，不扩展目录扫描范围。</span>
        </div>
        <button
          class="btn-secondary local-directory-add"
          disabled={unavailableLocalTracksLoading.value || repairingId !== null || batchRepairing || (!isTauriRuntime() && !isDemo)}
          onClick={() => void load()}
        >
          {unavailableLocalTracksLoading.value ? "正在读取…" : opened ? "刷新列表" : `查看 ${libraryDiagnostics.value?.unavailableTrackCount ?? 0} 首`}
        </button>
      </div>
      {unavailableLocalTracksError.value && (
        <p class="local-directory-message is-error" role="alert">{unavailableLocalTracksError.value}</p>
      )}
      {opened && unavailableLocalTracksLoading.value && (
        <p class="local-directory-message" role="status">正在检查已登记目录中的音频文件…</p>
      )}
      {opened && !unavailableLocalTracksLoading.value && unavailableLocalTracks.value.length === 0
        && !unavailableLocalTracksNotice.value && (
        <p class="local-directory-message" role="status">没有可修复的失联曲目；文件状态可能已变化，请重新检查曲库。</p>
      )}
      {opened && unavailableLocalTracks.value.length > 0 && (
        <>
          <div class="library-recovery-selection">
            <span class="library-recovery-selection-count" aria-live="polite">已选 {selectedCount} 首</span>
            <div class="library-recovery-selection-actions">
              <button
                class="btn-secondary"
                disabled={libraryMoveCandidatesLoading.value || batchRepairing || repairingId !== null || (!isTauriRuntime() && !isDemo)}
                onClick={() => void checkMoveCandidates()}
              >
                {libraryMoveCandidatesLoading.value ? "正在检查…" : "检查文件移动候选"}
              </button>
              <button
                class="library-recovery-select-all"
                disabled={batchRepairing || repairingId !== null}
                aria-pressed={unavailableLocalTracks.value.length > 0 && selectedCount === unavailableLocalTracks.value.length}
                onClick={toggleAllSelected}
              >
                {selectedCount === unavailableLocalTracks.value.length ? "清空选择" : "全选"}
              </button>
              <button
                class="btn-secondary"
                disabled={selectedCount === 0 || batchRepairing || repairingId !== null || (!isTauriRuntime() && !isDemo)}
                onClick={() => void repairSelected()}
              >
                {batchRepairing ? "正在批量修复…" : `批量重新关联${selectedCount > 0 ? ` · ${selectedCount}` : ""}`}
              </button>
            </div>
          </div>
          <p class="library-move-candidates-note">
            当前候选仅由首尾片段快速摘要筛出，属于低置信线索，不是可信文件身份。最多显示 100 条，不上传内容、不改路径，仍需人工核对。
          </p>
          {libraryMoveCandidatesError.value && (
            <p class="local-directory-message is-error" role="alert">{libraryMoveCandidatesError.value}</p>
          )}
          {moveCandidatesChecked && libraryMoveCandidates.value.length === 0 && !libraryMoveCandidatesError.value && (
            <p class="local-directory-message" role="status">没有可通过已保存快速摘要确认的候选。没有摘要的旧曲目不会按相似曲名推测；仍可逐首选择文件。</p>
          )}
          <div class="library-recovery-list" role="list" aria-label="可重新关联的本地曲目">
            {unavailableLocalTracks.value.map((track) => (
              <article class="library-recovery-item" role="listitem" key={track.id}>
                <input
                  class="library-recovery-checkbox"
                  type="checkbox"
                  checked={selectedTrackIds.includes(track.id)}
                  disabled={repairingId !== null || batchRepairing}
                  aria-label={`选择「${track.title}」`}
                  onChange={() => toggleTrackSelected(track.id)}
                />
                <div class="library-recovery-info">
                  <div class="library-recovery-track">
                    <span class="library-recovery-title">{track.title}</span>
                    <span>{track.artist}</span>
                    {track.album && <span>· {track.album}</span>}
                  </div>
                  <code class="library-recovery-path" title={track.filePath}>{track.filePath}</code>
                  {candidatesForTrack(track.id).length > 0 && (
                    <div class="library-move-candidates" aria-label={`${track.title} 的文件移动候选`}>
                      {candidatesForTrack(track.id).map((candidate) => (
                        <div class="library-move-candidate" key={candidate.candidateTrackId}>
                          <div class="library-move-candidate-heading">
                            <strong>可能位置：{candidate.title}</strong>
                            <span class={candidate.ambiguous ? "is-ambiguous" : "is-low-confidence"}>
                              {candidate.ambiguous
                                ? `多重匹配 · ${candidate.confidence === "low" ? "低置信" : "需人工判断"}`
                                : candidate.confidence === "low" ? "低置信线索" : "可信身份匹配"}
                            </span>
                          </div>
                          <code title={candidate.candidatePath}>{candidate.candidatePath}</code>
                          <span class="library-move-candidate-reasons">{candidate.reasons.join(" · ")}</span>
                          <small>请核对版本与实际音频；本次检查仅提供位置线索，没有关联或合并曲目。</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  class="btn-secondary"
                  disabled={repairingId !== null || batchRepairing || (!isTauriRuntime() && !isDemo)}
                  aria-label={`${track.title}：选择新的本地音频文件`}
                  onClick={() => void repair(track.id, track.title)}
                >
                  {repairingId === track.id ? "等待选择…" : "选择新文件"}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {batchProgress && <p class="local-directory-message" role="status">{batchProgress}</p>}
      {(unavailableLocalTracksNotice.value || actionMessage) && (
        <p class="local-directory-message" role="status" aria-live="polite">
          {actionMessage || unavailableLocalTracksNotice.value}
        </p>
      )}
    </section>
  );
}

function LocalDirectoryManager() {
  const [confirmingRevoke, setConfirmingRevoke] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    void refreshAuthorizedMusicDirectories();
  }, []);

  const revoke = async (directoryId: number) => {
    if (confirmingRevoke !== directoryId) {
      setConfirmingRevoke(directoryId);
      setActionMessage("");
      return;
    }
    try {
      await revokeAuthorizedMusicDirectory(directoryId);
      setConfirmingRevoke(null);
      setActionMessage("目录已从扫描范围移除；曲目资料与歌单关联已保留。");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const addOrRestore = async () => {
    setActionMessage("");
    await importFolder();
  };

  return (
    <section class="local-directory-manager" aria-label="本地音乐目录">
      <div class="local-directory-heading">
        <div class="local-directory-heading-copy">
          <span class="local-directory-title">本地音乐目录</span>
          <span class="local-directory-hint">用于新增与更新曲库；移除目录登记后，曲目资料、歌单关联和音频文件都会保留。</span>
        </div>
        <button
          class="btn-secondary local-directory-add"
          disabled={!isTauriRuntime() || importing.value}
          onClick={() => void addOrRestore()}
        >
          {importing.value ? "处理中…" : "添加 / 重新选择"}
        </button>
      </div>

      <Row
        title="启动时自动更新曲库"
        hint="默认关闭。开启后，本次启动首次空闲时只扫描已授权目录；不联网，也不改写音频文件。"
      >
        <Switch
          checked={startupLibraryRescanEnabled.value}
          onChange={setStartupLibraryRescanEnabled}
          label="启动时自动更新曲库"
          disabled={!isTauriRuntime()}
        />
      </Row>
      {isTauriRuntime()
        && (startupLibraryRescanEnabled.value || startupLibraryRescanRunning.value)
        && startupLibraryRescanStatus.value && (
        <p class="local-directory-message" role="status" aria-live="polite">
          {startupLibraryRescanStatus.value}
        </p>
      )}

      {!isTauriRuntime() && (
        <p class="local-directory-message" role="status">请在桌面版中管理已授权目录。</p>
      )}
      {authorizedMusicDirectoriesLoading.value && (
        <p class="local-directory-message" role="status">正在读取目录…</p>
      )}
      {authorizedMusicDirectoriesError.value && (
        <p class="local-directory-message is-error" role="alert">{authorizedMusicDirectoriesError.value}</p>
      )}
      {!authorizedMusicDirectoriesLoading.value
        && !authorizedMusicDirectoriesError.value
        && isTauriRuntime()
        && authorizedMusicDirectories.value.length === 0 && (
          <p class="local-directory-empty">还没有登记的音乐目录。添加一个文件夹后，Ome 会为你建立本地曲库。</p>
        )}

      {authorizedMusicDirectories.value.length > 0 && (
        <div class="local-directory-list" aria-label="已授权的音乐目录">
          {authorizedMusicDirectories.value.map((directory) => (
            <article class="local-directory-item" key={directory.id}>
              <div class="local-directory-info">
                <span class="local-directory-path" title={directory.path}>{directory.path}</span>
                <span class={`local-directory-status ${directory.available ? "is-available" : "is-missing"}`}>
                  <span class="local-directory-status-dot" aria-hidden="true" />
                  {directory.available ? "目录存在" : "目录不存在或暂不可用"}
                  <span class="local-directory-track-count">{directory.trackCount} 首已索引</span>
                </span>
                {!directory.available && (
                  <span class="local-directory-recovery-hint">路径已变更时，请先添加新位置，再将旧登记移出扫描范围。</span>
                )}
              </div>
              <div class="local-directory-actions">
                {confirmingRevoke === directory.id ? (
                  <>
                    <span class="local-directory-confirm-hint">只移出扫描范围</span>
                    <button
                      class="btn-secondary is-danger"
                      disabled={importing.value}
                      onClick={() => void revoke(directory.id)}
                    >
                      确认移出
                    </button>
                    <button class="btn-secondary" onClick={() => setConfirmingRevoke(null)}>取消</button>
                  </>
                ) : (
                  <>
                    {!directory.available && (
                      <button
                        class="btn-secondary"
                        disabled={!isTauriRuntime() || importing.value}
                        onClick={() => void addOrRestore()}
                      >
                        重新选择目录
                      </button>
                    )}
                    <button
                      class="btn-secondary"
                      disabled={!directory.available || importing.value || !isTauriRuntime()}
                      onClick={() => void rescanAuthorizedMusicDirectory(directory.id)}
                    >
                      重扫
                    </button>
                    <button
                      class="btn-secondary"
                      disabled={importing.value || !isTauriRuntime()}
                      onClick={() => void revoke(directory.id)}
                    >
                      移出扫描…
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div class="library-diagnostics">
        <div class="local-directory-heading">
          <div class="local-directory-heading-copy">
            <span class="local-directory-title">曲库健康检查</span>
            <span class="local-directory-hint">只读检查索引、已登记目录和缓存；不会读取音频或执行扫描。</span>
          </div>
          <button
            class="btn-secondary local-directory-add"
            disabled={!isTauriRuntime() || libraryDiagnosticsLoading.value || importing.value}
            onClick={() => void refreshLibraryDiagnostics()}
          >
            {libraryDiagnosticsLoading.value ? "检查中…" : !isTauriRuntime() && libraryDiagnostics.value ? "演示报告" : "检查曲库"}
          </button>
        </div>
        {!isTauriRuntime() && !libraryDiagnostics.value && (
          <p class="local-directory-message" role="status">曲库检查需要在桌面版中运行。</p>
        )}
        {libraryDiagnosticsError.value && (
          <p class="local-directory-message is-error" role="alert">{libraryDiagnosticsError.value}</p>
        )}
        {libraryDiagnosticsLoading.value && (
          <p class="local-directory-message" role="status">正在读取索引与文件元数据…</p>
        )}
        <LibraryDiagnosticsReport />
      </div>

      {(actionMessage || importNotice.value) && (
        <p class="local-directory-message" role="status" aria-live="polite">
          {actionMessage || importNotice.value}
        </p>
      )}
    </section>
  );
}

/** 播放行为：电台接播 + 切歌淡变（从声音区与 DJ 表单收拢而来） */
function PlaybackBody() {
  return (
    <>
      <Row
        title="自动电台"
        hint="开启后 DJ 按口味自动挑下一首并附歌前介绍；关闭则按队列顺序播完即停"
      >
        <Switch checked={radioEnabled.value} onChange={(next) => setRadioEnabled(next)} label="自动电台" />
      </Row>
      <Row title="切歌自动淡变" hint="旧曲 1.2 秒淡出、新曲从淡入开始，避免生硬打断">
        <Switch checked={fadeEnabled.value} onChange={(next) => setFadeEnabled(next)} label="切歌自动淡变" />
      </Row>
    </>
  );
}

function CustomThemeEditor() {
  return (
    <div class="custom-theme-editor">
      <div class="custom-theme-heading">
        <span class="custom-theme-title">自由调色</span>
        <span class="custom-theme-hint">四种颜色随意组合，修改后立即生效并保存在本机</span>
      </div>
      <div class="custom-theme-grid">
        {CUSTOM_COLOR_FIELDS.map(({ key, label }) => (
          <label class="custom-theme-color" key={key}>
            <span class="custom-theme-color-label">{label}</span>
            <span class="custom-theme-color-input">
              <input
                aria-label={`${label}颜色`}
                type="color"
                value={customTheme.value[key]}
                onInput={(event) => {
                  const value = (event.currentTarget as HTMLInputElement).value;
                  setCustomThemeColor(key, value);
                  if (key === "accent") setAccentMode("fixed");
                }}
              />
              <code>{customTheme.value[key].toUpperCase()}</code>
            </span>
          </label>
        ))}
      </div>
      <button class="btn-secondary custom-theme-reset" onClick={() => resetCustomTheme()}>
        恢复自由配色初始值
      </button>
    </div>
  );
}

function ThemeTransfer() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  const exportTheme = () => {
    const serialized = serializeThemeTransfer({
      themeChoice: themeChoice.value,
      customColors: customTheme.value,
      accentMode: accentMode.value,
    });
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ome-theme.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("已导出当前主题");
  };

  const importTheme = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_THEME_TRANSFER_BYTES) {
      setMessage("主题文件过大，无法导入");
      return;
    }
    try {
      const payload = parseThemeTransfer(await file.text());
      setCustomTheme(payload.customColors);
      setAccentMode(payload.accentMode);
      setThemeChoice(payload.themeChoice);
      const label = CHOICES.find((choice) => choice.value === payload.themeChoice)?.label;
      setMessage(`已导入「${label ?? "主题"}」`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "主题文件读取失败");
    }
  };

  return (
    <>
      <Row title="主题文件" hint="导入或分享配色；文件只包含主题设置，不含账号与曲库信息">
        <div class="theme-transfer-actions">
          <button class="btn-secondary" onClick={exportTheme}>导出主题</button>
          <button class="btn-secondary" onClick={() => fileInput.current?.click()}>导入主题</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="选择主题 JSON 文件"
            hidden
            onChange={(event) => void importTheme(event)}
          />
        </div>
      </Row>
      {message && <p class="view-hint theme-transfer-status" role="status" aria-live="polite">{message}</p>}
    </>
  );
}

/** 外观：主题 / 强调色 / 弹幕氛围 */
function AppearanceBody() {
  return (
    <>
      <div class="theme-grid" role="radiogroup" aria-label="主题">
        {CHOICES.map((choice) => {
          let swatch = THEME_SWATCHES[choice.value];
          if (choice.value === "custom") {
            swatch = {
              bg: customTheme.value.bg,
              elev: customTheme.value.surface,
              accent: customTheme.value.accent,
            };
          } else if (choice.value === "system") {
            swatch = systemDark.value ? THEME_SWATCHES.dark : THEME_SWATCHES.light;
          }
          const active = themeChoice.value === choice.value;
          return (
            <button
              key={choice.value}
              role="radio"
              aria-checked={active}
              class={`theme-card ${active ? "is-active" : ""}`}
              onClick={() => setThemeChoice(choice.value)}
            >
              <span
                class="theme-swatch"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, ${swatch.bg} 0 42%, ${swatch.elev} 42% 72%, ${swatch.accent} 72% 100%)`,
                }}
              />
              <span class="theme-card-name">{choice.label}</span>
              <span class="theme-card-check" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
            </button>
          );
        })}
      </div>
      {themeChoice.value === "custom" && <CustomThemeEditor />}
      <p class="view-hint">主题即时生效；唱片取色开启时强调色跟随封面，手动调整强调色会自动切到固定色。</p>
      <Row title="强调色" hint="按钮、歌词辉光等强调色：跟随当前封面主色，或用主题固定色">
        <Segmented
          value={accentMode.value}
          onChange={(next) => setAccentMode(next)}
          label="强调色"
          options={[
            { value: "cover", label: "唱片取色" },
            { value: "fixed", label: "固定主题" },
          ]}
        />
      </Row>
      <ThemeTransfer />
      <Row title="弹幕氛围" hint="播放 B站视频时在首页漂浮同屏弹幕，纯氛围装饰">
        <Switch checked={danmakuEnabled.value} onChange={(next) => setDanmakuEnabled(next)} label="弹幕氛围" />
      </Row>
    </>
  );
}

/** 声音（DSP）：均衡器 + 输出设备（淡变在「播放」） */
function SoundBody() {
  useEffect(() => {
    void refreshOutputDevices();
  }, []);

  return (
    <>
      <section class="replay-gain-panel" aria-labelledby="replay-gain-title">
        <div class="replay-gain-heading">
          <div>
            <h3 id="replay-gain-title">曲目响度</h3>
            <p>读取本地音频已有的 ReplayGain 标签，减少不同曲目间的音量落差。</p>
          </div>
          <Switch
            checked={replayGainEnabled.value}
            onChange={setReplayGainEnabled}
            label="启用 ReplayGain 响度归一化"
          />
        </div>
        <div class="replay-gain-options">
          <Row title="响度参照" hint="专辑模式优先使用专辑增益，缺失时回退到曲目增益">
            <Segmented
              value={replayGainMode.value}
              options={[{ value: "track", label: "曲目" }, { value: "album", label: "专辑" }]}
              onChange={setReplayGainMode}
              label="ReplayGain 响度参照"
            />
          </Row>
          <Row title="峰值保护" hint="仅按标签记录的峰值限制增益；不会分析音频，也不能覆盖 EQ 引起的削波">
            <Switch
              checked={replayGainPreventClipping.value}
              onChange={setReplayGainPreventClipping}
              label="启用 ReplayGain 峰值保护"
            />
          </Row>
          <label class="replay-gain-preamp">
            <span>前级 <strong>{replayGainPreampDb.value.toFixed(1)} dB</strong></span>
            <input
              type="range"
              min={REPLAY_GAIN_PREAMP_MIN}
              max={REPLAY_GAIN_PREAMP_MAX}
              step={REPLAY_GAIN_PREAMP_STEP}
              value={replayGainPreampDb.value}
              disabled={!replayGainEnabled.value}
              aria-label="ReplayGain 前级"
              onInput={(event) => setReplayGainPreampDb(Number((event.target as HTMLInputElement).value))}
            />
          </label>
        </div>
        <p class="replay-gain-note">此功能默认关闭。缺少增益值时按 0 dB 计算，手动前级与可用的峰值标签仍会生效；网易云和 B 站曲目不受影响。</p>
      </section>
      <section class="channel-tools-panel" aria-labelledby="channel-tools-title">
        <div class="channel-tools-heading">
          <div>
            <h3 id="channel-tools-title">声道工具</h3>
            <p>独立调整左右声道，包含平衡、增益、延迟、单声道监听和频段修正。</p>
          </div>
          <Switch
            checked={channelToolsSettings.value.enabled}
            onChange={(enabled) => patchChannelToolsSettings({ enabled })}
            label="启用声道工具"
          />
        </div>
        <div class="channel-tools-controls">
          <label class="channel-tools-slider channel-tools-balance">
            <span>立体声平衡 <strong>{channelToolsSettings.value.balance === 0
              ? "居中"
              : `${channelToolsSettings.value.balance < 0 ? "左" : "右"} ${Math.round(Math.abs(channelToolsSettings.value.balance) * 100)}%`}</strong></span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={channelToolsSettings.value.balance}
              disabled={!channelToolsSettings.value.enabled}
              aria-label="立体声平衡"
              onInput={(event) => patchChannelToolsSettings({ balance: Number((event.target as HTMLInputElement).value), enabled: true })}
            />
            <span class="channel-tools-scale"><span>左</span><span>中</span><span>右</span></span>
          </label>
          <div class="channel-tools-gains">
            {([
              ["leftGainDb", "左声道增益", "左声道", "#9a80ff"],
              ["rightGainDb", "右声道增益", "右声道", "#42cbb7"],
            ] as const).map(([key, label, side, color]) => (
              <label class="channel-tools-slider" data-side={side} key={key}>
                <span><em>{side}</em> <strong>{channelToolsSettings.value[key].toFixed(1)} dB</strong></span>
                <input
                  type="range"
                  min={CHANNEL_GAIN_MIN_DB}
                  max={CHANNEL_GAIN_MAX_DB}
                  step={0.1}
                  value={channelToolsSettings.value[key]}
                  disabled={!channelToolsSettings.value.enabled}
                  aria-label={label}
                  style={{ accentColor: color }}
                  onInput={(event) => patchChannelToolsSettings({ [key]: Number((event.target as HTMLInputElement).value), enabled: true })}
                />
              </label>
            ))}
          </div>
          <ChannelToolsPresetManager />
          <details class="channel-tools-advanced">
            <summary>更多声道处理</summary>
            <div class="channel-tools-advanced-body">
              <Row title="监听路由" hint="立体声保留左右；单声道将两个声道等量混合，也可单独监听左或右声道">
                <Segmented
                  value={channelToolsSettings.value.monoMode}
                  options={[
                    { value: "off", label: "立体声" },
                    { value: "sum", label: "混合" },
                    { value: "left", label: "只听左" },
                    { value: "right", label: "只听右" },
                  ]}
                  onChange={(monoMode) => patchChannelToolsSettings({ monoMode, enabled: monoMode !== "off" || channelToolsSettings.value.enabled })}
                  label="监听路由"
                />
              </Row>
              <div class="channel-tools-delay-grid">
                {([
                  ["leftDelayMs", "左声道延迟"],
                  ["rightDelayMs", "右声道延迟"],
                ] as const).map(([key, label]) => (
                  <label class="channel-tools-slider" key={key}>
                    <span>{label} <strong>{channelToolsSettings.value[key].toFixed(1)} ms</strong></span>
                    <input
                      type="range"
                      min={CHANNEL_DELAY_MIN_MS}
                      max={CHANNEL_DELAY_MAX_MS}
                      step={0.1}
                      value={channelToolsSettings.value[key]}
                      disabled={!channelToolsSettings.value.enabled}
                      aria-label={label}
                      onInput={(event) => patchChannelToolsSettings({ [key]: Number((event.target as HTMLInputElement).value), enabled: true })}
                    />
                  </label>
                ))}
              </div>
              <div class="channel-tools-switches">
                <Row title="左右交换" hint="将左声道送到右侧、右声道送到左侧">
                  <Switch checked={channelToolsSettings.value.swapLeftRight} onChange={(swapLeftRight) => patchChannelToolsSettings({ swapLeftRight, enabled: true })} label="交换左右声道" />
                </Row>
                <Row title="相位反转" hint="分别反转对应声道的极性；用于排查接线或录音相位问题">
                  <div class="channel-tools-phase-switches">
                    <Switch checked={channelToolsSettings.value.invertLeft} onChange={(invertLeft) => patchChannelToolsSettings({ invertLeft, enabled: true })} label="反转左声道相位" />
                    <span>左</span>
                    <Switch checked={channelToolsSettings.value.invertRight} onChange={(invertRight) => patchChannelToolsSettings({ invertRight, enabled: true })} label="反转右声道相位" />
                    <span>右</span>
                  </div>
                </Row>
                <Row title="恒功率平衡" hint="中心位置保持单位增益，移动时平滑衰减另一侧">
                  <Switch checked={channelToolsSettings.value.constantPower} onChange={(constantPower) => patchChannelToolsSettings({ constantPower, enabled: true })} label="恒功率平衡" />
                </Row>
              </div>
              <div class="channel-tools-band-heading">
                <strong>左右分频段修正</strong>
                <span>低频 140 Hz · 中频 1.2 kHz · 高频 8 kHz</span>
              </div>
              <div class="channel-tools-bands">
                {CHANNEL_TOOL_BANDS.map((band) => {
                  const labels = { low: "低频", mid: "中频", high: "高频" };
                  const frequency = { low: "140 Hz", mid: "1.2 kHz", high: "8 kHz" };
                  const gains = channelToolsSettings.value.bandGains[band];
                  return (
                    <div class="channel-tools-band" key={band}>
                      <div class="channel-tools-band-title"><strong>{labels[band]}</strong><span>{frequency[band]}</span></div>
                      {([
                        ["leftGainDb", "左", "#9a80ff"],
                        ["rightGainDb", "右", "#42cbb7"],
                      ] as const).map(([key, side, color]) => (
                        <label class="channel-tools-slider" key={key}>
                          <span>{side} <strong>{gains[key].toFixed(1)} dB</strong></span>
                          <input
                            type="range"
                            min={CHANNEL_BAND_MIN_DB}
                            max={CHANNEL_BAND_MAX_DB}
                            step={0.1}
                            value={gains[key]}
                            disabled={!channelToolsSettings.value.enabled}
                            aria-label={`${labels[band]}${side}声道增益`}
                            style={{ accentColor: color }}
                            onInput={(event) => patchChannelToolsSettings({
                              bandGains: {
                                ...channelToolsSettings.value.bandGains,
                                [band]: { ...gains, [key]: Number((event.target as HTMLInputElement).value) },
                              },
                              enabled: true,
                            })}
                          />
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
          <div class="channel-tools-footer">
            <p>默认旁路；正增益可能提高削波风险，当前播放器没有真峰值限幅器。</p>
            <button class="btn-secondary" onClick={resetChannelToolsSettings}>重置声道</button>
          </div>
        </div>
      </section>
      <Row title="均衡器" hint="10 段参数均衡（31Hz – 16kHz，±12dB）；关闭时链路完全透明">
        <Switch checked={eqEnabled.value} onChange={(next) => setEqEnabled(next)} label="均衡器" />
      </Row>
      <div class="eq-presets">
        {EQ_PRESETS.map((preset) => (
          <button
            key={preset.id}
            class={`chip-toggle ${eqPreset.value === preset.id && eqEnabled.value ? "is-active" : ""}`}
            onClick={() => {
              setEqEnabled(true);
              applyEqPreset(preset.id);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <EqCurve />
      <div class="eq-bands" aria-label="均衡器频段">
        {EQ_BANDS.map((frequency, index) => {
          const gain = eqGains.value[index] ?? 0;
          return (
            <div class="eq-band" key={frequency}>
              <span class="eq-band-value">{gain === 0 ? "0" : gain.toFixed(1)}</span>
              <input
                type="range"
                min={EQ_MIN}
                max={EQ_MAX}
                step={0.5}
                value={gain}
                disabled={!eqEnabled.value}
                aria-label={`${bandLabel(frequency)} 赫兹`}
                onInput={(event) => setEqBand(index, Number((event.target as HTMLInputElement).value))}
              />
              <span class="eq-band-label">{bandLabel(frequency)}</span>
            </div>
          );
        })}
      </div>
      <section class="eq-headroom" aria-labelledby="eq-headroom-title">
        <div class="eq-headroom-copy">
          <div class="eq-headroom-heading">
            <h3 id="eq-headroom-title">前级余量</h3>
            <span class={`eq-headroom-estimate ${eqEnabled.value && estimateEqPeakWithPreampDb(eqGains.value, eqPreampDb.value, true) > 0 ? "is-hot" : ""}`}>
              估算峰值 {estimateEqPeakWithPreampDb(eqGains.value, eqPreampDb.value, eqEnabled.value).toFixed(1)} dB
            </span>
          </div>
          <p>按整条 EQ 频响曲线估算；不是实测削波或真峰值保证。</p>
        </div>
        <label class="eq-headroom-slider">
          <span>衰减 <strong>{eqPreampDb.value.toFixed(1)} dB</strong></span>
          <input
            type="range"
            min={EQ_PREAMP_MIN}
            max={EQ_PREAMP_MAX}
            step={EQ_PREAMP_STEP}
            value={eqPreampDb.value}
            disabled={!eqEnabled.value}
            aria-label="均衡器前级衰减"
            onInput={(event) => setEqPreampDb(Number((event.target as HTMLInputElement).value))}
          />
        </label>
        <button
          class="eq-headroom-recommend chip-toggle"
          disabled={!eqEnabled.value || eqPreampDb.value === recommendedEqPreampDb(eqGains.value)}
          onClick={() => setEqPreampDb(recommendedEqPreampDb(eqGains.value))}
        >
          按建议预留
        </button>
        {eqEnabled.value && estimateEqPeakWithPreampDb(eqGains.value, eqPreampDb.value, true) > 0 && (
          <p class="eq-headroom-warning" role="status">
            当前估算仍高于 0 dB，可增加衰减；建议值受 −12 dB 调节范围限制。
          </p>
        )}
      </section>
      <Row title="输出设备" hint="选择声音输出到哪台设备；设备拔出时自动回退到系统默认">
        <select
          class="eq-device-select"
          value={outputDeviceId.value}
          onChange={(event) => setOutputDevice((event.target as HTMLSelectElement).value)}
        >
          <option value="">系统默认</option>
          {outputDevices.value.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}

/** 歌词：桌面歌词开关与锁定（从外观区收拢而来） */
function LyricsBody() {
  useEffect(() => {
    void loadLyricsBackfillStatus();
  }, []);

  const backfillJob = lyricsBackfillJob.value;
  const backfillActive = backfillJob?.status === "running" || backfillJob?.status === "paused";
  const backfillCanResume = Boolean(backfillActive && !lyricsBackfillBusy.value && !isLyricsBackfillRunning());
  const backfillStatus = backfillJob?.status === "completed" ? "已完成"
    : backfillJob?.status === "cancelled" ? "已停止"
      : backfillJob?.status === "paused" ? "已暂停"
        : backfillJob?.status === "running" ? "正在回填"
          : "等待启动";

  return (
    <>
      <Row
        title="歌词副字幕"
        hint="双语模式会同时显示罗马音与翻译；纯文本歌词仅显示已有的逐行罗马音"
      >
        <Segmented
          value={lyricSubtitleMode.value}
          options={[
            { value: "translation", label: "翻译" },
            { value: "romanization", label: "罗马音" },
            { value: "combined", label: "双语" },
            { value: "none", label: "不显示" },
          ]}
          onChange={setLyricSubtitleMode}
          label="歌词副字幕显示"
        />
      </Row>
      <Row
        title="舞台歌词字号"
        hint="调整沉浸舞台中的主歌词与副字幕；舞台顶部也可随时微调"
      >
        <div class="stage-font-scale-control">
          <input
            type="range"
            min={STAGE_FONT_SCALE_MIN}
            max={STAGE_FONT_SCALE_MAX}
            step={STAGE_FONT_SCALE_STEP}
            value={stageFontScale.value}
            aria-label="舞台歌词字号"
            aria-valuetext={`${stageFontScale.value}%`}
            onInput={(event) => setStageFontScale(Number((event.target as HTMLInputElement).value))}
          />
          <output class="stage-font-scale-value">{stageFontScale.value}%</output>
        </div>
      </Row>
      <Row
        title="桌面歌词"
        hint="独立悬浮歌词条：常驻桌面最上层、可拖动、不抢焦点，重开应用自动恢复"
      >
        <Switch
          checked={deskLyricsOpen.value}
          onChange={(next) => (next ? void openDeskLyrics() : void closeDeskLyrics())}
          label="桌面歌词"
        />
      </Row>
      {deskLyricsOpen.value && (
        <Row
          title="锁定歌词条"
          hint="鼠标全穿透、不挡桌面操作；解锁只能回这里或用命令面板（Ctrl+K）"
        >
          <Switch
            checked={deskLyricsLocked.value}
            onChange={(next) => setDeskLyricsLocked(next)}
            label="锁定歌词条"
          />
        </Row>
      )}
      <Row
        title="缺失歌词回填"
        hint="只处理已授权且未排除的本地曲目；查询只发送曲名与艺人，符合阈值的歌词存入本机数据库，不改音频文件"
      >
        <div class="lyrics-backfill-panel">
          <label class="lyrics-backfill-threshold">
            <span>自动保存匹配阈值</span>
            <input
              type="range"
              min={82}
              max={95}
              step={1}
              value={backfillActive ? (backfillJob?.threshold ?? lyricsBackfillThreshold.value) : lyricsBackfillThreshold.value}
              disabled={backfillActive}
              aria-label="歌词自动保存匹配阈值"
              aria-valuetext={`${backfillActive ? (backfillJob?.threshold ?? lyricsBackfillThreshold.value) : lyricsBackfillThreshold.value}%`}
              onInput={(event) => setLyricsBackfillThreshold(Number((event.target as HTMLInputElement).value))}
            />
            <output>{backfillActive ? (backfillJob?.threshold ?? lyricsBackfillThreshold.value) : lyricsBackfillThreshold.value}%</output>
          </label>
          <div class="lyrics-backfill-actions">
            <button
              class="btn-secondary"
              disabled={!isTauriRuntime() || lyricsBackfillBusy.value || backfillActive}
              onClick={() => void startLyricsBackfillJob("quick")}
            >
              快速回填
            </button>
            <button
              class="btn-secondary"
              disabled={!isTauriRuntime() || lyricsBackfillBusy.value || backfillActive}
              onClick={() => void startLyricsBackfillJob("complete")}
            >
              全来源回填
            </button>
            {backfillCanResume && (
              <button class="btn-secondary" onClick={() => void resumeLyricsBackfillJob()}>
                继续上次进度
              </button>
            )}
            {backfillActive && (
              <button class="btn-secondary is-danger" onClick={() => void cancelLyricsBackfillJob()}>
                停止回填
              </button>
            )}
          </div>
          {!isTauriRuntime() && <p class="view-hint">歌词回填需要 Ome 桌面版的本地曲库。</p>}
          {backfillJob && (
            <div class="lyrics-backfill-progress" role="status" aria-live="polite">
              <div class="lyrics-backfill-progress-heading">
                <strong>{backfillStatus}{backfillJob.currentTrackTitle ? ` · ${backfillJob.currentTrackTitle}` : ""}</strong>
                <span>{backfillJob.processed} / {backfillJob.total}</span>
              </div>
              <div
                class="lyrics-backfill-progress-track"
                role="progressbar"
                aria-label="歌词回填进度"
                aria-valuemin={0}
                aria-valuemax={backfillJob.total || 1}
                aria-valuenow={backfillJob.processed}
              >
                <span style={{ width: `${backfillJob.total ? Math.min(100, backfillJob.processed / backfillJob.total * 100) : 100}%` }} />
              </div>
              <span class="lyrics-backfill-progress-summary">
                找到 {backfillJob.matched} 首 · 无匹配 {backfillJob.noMatch} 首 · 跳过 {backfillJob.skipped} 首
                {backfillJob.failed ? ` · 失败 ${backfillJob.failed} 首` : ""}
              </span>
              {backfillJob.note && <span class="lyrics-backfill-note">{backfillJob.note}</span>}
            </div>
          )}
          {lyricsBackfillError.value && <p class="lyrics-backfill-error" role="alert">{lyricsBackfillError.value}</p>}
          <p class="view-hint">快速模式查询网易云、LRCLIB 与 QQ 音乐；全来源模式再加入 AMLL、酷狗与酷我。阈值默认 88%，版本冲突与低匹配候选不会自动保存；每次最多处理 20,000 首。</p>
        </div>
      </Row>
      <p class="view-hint">
        悬浮在歌词条上可调字号、横竖排与锁定；单曲歌词偏移在电台页「±0.5s」微调，按曲目记忆。
      </p>
    </>
  );
}

/** 快捷键参考：与实际按键处理共用 SHORTCUTS 数据源 */
function ShortcutsBody() {
  return (
    <div class="shortcut-list">
      {SHORTCUTS.map((item) => (
        <div class="shortcut-row" key={item.label}>
          <span class="shortcut-keys">
            {item.keys.map((key) => (
              <kbd class="kbd" key={key}>
                {key}
              </kbd>
            ))}
          </span>
          <span class="shortcut-label">{item.label}</span>
        </div>
      ))}
      <p class="view-hint">在输入框打字或中文组字时快捷键自动失效，不会误触。</p>
    </div>
  );
}

/** 关于：版本 / 仓库 / 重置偏好（两步确认，只清 ome.* 本地偏好） */
function AboutBody({ version }: { version: string }) {
  const [confirming, setConfirming] = useState(false);

  const resetPrefs = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith("ome.")) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* 存储不可用忽略 */
    }
    window.location.reload();
  };

  return (
    <>
      <Row title="应用版本" hint="本地优先的私人音乐电台 · AI 时代的私人电台">
        <span class="about-version">v{version}</span>
      </Row>
      <Row title="开源仓库" hint="github.com/zerolyx/ome-music · MIT License · Preact + Tauri + SQLite" />
      <PreferencesTransfer version={version} />
      <Row
        title="重置应用偏好"
        hint="清空主题、均衡器、曲目响度归一化、歌词偏移等本地偏好；音乐库与 DJ 配置存于数据库，不受影响"
      >
        <button
          class={`btn-secondary ${confirming ? "is-danger" : ""}`}
          onClick={resetPrefs}
        >
          {confirming ? "再点一次确认重置" : "重置偏好…"}
        </button>
      </Row>
    </>
  );
}

function currentPreferences(): PreferencesTransferPayload {
  const knownPreset = EQ_PRESETS.some((item) => item.id === eqPreset.value)
    ? eqPreset.value as PreferencesTransferPayload["sound"]["eqPreset"]
    : "custom";
  return {
    theme: {
      choice: themeChoice.value,
      customColors: { ...customTheme.value },
      accentMode: accentMode.value,
    },
    playback: {
      radioEnabled: radioEnabled.value,
      fadeEnabled: fadeEnabled.value,
    },
    sound: {
      eqEnabled: eqEnabled.value,
      eqPreset: knownPreset,
      eqGains: [...eqGains.value],
      eqPreampDb: eqPreampDb.value,
      replayGainEnabled: replayGainEnabled.value,
      replayGainMode: replayGainMode.value,
      replayGainPreventClipping: replayGainPreventClipping.value,
        replayGainPreampDb: replayGainPreampDb.value,
        channelTools: structuredClone(channelToolsSettings.value),
        channelToolsPresets: structuredClone(channelToolsPresets.value),
        channelToolsComparison: structuredClone(channelToolsComparisonSlots.value),
    },
    visual: {
      danmakuEnabled: danmakuEnabled.value,
      visualizerMode: vizMode.value,
      visualizerPalette: vizPalette.value,
      stageEffect: stageEffect.value,
      stageFontScale: stageFontScale.value,
    },
    lyrics: {
      subtitleMode: lyricSubtitleMode.value,
      backfillThreshold: lyricsBackfillThreshold.value,
    },
  };
}

function applyPreferences(preferences: PreferencesTransferPayload): void {
  setCustomTheme(preferences.theme.customColors);
  setAccentMode(preferences.theme.accentMode);
  setThemeChoice(preferences.theme.choice);
  setRadioEnabled(preferences.playback.radioEnabled);
  setFadeEnabled(preferences.playback.fadeEnabled);
  restoreEqSettings({
    enabled: preferences.sound.eqEnabled,
    preset: preferences.sound.eqPreset,
    gains: preferences.sound.eqGains,
    preampDb: preferences.sound.eqPreampDb,
  });
  restoreReplayGainSettings({
    enabled: preferences.sound.replayGainEnabled,
    mode: preferences.sound.replayGainMode,
    preventClipping: preferences.sound.replayGainPreventClipping,
    preampDb: preferences.sound.replayGainPreampDb,
  });
  restoreChannelToolsSettings(preferences.sound.channelTools);
  restoreChannelToolsProfiles(preferences.sound.channelToolsPresets, preferences.sound.channelToolsComparison);
  setDanmakuEnabled(preferences.visual.danmakuEnabled);
  setVizMode(preferences.visual.visualizerMode);
  setVizPalette(preferences.visual.visualizerPalette);
  setStageEffect(preferences.visual.stageEffect);
  setStageFontScale(preferences.visual.stageFontScale);
  setLyricSubtitleMode(preferences.lyrics.subtitleMode);
  setLyricsBackfillThreshold(preferences.lyrics.backfillThreshold);
}

/** Export/import an explicit, non-sensitive allowlist of cross-device preferences. */
function PreferencesTransfer({ version }: { version: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const previewDemo = new URLSearchParams(window.location.search).get("demo") === "settings-preferences-preview";
  const [pending, setPending] = useState<{ fileName: string; document: PreferencesTransferDocument } | null>(() =>
    previewDemo
      ? {
          fileName: "ome-preferences-demo.json",
          document: {
            format: "ome-preferences",
            version: 5,
            exportedAt: new Date().toISOString(),
            appVersion: version,
            preferences: currentPreferences(),
          },
        }
      : null,
  );
  const [message, setMessage] = useState("");

  const exportPreferences = () => {
    try {
      const serialized = serializePreferencesTransfer(currentPreferences(), version);
      const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "ome-preferences.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage("已导出偏好文件");
      setPending(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "偏好文件导出失败");
    }
  };

  const inspectFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setPending(null);
    if (file.size > MAX_PREFERENCES_TRANSFER_BYTES) {
      setMessage("偏好文件过大，无法导入");
      return;
    }
    try {
      const backup = parsePreferencesTransfer(await file.text());
      setPending({ fileName: file.name, document: backup });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "偏好文件读取失败");
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    try {
      applyPreferences(pending.document.preferences);
      setMessage(`已导入「${pending.fileName}」中的五类偏好`);
      setPending(null);
    } catch {
      setMessage("偏好导入未完成，请检查当前设置后重试");
    }
  };

  return (
    <div class="preference-transfer">
      <Row
        title="偏好迁移文件"
          hint="备份外观、播放、声音、视觉和歌词偏好，包含声道预设与 A/B 快照；文件不含账号、密钥、曲库、历史或设备路径"
      >
        <div class="preference-transfer-actions">
          <button class="btn-secondary" onClick={exportPreferences}>导出偏好</button>
          <button class="btn-secondary" onClick={() => fileInput.current?.click()}>选择文件</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="选择偏好 JSON 文件"
            hidden
            onChange={(event) => void inspectFile(event)}
          />
        </div>
      </Row>
      {pending && (
        <div class="preference-transfer-preview" role="group" aria-label="导入偏好预览" aria-live="polite">
          <div class="preference-transfer-file">
            <span>准备导入</span>
            <strong>{pending.fileName}</strong>
          </div>
          <p>确认后将覆盖这台设备上的以下设置：</p>
          <div class="preference-transfer-categories" aria-label="将覆盖的设置类别">
            {(["外观", "播放", "声音", "视觉氛围", "歌词"] as const).map((category) => (
              <span class="preference-transfer-chip" key={category}>{category}</span>
            ))}
          </div>
          <p class="preference-transfer-exclusion">
            自动电台开关会一并导入；启用且已配置 DJ 时，应用下次启动可能自动续播。桌面歌词窗口状态、固定命令槽、DJ/TTS 配置、账号会话、曲库与播放历史不会导入。
          </p>
          <div class="preference-transfer-confirm">
            <button class="btn-secondary" onClick={() => setPending(null)}>取消</button>
            <button class="btn-primary" onClick={confirmImport}>确认覆盖五类偏好</button>
          </div>
        </div>
      )}
      {message && <p class="view-hint preference-transfer-status" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}

function restoredSnapshot(data: DataRestoreResult): {
  preferences: PreferencesTransferPayload;
  queue: ReturnType<typeof parseQueueSessionSnapshot>;
} {
  const preferences = parsePreferencesTransfer(data.preferencesJson).preferences;
  const queue = data.queueSessionJson
    ? parseQueueSessionSnapshot(data.queueSessionJson)
    : null;
  if (data.queueSessionJson && !queue) throw new Error("备份中的手动队列格式无效");
  return { preferences, queue };
}

function displayBackupTime(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return value;
  return new Date(seconds * 1000).toLocaleString();
}

/** 本机曲库与收听数据的可移植备份；本机凭据和目录授权留在当前设备。 */
function DataBackupBody({ version }: { version: string }) {
  const demo = new URLSearchParams(window.location.search).get("demo") === "settings-data-backup-preview";
  const previewVersion = version === "…" ? "0.7.0" : version;
  const [preview, setPreview] = useState<DataBackupPreview | null>(() => {
    if (!demo) return null;
    return {
      backupId: "demo-backup",
      folderName: "Ome-Music-Backup",
      exportedAt: String(Math.floor(Date.now() / 1000)),
      appVersion: previewVersion,
      schemaVersion: 15,
      trackCount: 128,
      playlistCount: 6,
      databaseBytes: 0,
      hasQueueSession: Boolean(lastManualQueueSession.value),
      preferencesJson: serializePreferencesTransfer(currentPreferences(), previewVersion),
      queueSessionJson: lastManualQueueSession.value ? JSON.stringify(lastManualQueueSession.value) : null,
    };
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  useEffect(() => {
    if (isTauriRuntime()) {
      void hasLastRestorePoint().then(setCanUndo).catch(() => setCanUndo(false));
    }
  }, []);

  const exportBackup = async () => {
    if (!isTauriRuntime()) return;
    setBusy(true);
    setMessage("");
    try {
      const preferencesJson = serializePreferencesTransfer(currentPreferences(), version);
      const queue = lastManualQueueSession.value;
      const result = await exportDataBackup(preferencesJson, queue ? JSON.stringify(queue) : null);
      const queueNote = result.hasQueueSession ? "，含手动队列快照" : "";
      setMessage(`备份已保存：${result.folderName}（${result.trackCount} 首曲目，${result.playlistCount} 个歌单${queueNote}）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备份未完成");
    } finally {
      setBusy(false);
    }
  };

  const inspectBackup = async () => {
    if (!isTauriRuntime()) return;
    setBusy(true);
    setMessage("");
    setConfirmRestore(false);
    try {
      const result = await inspectDataBackup();
      parsePreferencesTransfer(result.preferencesJson);
      if (result.queueSessionJson && !parseQueueSessionSnapshot(result.queueSessionJson)) {
        throw new Error("备份中的手动队列格式无效");
      }
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "备份检查未通过");
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!preview || !isTauriRuntime()) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const currentPreferencesJson = serializePreferencesTransfer(currentPreferences(), version);
      const currentQueue = lastManualQueueSession.value;
      const result = await restoreDataBackup(
        preview.backupId,
        preview.preferencesJson,
        preview.queueSessionJson,
        currentPreferencesJson,
        currentQueue ? JSON.stringify(currentQueue) : null,
      );
      const restored = restoredSnapshot(result);
      applyPreferences(restored.preferences);
      if (!replaceLastManualQueueSession(restored.queue)) throw new Error("手动队列快照写入失败");
      setCanUndo(true);
      setPreview(null);
      setMessage(`已恢复 ${result.restoredTracks} 首曲目与 ${result.restoredPlaylists} 个歌单。曲库页面即将刷新。`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复未完成；如有需要可使用本机回退点撤销");
      setConfirmRestore(false);
      void hasLastRestorePoint().then(setCanUndo).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const undoRestore = async () => {
    if (!isTauriRuntime()) return;
    if (!confirmUndo) {
      setConfirmUndo(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await restoreLastImport();
      const restored = restoredSnapshot(result);
      applyPreferences(restored.preferences);
      if (!replaceLastManualQueueSession(restored.queue)) throw new Error("手动队列快照恢复失败");
      setCanUndo(false);
      setMessage("已撤销上次恢复，正在刷新曲库…");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "撤销未完成");
      setConfirmUndo(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="preference-transfer data-backup">
      <Row
        title="本地数据备份"
        hint="保留曲库、歌单、歌词、收听历史与安全范围内的偏好；备份保存到你选择的文件夹"
      >
        <div class="preference-transfer-actions">
          <button class="btn-secondary" disabled={busy || !isTauriRuntime()} onClick={() => void exportBackup()}>
            {busy ? "处理中…" : "备份到文件夹"}
          </button>
          <button class="btn-secondary" disabled={busy || !isTauriRuntime()} onClick={() => void inspectBackup()}>
            从备份恢复…
          </button>
        </div>
      </Row>
      <p class="view-hint">
        备份未加密，会包含歌曲文件路径、收听记录、歌词与 DJ 本地记忆；若保存到共享或同步文件夹，备份也会保存到那里。不会复制音频文件、封面缓存、网易云登录、DJ 密钥或本机文件夹授权。
        恢复会保留当前设备仍有效的 DJ 配置与文件授权，不会启用备份中的权限。
      </p>
      {preview && (
        <div class="preference-transfer-preview" role="group" aria-label="数据备份恢复预览" aria-live="polite">
          <div class="preference-transfer-file">
            <span>已检查备份</span>
            <strong>{preview.folderName}</strong>
          </div>
          <p>
            导出时间：{displayBackupTime(preview.exportedAt)} · 版本：{preview.appVersion} · 曲目 {preview.trackCount} 首 · 歌单 {preview.playlistCount} 个
          </p>
          <div class="preference-transfer-categories" aria-label="备份包含内容">
            {["曲库与歌单", "歌词", "收听记录", "偏好", ...(preview.hasQueueSession ? ["手动队列快照"] : [])].map((item) => (
              <span class="preference-transfer-chip" key={item}>{item}</span>
            ))}
          </div>
          <p class="preference-transfer-exclusion">
            确认后将替换当前曲库、歌单与收听记录，并应用备份偏好；当前设备会先保存可撤销的本机回退点。偏好中的自动电台开关也会恢复，DJ 已配置时可能按该设置自动接播；队列快照本身不会启动播放。
          </p>
          <div class="preference-transfer-confirm">
            <button class="btn-secondary" disabled={busy} onClick={() => { setPreview(null); setConfirmRestore(false); }}>
              取消
            </button>
            <button class={confirmRestore ? "btn-primary is-danger" : "btn-primary"} disabled={busy || demo} onClick={() => void restoreBackup()}>
              {confirmRestore ? "再次确认并恢复曲库" : "恢复此备份…"}
            </button>
          </div>
        </div>
      )}
      {canUndo && (
        <Row title="最近一次恢复" hint="恢复前已保存在本机的回退点，可撤销这次数据恢复">
          <button class={`btn-secondary ${confirmUndo ? "is-danger" : ""}`} disabled={busy} onClick={() => void undoRestore()}>
            {confirmUndo ? "再次确认撤销恢复" : "撤销最近一次恢复…"}
          </button>
        </Row>
      )}
      {demo && <p class="view-hint">此为界面预览，不会读取或修改本机备份数据。</p>}
      {!isTauriRuntime() && !demo && <p class="view-hint">数据备份仅在桌面应用中可用。</p>}
      {message && <p class="view-hint preference-transfer-status" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");
  const [query, setQuery] = useState("");
  const demo = new URLSearchParams(window.location.search).get("demo");
  const preferencePreview = demo === "settings-preferences" || demo === "settings-preferences-preview";
  // 受控折叠：默认播放与外观展开（使用频率最高）
  const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>({
    playback: true,
    appearance: true,
    sound: false,
    source: false,
    lyrics: false,
    dj: false,
    shortcuts: false,
    data: demo === "settings-data-backup-preview",
    about: preferencePreview,
  });
  const [activeSection, setActiveSection] = useState<SectionId>("playback");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
      void refreshStatus();
    } else {
      setVersion("开发预览");
    }
    return () => cancelQrLogin();
  }, []);

  const searching = query.trim() !== "";
  const matches = useMemo(() => searchSections(query), [query]);
  const visibleSections = useMemo(
    () => (searching ? SETTINGS_SECTIONS.filter((section) => matches.includes(section.id)) : SETTINGS_SECTIONS),
    [searching, matches],
  );

  const toggleSection = (id: SectionId) => {
    setOpenMap((map) => ({ ...map, [id]: !map[id] }));
  };

  /** 侧栏导航：展开对应分组并平滑定位（Kimi 设置页信息架构） */
  const navigateTo = (id: SectionId) => {
    setActiveSection(id);
    setOpenMap((map) => ({ ...map, [id]: true }));
    requestAnimationFrame(() => {
      document
        .getElementById(`settings-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    const requestedSection = requestedSettingsSection.value;
    if (!requestedSection) return;
    requestedSettingsSection.value = null;
    navigateTo(requestedSection);
  }, []);

  const isOpen = (id: SectionId) => (searching ? matches.includes(id) : openMap[id]);

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置分组">
          <div class="settings-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="搜索设置…"
              aria-label="搜索设置"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            />
            {searching && (
              <button class="settings-search-clear" aria-label="清除搜索" onClick={() => setQuery("")}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          {searching && visibleSections.length === 0 && (
            <p class="settings-nav-empty">没有匹配的设置</p>
          )}
          {SETTINGS_GROUPS.map((group) => {
            const items = visibleSections.filter((section) => section.group === group);
            if (items.length === 0) return null;
            return (
              <div class="settings-nav-group" key={group}>
                <span class="settings-nav-group-label">{group}</span>
                {items.map((section) => (
                  <button
                    key={section.id}
                    class="settings-nav-item"
                    data-active={activeSection === section.id}
                    onClick={() => navigateTo(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div class="settings-cards">
          <Card title="播放" id="playback" open={isOpen("playback")} onToggle={() => toggleSection("playback")}>
            <PlaybackBody />
          </Card>

          <Card title="外观" id="appearance" open={isOpen("appearance")} onToggle={() => toggleSection("appearance")}>
            <AppearanceBody />
          </Card>

          <Card title="声音（DSP）" id="sound" open={isOpen("sound")} onToggle={() => toggleSection("sound")}>
            <SoundBody />
          </Card>

          <Card title="音乐源" id="source" open={isOpen("source")} onToggle={() => toggleSection("source")}>
            <NetEaseBody />
            <SubsonicSettingsBody />
            <JellyfinSettingsBody />
            <EmbySettingsBody />
            <WebDavSettingsBody />
            <SmbSettingsBody />
            <LocalDirectoryManager />
            <p class="view-hint">本地歌词支持同目录 lrc / vtt / ttml / qrc / krc。</p>
          </Card>

          <Card title="歌词" id="lyrics" open={isOpen("lyrics")} onToggle={() => toggleSection("lyrics")}>
            <LyricsBody />
          </Card>

          <Card title="DJ 电台与语音" id="dj" open={isOpen("dj")} onToggle={() => toggleSection("dj")}>
            <DjConfigBody />
          </Card>

          <Card title="快捷键" id="shortcuts" open={isOpen("shortcuts")} onToggle={() => toggleSection("shortcuts")}>
            <ShortcutsBody />
          </Card>

          <Card title="数据与备份" id="data" open={isOpen("data")} onToggle={() => toggleSection("data")}>
            <DataBackupBody version={version} />
          </Card>

          <Card title="关于" id="about" open={isOpen("about")} onToggle={() => toggleSection("about")}>
            <AboutBody version={version} />
          </Card>
        </div>
      </div>
    </section>
  );
}
