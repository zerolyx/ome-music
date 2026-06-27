# 更新日志 / Changelog

本文件记录 Ome Music 每个版本的变更，遵循小版本迭代原则。每次代码修改后同步更新此处日志，简要说明改了什么、优化了什么以及具体做了哪些事项。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循语义化版本。

---

## [Unreleased]

### 全面审查修复（功能 / UI / 体验）

#### 播放体验
- **随机播放改为 Fisher-Yates 洗牌队列**：原 `Math.random()` 真随机每次独立抽样，受生日问题影响约 17 次「下一首」后重复概率超 50%，体感「伪随机、容易重复」。改为整轮洗牌队列，保证一轮内不重复，播完再重新洗牌，并尽量避免下一首立即重复当前曲目。
- **「上一首」加入播放历史栈**：原 shuffle 下「上一首」与「下一首」走同一条随机抽取，无法回到实际播放过的曲目。新增 `playHistoryRef` 栈（上限 200），「上一首」优先弹栈回到上一首实际播放的曲目，shuffle 下同样有效。
- **单曲列表「列表循环」可正常循环**：原 `loop === "all" && tracks.length > 1` 在只有 1 首歌时落到 `setIsPlaying(false)` 停止，与「单曲循环」行为不一致。改为 `tracks.length > 0`，单曲列表也能循环重播。
- **单曲循环不再阻塞电台/临时歌单队列**：原 `loop === "one"` 分支在消耗 `agentQueue` 之前 `return`，导致开了单曲循环时排队的电台曲目永远不动。改为先消耗 `agentQueue`，仅队列空时才单曲循环。
- **歌单同步后当前曲目丢失导致控制条消失**：`onLibraryChanged` 原仅当 `currentTrackId` 为 `null` 时才回退，若当前播放的曲目不在同步后的新列表中，`currentTrackId` 变陈旧 → `currentIndex = -1` → `currentTrack = null` → 底部控制条消失 + `<audio>` 幽灵播放。改为校验当前曲目是否在新列表中，不在则回退到首曲；同时重置洗牌队列与播放历史，避免索引越界。
- **URL 过期后播放中断无法恢复**：原 `playableSrcForTrackIdRef` 命中即跳过解析，签名 URL / 代理 token 过期后 audio 报错但缓存标记仍在，resolve effect 不重跑，用户必须手动切歌再切回。改为 audio `error` 时清空 `playableSrcForTrackIdRef` 与 `playableSrc`，触发重新解析（自动恢复，无需手动操作）。

#### UI 回归
- **修复底部空白与窗口可上下拖拽**：v0.3 重构时 shell className 从 `h-screen overflow-hidden` 误改为 `min-h-screen overflow-x-hidden`。按 CSS Overflow Module 规范，`overflow-x: hidden` 会让 `overflow-y` 计算成 `auto`，叠加 `min-h-screen` 允许容器向上增长 → shell 变成纵向滚动容器，页面可上下拖拽并露出 100vh 之外的 `#d0c6ba` 空白底色。改回 `h-screen overflow-hidden` 同时消除两个症状。

#### 设置面板与搜索 UX
- **删除死代码 `PlaylistAnalysisPanel`**：该组件从未被任何地方 import / 渲染，配套的 `savePlaylistAnalysisReport` 调用结果也从未被读取，属纯冗余。删除文件与调用，精简导入歌单流程。
- **移除冗余的「检查状态」按钮**：网易云与 Bilibili 的 QR 弹窗均有每 2.2s 自动轮询（`useEffect`），但仍保留了手动「Check Status / 检查状态」按钮作为重复兜底。移除两个手动按钮与对应 dead code（`checkQrLogin` / `checkBilibiliQrLogin` / `onCheckQr` prop），弹窗内改为就近显示「等待扫码确认…」状态文案。
- **搜索加载文案明确化**：网易云加载文案从诗意的 "Listening outside the room" 改为 "Searching NetEase Cloud Music…"，Bilibili 从 "Tuning the outside room" 改为 "Searching Bilibili…"，新用户易理解。

### 紧急修复（v0.3.0 回归问题）
- **网易云扫码登录弹窗不出现**：v0.2 在 `request_netease_json_response` 中新增的本地环境预检（`ensure_local_netease_api_service` 返回 `Err` 即整体失败）过于激进 —— 当 Node.js 未装、`NeteaseCloudMusicApi` 包未找到或服务 12 秒内未就绪时，`create_netease_qr_login` 直接返回 `Err`，前端 catch 只把错误写进面板底部小字 `sourceMessage`，`neteaseQr` 状态永远不被赋值，导致二维码弹窗条件 `{neteaseQr && (...)}` 不成立，用户看到「点了没反应」。
  - **修复**：恢复 v0.1 的行为 —— `let _ = ensure_local_netease_api_service(&config.base_url).await;` 仍尝试拉起本地服务，但**不再以预检结果阻断请求**。预检通过则 HTTP 调用命中已就绪的服务；预检失败则由后续 HTTP 请求自然返回 `Could not reach the NetEase API`，扫码与搜索都能继续工作，不再被环境检查卡死。
