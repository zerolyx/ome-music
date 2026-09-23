import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { openPalette } from "../state/commands";
import { importFolder } from "../state/library";
import { THEME_PRESETS, themeChoice, setThemeChoice } from "../state/theme";
import { activeView } from "../state/app";

const KEY = "ome.welcome.dismissed";

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** 首次启动引导卡：电台未开播时的功能导览（Folia onboarding 的轻量版） */
export function WelcomeCard() {
  const [dismissed, setDismissed] = useState(loadDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const cycleTheme = () => {
    const ids = THEME_PRESETS.map((preset) => preset.id);
    const index = ids.indexOf(themeChoice.value as (typeof ids)[number]);
    const next = ids[(index + 1) % ids.length] ?? "noir";
    setThemeChoice(next);
  };

  return (
    <div class="welcome-card">
      <div class="welcome-head">
        <span class="welcome-title">三分钟上手 Ome</span>
        <button class="welcome-close" aria-label="关闭引导" onClick={dismiss}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="welcome-grid">
        <button class="welcome-item" onClick={() => void importFolder()}>
          <Icon name="folder" size={18} />
          <span class="welcome-item-title">导入音乐文件夹</span>
          <span class="welcome-item-hint">本地曲库是一切的开端</span>
        </button>
        <button class="welcome-item" onClick={openPalette}>
          <Icon name="search" size={18} />
          <span class="welcome-item-title">按 Ctrl K 唤起命令面板</span>
          <span class="welcome-item-hint">所有功能，一键直达</span>
        </button>
        <button class="welcome-item" onClick={cycleTheme}>
          <Icon name="moon" size={18} />
          <span class="welcome-item-title">试试换一套主题</span>
          <span class="welcome-item-hint">月夜 / 茜影 / 青川 / 纸墨</span>
        </button>
        <button class="welcome-item" onClick={() => (activeView.value = "settings")}>
          <Icon name="settings" size={18} />
          <span class="welcome-item-title">配置 DJ 与声音</span>
          <span class="welcome-item-hint">私人电台 · 均衡器 · 输出设备</span>
        </button>
      </div>
    </div>
  );
}
