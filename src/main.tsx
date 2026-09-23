import { render } from "preact";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles/theme.css";
import "./styles/motion.css";
import "./styles/layout.css";
import { App } from "./app";
import "./state/theme"; // 引入即生效：应用主题到 <html>
import { isDemoMode, seedDemoData } from "./lib/demo";

if (isDemoMode()) seedDemoData();

render(<App />, document.getElementById("app")!);

// 启动序列：双 rAF 确保首帧与入场动画已提交后，移除 booting 遮蔽、
// 显示窗口并聚焦。非 Tauri 环境（浏览器预览/测试）静默跳过。
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove("booting");
    document.documentElement.classList.add("ready");
    try {
      const win = getCurrentWindow();
      void win.show();
      void win.setFocus();
    } catch {
      // 浏览器预览环境无 Tauri IPC
    }
  });
});
