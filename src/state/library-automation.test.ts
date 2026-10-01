import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackActive } from "./playback-status";
import {
  canRunStartupLibraryRescan,
  initStartupLibraryRescan,
  setStartupLibraryRescanEnabled,
  startupLibraryRescanEnabled,
  startupLibraryRescanStatus,
} from "./library-automation";

const mocks = vi.hoisted(() => ({
  rescanLibrary: vi.fn(),
  refreshAuthorizedMusicDirectories: vi.fn(),
  importing: null as unknown,
}));
let stopAutomaticRescan: (() => void) | undefined;

function setLibraryBusy(busy: boolean): void {
  (mocks.importing as { value: boolean }).value = busy;
}

vi.mock("../lib/api", () => ({ isTauriRuntime: () => true }));
vi.mock("./library", async () => {
  const signals = await vi.importActual<typeof import("@preact/signals")>("@preact/signals");
  const importing = signals.signal(false);
  mocks.importing = importing;
  return {
    authorizedMusicDirectories: signals.signal([{ id: 1, path: "local-only", trackCount: 1, available: true }]),
    authorizedMusicDirectoriesError: signals.signal<string | null>(null),
    importNotice: signals.signal<string | null>(null),
    importing,
    refreshAuthorizedMusicDirectories: mocks.refreshAuthorizedMusicDirectories,
    rescanLibrary: mocks.rescanLibrary,
  };
});

describe("启动时自动更新曲库", () => {
  beforeEach(() => {
    localStorage.clear();
    setStartupLibraryRescanEnabled(false);
    playbackActive.value = false;
    setLibraryBusy(false);
    mocks.rescanLibrary.mockReset().mockResolvedValue(true);
    mocks.refreshAuthorizedMusicDirectories.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    stopAutomaticRescan?.();
    stopAutomaticRescan = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    setStartupLibraryRescanEnabled(false);
    playbackActive.value = false;
  });

  it("默认关闭，并将用户选择保存在本机偏好中", () => {
    expect(startupLibraryRescanEnabled.value).toBe(false);
    setStartupLibraryRescanEnabled(true);
    expect(localStorage.getItem("ome.library.startup-rescan")).toBe("1");
    setStartupLibraryRescanEnabled(false);
    expect(localStorage.getItem("ome.library.startup-rescan")).toBe("0");
  });

  it("只在已启用、桌面前台、停止播放且没有其他曲库任务时运行", () => {
    const eligible = {
      enabled: true,
      desktop: true,
      visible: true,
      focused: true,
      playing: false,
      busy: false,
    };
    expect(canRunStartupLibraryRescan(eligible)).toBe(true);
    expect(canRunStartupLibraryRescan({ ...eligible, enabled: false })).toBe(false);
    expect(canRunStartupLibraryRescan({ ...eligible, desktop: false })).toBe(false);
    expect(canRunStartupLibraryRescan({ ...eligible, visible: false })).toBe(false);
    expect(canRunStartupLibraryRescan({ ...eligible, focused: false })).toBe(false);
    expect(canRunStartupLibraryRescan({ ...eligible, playing: true })).toBe(false);
    expect(canRunStartupLibraryRescan({ ...eligible, busy: true })).toBe(false);
  });

  it("启动后只静默扫描一次，并在本次启动显示结果", async () => {
    setStartupLibraryRescanEnabled(true);
    stopAutomaticRescan = initStartupLibraryRescan();

    await vi.advanceTimersByTimeAsync(45_000);

    expect(mocks.refreshAuthorizedMusicDirectories).toHaveBeenCalledOnce();
    expect(mocks.rescanLibrary).toHaveBeenCalledOnce();
    expect(mocks.rescanLibrary).toHaveBeenCalledWith({ quiet: true });
    expect(startupLibraryRescanStatus.value).toBe("本次启动已更新已授权曲库");
  });

  it("播放时等待；暂停后才开始扫描", async () => {
    playbackActive.value = true;
    setStartupLibraryRescanEnabled(true);
    stopAutomaticRescan = initStartupLibraryRescan();

    await vi.advanceTimersByTimeAsync(45_000);
    expect(mocks.rescanLibrary).not.toHaveBeenCalled();
    expect(startupLibraryRescanStatus.value).toBe("将在暂停播放后检查已授权曲库");

    playbackActive.value = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.rescanLibrary).toHaveBeenCalledOnce();
  });

  it("关闭期间完成手动曲库任务后，稍后启用仍会安排自动检查", async () => {
    stopAutomaticRescan = initStartupLibraryRescan();
    setLibraryBusy(true);
    setLibraryBusy(false);
    setStartupLibraryRescanEnabled(true);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(mocks.rescanLibrary).toHaveBeenCalledOnce();
  });
});
