# 更新日志 / Changelog

本文件记录 Ome Music 每个版本的变更，遵循小版本迭代原则。每次代码修改后同步更新此处日志，简要说明改了什么、优化了什么以及具体做了哪些事项。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循语义化版本。

---

## [Unreleased]

### 新增
- **CI 流水线**（来自 [@chinokoyuki](https://github.com/chinokoyuki) 的 [PR #2](https://github.com/zerolyx/ome-music/pull/2)，采纳配置部分）：新增 `.github/workflows/ci.yml`，对 `main` 分支与 PR 运行 Rust（`cargo check` / `cargo clippy -D warnings` / `cargo fmt --check`）与 TypeScript（`tsc --noEmit` / `eslint` / `prettier --check`）两套检查，支持 `paths-ignore` 跳过纯文档变更，使用 `Swatinem/rust-cache@v2` 与 `cancel-in-progress` 节省 CI 资源。
- **代码风格基线**：新增 ESLint 9 flat config（`eslint.config.mjs`，含 `typescript-eslint`、`react-hooks`、`react-refresh` 插件）与 Prettier 配置（`.prettierrc`），并补充 `lint` / `format` / `format:check` 脚本与对应 devDependencies。
- **Docker 镜像构建**：新增 `Dockerfile.api`（基于 `node:22-alpine` 的 `NeteaseCloudMusicApi` 服务镜像）与 `Dockerfile.build`（基于 `ubuntu:24.04` 的 Tauri Linux 构建环境镜像）；在 `release.yml` 中追加 `docker-api` 与 `docker-build-env` 两个 job，跟随版本 tag 推送到 GHCR（`ghcr.io/zerolyx/ome-netease-api` 与 `ghcr.io/zerolyx/ome-build-env`），并为 release workflow 增加 `packages: write` 权限。
- **贡献者名单**：`CONTRIBUTING.md` 新增 Contributors 章节，登记 [@zerolyx](https://github.com/zerolyx)（创建者）与 [@chinokoyuki](https://github.com/chinokoyuki)（CI/CD 流水线贡献）；PR 提交前检查清单同步更新为包含 `npm run lint` / `format:check` / `tsc --noEmit` 与 `cargo fmt --check` / `clippy -D warnings`。

### 修复
- **预存 ESLint error 清理**（使新流水线可正常通过）：
  - 删除 `src/App.tsx` 中从未被调用的 `isRestoredOnlyTrack` 函数与配套 `restoredOnlyPrefixPattern` 正则（dead code）。
  - 移除 `src/features/speech/provider.ts` 中只赋值不读取的 `stopResolve` 状态变量，Promise 仍通过闭包内的 `resolve` / `reject` 正常完成。
- **统一代码风格**：对全仓 `src/**` 与配置文件运行 `prettier --write`，36 个文件统一为 2 空格缩进、双引号、行宽 100、LF 结尾的风格。

### 变更
- CI/CD 配置文件提取自 PR #2，未合并该 PR 中的 43 个源码改动（与 v0.3 代码已分叉，直接合并会回滚 v0.3 的引导界面与登录修复）。
- `release.yml` 中 Docker 构建任务与既有中文 releaseBody 并存，未覆盖原有版本说明。

---

## [0.3.0] — 2026-06-27

### 新增
- **新手引导界面**：首次打开软件时自动展示 5 步引导（欢迎 → 导入本地音乐 → 连接网易云 → 连接 Bilibili → 就绪），含进度条、可点击步骤指示器、完成状态徽章与 CTA 跳转按钮。
- **跳过引导**：引导界面右上角提供「跳过引导」按钮，跳过后写入 localStorage 不再自动弹出；设置面板「使用指南」中可随时点击「重新查看新手引导」重新触发。
- 后台启动时同时获取网易云与 Bilibili 登录状态，引导界面据此显示各步骤完成徽章。

### 修复
- **Bilibili 扫码登录**：根因为 QR 登录接口使用了简化的 `Mozilla/5.0 OmeMusic` User-Agent，被 passport API 当作非浏览器请求拒绝。新增 `BILIBILI_BROWSER_USER_AGENT` 常量（完整 Chrome UA），`create_bilibili_qr_login` 与 `check_bilibili_qr_login` 均改用该常量，并补充 `Origin` 与 `Accept` 头，与其他 Bilibili 调用保持一致。
- **网易云扫码登录**：移除 `check_netease_qr_login` 中多余的 `noCookie=true` 参数（`login_qr_check` 模块本身已在响应体返回 cookie），避免部分 API 版本下 cookie 获取异常；当扫码成功但 cookie 缺失时返回明确错误而非静默失败。
- **错误信息中文化**：`create_netease_qr_login` 各环节添加中文错误提示；`request_netease_json_response` 在本地 API 未运行时先检查 Node.js/API 包是否存在，返回精确的中文环境缺失提示。
- **构建失败修复**：修复 `request_netease_json_response` 中 `endpoint` 被 move 进 `client.get(endpoint)` 后又在错误处理 `format!` 中引用导致的 `E0382: borrow of moved value` 编译错误，改用 move 前的 clone 副本。

### 变更
- 版本号 `0.2.0` → `0.3.0`（package.json / tauri.conf.json / Cargo.toml / Cargo.lock / README / BUILD）。
- Release 页面 changelog 同步更新本次新功能与修复说明。

---

## [0.2.0] — 2026-06-27

### 新增
- **环境检测与引导安装**：启动时自动检测系统是否已安装 Node.js。若未安装，弹出居中提示框告知「网易云音乐功能（搜索、播放、封面、歌词）将无法运行」，提供「下载 Node.js」「重新检测」「稍后再说」三个操作；本地音乐播放不受影响。
- **服务状态可视化**：快捷设置面板的「网易云」来源行新增「缺少 Node.js / API 缺失」状态标签，缺少环境的状态一目了然。
- **安全的外链打开**：新增 `open_external_url` Tauri 命令，前端仅可打开 `https://` 链接（如 Node.js 下载页），杜绝任意协议跳转风险。
- **文档完善**：`TROUBLESHOOTING.md` 与 `CONFIGURATION.md` 新增 Node.js 运行环境章节，说明本地模式与外部 API 模式两种使用方式。

### 修复
- **更精确的错误信息**：后端在 API 不可达时先检测 Node.js 与内置 `NeteaseCloudMusicApi` 包是否存在，返回精确的失败原因，避免误判为「服务未启动」。

### 变更
- 版本号 `0.1.0` → `0.2.0`（package.json / tauri.conf.json / Cargo.toml / Cargo.lock / README / BUILD）。
- Release 下载页教程第 3 步更新为描述新的环境检测弹窗交互。

---

## [0.1.0] — 2026-06-27

### 新增
- **首个正式发布版本**：小而美的沉浸式桌面音乐播放器，支持本地音乐、网易云音乐、Bilibili 音频与 AI 电台解说。
- **Windows NSIS 安装包**：通过 GitHub Actions 在 Windows runner 上交叉编译，含 WebView2 引导安装与清洁卸载钩子。
- **新手使用教程**：Release 下载页提供 6 步新手教程（安装 → 导入本地音乐 → 连接网易云 → 登录账号 → 搜索播放 → 歌词弹幕）。
- **依赖环境说明**：下载页表格列出 WebView2、Node.js、凭据管理器等依赖的必须性与是否内置。
- **清洁卸载**：NSIS 卸载钩子清理 `%APPDATA%\com.ome.music`、`%LOCALAPPDATA%\com.ome.music`、Windows 凭据管理器中的密钥与注册表残留。

### 修复
- 修复网易云封面被 CSP 拦截（HTTP→HTTPS 规范化）、VIP 状态检测不可靠、试听 URL 被过度丢弃等问题。
- 修复设置界面 10+ 处一致性问题。
- 清理合并遗留的已删除模块文件与悬空类型。

---

## 版本迭代规范

- 按 `0.x` 小版本迭代，避免大规模推倒重来的操作。
- 每次代码修改后同步更新本日志，简要说明改了什么、优化了什么以及具体做了哪些事项。
- 像正式运行的软件一样正常迭代，在 Release 页面写明更新内容与修复的问题。
