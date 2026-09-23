import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { playlistTracks } from "../lib/api";
import { activeView } from "../state/app";
import {
  closePalette,
  filterCommands,
  openPalette,
  paletteOpen,
  readRecent,
  runCommand,
  type Command,
} from "../state/commands";
import { djTab, drawerOpen, openDrawer } from "../state/dj";
import {
  clearQueue,
  currentTrack,
  isPlaying,
  next,
  playTracks,
  previous,
  queueOpen,
  setVolume,
  togglePlayback,
  volume,
} from "../state/player";
import { rematchLyric, findMatchCandidates } from "../state/lyrics";
import { openPlaylist, playlists } from "../state/playlists";
import { setThemeChoice, THEME_PRESETS } from "../state/theme";
import { openStage } from "../state/stage";
import { openViz } from "../state/visualizer";
import { cancelSleepTimer, setSleepAtTrackEnd, setSleepTimer } from "../state/sleeptimer";
import { Icon } from "./Icon";

/** 曲库视图切换：localStorage 与 Library 组件的读取约定保持一致 */
function switchLibraryView(view: string): void {
  try {
    localStorage.setItem("ome.library.view", view);
  } catch {
    /* ignore */
  }
  activeView.value = "library";
}

function goToDjTab(tab: "chat" | "memory" | "profile"): void {
  djTab.value = tab;
  drawerOpen.value = true;
  void openDrawer();
}

function buildCommands(): Command[] {
  const commands: Command[] = [
    // 导航
    { id: "nav.home", title: "回到电台", group: "导航", run: () => (activeView.value = "home") },
    { id: "nav.search", title: "去搜索", group: "导航", run: () => (activeView.value = "search") },
    { id: "nav.library", title: "打开曲库", group: "导航", run: () => (activeView.value = "library") },
    { id: "nav.settings", title: "打开设置", group: "导航", run: () => (activeView.value = "settings") },
    // 曲库视图
    { id: "lib.list", title: "曲库 · 列表视图", group: "曲库", hint: "列表", run: () => switchLibraryView("list") },
    { id: "lib.grid", title: "曲库 · 专辑墙", group: "曲库", hint: "专辑墙", run: () => switchLibraryView("grid") },
    { id: "lib.artists", title: "曲库 · 艺人视图", group: "曲库", hint: "艺人", run: () => switchLibraryView("artists") },
    { id: "lib.folders", title: "曲库 · 文件夹", group: "曲库", hint: "文件夹", run: () => switchLibraryView("folders") },
    { id: "lib.playlists", title: "曲库 · 歌单", group: "曲库", hint: "歌单", run: () => switchLibraryView("playlists") },
    { id: "lib.history", title: "曲库 · 播放历史", group: "曲库", hint: "历史", run: () => switchLibraryView("history") },
    // 播放控制
    { id: "play.toggle", title: isPlaying.value ? "暂停" : "播放", group: "播放", run: () => togglePlayback() },
    { id: "play.prev", title: "上一首", group: "播放", run: () => previous() },
    { id: "play.next", title: "下一首", group: "播放", run: () => next(true) },
    { id: "play.queue", title: "打开播放队列", group: "播放", run: () => (queueOpen.value = true) },
    { id: "play.clear", title: "清空播放队列", group: "播放", run: () => clearQueue() },
    { id: "volume.up", title: "音量 · 加大", group: "播放", hint: `${Math.round(volume.value * 100)}%`, run: () => setVolume(volume.value + 0.1) },
    { id: "volume.down", title: "音量 · 减小", group: "播放", hint: `${Math.round(volume.value * 100)}%`, run: () => setVolume(volume.value - 0.1) },
    { id: "volume.mute", title: "音量 · 静音", group: "播放", run: () => setVolume(0) },
    { id: "lyric.rematch", title: "歌词 · 重新匹配当前曲目", group: "播放", hint: currentTrack.value ? currentTrack.value.title : "未在播放", run: () => { const track = currentTrack.value; if (track) void rematchLyric(track); } },
    { id: "lyric.pick", title: "歌词 · 手动挑选匹配版本", group: "播放", hint: currentTrack.value ? currentTrack.value.title : "未在播放", run: () => { const track = currentTrack.value; if (track) void findMatchCandidates(track); } },
    { id: "stage.open", title: "打开歌词舞台", group: "播放", run: () => openStage() },
    { id: "viz.open", title: "打开视觉器", group: "播放", run: () => openViz() },
    // DJ
    { id: "dj.chat", title: "打开 DJ 对话", group: "DJ", run: () => goToDjTab("chat") },
    { id: "dj.memory", title: "打开 DJ 记忆", group: "DJ", run: () => goToDjTab("memory") },
    { id: "dj.profile", title: "打开 DJ 画像", group: "DJ", run: () => goToDjTab("profile") },
    // 睡眠定时（Folia 定时关闭）
    { id: "sleep.15", title: "睡眠定时 · 15 分钟后停止", group: "睡眠", run: () => setSleepTimer(15) },
    { id: "sleep.30", title: "睡眠定时 · 30 分钟后停止", group: "睡眠", run: () => setSleepTimer(30) },
    { id: "sleep.60", title: "睡眠定时 · 60 分钟后停止", group: "睡眠", run: () => setSleepTimer(60) },
    { id: "sleep.track", title: "睡眠定时 · 播完当前停止", group: "睡眠", run: () => setSleepAtTrackEnd() },
    { id: "sleep.cancel", title: "睡眠定时 · 取消", group: "睡眠", run: () => cancelSleepTimer() },
    // 外观
    { id: "theme.system", title: "外观 · 跟随系统", group: "外观", run: () => setThemeChoice("system") },
    ...THEME_PRESETS.map((preset) => ({
      id: `theme.${preset.id}`,
      title: `外观 · ${preset.label}`,
      group: "外观" as const,
      run: () => setThemeChoice(preset.id),
    })),
  ];
  // 歌单：一键播放
  for (const playlist of playlists.value ?? []) {
    commands.push({
      id: `playlist.${playlist.id}`,
      title: `播放歌单「${playlist.name}」`,
      group: "歌单",
      hint: `${playlist.trackCount} 首`,
      run: async () => {
        try {
          const tracks = await playlistTracks(playlist.id);
          if (tracks.length > 0) playTracks(tracks, 0);
          await openPlaylist(playlist.id);
        } catch {
          /* 歌单读取失败：静默 */
        }
      },
    });
  }
  return commands;
}

