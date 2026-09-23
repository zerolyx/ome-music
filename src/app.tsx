import { useEffect } from "preact/hooks";
import { isTauriRuntime } from "./lib/api";
import { activeView } from "./state/app";
import { chromeVisible, initChromeAutoHide } from "./state/chrome";
import { greet } from "./state/dj";
import { stopAllSpeech } from "./state/tts";
import { startRadioIfIdle } from "./state/radio";
import { Rail } from "./components/Rail";
import { TitleBar } from "./components/TitleBar";
import { ImmersiveCursor } from "./components/ImmersiveCursor";
import { DjDrawer } from "./components/DjDrawer";
import { HomeView } from "./views/Home";
import { SearchView } from "./views/Search";
import { LibraryView } from "./views/Library";
import { SettingsView } from "./views/Settings";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { CommandPalette } from "./components/CommandPalette";

export function App() {
  useEffect(() => initChromeAutoHide(), []);

  // 开机单链：入场动画 → 问候（说完）→ 电台接播（续播上次 / 今日推荐）
  // 顺序执行杜绝多路人声重叠；卸载时停掉一切播报
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const boot = async () => {
      await delay(1500);
      if (cancelled) return;
      await greet();
      await delay(600);
      if (cancelled) return;
      await startRadioIfIdle();
    };
    void boot();
    return () => {
      cancelled = true;
      stopAllSpeech();
    };
  }, []);

  return (
    <div class={`app-shell ${chromeVisible.value ? "" : "chrome-hidden"}`}>
      <ImmersiveCursor />
      <TitleBar />
      <div class="app-body">
        <Rail />
        <main class="view-host">
          <div key={activeView.value} class="view-swap">
            {activeView.value === "home" && <HomeView />}
            {activeView.value === "search" && <SearchView />}
            {activeView.value === "library" && <LibraryView />}
            {activeView.value === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
      <PlayerBar />
      <QueueDrawer />
      <DjDrawer />
      <PlaylistPicker />
      <CommandPalette />
    </div>
  );
}
