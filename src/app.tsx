import { activeView } from "./state/app";
import { Rail } from "./components/Rail";
import { TitleBar } from "./components/TitleBar";
import { HomeView } from "./views/Home";
import { SearchView } from "./views/Search";
import { LibraryView } from "./views/Library";
import { SettingsView } from "./views/Settings";
import { PlayerBar } from "./components/PlayerBar";

export function App() {
  return (
    <div class="app-shell">
      <TitleBar />
      <div class="app-body">
        <Rail />
        <main class="view-host">
          {activeView.value === "home" && <HomeView />}
          {activeView.value === "search" && <SearchView />}
          {activeView.value === "library" && <LibraryView />}
          {activeView.value === "settings" && <SettingsView />}
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}
