# Plan 1「地基」Implementation Plan — 新前端骨架 + Rust 后端核心

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Preact + 手写 CSS 的全新前端和模块化 Rust 后端替换旧实现，产出"本地音乐导入/播放/歌词占位 + 双主题"完整可用的应用外壳。

**Architecture:** 同仓库重建：前端删旧换新（Preact + signals + CSS 自定义属性双主题）；Rust 侧删除 `qqmusic.rs` 与 10600 行单文件 `lib.rs`，拆成 `db / library / media` 模块，媒体经自注册 `ome-media` 协议代理（支持 Range）。旧 SQL 迁移（001-003）原样沿用。

**Tech Stack:** Preact 10 + @preact/signals + @tauri-apps/api（仅 3 个运行时依赖）；Vite 6 + Vitest + @testing-library/preact；Rust: tauri 2, rusqlite(bundled), walkdir, lofty, tauri-plugin-dialog, md5, base64, tokio。

**Spec:** `docs/superpowers/specs/2026-09-21-ome-lightweight-personal-radio-design.md`（本计划实现其 §2 架构 + §5 UI 骨架 + 里程碑 M1/M2；NetEase=M3→Plan 2，DJ=§4→Plan 3，Bilibili→Plan 4，清理→Plan 5）

## Global Constraints

- 版本号 `0.4.0`：`package.json` 与 `src-tauri/tauri.conf.json` 必须 lockstep 一致。
- 前端运行时依赖**只允许** `preact`、`@preact/signals`、`@tauri-apps/api`，禁止新增。
- UI 文案全部简体中文；代码标识符英文。
- 双主题：浅色暖白纸感 / 深色 #0A0A0C 近黑，`data-theme` 属性驱动，默认跟随系统。
- `PersonalConfig/` 禁读禁印禁提交（.gitignore 屏蔽）。
- 提交信息用 Conventional Commits（feat/fix/chore/test/refactor）。
- 每个任务结束时 `npm run test` 或 `cargo test` 必须绿。
- 禁止引入 TTS/LLM/NetEase/Bilibili 逻辑（后续计划）。

---

### Task 0: git 安全网（先做，全程有版本控制）

**Files:**
- Delete: `.git/`（损坏，bad object HEAD）
- Create: `.gitignore`（覆盖旧的）

- [ ] **Step 1: 移除损坏的 .git 并重新 init**

```bash
rm -rf .git
git init -b main
git config user.name "ome" && git config user.email "ome@local"
```

- [ ] **Step 2: 写入新 .gitignore**

```gitignore
node_modules/
dist/
src-tauri/target/
src-tauri/gen/
test-results/
PersonalConfig/
*.local
.env
```

- [ ] **Step 3: 基线提交（旧状态原样入库，可随时回退）**

```bash
git add -A && git commit -m "chore: legacy baseline before lightweight rebuild"
```

Expected: 提交成功，`git log --oneline` 可见 1 条提交。

---

### Task 1: 前端依赖置换（React→Preact）

**Files:**
- Modify: `package.json`（整体替换）
- Modify: `vite.config.ts`、`tsconfig.json`、`eslint.config.mjs`（整体替换）
- Delete: `tailwind.config.ts`、`postcss.config.js`、`playwright.config.ts`、`tests/`、`scripts/`、`src/`（旧前端整体删除，后续任务重建）

**Interfaces:**
- Produces: 脚本 `npm run dev / build / test / lint / tauri`；`src/` 目录为空起步。

- [ ] **Step 1: 删除旧文件**

```bash
rm -rf src tests scripts tailwind.config.ts postcss.config.js playwright.config.ts test-results
```

- [ ] **Step 2: 写入新 `package.json`**

```json
{
  "name": "ome-music-player",
  "private": true,
  "version": "0.4.0",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "lint": "eslint src",
    "tauri": "tauri",
    "desktop": "tauri dev"
  },
  "dependencies": {
    "@preact/signals": "^1.3.0",
    "@tauri-apps/api": "^2.5.0",
    "preact": "^10.26.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.10.0",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/preact": "^3.2.4",
    "@types/node": "^22.10.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.17.0",
    "jsdom": "^29.1.1",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.19.1",
    "vite": "^6.4.3",
    "vitest": "^3.0.0"
  }
}
```

注意：旧 lockfile 无效，执行 `rm -f package-lock.json` 后 `npm install` 重新生成。若 vitest/jsdom 版本解析冲突，允许微调 patch 版本，但**不得**加入 react/tailwind 类依赖。

- [ ] **Step 3: 写入 `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 4: 写入 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: 写入 `eslint.config.mjs`**

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src-tauri"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  }
);
```

- [ ] **Step 6: 安装并验证空项目可跑**

```bash
rm -f package-lock.json && npm install
mkdir -p src && npx tsc --noEmit && npm run test
```

Expected: `tsc` 无错误（无输入文件也通过）、vitest 提示 "No test files found" 以退出码 1 结束属预期——临时 `echo "export {}" > src/placeholder.ts && npm run test` 通过即可，删除 placeholder。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(frontend): replace react/tailwind stack with preact + handwritten css"
```

---

### Task 2: 双主题系统

**Files:**
- Create: `index.html`（覆盖旧的）、`src/styles/theme.css`、`src/state/theme.ts`、`src/state/theme.test.ts`、`src/test/setup.ts`

**Interfaces:**
- Produces: `setThemeChoice(choice: ThemeChoice): void`、`themeChoice: Signal<ThemeChoice>`、`resolvedTheme(choice: ThemeChoice, systemDark: boolean): "light" | "dark"`；全局 `html[data-theme="light"|"dark"]`。

- [ ] **Step 1: 写入 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ome Music</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 写入 `src/styles/theme.css`（设计 tokens + 基础重置）**

```css
:root {
  --bg: #f7f5f1;
  --bg-elev: #ffffff;
  --bg-veil: rgba(247, 245, 241, 0.72);
  --text: #1a1817;
  --text-dim: #6f6a66;
  --accent: #c96f4a;
  --accent-soft: rgba(201, 111, 74, 0.12);
  --border: rgba(26, 24, 23, 0.08);
  --shadow: 0 8px 32px rgba(26, 24, 23, 0.08);
  --glow-opacity: 0;
  --radius: 14px;
  --font: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
}

[data-theme="dark"] {
  --bg: #0a0a0c;
  --bg-elev: #141417;
  --bg-veil: rgba(10, 10, 12, 0.6);
  --text: #eceae7;
  --text-dim: #8b8783;
  --accent: #e08763;
  --accent-soft: rgba(224, 135, 99, 0.16);
  --border: rgba(236, 234, 231, 0.08);
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  --glow-opacity: 1;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #app { height: 100%; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

input, select { font-family: inherit; color: inherit; }
```

- [ ] **Step 3: 写失败测试 `src/state/theme.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolvedTheme, setThemeChoice, themeChoice } from "./theme";

describe("resolvedTheme", () => {
  it("system 跟随系统偏好", () => {
    expect(resolvedTheme("system", true)).toBe("dark");
    expect(resolvedTheme("system", false)).toBe("light");
  });
  it("显式选择覆盖系统", () => {
    expect(resolvedTheme("light", true)).toBe("light");
    expect(resolvedTheme("dark", false)).toBe("dark");
  });
});