export function CommandPalette() {
  const open = paletteOpen.value;
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl+K / Cmd+K 全局唤起（Folia / Kimi 约定）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (paletteOpen.value) closePalette();
        else openPalette();
      } else if (event.key === "Escape" && paletteOpen.value) {
        closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 打开时：重置查询、聚焦输入
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo(() => (open ? buildCommands() : []), [open]);
  const visible = useMemo(() => filterCommands(commands, query, readRecent()), [commands, query]);
  const clampedCursor = Math.min(cursor, Math.max(0, visible.length - 1));

  // 光标项滚进可视区
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [clampedCursor, visible.length]);

  if (!open) return null;

  const submit = (index: number) => {
    const command = visible[index];
    if (command) void runCommand(command);
  };

  // 按 group 连续分段（filterCommands 保持原顺序，buildCommands 已按组排列）
  const rows: Array<{ type: "group"; name: string } | { type: "item"; command: Command; index: number }> = [];
  let lastGroup = "";
  visible.forEach((command, index) => {
    if (command.group !== lastGroup) {
      rows.push({ type: "group", name: command.group });
      lastGroup = command.group;
    }
    rows.push({ type: "item", command, index });
  });

  return (
    <div class="palette-backdrop" onClick={closePalette}>
      <div
        class="palette-dialog"
        role="dialog"
        aria-label="命令面板"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="palette-input-row">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            placeholder="输入命令…（Esc 关闭）"
            aria-label="命令搜索"
            value={query}
            onInput={(event) => {
              setQuery((event.target as HTMLInputElement).value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor(Math.min(clampedCursor + 1, visible.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor(Math.max(clampedCursor - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                submit(clampedCursor);
              }
            }}
          />
          <kbd class="palette-kbd">Ctrl K</kbd>
        </div>

        <div class="palette-list" ref={listRef}>
          {visible.length === 0 && <p class="palette-empty">没有匹配的命令</p>}
          {rows.map((row) =>
            row.type === "group" ? (
              <div key={`group-${row.name}`} class="palette-group">
                {row.name}
              </div>
            ) : (
              <button
                key={row.command.id}
                class="palette-item"
                data-active={row.index === clampedCursor}
                onMouseEnter={() => setCursor(row.index)}
                onClick={() => submit(row.index)}
              >
                <span class="palette-item-title">{row.command.title}</span>
                {row.command.hint && <span class="palette-item-hint">{row.command.hint}</span>}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
