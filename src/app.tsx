import { useEffect } from "preact/hooks";
import { activeView } from "./state/app";
import { chromeVisible, initChromeAutoHide } from "./state/chrome";
import { Rail } from "./components/Rail";
import { TitleBar } from "./components/TitleBar";
import { ImmersiveCursor } from "./components/ImmersiveCursor";
import { HomeView } from "./views/Home";
import { SearchView } from "./views/Search";
import { LibraryView } from "./views/Library";
import { SettingsView } from "./views/Settings";
import { PlayerBar } from "./components/PlayerBar";

export function App() {
  useEffect(() => initChromeAutoHide(), []);

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
    </div>
  );
}