describe("setThemeChoice", () => {
  it("持久化显式选择，system 时清除", () => {
    setThemeChoice("dark");
    expect(themeChoice.value).toBe("dark");
    expect(localStorage.getItem("ome.theme")).toBe("dark");
    setThemeChoice("system");
    expect(localStorage.getItem("ome.theme")).toBeNull();
    expect(themeChoice.value).toBe("system");
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npm run test`
Expected: FAIL — `Cannot find module './theme'`

- [ ] **Step 5: 写实现 `src/state/theme.ts`**

```ts
import { effect, signal } from "@preact/signals";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ome.theme";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export const themeChoice = signal<ThemeChoice>(loadChoice());
export const systemDark = signal<boolean>(media.matches);

function loadChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

export function resolvedTheme(choice: ThemeChoice, dark: boolean): ResolvedTheme {
  if (choice === "system") return dark ? "dark" : "light";
  return choice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  themeChoice.value = choice;
  if (choice === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, choice);
}

media.addEventListener("change", (event) => {
  systemDark.value = event.matches;
});

effect(() => {
  document.documentElement.dataset.theme = resolvedTheme(
    themeChoice.value,
    systemDark.value
  );
});
```

- [ ] **Step 6: 写入 `src/test/setup.ts`（jsdom 无 matchMedia，需桩）**

```ts
import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }),
});
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test`
Expected: PASS（5 tests）

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(theme): dual-theme design tokens with system-follow + override"
```

---

### Task 3: 应用外壳（标题栏/侧栏/视图切换）

**Files:**
- Create: `src/main.tsx`、`src/app.tsx`、`src/app.test.tsx`、`src/state/app.ts`、`src/components/Icon.tsx`、`src/components/TitleBar.tsx`、`src/components/Rail.tsx`、`src/styles/layout.css`

**Interfaces:**
- Produces: `activeView: Signal<View>`，`View = "home" | "search" | "library" | "settings"`；`<Icon name="..."/>`（名称见实现）；视图组件挂载点 `<main class="view-host">`。

- [ ] **Step 1: 写失败测试 `src/app.test.tsx`**

```tsx
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app";
import { activeView } from "./state/app";

afterEach(cleanup);

describe("App shell", () => {
  it("渲染四个导航项", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "首页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "曲库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("点击导航切换视图信号", async () => {
    const { user } = render(<App />);
    await user.click(screen.getByRole("button", { name: "曲库" }));
    expect(activeView.value).toBe("library");
  });
});
```

若 `render` 不返回 `user`，改用 `userEvent.setup()`（@testing-library/preact v3 自带 userEvent 的话直接用返回值；否则 `import userEvent from "@testing-library/user-event"` 不引入——用 `fireEvent.click` 替代）。**统一用 `fireEvent.click`** 避免依赖差异：`await fireEvent.click(screen.getByRole(...))`。

- [ ] **Step 2: 运行确认失败**

Run: `npm run test`
Expected: FAIL — `Cannot find module './app'`

- [ ] **Step 3: 写 `src/state/app.ts`**

```ts
import { signal } from "@preact/signals";

export type View = "home" | "search" | "library" | "settings";
export const activeView = signal<View>("home");
```

- [ ] **Step 4: 写 `src/components/Icon.tsx`（内联 SVG 图标集）**

```tsx
interface IconProps {
  name: keyof typeof PATHS;
  size?: number;
}

// 24x24 线性图标，stroke 用 currentColor
const PATHS = {
  home: "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  search: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm5.2 11.7L20 20",
  library: "M5 4v16M10 4v16M15 5l4.5 14.5",
  settings:
    "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2-1.2L14.6 3h-4l-.4 2.7a7.6 7.6 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7.6 7.6 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z",
  play: "M8 5.5v13l11-6.5z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  "skip-back": "M18 5.5v13L8.5 12zM6 5v14",
  "skip-forward": "M6 5.5v13L15.5 12zM18 5v14",
  heart:
    "M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20z",
  "music-note": "M9 18.5V5l10-2v13.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  volume: "M4 9v6h3.5L12 19V5L7.5 9zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10",
  plus: "M12 5v14M5 12h14",
  minimize: "M5 12h14",
  maximize: "M5.5 5.5h13v13h-13z",
  close: "M6 6l12 12M18 6L6 18",
} as const;

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
```

（preact JSX 属性用小写 `stroke-width` 合法；若 tsc 报错改 `stroke-width` → `strokeWidth`。）

- [ ] **Step 5: 写 `src/components/TitleBar.tsx`（无边框窗口拖拽区 + 控制按钮）**

```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";

const appWindow = import.meta.env.MODE === "test" ? null : getCurrentWindow();

export function TitleBar() {
  return (
    <header class="titlebar" data-tauri-drag-region>
      <span class="titlebar-name" data-tauri-drag-region>Ome Music</span>
      <div class="titlebar-controls">
        <button
          class="titlebar-btn"
          aria-label="最小化"
          onClick={() => appWindow?.minimize()}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          class="titlebar-btn"
          aria-label="最大化"
          onClick={() => appWindow?.toggleMaximize()}
        >
          <Icon name="maximize" size={12} />
        </button>
        <button
          class="titlebar-btn titlebar-close"
          aria-label="关闭"
          onClick={() => appWindow?.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: 写 `src/components/Rail.tsx`（左侧图标导航栏）**

```tsx
import { activeView, type View } from "../state/app";
import { Icon } from "./Icon";

const ITEMS: Array<{ view: View; label: string; icon: keyof typeof ICONS }> = [
  { view: "home", label: "首页", icon: "home" },
  { view: "search", label: "搜索", icon: "search" },
  { view: "library", label: "曲库", icon: "library" },
  { view: "settings", label: "设置", icon: "settings" },
];

const ICONS = { home: 1, search: 1, library: 1, settings: 1 };

export function Rail() {
  return (
    <nav class="rail" aria-label="主导航">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          class={`rail-item ${activeView.value === item.view ? "is-active" : ""}`}
          aria-label={item.label}
          title={item.label}
          onClick={() => (activeView.value = item.view)}
        >
          <Icon name={item.icon} />
        </button>
      ))}
    </nav>
  );
}
```

（`ICONS` 仅为 `keyof` 推导的常量对象，等价于 `View` 的图标子集类型。）

- [ ] **Step 7: 写 `src/app.tsx`（外壳布局）**

```tsx
import type { ComponentChildren } from "preact";
import { activeView } from "./state/app";
import { Rail } from "./components/Rail";
import { TitleBar } from "./components/TitleBar";
import { HomeView } from "./views/Home";
import { SearchView } from "./views/Search";
import { LibraryView } from "./views/Library";
import { SettingsView } from "./views/Settings";
import { PlayerBar } from "./components/PlayerBar";

function ViewHost({ children }: { children: ComponentChildren }) {
  return <main class="view-host">{children}</main>;
}

export function App() {
  return (
    <div class="app-shell">
      <TitleBar />
      <div class="app-body">
        <Rail />
        <ViewHost>
          {activeView.value === "home" && <HomeView />}
          {activeView.value === "search" && <SearchView />}
          {activeView.value === "library" && <LibraryView />}
          {activeView.value === "settings" && <SettingsView />}
        </ViewHost>
      </div>
      <PlayerBar />
    </div>
  );
}
```

- [ ] **Step 8: 写占位视图（`src/views/Home.tsx` / `Search.tsx` / `Library.tsx` / `Settings.tsx`）**

```tsx
// src/views/Home.tsx — Plan 3 的 DJ 电台视图，先放沉静空态
import { Icon } from "../components/Icon";

export function HomeView() {
  return (
    <section class="view view-home">
      <div class="home-empty">
        <Icon name="music-note" size={44} />
        <h1>电台即将开播</h1>
        <p>先把你的音乐带进来吧</p>
      </div>
    </section>
  );
}
```

```tsx
// src/views/Search.tsx — Plan 2 接入 NetEase，先做本地过滤占位
export function SearchView() {
  return (
    <section class="view view-search">
      <h1 class="view-title">搜索</h1>
      <p class="view-hint">在线搜索将在后续版本启用</p>
    </section>
  );
}
```

```tsx
// src/views/Library.tsx — Task 5/7 实现，本任务先占位
export function LibraryView() {
  return (
    <section class="view view-library">
      <h1 class="view-title">曲库</h1>
    </section>
  );
}
```

```tsx
// src/views/Settings.tsx — Task 8 完善，本任务先占位
export function SettingsView() {
  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>
    </section>
  );
}
```

```tsx
// src/components/PlayerBar.tsx — Task 7 实现，本任务占位
export function PlayerBar() {
  return <footer class="player-bar" aria-label="播放条" />;
}
```

- [ ] **Step 9: 写 `src/main.tsx` 与 `src/styles/layout.css`**

```tsx
// src/main.tsx
import { render } from "preact";
import "./styles/theme.css";
import "./styles/layout.css";
import { App } from "./app";
import "./state/theme"; // 引入即生效：应用主题到 <html>

