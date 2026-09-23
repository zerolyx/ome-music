# Ome Music 项目全量交代文档

> 写于 2026-09-23，v0.7.0 发布日。本文档是项目迄今为止最完整的一份交接：
> 从背景定位、架构地图、功能全景、关键机制、踩坑记录到路线图，一页讲清。
> 维护规则见根目录 AGENTS.md 与 PROJECT.md（L0 摘要），本文不重复摘抄纪律条款。

---

## 一、项目背景与定位

**Ome Music 是什么**：AI 时代的私人音乐电台。一句话定位——「不必选歌，按下播放就好」。

- **私人博客作者的个人软件**：所有者是单用户场景，本地优先（local-first），数据全部在自己机器上。
- **三个音乐源**：本地文件夹（主力）、网易云（扫码登录后搜索/播放在线曲库）、Bilibili（氛围视频+弹幕，从属地位）。
- **私人 DJ**：接入 OpenAI 兼容语言模型（如 DeepSeek），有人格设定（港台腔男播客、慵懒松弛、中文为主偶夹英文）、有记忆（聊过什么、播过什么会记住）、有声音（歌前介绍用 TTS 说出来，说完再淡入音乐）。
- **轻量硬指标**：安装包 10MB 级；前端运行时依赖仅 `preact` / `@preact/signals` / `@tauri-apps/api`，禁止新增。

**版本沿革**（GitHub: https://github.com/zerolyx/ome-music ）：

| 版本 | 内容 |
| --- | --- |
| v0.3.x | 早期可用版：三源播放、DJ、队列、歌单、睡眠定时 |
| v0.5.0 | 合并旧历史后的基线重发；GitHub Actions 自动打包发布上线 |
| v0.6.0 | Folia/ECHO 移植大版本：主题系统、歌词舞台、视觉器、EQ+输出设备+淡变、文件夹视图、引导卡、命令面板增强 |
| v0.6.1~0.6.4 | 连环救火：双源无声（CORS 污染）、光标消失、封面丢失、网易云 http 直链 |
| v0.7.0 | UI 逐页对照重做（T1-T5）+ 迷你播放器 + 歌词候选弹窗 |

