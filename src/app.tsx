import { useEffect } from "preact/hooks";
import { isTauriRuntime } from "./lib/api";
import { activeView } from "./state/app";
import { chromeVisible, initChromeAutoHide } from "./state/chrome";
import { greet } from "./state/dj";
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

export function App() {
  useEffect(() => initChromeAutoHide(), []);

  // 开播问候：稍待入场动画结束再开口；未配置 / 不可用时 greet 自行静默
  useEffect(() => {
    const t = setTimeout(() => void greet(), 1600);
    // 问候之后自动电台开播：仅 Tauri 环境；未开电台 / DJ 未配置 / 曲库为空时静默
    const radio = setTimeout(() => {
      if (!isTauriRuntime()) return;
      void startRadioIfIdle();
    }, 2600);
    return () => {
      clearTimeout(t);
      clearTimeout(radio);
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
      <DjDrawer />
    </div>
  );
}
