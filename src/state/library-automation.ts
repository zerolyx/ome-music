import { signal } from "@preact/signals";
import { isTauriRuntime } from "../lib/api";
import {
  authorizedMusicDirectories,
  authorizedMusicDirectoriesError,
  importNotice,
  importing,
  refreshAuthorizedMusicDirectories,
  rescanLibrary,
} from "./library";
import { playbackActive } from "./playback-status";

const ENABLED_KEY = "ome.library.startup-rescan";
const STARTUP_GRACE_MS = 45_000;
const ENABLE_GRACE_MS = 2_000;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export const startupLibraryRescanEnabled = signal(readEnabled());
export const startupLibraryRescanRunning = signal(false);
export const startupLibraryRescanStatus = signal(
  startupLibraryRescanEnabled.value ? "等待本次启动空闲后检查已授权曲库" : "",
);

export function setStartupLibraryRescanEnabled(enabled: boolean): void {
  startupLibraryRescanEnabled.value = enabled;
  startupLibraryRescanStatus.value = enabled ? "等待本次启动空闲后检查已授权曲库" : "";
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // The toggle still applies for this session when persistent storage is unavailable.
  }
}

export interface StartupRescanGate {
  enabled: boolean;
  desktop: boolean;
  visible: boolean;
  focused: boolean;
  playing: boolean;
  busy: boolean;
}

export function canRunStartupLibraryRescan(gate: StartupRescanGate): boolean {
  return gate.enabled && gate.desktop && gate.visible && gate.focused && !gate.playing && !gate.busy;
}

export function initStartupLibraryRescan(): () => void {
  if (!isTauriRuntime()) return () => {};

  let disposed = false;
  let sessionFinished = false;
  let timer = 0;
  let running = false;
  let manualLibraryActivity = false;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const schedule = (delay: number) => {
    if (disposed || !startupLibraryRescanEnabled.value || sessionFinished || running) return;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = 0;
      void run();
    }, delay);
  };

  const gate = (): StartupRescanGate => ({
    enabled: startupLibraryRescanEnabled.value,
    desktop: isTauriRuntime(),
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
    playing: playbackActive.value,
    busy: importing.value,
  });

  const run = async () => {
    if (disposed || running || sessionFinished) return;
    if (!startupLibraryRescanEnabled.value) {
      startupLibraryRescanStatus.value = "";
      return;
    }
    if (!canRunStartupLibraryRescan(gate())) {
      if (playbackActive.value) startupLibraryRescanStatus.value = "将在暂停播放后检查已授权曲库";
      else if (document.visibilityState !== "visible" || !document.hasFocus()) {
        startupLibraryRescanStatus.value = "将在 Ome 回到前台后检查已授权曲库";
      } else if (importing.value) startupLibraryRescanStatus.value = "曲库操作完成后再检查";
      return;
    }

    running = true;
    startupLibraryRescanRunning.value = true;
    startupLibraryRescanStatus.value = "正在后台更新已授权曲库…";
    try {
      await refreshAuthorizedMusicDirectories();
      if (authorizedMusicDirectoriesError.value) {
        startupLibraryRescanStatus.value = "自动更新未完成；请在本地音乐目录设置中检查状态";
        sessionFinished = true;
        return;
      }

      const directories = authorizedMusicDirectories.value.filter((directory) => directory.available);
      if (directories.length === 0) {
        startupLibraryRescanStatus.value = "没有可自动更新的已授权目录";
        sessionFinished = true;
        return;
      }

      if (!startupLibraryRescanEnabled.value) {
        startupLibraryRescanStatus.value = "自动更新已关闭";
        sessionFinished = true;
        return;
      }
      if (importNotice.value) importNotice.value = null;
      const completed = await rescanLibrary({ quiet: true });
      startupLibraryRescanStatus.value = !startupLibraryRescanEnabled.value
        ? "自动更新已关闭；已开始的扫描已完成"
        : completed
          ? "本次启动已更新已授权曲库"
          : "自动更新未完成；可在本地音乐目录设置中手动重扫";
      sessionFinished = true;
    } catch {
      startupLibraryRescanStatus.value = "自动更新未完成；可在本地音乐目录设置中手动重扫";
      sessionFinished = true;
    } finally {
      running = false;
      startupLibraryRescanRunning.value = false;
    }
  };

  const tryAfterIdle = () => schedule(ENABLE_GRACE_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") tryAfterIdle();
  };
  const onFocus = () => tryAfterIdle();
  const unsubscribeEnabled = startupLibraryRescanEnabled.subscribe((enabled) => {
    if (enabled) schedule(ENABLE_GRACE_MS);
    else {
      clearTimer();
      if (!running) startupLibraryRescanStatus.value = "";
    }
  });
  const unsubscribePlayback = playbackActive.subscribe((active) => {
    if (!active) tryAfterIdle();
  });
  const unsubscribeLibrary = importing.subscribe((busy) => {
    if (busy && !running && !sessionFinished) {
      manualLibraryActivity = true;
      return;
    }
    if (!busy && !running) {
      if (manualLibraryActivity && startupLibraryRescanEnabled.value) {
        sessionFinished = true;
        startupLibraryRescanStatus.value = "本次启动已进行手动曲库操作，跳过自动扫描";
      } else if (!manualLibraryActivity) {
        tryAfterIdle();
      }
    }
  });

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onFocus);
  if (startupLibraryRescanEnabled.value) schedule(STARTUP_GRACE_MS);

  return () => {
    disposed = true;
    clearTimer();
    unsubscribeEnabled();
    unsubscribePlayback();
    unsubscribeLibrary();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onFocus);
  };
}