render(<App />, document.getElementById("app")!);
```

```css
/* src/styles/layout.css */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding-left: 16px;
  flex: none;
}

.titlebar-name { font-size: 12px; letter-spacing: 0.08em; color: var(--text-dim); }

.titlebar-controls { display: flex; height: 100%; }
.titlebar-btn {
  width: 44px; height: 100%;
  display: grid; place-items: center;
  color: var(--text-dim);
}
.titlebar-btn:hover { background: var(--accent-soft); color: var(--text); }
.titlebar-close:hover { background: #e5484d; color: #fff; }

.app-body { display: flex; flex: 1; min-height: 0; }

.rail {
  width: 64px;
  display: flex; flex-direction: column; align-items: center;
  gap: 6px;
  padding: 12px 0;
  flex: none;
}

.rail-item {
  width: 42px; height: 42px;
  display: grid; place-items: center;
  border-radius: 12px;
  color: var(--text-dim);
  transition: background 0.15s ease, color 0.15s ease;
}
.rail-item:hover { color: var(--text); background: var(--accent-soft); }
.rail-item.is-active { color: var(--accent); background: var(--accent-soft); }

.view-host { flex: 1; min-width: 0; overflow-y: auto; }

.view { padding: 24px 32px 48px; }
.view-title { font-size: 22px; font-weight: 600; margin-bottom: 16px; }
.view-hint { color: var(--text-dim); font-size: 14px; }

.view-home { height: 100%; display: grid; place-items: center; }
.home-empty { text-align: center; color: var(--text-dim); display: grid; gap: 12px; justify-items: center; }
.home-empty h1 { font-size: 20px; font-weight: 600; color: var(--text); letter-spacing: 0.04em; }

.player-bar { height: 72px; flex: none; border-top: 1px solid var(--border); background: var(--bg-elev); }
```

- [ ] **Step 10: 运行测试确认通过**

Run: `npm run test && npx tsc --noEmit`
Expected: 全部 PASS；注意 jsdom 下 `@tauri-apps/api/window` 导入即执行需防护——`import.meta.env.MODE === "test"` 分支已处理；若 vitest 仍解析 tauri api 失败，在 `vite.config.ts` `test` 里加 `server: { deps: { inline: [/@tauri-apps/] } }` 或将 `getCurrentWindow()` 调用包进惰性函数 `function win() { try { return getCurrentWindow(); } catch { return null; } }`（**采用惰性函数方案更稳**，直接按此实现 TitleBar）。

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(shell): app frame with titlebar, rail nav, view routing"
```

---

### Task 4: Rust 新骨架（删 QQ/sidecar，模块化起步）

**Files:**
- Delete: `src-tauri/src/qqmusic.rs`
- Replace: `src-tauri/src/lib.rs`（10600 行 → ~80 行装配）
- Create: `src-tauri/src/db.rs`、`src-tauri/src/db_test.rs`（或 `#[cfg(test)]` 模块）
- Modify: `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`
- Delete: `src-tauri/resources/node/`、`src-tauri/resources/netease-runtime/`（115MB sidecar；`resources/` 目录整个删除）

**Interfaces:**
- Produces: `db::open_db(path: &Path) -> Result<Connection>`、`db::run_migrations(conn: &Connection) -> Result<()>`、`AppState { db: Mutex<Connection> }`、命令 `get_app_version`。

- [ ] **Step 1: 删除旧 Rust 与 sidecar**

```bash
rm -rf src-tauri/src/qqmusic.rs src-tauri/resources
```

- [ ] **Step 2: 写失败测试（lib.rs 内 `#[cfg(test)] mod tests`）**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_tracks_table_and_are_idempotent() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::run_migrations(&conn).unwrap(); // 幂等
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tracks','playback_events','mood_entries','playlists')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 4);
    }
}
```

- [ ] **Step 3: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 编译失败（`db` 模块不存在）。

- [ ] **Step 4: 写 `src-tauri/src/db.rs`**

```rust
use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_initial_schema.sql"),
    include_str!("../migrations/002_mood_note_rename_and_indexes.sql"),
    include_str!("../migrations/003_authorized_music_directories.sql"),
];

pub fn open_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
             version INTEGER PRIMARY KEY,
             applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )?;
    let current: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    for (index, script) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        if version > current {
            conn.execute_batch(script)?;
            conn.execute("INSERT INTO schema_migrations (version) VALUES (?1)", [version])?;
        }
    }
    Ok(())
}
```

- [ ] **Step 5: 写新 `src-tauri/src/lib.rs`（装配）**

```rust
mod db;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[tauri::command]
fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open_db(&data_dir.join("ome-music.db"))
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            db::run_migrations(&conn)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_app_version])
        .run(tauri::generate_context!())
        .expect("error while running ome music");
}
```

（`main.rs` 保持 `fn main() { ome_music_player_lib::run() }` 不动；旧 lib.rs 里被删的命令如被 `generate_handler` 引用会编译错——本任务同时删除所有旧命令，只留 `get_app_version`。）

- [ ] **Step 6: 精简 `src-tauri/Cargo.toml`**

```toml
[package]
name = "ome-music-player"
version = "0.4.0"
description = "Local-first private music player desktop app"
authors = ["Ome"]
license = "MIT"
edition = "2021"

[lib]
name = "ome_music_player_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
rusqlite = { version = "0.32", features = ["bundled"] }
walkdir = "2"
lofty = "0.24"
base64 = "0.22"
md5 = "0.7"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "gzip", "brotli", "deflate"] }
tokio = { version = "1", features = ["time", "sync"] }

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
strip = true
opt-level = "z"
```

删除的依赖（后续计划按需加回）：`urlencoding`、`flate2`、`sha1`、`keyring`（Plan 2 加回）、`webview2-com`、`windows`、`multipart` feature。`tauri` features 移除 `protocol-asset`（本地播放改走 ome-media 自协议，不再用 asset 协议）。

- [ ] **Step 7: 更新 `src-tauri/tauri.conf.json`（跟随系统主题 + 移除 resources + 版本）**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Ome Music",
  "version": "0.4.0",
  "identifier": "com.ome.music",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Ome Music",
        "width": 1180,
        "height": 740,
        "minWidth": 960,
        "minHeight": 620,
        "transparent": true,
        "decorations": false,
        "shadow": true,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://ome-media.localhost ome-media: https:; media-src 'self' data: blob: http://ome-media.localhost ome-media: https:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:* https:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/icon.png", "icons/icon.ico"],
    "windows": {
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "displayLanguageSelector": false,
        "installerHooks": "nsis-hooks.nsh"
      },
      "webviewInstallMode": { "type": "downloadBootstrapper", "silent": true }
    }
  }
}
```

变更：删 `"theme": "Light"`（跟随系统）、删 `bundle.resources`、删 assetProtocol（不再使用）、CSP 去掉 asset.localhost、`beforeBuildCommand` 改 `npm run build`（`build:tauri` 脚本随 sidecar 一起消亡）。

