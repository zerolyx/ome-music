import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";

// 惰性获取窗口句柄：jsdom/测试环境没有 Tauri IPC，模块顶层调用会崩
function win() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function TitleBar() {
  return (
    <header class="titlebar" data-tauri-drag-region>
      <span class="titlebar-name" data-tauri-drag-region>
        Ome Music
      </span>
      <div class="titlebar-controls">
        <button class="titlebar-btn" aria-label="最小化" onClick={() => void win()?.minimize()}>
          <Icon name="minimize" size={14} />
        </button>
        <button
          class="titlebar-btn"
          aria-label="最大化"
          onClick={() => void win()?.toggleMaximize()}
        >
          <Icon name="maximize" size={12} />
        </button>
        <button class="titlebar-btn titlebar-close" aria-label="关闭" onClick={() => void win()?.close()}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  );
}