- **启用网易云后搜索不到目标歌曲**：同一根因 —— `request_netease_json_response` 的预检 `Err` 让 `search_netease_songs` 直接失败；而前端 `TopSearch.tsx` 的 `.catch(() => setNeteaseMessage("The outside source is quiet just now."))` 又把后端精确错误吞成模糊文案，用户既搜不到歌也看不到原因。
  - **修复**：随上一项恢复 v0.1 行为后，搜索请求能正常打到本地 API 服务；同时 `TopSearch.tsx` 改用 `readNeteaseSearchError(error)` 透出后端真实错误，连接失败时提示「NetEase API 未连接，请确认本地服务已启动或在设置中改用可用的 API 地址」，而非笼统的「outside source is quiet」。

### 新增
- **CI 流水线**（来自 [@chinokoyuki](https://github.com/chinokoyuki) 的 [PR #2](https://github.com/zerolyx/ome-music/pull/2)，采纳配置部分）：新增 `.github/workflows/ci.yml`，对 `main` 分支与 PR 运行 Rust（`cargo check` / `cargo clippy -D warnings` / `cargo fmt --check`）与 TypeScript（`tsc --noEmit` / `eslint` / `prettier --check`）两套检查，支持 `paths-ignore` 跳过纯文档变更，使用 `Swatinem/rust-cache@v2` 与 `cancel-in-progress` 节省 CI 资源。
- **云端同步核查步骤**：在 CI 流水线末尾新增 `verify-cloud-sync` job（`needs: [rust, typescript]`，仅 `push` 事件触发），三重核查确保提交真正落地云端 —— ① `git fetch` 后比对本地 HEAD 与 `origin/main` 的 SHA 是否一致；② 调用 GitHub API `/repos/{owner}/{repo}/commits/{sha}` 确认提交远端可检索；③ 逐个核查关键文件（ci.yml、release.yml、lib.rs、package.json 等）在远端分支可达。任一不一致即 `::error::` 失败，杜绝「本地显示已推送、远端实际缺失」的静默失败。
- **代码风格基线**：新增 ESLint 9 flat config（`eslint.config.mjs`，含 `typescript-eslint`、`react-hooks`、`react-refresh` 插件）与 Prettier 配置（`.prettierrc`），并补充 `lint` / `format` / `format:check` 脚本与对应 devDependencies。
- **Docker 镜像构建**：新增 `Dockerfile.api`（基于 `node:22-alpine` 的 `NeteaseCloudMusicApi` 服务镜像）与 `Dockerfile.build`（基于 `ubuntu:24.04` 的 Tauri Linux 构建环境镜像）；在 `release.yml` 中追加 `docker-api` 与 `docker-build-env` 两个 job，跟随版本 tag 推送到 GHCR（`ghcr.io/zerolyx/ome-netease-api` 与 `ghcr.io/zerolyx/ome-build-env`），并为 release workflow 增加 `packages: write` 权限。
- **贡献者名单**：`CONTRIBUTING.md` 新增 Contributors 章节，登记 [@zerolyx](https://github.com/zerolyx)（创建者）与 [@chinokoyuki](https://github.com/chinokoyuki)（CI/CD 流水线贡献）；PR 提交前检查清单同步更新为包含 `npm run lint` / `format:check` / `tsc --noEmit` 与 `cargo fmt --check` / `clippy -D warnings`。

### 修复
- **预存 ESLint error 清理**（使新流水线可正常通过）：
  - 删除 `src/App.tsx` 中从未被调用的 `isRestoredOnlyTrack` 函数与配套 `restoredOnlyPrefixPattern` 正则（dead code）。
  - 移除 `src/features/speech/provider.ts` 中只赋值不读取的 `stopResolve` 状态变量，Promise 仍通过闭包内的 `resolve` / `reject` 正常完成。
- **预存 Rust clippy 警告清理**（使 `cargo clippy -D warnings` 通过）：
  - `lib.rs:1843` needless_question_mark：`Ok(with_saved_lyric_offset(&state, resolved)?)` → 去掉 `Ok(...?)` 包裹。
  - `lib.rs:4221` collapsible_str_replace：`title.replace('《', " - ").replace('》', " - ")` → `title.replace(['《', '》'], " - ")`。
  - `lib.rs:6320` manual_clamp：`limit.max(1).min(120)` → `limit.clamp(1, 120)`。
  - `lib.rs:6970` io_other_error：`std::io::Error::new(std::io::ErrorKind::Other, error)` → `std::io::Error::other(error)`。
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