- [ ] **Step 8: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
Expected: 测试 PASS、clippy 零警告。

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor(tauri): modular skeleton, drop qqmusic + node sidecar, follow-system theme"
```

---

### Task 5: library.rs — 本地扫描与曲库命令

**Files:**
- Create: `src-tauri/src/library.rs`
- Modify: `src-tauri/src/lib.rs`（注册模块与命令）

**Interfaces:**
- Consumes: `db::run_migrations`、`AppState`。
- Produces（前端 invoke 契约，后续任务/计划依赖，命名必须一致）:
  - `list_tracks() -> Vec<TrackDto>`
  - `import_music_folder() -> ImportResultDto { added: i64, updated: i64, total: i64 }`
  - `set_track_liked(id: String, liked: bool) -> ()`
  - `record_playback_event(track_id: String, event_type: String, position_seconds: i64) -> ()`
  - `TrackDto { id, title, artist, album, durationSeconds, filePath, source, sourceId, unavailableReason, coverPath, liked, playCount }`（serde camelCase）

- [ ] **Step 1: 写失败测试（library.rs 内 `#[cfg(test)]`，纯 SQL 层）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn insert_and_load_track_roundtrip() {
        let conn = memory_db();
        let track = NewTrack {
            title: "夜曲".into(),
            artist: "周杰伦".into(),
            album: "十一月的萧邦".into(),
            duration_seconds: 226,
            file_path: "C:\\music\\夜曲.flac".into(),
            cover_path: None,
        };
        insert_track(&conn, &track).unwrap();
        let tracks = load_tracks(&conn).unwrap();
        assert_eq!(tracks.len(), 1);
        let loaded = &tracks[0];
        assert_eq!(loaded.title, "夜曲");
        assert_eq!(loaded.artist, "周杰伦");
        assert_eq!(loaded.duration_seconds, 226);
        assert!(!loaded.liked);
        // 同路径再插入 → 更新不重复
        insert_track(&conn, &track).unwrap();
        assert_eq!(load_tracks(&conn).unwrap().len(), 1);
    }

    #[test]
    fn set_liked_persists() {
        let conn = memory_db();
        let track = NewTrack { title: "a".into(), artist: "b".into(), album: String::new(), duration_seconds: 1, file_path: "p".into(), cover_path: None };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        set_track_liked(&conn, &id, true).unwrap();
        assert!(load_tracks(&conn).unwrap()[0].liked);
    }

    #[test]
    fn playback_event_rejects_unknown_type() {
        let conn = memory_db();
        let track = NewTrack { title: "a".into(), artist: "b".into(), album: String::new(), duration_seconds: 1, file_path: "p".into(), cover_path: None };
        insert_track(&conn, &track).unwrap();
        let id = load_tracks(&conn).unwrap()[0].id.clone();
        assert!(record_playback_event(&conn, &id, "play", 0).is_ok());
        assert!(record_playback_event(&conn, &id, "explode", 0).is_err());
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 编译失败（library 模块不存在）。

- [ ] **Step 3: 写 `src-tauri/src/library.rs`（纯 SQL 函数 + 命令包装分离）**

```rust
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "ogg", "opus", "aac"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub source: String,
    pub source_id: Option<String>,
    pub unavailable_reason: Option<String>,
    pub cover_path: Option<String>,
    pub liked: bool,
    pub play_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDto {
    pub added: i64,
    pub updated: i64,
    pub total: i64,
}

pub struct NewTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: i64,
    pub file_path: String,
    pub cover_path: Option<String>,
}

fn track_id_for_path(path: &str) -> String {
    format!("{:x}", md5::compute(path.as_bytes()))
}

pub fn insert_track(conn: &Connection, track: &NewTrack) -> Result<(), rusqlite::Error> {
    let id = track_id_for_path(&track.file_path);
    conn.execute(
        "INSERT INTO tracks (id, title, artist, album_id, duration_seconds, file_path, source, cover_path)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'local', ?6)
         ON CONFLICT(file_path) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            duration_seconds = excluded.duration_seconds,
            cover_path = excluded.cover_path,
            updated_at = CURRENT_TIMESTAMP",
        params![id, track.title, track.artist, track.duration_seconds, track.file_path, track.cover_path],
    )?;
    Ok(())
}

fn row_to_track(row: &rusqlite::Row<'_>) -> Result<TrackDto, rusqlite::Error> {
    Ok(TrackDto {
        id: row.get("id")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get::<_, Option<String>>("album")?.unwrap_or_default(),
        duration_seconds: row.get("duration_seconds")?,
        file_path: row.get("file_path")?,
        source: row.get("source")?,
        source_id: row.get("source_id")?,
        unavailable_reason: row.get("unavailable_reason")?,
        cover_path: row.get("cover_path")?,
        liked: row.get::<_, i64>("liked")? != 0,
        play_count: row.get("play_count")?,
    })
}

pub fn load_tracks(conn: &Connection) -> Result<Vec<TrackDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, t.artist, a.title AS album, t.duration_seconds, t.file_path,
                t.source, t.source_id, t.unavailable_reason, t.cover_path, t.liked, t.play_count
         FROM tracks t LEFT JOIN albums a ON t.album_id = a.id
         ORDER BY t.title COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], row_to_track)?;
    rows.collect()
}

pub fn set_track_liked(conn: &Connection, id: &str, liked: bool) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE tracks SET liked = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, liked as i64],
    )?;
    Ok(())
}

pub fn record_playback_event(
    conn: &Connection,
    track_id: &str,
    event_type: &str,
    position_seconds: i64,
) -> Result<(), String> {
    const ALLOWED: &[&str] = &["play", "pause", "skip", "completed", "liked", "unliked", "replayed"];
    if !ALLOWED.contains(&event_type) {
        return Err(format!("Unknown playback event type: {event_type}"));
    }
    conn.execute(
        "INSERT INTO playback_events (id, track_id, event_type, position_seconds) VALUES (?1, ?2, ?3, ?4)",
        params![format!("{:x}", md5::compute(format!("{track_id}{event_type}{std::time::SystemTime::now():?}"))), track_id, event_type, position_seconds],
    )
    .map_err(|error| error.to_string())?;
    if event_type == "play" {
        let _ = conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            params![track_id],
        );
    }
    Ok(())
}

fn read_track_metadata(path: &Path) -> Option<NewTrack> {
    let file_path = path.to_string_lossy().to_string();
    let tagged = lofty::read_from_path(path).ok();
    let properties = tagged.as_ref().map(|tagged| tagged.properties());
    let duration_seconds = properties
        .map(|properties| properties.duration().as_secs() as i64)
        .unwrap_or(0);
    let tag = tagged.as_ref().and_then(|tagged| tagged.primary_tag()).or_else(|| tagged.as_ref().and_then(|tagged| tagged.first_tag()));
    let fallback_title = path.file_stem()?.to_string_lossy().to_string();
    Some(NewTrack {
        title: tag
            .and_then(|tag| tag.title().map(|value| value.to_string()))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(fallback_title),
        artist: tag
            .and_then(|tag| tag.artist().map(|value| value.to_string()))
            .unwrap_or_else(|| "未知艺人".into()),
        album: tag
            .and_then(|tag| tag.album().map(|value| value.to_string()))
            .unwrap_or_default(),
        duration_seconds,
        file_path,
        cover_path: None,
    })
}

fn is_authorized(conn: &Connection, path: &Path) -> Result<bool, rusqlite::Error> {
    let path_text = path.to_string_lossy();
    let prefix: Option<String> = conn
        .query_row(
            "SELECT path FROM authorized_music_directories WHERE ?1 LIKE path || '%'
             ORDER BY LENGTH(path) DESC LIMIT 1",
            params![path_text],
            |row| row.get(0),
        )
        .optional()?;
    Ok(prefix.is_some())
}

#[tauri::command]
pub async fn import_music_folder(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ImportResultDto, String> {
    let folder = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .add_filter("音频", &AUDIO_EXTENSIONS)
        .blocking_pick_folder()
        .ok_or("未选择文件夹")?
        .into_path()
        .map_err(|error| error.to_string())?;

    let folder_text = folder.to_string_lossy().to_string();
    {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO authorized_music_directories (path) VALUES (?1)",
            params![folder_text],
        )
        .map_err(|error| error.to_string())?;
    }

    let app_cache = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    let covers_dir = app_cache.join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|error| error.to_string())?;

    // 阻塞扫描放到独立线程，避免卡 UI
    let state_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ome-music.db");
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<ImportResultDto, String> {
        let conn = crate::db::open_db(&state_path).map_err(|error| error.to_string())?;
        let mut added = 0i64;
        let mut updated = 0i64;
        for entry in WalkDir::new(&folder).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() { continue; }
            let ext_ok = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
                .unwrap_or(false);
            if !ext_ok { continue; }
            if !is_authorized(&conn, path).map_err(|error| error.to_string())? { continue; }
            let existed: i64 = conn
                .query_row("SELECT COUNT(*) FROM tracks WHERE file_path = ?1", params![path.to_string_lossy()], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            let mut track = read_track_metadata(path).ok_or_else(|| format!("无法读取: {}", path.display()))?;
            track.cover_path = extract_cover(&conn, &covers_dir, path, &track)?;
            insert_track(&conn, &track).map_err(|error| error.to_string())?;
            if existed > 0 { updated += 1; } else { added += 1; }
        }
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        Ok(ImportResultDto { added, updated, total })
    })
    .await
    .map_err(|error| error.to_string())??;

    Ok(result)
}

fn extract_cover(
    conn: &Connection,
    covers_dir: &Path,
    path: &Path,
    track: &NewTrack,
) -> Result<Option<String>, String> {
    let tagged = match lofty::read_from_path(path) {
        Ok(tagged) => tagged,
        Err(_) => return Ok(None),
    };
    let picture = tagged
        .primary_tag()
        .and_then(|tag| tag.pictures().first())
        .or_else(|| tagged.first_tag().and_then(|tag| tag.pictures().first()));
    let picture = match picture {
        Some(picture) => picture,
        None => return Ok(None),
    };
    let extension = match picture.mime_type() {
        lofty::picture::MimeType::Png => "png",
        _ => "jpg",
    };
    let cover_path = covers_dir.join(format!("{}.{}", track_id_for_path(&track.file_path), extension));
    if !cover_path.exists() {
        std::fs::write(&cover_path, picture.data()).map_err(|error| error.to_string())?;
    }
    Ok(Some(cover_path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_tracks(state: State<'_, AppState>) -> Result<Vec<TrackDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_tracks(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_track_liked_command(state: State<'_, AppState>, id: String, liked: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    set_track_liked(&conn, &id, liked).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_playback_event_command(
    state: State<'_, AppState>,
    track_id: String,
    event_type: String,
    position_seconds: i64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    record_playback_event(&conn, &track_id, &event_type, position_seconds)
}
```

注意：`authorized_music_directories` 表结构与 003 迁移的实际列名可能不同（迁移文件里叫 `path` 或别的）——**实现前先 `cat src-tauri/migrations/003_authorized_music_directories.sql` 核对列名**，按实际列名写 SQL；若该表结构复杂（带 granted_at 等），`INSERT OR IGNORE` 只填 path 列即可。

- [ ] **Step 4: lib.rs 注册（diff）**

```rust
mod db;
mod library;   // 新增

// invoke_handler 改为：
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            library::list_tracks,
            library::import_music_folder,
            library::set_track_liked_command,
            library::record_playback_event_command,
        ])
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
Expected: 全 PASS、零警告。lofty 0.24 API 若与上述签名有出入（如 `read_from_path` → `Probe`），以 `cargo doc --manifest-path src-tauri/Cargo.toml --open` 或 crate 源码为准修正调用，不改测试断言。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(library): local scan, tags, covers, playback events via rusqlite"
```

---

### Task 6: media.rs — ome-media 协议代理（Range 支持）

**Files:**
- Create: `src-tauri/src/media.rs`
- Modify: `src-tauri/src/lib.rs`（注册协议）

**Interfaces:**
- Produces: URI `http://ome-media.localhost/local?p=<encodeURIComponent(absPath)>`（Windows WebView2 形式）；`media::parse_range(header: Option<&str>, size: u64) -> Option<(u64, u64)>`；`media::content_type_for(ext: &str) -> &'static str`。

- [ ] **Step 1: 写失败测试（media.rs 内 `#[cfg(test)]`）**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_range_full_suffix() {
        assert_eq!(parse_range(Some("bytes=0-"), 100), Some((0, 99)));
        assert_eq!(parse_range(Some("bytes=10-"), 100), Some((10, 99)));
    }

    #[test]
    fn parse_range_explicit_end_clamps_to_size() {
        assert_eq!(parse_range(Some("bytes=0-49"), 100), Some((0, 49)));
        assert_eq!(parse_range(Some("bytes=90-999"), 100), Some((90, 99)));
    }

    #[test]
    fn parse_range_invalid() {
        assert_eq!(parse_range(None, 100), None);
        assert_eq!(parse_range(Some("bytes=200-300"), 100), None);
        assert_eq!(parse_range(Some("apples"), 100), None);
    }

    #[test]
    fn content_type_by_extension() {
        assert_eq!(content_type_for("mp3"), "audio/mpeg");
        assert_eq!(content_type_for("FLAC"), "audio/flac");
        assert_eq!(content_type_for("xyz"), "application/octet-stream");
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 编译失败（media 模块不存在）。

- [ ] **Step 3: 写 `src-tauri/src/media.rs`**

```rust
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::http::{header::CONTENT_RANGE, HeaderMap, HeaderValue, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};

pub fn parse_range(header: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let header = header?;
    let spec = header.strip_prefix("bytes=")?;
    let (start_raw, end_raw) = spec.split_once('-')?;
    let start: u64 = start_raw.trim().parse().ok()?;
    if start >= size {
        return None;
    }
    let end: u64 = if end_raw.trim().is_empty() {
        size - 1
    } else {
        end_raw.trim().parse().ok()?.min(size - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

pub fn content_type_for(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "m4a" | "aac" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn serve_file(path: PathBuf, range_header: Option<String>) -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
    let mut file = std::fs::File::open(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file.metadata().map_err(|_| StatusCode::NOT_FOUND)?.len();
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("");
    let content_type = content_type_for(ext);

    if let Some((start, end)) = parse_range(range_header.as_deref(), size) {
        let length = end - start + 1;
        let mut buffer = vec![0u8; length as usize];
        file.seek(SeekFrom::Start(start)).map_err(|_| StatusCode::BAD_REQUEST)?;
        file.read_exact(&mut buffer).map_err(|_| StatusCode::BAD_REQUEST)?;
        tauri::http::Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Type", content_type)
            .header("Accept-Ranges", "bytes")
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
            .header("Content-Length", length)
            .body(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        tauri::http::Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", content_type)
            .header("Accept-Ranges", "bytes")
            .header("Content-Length", size)
            .body(buffer)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

pub fn register(
    context: UriSchemeContext<'_, '_>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let uri = request.uri().to_string();
    // 形如 http://ome-media.localhost/local?p=%2FD%3A%2Fmusic%2Fa.mp3 （或 ome-media://local?p=...）
    let handled = (|| -> Result<tauri::http::Response<Vec<u8>>, StatusCode> {
        let query = uri.split_once('?').map(|(_, query)| query).unwrap_or("");
        let mut p = None;
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            if parts.next() == Some("p") {
                p = parts.next().map(percent_decode);
            }
        }
        let path = p.ok_or(StatusCode::BAD_REQUEST)?;
        if !std::path::Path::new(&path).is_absolute() {
            return Err(StatusCode::BAD_REQUEST);
        }
        serve_file(PathBuf::from(path), header_value(&request, "range"))
    })();
    responder.respond(match handled {
        Ok(response) => response,
        Err(status) => tauri::http::Response::builder()
            .status(status)
            .body(Vec::new())
            .unwrap(),
    });
}

fn header_value(request: &tauri::http::Request<Vec<u8>>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}

fn percent_decode(input: &str) -> String {
    let mut output = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() + 1 && index + 2 < bytes.len() + 1 {
            let hex = &input[index + 1..index + 3];
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                output.push(byte);
                index += 3;
                continue;
            }
        }
        if bytes[index] == b'+' {
            output.push(b' ');
        } else {
            output.push(bytes[index]);
        }
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

#[allow(unused)]
fn _header_map_helper() -> HeaderMap {
    HeaderMap::new()
}
```

实现注意：
- 请求头实际是小写 `range`；`HeaderMap::get` 大小写不敏感（http crate 内部规范化），两种写法均可。
- `percent_decode` 若嫌手写易错，可在 Cargo.toml 加回 `urlencoding = "2"`（Tiny，允许）并使用 `urlencoding::decode`。**推荐加回 urlencoding，删掉手写实现。**
- 协议回调签名以当前 tauri 2 版本为准：`register_uri_scheme_protocol("ome-media", |ctx, request| ...)` 返回 `http::Response<Vec<u8>>`；若签名带 `UriSchemeResponder`（流式 API），按编译器提示适配。**先写出 `tauri::protocol::UriSchemeResponder` 编译不过时的最小形态：闭包直接返回 `Response<Vec<u8>>`**，删掉 responder 参数。

- [ ] **Step 4: lib.rs 注册协议（diff）**

```rust
mod media;   // 新增

// Builder 链上新增：
        .register_uri_scheme_protocol("ome-media", media::register)
```

若闭包签名不带 responder，则改为：

```rust
        .register_uri_scheme_protocol("ome-media", |context, request| media::handle(request))
```

并把 `media::register` 改名 `media::handle(request) -> http::Response<Vec<u8>>`。以能编译的形态为准，两形态逻辑一致。

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
Expected: PASS、零警告。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(media): ome-media protocol with range streaming for local files"
```

---

### Task 7: 播放引擎 + 曲库视图

**Files:**
- Create: `src/lib/api.ts`、`src/lib/audio.ts`、`src/state/player.ts`、`src/state/player.test.ts`、`src/views/Library.tsx`（覆盖占位）、`src/components/PlayerBar.tsx`（覆盖占位）、`src/components/TrackList.tsx`
- Modify: `src/styles/layout.css`（追加曲库/播放条样式）

**Interfaces:**
- Consumes: Task 5 的四个命令、Task 6 的 `ome-media` URL。
- Produces: `playTracks(tracks: Track[], start?: number)`、`togglePlayback()`、`next(manual: boolean)`、`previous()`、`seek(sec: number)`、`setVolume(v: number)`、signals：`queue/currentIndex/isPlaying/position/duration/volume/currentTrack`；`endEventType(positionSec: number, durationSec: number): "completed" | "skip"`。

- [ ] **Step 1: 写失败测试 `src/state/player.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { advance, endEventType } from "./player";

describe("endEventType", () => {
  it("播过 90% 以上算 completed", () => {
    expect(endEventType(200, 220)).toBe("completed");
    expect(endEventType(198, 220)).toBe("skip");
  });
  it("时长未知时不判 completed", () => {
    expect(endEventType(100, 0)).toBe("skip");
  });
});

describe("advance", () => {
  const queue = [1, 2, 3] as const;
  it("中间前进", () => {
    expect(advance(0, queue.length)).toBe(1);
    expect(advance(1, queue.length)).toBe(2);
  });
  it("末尾结束播放（返回 null）", () => {
    expect(advance(2, queue.length)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test`
Expected: FAIL — `Cannot find module './player'`

- [ ] **Step 3: 写 `src/lib/api.ts`（后端契约层）**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types/music";

export const isTauriRuntime = (): boolean => "__TAURI_INTERNALS__" in window;

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
}

export const getAppVersion = () => invoke<string>("get_app_version");
export const listTracks = () => invoke<Track[]>("list_tracks");
export const importMusicFolder = () => invoke<ImportResult>("import_music_folder");
export const setTrackLiked = (id: string, liked: boolean) =>
  invoke<void>("set_track_liked_command", { id, liked });
export const recordPlaybackEvent = (
  trackId: string,
  eventType: "play" | "skip" | "completed",
  positionSeconds: number
) => invoke<void>("record_playback_event_command", { trackId, eventType, positionSeconds });
```

- [ ] **Step 4: 写 `src/types/music.ts`（精简版 Track）**

```ts
export type MusicSource = "local" | "netease" | "bilibili";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  filePath: string;
  source: MusicSource;
  sourceId?: string | null;
  unavailableReason?: string | null;
  coverPath?: string | null;
  liked: boolean;
  playCount: number;
}
```

- [ ] **Step 5: 写 `src/lib/audio.ts`（可播放 URL 解析）**

```ts
import type { Track } from "../types/music";
import { isTauriRuntime } from "./api";

export function toPlayableSrc(track: Track): string {
  if (track.filePath.startsWith("unavailable:")) return "";
  if (/^https?:\/\//i.test(track.filePath)) return track.filePath;
  if (!isTauriRuntime()) return track.filePath;
  return `http://ome-media.localhost/local?p=${encodeURIComponent(track.filePath)}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 6: 写 `src/state/player.ts`（引擎：纯逻辑 + audio 副作用分离）**

```ts
import { computed, signal } from "@preact/signals";
import type { Track } from "../types/music";
import { recordPlaybackEvent } from "../lib/api";
import { toPlayableSrc } from "../lib/audio";

export const queue = signal<Track[]>([]);
export const currentIndex = signal(-1);
export const isPlaying = signal(false);
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.9);

export const currentTrack = computed<Track | null>(
  () => queue.value[currentIndex.value] ?? null
);

let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.volume = volume.value;
  audio.addEventListener("timeupdate", () => {
    position.value = audio?.currentTime ?? 0;
  });
  audio.addEventListener("durationchange", () => {
    duration.value = Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0;
  });
  audio.addEventListener("play", () => (isPlaying.value = true));
  audio.addEventListener("pause", () => (isPlaying.value = false));
  audio.addEventListener("ended", () => onEnded());
  return audio;
}

/** 纯逻辑：是否算完整听完 */
export function endEventType(positionSec: number, durationSec: number): "completed" | "skip" {
  if (durationSec > 0 && positionSec >= durationSec * 0.9) return "completed";
  return "skip";
}

/** 纯逻辑：下一个索引；末尾返回 null */
export function advance(index: number, length: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

function onEnded() {
  const track = currentTrack.value;
  if (track) {
    void recordPlaybackEvent(track.id, endEventType(position.value, duration.value), Math.round(position.value));
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    isPlaying.value = false;
    position.value = 0;
    return;
  }
  playAt(nextIndex);
}

export function playTracks(tracks: Track[], start = 0) {
  queue.value = tracks;
  playAt(start);
}

export function playAt(index: number) {
  const track = queue.value[index];
  if (!track) return;
  currentIndex.value = index;
  position.value = 0;
  duration.value = track.durationSeconds;
  const element = ensureAudio();
  element.src = toPlayableSrc(track);
  void element.play().catch(() => {
    isPlaying.value = false;
  });
  void recordPlaybackEvent(track.id, "play", 0);
}

export function togglePlayback() {
  const element = ensureAudio();
  if (!element.src) {
    if (queue.value.length > 0) playAt(Math.max(currentIndex.value, 0));
    return;
  }
  if (element.paused) void element.play();
  else element.pause();
}

export function next(manual: boolean) {
  const track = currentTrack.value;
  if (manual && track) {
    void recordPlaybackEvent(track.id, "skip", Math.round(position.value));
  }
  const nextIndex = advance(currentIndex.value, queue.value.length);
  if (nextIndex === null) {
    ensureAudio().pause();
    return;
  }
  playAt(nextIndex);
}

export function previous() {
  if (position.value > 3) {
    seek(0);
    return;
  }
  const prevIndex = currentIndex.value - 1;
  if (prevIndex >= 0) playAt(prevIndex);
  else seek(0);
}

export function seek(seconds: number) {
  const element = ensureAudio();
  element.currentTime = seconds;
  position.value = seconds;
}

export function setVolume(value: number) {
  volume.value = Math.min(1, Math.max(0, value));
  ensureAudio().volume = volume.value;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test`
Expected: PASS。

- [ ] **Step 8: 写 `src/components/TrackList.tsx` + `src/views/Library.tsx`**

```tsx
// src/components/TrackList.tsx
import type { Track } from "../types/music";
import { formatDuration } from "../lib/audio";
import { Icon } from "./Icon";

interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  onPlay: (index: number) => void;
  onToggleLike: (track: Track) => void;
}

export function TrackList({ tracks, currentIndex, onPlay, onToggleLike }: TrackListProps) {
  return (
    <ul class="track-list" role="list">
      {tracks.map((track, index) => (
        <li
          key={track.id}
          class={`track-row ${index === currentIndex ? "is-current" : ""}`}
          onDblClick={() => onPlay(index)}
        >
          <button class="track-play" aria-label={`播放 ${track.title}`} onClick={() => onPlay(index)}>
            <Icon name="play" size={14} />
          </button>
          <div class="track-meta" onClick={() => onPlay(index)}>
            <span class="track-title">{track.title}</span>
            <span class="track-artist">{track.artist}</span>
          </div>
          <span class="track-duration">{formatDuration(track.durationSeconds)}</span>
          <button
            class={`track-like ${track.liked ? "is-liked" : ""}`}
            aria-label={track.liked ? "取消红心" : "红心"}
            onClick={() => onToggleLike(track)}
          >
            <Icon name="heart" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/views/Library.tsx
import { useEffect, useState } from "preact/hooks";
import { importMusicFolder, listTracks, setTrackLiked, type ImportResult } from "../lib/api";
import type { Track } from "../types/music";
import { playTracks, currentIndex, toggleLiked, tracks as libraryTracks } from "../state/library";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

export function LibraryView() {
  // 状态与加载逻辑在 src/state/library.ts（下一步）
  return null; // 由下一步实现替换
}
```

写 `src/state/library.ts`（视图状态与后端同步）：

```ts
import { signal } from "@preact/signals";
import { importMusicFolder, listTracks, setTrackLiked } from "../lib/api";
import type { Track } from "../types/music";
import { playTracks } from "./player";

export const tracks = signal<Track[]>([]);
export const currentIndex = signal(-1);
export const importing = signal(false);
export const importNotice = signal<string | null>(null);

export async function refreshTracks(): Promise<void> {
  tracks.value = await listTracks();
}

export async function importFolder(): Promise<void> {
  importing.value = true;
  importNotice.value = null;
  try {
    const result: Awaited<ReturnType<typeof importMusicFolder>> = await importMusicFolder();
    importNotice.value = `新增 ${result.added} 首，更新 ${result.updated} 首，共 ${result.total} 首`;
    await refreshTracks();
  } catch (error) {
    importNotice.value = error instanceof Error ? error.message : String(error);
  } finally {
    importing.value = false;
  }
}

export function playFromLibrary(index: number): void {
  currentIndex.value = index;
  playTracks(tracks.value, index);
}

export async function toggleLiked(track: Track): Promise<void> {
  const nextLiked = !track.liked;
  tracks.value = tracks.value.map((item) =>
    item.id === track.id ? { ...item, liked: nextLiked } : item
  );
  try {
    await setTrackLiked(track.id, nextLiked);
  } catch {
    tracks.value = tracks.value.map((item) =>
      item.id === track.id ? { ...item, liked: track.liked } : item
    );
  }
}
```

真正的 `src/views/Library.tsx`：

```tsx
import { useEffect } from "preact/hooks";
import {
  importFolder,
  importing,
  importNotice,
  playFromLibrary,
  refreshTracks,
  toggleLiked,
  tracks,
  currentIndex,
} from "../state/library";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

export function LibraryView() {
  useEffect(() => {
    void refreshTracks();
  }, []);

  return (
    <section class="view view-library">
      <div class="view-head">
        <h1 class="view-title">曲库</h1>
        <button class="btn-primary" disabled={importing.value} onClick={() => void importFolder()}>
          <Icon name="plus" size={16} />
          {importing.value ? "正在导入…" : "导入音乐文件夹"}
        </button>
      </div>
      {importNotice.value && <p class="view-hint">{importNotice.value}</p>}
      {tracks.value.length === 0 ? (
        <div class="library-empty">
          <Icon name="library" size={40} />
          <p>曲库还是空的</p>
          <p class="view-hint">点击右上角导入你的音乐文件夹</p>
        </div>
      ) : (
        <TrackList
          tracks={tracks.value}
          currentIndex={currentIndex.value}
          onPlay={playFromLibrary}
          onToggleLike={(track) => void toggleLiked(track)}
        />
      )}
    </section>
  );
}
```

（删除 Task 7 起草时产生的 `src/state/player.test.ts` 之外的多余导入——以 `tsc --noEmit` 零错误为准。`views/Library.tsx` 中不要从 `state/player` 导入 `currentIndex`，统一用 `state/library` 的。）

- [ ] **Step 9: 写 `src/components/PlayerBar.tsx`（覆盖占位）**

```tsx
import { currentTrack, duration, isPlaying, next, position, previous, seek, setVolume, togglePlayback, volume } from "../state/player";
import { formatDuration } from "../lib/audio";
import { Icon } from "./Icon";

export function PlayerBar() {
  const track = currentTrack.value;
  return (
    <footer class="player-bar" aria-label="播放条">
      <div class="player-info">
        {track ? (
          <>
            {track.coverPath ? (
              <img class="player-cover" src={track.coverPath} alt="" />
            ) : (
              <div class="player-cover player-cover-empty">
                <Icon name="music-note" size={18} />
              </div>
            )}
            <div class="player-text">
              <span class="player-title">{track.title}</span>
              <span class="player-artist">{track.artist}</span>
            </div>
          </>
        ) : (
          <div class="player-text">
            <span class="player-title player-title-idle">没有在播放</span>
          </div>
        )}
      </div>

      <div class="player-center">
        <div class="player-buttons">
          <button aria-label="上一首" onClick={() => previous()}>
            <Icon name="skip-back" size={18} />
          </button>
          <button class="player-toggle" aria-label={isPlaying.value ? "暂停" : "播放"} onClick={togglePlayback}>
            <Icon name={isPlaying.value ? "pause" : "play"} size={20} />
          </button>
          <button aria-label="下一首" onClick={() => next(true)}>
            <Icon name="skip-forward" size={18} />
          </button>
        </div>
        <div class="player-progress">
          <span class="player-time">{formatDuration(position.value)}</span>
          <input
            class="slider"
            type="range"
            min={0}
            max={Math.max(duration.value, 1)}
            step={1}
            value={Math.min(position.value, duration.value || 0)}
            aria-label="播放进度"
            onInput={(event) => seek(Number((event.target as HTMLInputElement).value))}
          />
          <span class="player-time">{formatDuration(duration.value)}</span>
        </div>
      </div>

      <div class="player-volume">
        <Icon name="volume" size={16} />
        <input
          class="slider slider-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume.value}
          aria-label="音量"
          onInput={(event) => setVolume(Number((event.target as HTMLInputElement).value))}
        />
      </div>
    </footer>
  );
}
```

封面用 `convertFileSrc`：在 `api.ts` 增加 `coverUrl(path?: string | null): string { return path && isTauriRuntime() ? convertFileSrc(path) : path ?? ""; }`，PlayerBar 的 `img src` 用 `coverUrl(track.coverPath)`。同时 `img-src` CSP 需包含 `asset:`/`asset.localhost` —— 因为封面走了 tauri asset 协议，而我们在 Task 4 移除了 `protocol-asset` feature！**决策：封面同样走 ome-media 代理**：`coverUrl(path)` 返回 `http://ome-media.localhost/local?p=<encoded>`（同一 handler 已支持 png/jpg content-type），零新协议。按此实现。

- [ ] **Step 10: layout.css 追加样式**

```css
/* 曲库 */
.view-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: 999px;
  background: var(--accent); color: #fff; font-size: 13px; font-weight: 500;
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-primary:not(:disabled):hover { filter: brightness(1.05); }

.library-empty { display: grid; place-items: center; gap: 10px; padding: 80px 0; color: var(--text-dim); text-align: center; }

.track-list { list-style: none; display: grid; gap: 2px; }
.track-row {
  display: grid;
  grid-template-columns: 36px 1fr auto 36px;
  align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 10px;
}
.track-row:hover { background: var(--accent-soft); }
.track-row.is-current .track-title { color: var(--accent); }
.track-play { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--text-dim); opacity: 0; }
.track-row:hover .track-play, .track-row.is-current .track-play { opacity: 1; }
.track-meta { display: grid; gap: 2px; min-width: 0; cursor: default; }
.track-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track-artist { font-size: 12px; color: var(--text-dim); }
.track-duration { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.track-like { display: grid; place-items: center; width: 28px; height: 28px; color: var(--text-dim); }
.track-like.is-liked { color: var(--accent); }
.track-like.is-liked svg { fill: currentColor; }

/* 播放条 */
.player-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 0 20px; }
.player-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
.player-cover { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background: var(--accent-soft); }
.player-cover-empty { display: grid; place-items: center; color: var(--text-dim); }
.player-text { display: grid; gap: 2px; min-width: 0; }
.player-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.player-title-idle { color: var(--text-dim); font-weight: 400; }
.player-artist { font-size: 12px; color: var(--text-dim); }

.player-center { display: grid; gap: 6px; justify-items: center; width: min(480px, 40vw); }
.player-buttons { display: flex; align-items: center; gap: 18px; }
.player-buttons button { color: var(--text-dim); display: grid; place-items: center; }
.player-buttons button:hover { color: var(--text); }
.player-toggle {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--text); color: var(--bg) !important;
  display: grid; place-items: center;
}
.player-toggle:hover { filter: brightness(1.1); }
.player-progress { display: flex; align-items: center; gap: 10px; width: 100%; }
.player-time { font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums; }

.player-volume { display: flex; align-items: center; gap: 8px; justify-content: flex-end; color: var(--text-dim); }

.slider {
  -webkit-appearance: none; appearance: none;
  height: 4px; border-radius: 2px;
  background: var(--border);
  flex: 1; min-width: 0; cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--accent);
  opacity: 0; transition: opacity 0.15s ease;
}
.slider:hover::-webkit-slider-thumb, .slider:active::-webkit-slider-thumb { opacity: 1; }
.slider-volume { max-width: 100px; }
```

- [ ] **Step 11: 全部验证**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: 全绿。

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(player): local playback engine, library view, player bar"
```

---

### Task 8: Settings（主题/版本）+ Home 视图打磨

**Files:**
- Modify: `src/views/Settings.tsx`（覆盖占位）、`src/views/Home.tsx`（打磨空态视觉）、`src/styles/layout.css`（追加设置样式）

**Interfaces:**
- Consumes: Task 2 `setThemeChoice/themeChoice`、Task 5 `getAppVersion`。

- [ ] **Step 1: 写 `src/views/Settings.tsx`**

```tsx
import { useEffect, useState } from "preact/hooks";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, themeChoice, type ThemeChoice } from "../state/theme";

const CHOICES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
    } else {
      setVersion("开发预览");
    }
  }, []);

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>

      <div class="settings-group">
        <h2 class="settings-label">外观</h2>
        <div class="segmented" role="radiogroup" aria-label="主题">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              role="radio"
              aria-checked={themeChoice.value === choice.value}
              class={`segment ${themeChoice.value === choice.value ? "is-active" : ""}`}
              onClick={() => setThemeChoice(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div class="settings-group">
        <h2 class="settings-label">关于</h2>
        <p class="view-hint">Ome Music v{version} · 本地优先的私人音乐电台</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 打磨 Home 空态（封面光晕占位，为 Plan 3 铺垫）**

```tsx
// src/views/Home.tsx
import { Icon } from "../components/Icon";

export function HomeView() {
  return (
    <section class="view view-home">
      <div class="home-glow" aria-hidden="true" />
      <div class="home-empty">
        <div class="home-disc">
          <Icon name="music-note" size={40} />
        </div>
        <h1>电台即将开播</h1>
        <p>导入音乐后，这里会成为你的私人电台</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 追加样式**

```css
/* 设置 */
.settings-group { margin-bottom: 28px; }
.settings-label { font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 10px; letter-spacing: 0.04em; }
.segmented { display: inline-flex; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; padding: 3px; }
.segment { padding: 7px 18px; border-radius: 999px; font-size: 13px; color: var(--text-dim); }
.segment.is-active { background: var(--accent); color: #fff; }

/* Home */
.view-home { position: relative; }
.home-glow {
  position: absolute; inset: 20% 15%;
  background: radial-gradient(closest-side, var(--accent-soft), transparent 70%);
  opacity: var(--glow-opacity);
  pointer-events: none;
}
.home-disc {
  width: 120px; height: 120px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--accent);
}
```

- [ ] **Step 4: 验证**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(settings): theme override + about; polish home empty state"
```

---

### Task 9: 端到端验收（人工清单 + 自动门禁）

**Files:** 无新文件；只验证与修复。

- [ ] **Step 1: 自动门禁**

```bash
npm run lint && npm run test && npx tsc --noEmit && npm run build && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 全绿，`dist/` 产出正常。

- [ ] **Step 2: `npm run tauri dev` 人工验收清单**

1. 无边框窗口出现，拖拽标题栏可移动，三个窗口控制按钮工作。
2. 系统深色/浅色切换时应用主题跟随；设置页手动覆盖生效且重启后保持。
3. 曲库 → 导入音乐文件夹（含中文路径、中文歌名）→ 列表出现，标题/艺人/时长正确。
4. 双击歌曲播放出声；进度条拖动生效；下一首/上一首/暂停正常；末首播完自动停止。
5. 红心切换后重启应用仍保留（SQLite 持久化）。
6. 播放中窗口缩放不崩、列表滚动流畅。
7. `select` 一个文件资源管理器中的歌曲文件确认 ome-media 代理对含空格/中文路径工作。

- [ ] **Step 3: 记录问题并修复**

任何一条失败：用 systematic-debugging 技能定位修复后重新走完清单。

- [ ] **Step 4: Commit（如有修复）+ 计划完成报告**

```bash
git add -A && git commit -m "chore: plan1 foundation acceptance fixes"
```

---

## Self-Review 记录

1. **Spec 覆盖**：本计划覆盖 spec §2（前端栈/后端模块化/删除 qqmusic+sidecar）、§5 的布局与双主题骨架、M1/M2。§3 NetEase→Plan 2、§4 DJ→Plan 3、Bilibili→Plan 4、§8 清理→Plan 5。无遗漏。
2. **占位符扫描**：Task 5/6 各有一处"以编译器/迁移文件实际为准"的适配说明——这是对外部 API 版本差异的显式决策规则，非 TBD；测试断言不变。
3. **类型一致性**：`TrackDto.coverPath` ↔ 前端 `Track.coverPath` 一致；命令名 `set_track_liked_command` / `record_playback_event_command` 在 Task 5 与 `api.ts` 一致；`ome-media` URL 形式在 media.rs、audio.ts、CSP 三处一致（`http://ome-media.localhost/local?p=`）。`state/library.ts` 的 `currentIndex` 与 `state/player.ts` 的 `currentIndex` 职责已注明分离（视图当前行 vs 播放引擎），视图统一用 library 的。