**设计参考**（已克隆到 `D:\Download\ome-reference\`， folia 为 AGPL、ECHO 为 LGPL，只借鉴思路不复制代码）：

- **folia-major**：主题商店式预设主题、全屏歌词舞台（逐字卡拉 OK + 文字 PV 动效）、AI 式沉浸界面、命令面板。
- **echonext.moe (ECHO)**：DSP Center（EQ）、输出设备选择、桌面歌词、迷你播放器、页面体系（历史/收藏/文件夹/队列）、Onboarding。

---

## 二、技术栈与架构

**前端**：Preact 3 + @preact/signals + @tauri-apps/api + 纯手写 CSS（分四个文件：`theme.css` 主题 tokens、`layout.css` 布局与组件、 `motion.css` 动效与沉浸光标）。构建 Vite。测试 Vitest（96 个）。

**后端**：Tauri 2 + Rust（模块见下）。测试 `cargo test`（68 个）。数据 SQLite（rusqlite bundled），迁移在 `src-tauri/migrations/`。

**媒体通路（全项目最关键的一条线）**：

```
页面 (http://tauri.localhost)
  ├─ 音频：ome-media 自定义协议 (http://ome-media.localhost)
  │    /local?p=<绝对路径>     本地文件（Range 支持，ACAO:*）
  │    /remote?p=<url>         远程代理（SSRF 白名单、Range 透传、ACAO:*）
  ├─ 封面：同上两条路（coverUrl() 自动选择）
  └─ WebAudio 图：MediaElementSource → 10×Peaking EQ → Analyser → destination
```

**前端目录地图**：

```
src/
  app.tsx                  应用壳：Rail + 视图切换 + 全局组件挂载
  state/                   全部业务状态（signals 单一事实源）
    player.ts              播放队列/当前曲目/进度/音量；WebAudio 建链；淡变包装
    library.ts             曲库列表/导入/喜欢
    lyrics.ts              歌词解析(lrc/yrc/tlyric)/匹配/偏移/候选弹窗状态
    theme.ts tint.ts       主题预设 + 封面取色（--accent/--ambient-a/b）
    equalizer.ts fade.ts audioout.ts   B1 声音三件套（DSP）
    stage.ts visualizer.ts 歌词舞台 / 视觉器开关与动效选择
    commands.ts            命令面板纯逻辑（模糊匹配/最近使用）
    dj.ts radio.ts tts.ts  DJ 配置/电台流程/语音合成
    netease.ts bilibili.ts danmaku.ts playlists.ts sleeptimer.ts
  components/              TrackList/PlayerBar/Rail/CommandPalette/QueueDrawer/
                           StageView/VisualizerView/MiniPlayer/LyricsMatchPicker/
                           WelcomeCard/ImmersiveCursor(环+点双光标)/Icon 等
  views/                   Home/Search/Library/Settings/Playlists
  lib/                     api.ts(invoke 封装/coverUrl)、audio.ts(toPlayableSrc)
```

**Rust 目录地图**：

```
src-tauri/src/
  lib.rs      入口 + ome-media 协议注册 + 命令注册
  db.rs       SQLite 打开（WAL/busy_timeout/foreign_keys）
  library.rs  导入(walkdir+lofty 元数据/封面提取)、喜欢、播放历史、播放事件
  media.rs    /local 伺服 + /remote 代理（SSRF 白名单 + 逐跳重定向校验）
  netease/    登录(QR)、搜索、取流(eapi 加密)、歌词
  bilibili.rs 搜索、取流、弹幕
  dj.rs       DJ 命令：LLM 调用、人格 prompt、记忆存取
  playlists.rs 歌单 CRUD
```

---

## 三、功能全景（v0.7.0）

**播放核心**：队列管理（下一首播放/追加/移除/清空）、进度拖动、音量、上一首/下一首、播放历史自动记录。

**三个音乐源**：本地文件夹导入（ authorized_directories 授权机制）；网易云扫码登录、搜索、VIP 检测（fee/freeTrialInfo）、逐字歌词(yrc)+翻译(tlyric)；B站视频音频（CDN 防盗链走 /remote 代理）+ 同屏弹幕氛围层（可关）。

**DJ 电台**：OpenAI 兼容 LLM 配置（服务商/接口/模型/密钥）；开播问候、歌前介绍（TTS 说完淡入）、播完自动接播（自动电台开关）、记忆（聊天/播放事件入库）、画像页。TTS 三层兜底：WebView2 speechSynthesis → Edge 神经语音 → OpenAI 兼容 TTS。

**声音（DSP）**：10 段参数 EQ（31Hz-16kHz，±12dB，6 预设，localStorage 持久化）；输出设备选择（setSinkId，拔出自动回退）；切歌 1.2s 自动淡变（token 防竞态）。

**视觉**：4 套预设主题（noir 月夜/ember 茜影/jade 青川/paper 纸墨）+ 跟随系统；封面取色（accent + 双团氛围光背景）；全屏歌词舞台（浮流/群唱/心象三动效，逐字+扫光双模式）；全屏视觉器（极光/圆环/脉冲 Canvas 三模式）；沉浸光标（环 lerp + 点快随，差值混合恒可见）；Kimi 式设置页（侧栏导航+折叠分区）；页面切换过渡、细滚动条。

**功能入口**：Ctrl+K 命令面板（模糊匹配+最近使用置顶：导航/曲库视图/播放控制/音量/歌词重匹配与候选挑选/睡眠定时/主题/歌单一键播放）；新手引导卡（首启可关）；迷你播放器（非首页悬浮，切歌自动弹出）；歌词偏移微调（±0.5s 步进，按曲目记忆）。

**曲库视图**：列表 / 专辑墙 / 艺人 / 文件夹（按磁盘目录分组）/ 歌单 / 播放历史，「只看收藏」过滤，全部 localStorage 记忆上次视图。

---

## 四、关键机制与实现要点

### 4.1 为什么所有媒体都要走 ome-media 代理（v0.6.1 血的教训）

舞台频谱（v0.5.0 引入）调用 `createMediaElementSource` 把媒体接进 WebAudio。 **Chromium 规定：媒体一旦被 MediaElementSource 接管，跨域且无 CORS 许可的资源在音频图上输出的是静音**（不是降级）。页面源是 `http://tauri.localhost`，本地音频走 `http://ome-media.localhost`（不同源）、网易云走 126.net 直链（无 ACAO）——于是 v0.6.0 双源无声，且 Analyser 数据全零导致视觉全废。

修法三件套（缺一不可）：
1. media 元素设 `crossOrigin = "anonymous"`（CORS 模式取流）；
2. 所有媒体源带 `Access-Control-Allow-Origin: *`——ome-media 两个路由都已带；
3. `toPlayableSrc()` / `coverUrl()` 把白名单域名（126.net/bilivideo/hdslb/akamaized）的直链**升级 http→https 后**经 /remote 代理（代理只收 https；网易云接口返回的直链和 picUrl 都是 http，这曾导致代理被白名单拒、直连被 CORS 拒的双杀）。

**推论**：以后任何进 audio 元素的 src 都必须满足「同源或 ACAO:*」。新增远程媒体域要同时改三处：media.rs 白名单、audio.ts 白名单、api.ts 封面白名单。

### 4.2 封面缓存自愈（v0.6.3）

封面提取文件存在 **app_cache/covers**（缓存目录，会被 Windows 存储感知/清理软件删除），而 DB 存绝对路径 → 悬空。修法：媒体协议伺服 /local 发现 covers 目录 404 时，按封面文件名（= track_id）查库找回源音频，lofty 当场重提取写回原路径再伺服（`media.rs::regenerate_cover` → `library.rs::reextract_cover_by_id`）。前端三处封面图均有 onError 兜底。

### 4.3 主题系统（A1）

`theme.ts` 的 THEME_PRESETS 是唯一事实源；`data-theme` 落到 `<html>`（system 会先解析成 light/dark）。**改主题必须检查所有 `[data-theme="dark"]` 选择器**——v0.6.2 的指针消失就是因为 A1 新增 noir/ember/jade 后，光标/暗角/封面调光还只挂旧 dark。当前暗色选择器统一为 `dark/noir/ember/jade` 四联。沉浸光标已改 `mix-blend-mode: difference` 纯白，不再受主题变量影响。

### 4.4 播放链与淡变

```
audio 元素(crossOrigin) → MediaElementSource → EQ×10 → Analyser → destination
element.volume = 用户音量 × fadeFactor()
```
切歌三条路径（netease/bilibili/local）统一经 `fadeSwap(shouldFade, swap, applyVolume)` 包装：淡变关或无在播 → 直接换源；开 → 1.2s 淡出（12×100ms 步进）→ 静音点换源起播 → 淡入。token 机制防快速连切竞态；队列播完 `resetFade()`。

### 4.5 歌词系统

解析：lrc（一行多时间戳）/ yrc 逐字 / tlyric 翻译按时间戳就近对齐（容差 0.6s）。来源优先级：本地同目录 .lrc（base64→UTF-8 严格解码，失败回退 GBK）> 网易云直取（sourceId）> 智能匹配（标题归一化：完全一致 > 互相包含 > 第一首）。匹配结果内存缓存；手动重匹配/候选挑选会清缓存重拉。偏移按曲目存 localStorage（`ome.lyric.offsets`），±20s 上限，调时立即重解析生效。

### 4.6 持久化键清单（localStorage）

`ome.theme` `ome.accentMode` `ome.library.view` `ome.library.likedOnly` `ome.eq.gains/enabled/preset` `ome.fade` `ome.audioout` `ome.palette.recent` `ome.lyric.offsets` `ome.welcome.dismissed` `ome.danmaku` `ome.radio` 等；后端另有 saveLastPlayback（续播恢复）与 DB（曲目/歌单/播放事件/播放历史/DJ 记忆/授权目录）。

---

## 五、工程质量与发布流程

**门禁（每批必跑全绿才提交）**：
```bash
# 前端
npx tsc --noEmit && npm run lint && npx vitest run        # 96 tests
# 后端
cd src-tauri && cargo test --workspace                     # 68 tests
cargo clippy --workspace -- -D warnings && cargo fmt --all -- --check
```

**版本号 lockstep 三处**：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`（+ Cargo.lock 自动跟随）。提交信息 Conventional Commits。

**CI/CD**（`.github/workflows/ci.yml` + `release.yml`）：push/PR 跑 CI；打 `v*` 标签自动出 Release（tauri-action 构建 NSIS 安装包并挂到 Release）。已验证：v0.5.0~v0.7.0 全部自动发布成功。

**本机构建 exe 的拦路虎：卡巴斯基**。其会按确定性模式隔离 cargo 的 build-script-build.exe。打包前先 `tasklist | grep -iE "avp|kaspersky"` 确认已退出。

**GitHub 连通性**：本机直连 443 时好时坏，推送前如遇 `Failed to connect to github.com port 443` 让用户开代理后重试即可。push/API 均走 GCM token（`git credential fill`）。

**网络/代理**：全局 http/https proxy 已 unset（原 7892 是死端口，会致诡异的 401/超时）。参考仓库放在 `D:\Download\ome-reference\`（**不要放进工作区**，.reference/ 曾把 vitest 干爆到 759 个测试文件）。

---

## 六、已知坑位速查表

| 症状 | 根因 | 解法 |
| --- | --- | --- |
| 双源无声、频谱全零 | WebAudio CORS 污染 | 4.1 三件套 |
| 网易云不能播 | 直链是 http，代理只收 https | toPlayableSrc 升级 https |
| 网易云封面空白 | picUrl 是 http，被白名单拒 | coverUrl 升级 https |
| 指针整个消失 | 主题改版后 --cursor 挂旧 dark；或浅主题+深电台区撞色 | 暗色四联选择器 + difference 混合 |
| 封面批量 404 | app_cache 被系统清理 | media.rs 自愈重提取 |
| 本机构建失败 | 卡巴斯基隔离 build-script | 退出杀软 |
| push 443 超时 | 网络直连被断 | 开代理重试 |

---

## 七、远期路线图（已记录在案，按优先级）

1. **桌面歌词独立窗口**（Tauri 第二窗口；需歌词信号跨窗同步，工作量最大，单独立项）。
2. **壁纸模式**（WorkerW SetParent，把播放器钉到桌面壁纸层）。
3. 歌词格式扩展：TTML / qrc / krc。
4. Sync Server / Now Playing 接入 / gapless 播放。
5. 继续挖 folia/ECHO：页面动效细节、更多 ECHO DSP（headroom/FIR 不重做）。

**Spec 索引**（`docs/superpowers/specs/`）：设计总纲 `2026-09-21-ome-lightweight-personal-radio-design.md`、UI 改版 `2026-09-23-ui-redesign-folia-echo-design.md`、移植计划 `2026-09-23-v060-folia-echo-port.md`、**v0.7.0 批次进度 `2026-09-23-v070-ui-deep-dive.md`（每批 hash 与验收点在此追加）**。

---

## 八、常用命令

```bash
npm run tauri dev          # 开发（Rust 改动会自动重编译）
npm run test               # 前端测试
npm run tauri build        # 本地出安装包（先退卡巴斯基）
```

DJ 人格、B站从属原则、PersonalConfig/ 禁读禁印等纪律条款见 AGENTS.md 与 PROJECT.md，本文不再重复。
