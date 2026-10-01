# Ome Music 项目全量交代文档

## 2026-09-24 范围与总账更新

用户已授权继续盘点并整合 Folia 与 ECHO Community 的功能。此前各历史 spec 中“本版不做 / 不移植”的项目是当时的阶段决策，不代表本轮停止探索；当前状态、统一实现归属、上游能力映射及现有资产目录统一维护在 [参考功能与资产总账](REFERENCE-FEATURE-INVENTORY.md)。

本轮基于工作区外本地快照 `folia-major@9cf8220` 与 `echo@d25d5c9`。只将其作为设计与功能参考，不拷贝源代码或媒体素材；保留既有未提交改动。项目仍保持本地优先及现有前端依赖约束，原生 HiFi 音频、远程曲库、可执行插件等能力须单独设计权限、维护和回退边界。

第一轮已更新功能/资产总账和 Third-Party Notices，并新增曲库“重复”视图：只对本地曲目按规范化曲名、艺人和两秒时长差分组，显示专辑/文件位置线索，不自动隐藏或删除。最小桌面宽度 960px 与 720px 窄窗截图核验无横向溢出；筛选组合正常。`npm run build`、`npm run lint` 与前端全量 Vitest 154 项通过。构建仍有 `player.ts` 同时静态/动态导入的既有分包提示，与本批修改无关。

第二批接入同目录 WebVTT（`.vtt`）歌词：Rust 文件查找优先级为 LRC > VTT > TTML > QRC > KRC，前端将 cue 起始时间和字幕文本合成为 LRC 行级歌词；不伪造逐字时间轴。空或无效 sidecar 会继续回退在线匹配。当前 `npm run build`、`npm run lint`、前端 159 项测试、`cargo fmt -- --check` 与 Rust 73 项测试均通过；Rust 有 10 项真实网络/服务测试按设计忽略。构建仍显示同一条既有分包提示。

第三批为曲库导入加入“选择文件夹 → 遍历 → 读取元数据/封面 → 完成”进度：Rust 后台扫描以约 1 秒节流发送 `library-import-progress`，只包含阶段与数量，不发送文件路径/歌曲名；主窗口在 `view-host` 顶部统一显示，首页引导卡和曲库页入口都可见，最终摘要可关闭。目录遍历错误与跳过曲目分别统计。实现使用已安装 `@tauri-apps/api` 2.11.1 的 `listen` 与 Tauri v2 `AppHandle::emit`（核对官方 Context7 文档），未增加依赖。当前 `npm run build`、`npm run lint`、前端 162 项测试、`cargo fmt -- --check` 与 Rust 75 项测试通过；10 项真实网络/服务测试按设计忽略。960px 与 720px 检查无横向溢出，切换到设置页时进度仍可见，浏览器控制台无错误。构建保留既有 `player.ts` 分包提示。

第四批加入外观主题文件导入/导出：`ome-theme` v1 JSON 白名单只保存当前主题选择、四种自定义颜色与强调色模式，导入上限 32 KB 且先完整校验再应用；不会读取或写出账号、DJ 密钥、曲库路径、歌词偏移等其他本机偏好。无需新增依赖。`npm run build`、`npm run lint`、前端 167 项测试通过；设置页在 960px 与 720px 截图下控件均可见且未出现横向溢出。Vite 仍提示 `player.ts` 同时静态/动态导入，这是既有分包提示。此处为早期批次记录；五类常用偏好的白名单迁移已于第五十五批接入，完整数据库/曲库/缓存备份恢复、云端主题同步与 AI 主题生成仍待补或评估。

第五批在播放列表抽屉加入曲名/歌手/专辑多词搜索（不区分大小写，全部词项需匹配）：过滤项保留原队列索引，播放/移除不会误操作到列表序号对应的另一首；搜索时关闭拖拽重排并提示原因，清空队列时重置搜索。`npm run build`、`npm run lint`、前端 171 项测试通过；实际界面验证中文筛选、无匹配空态、筛选后移除原队尾曲目，以及 960px/720px 布局。Vite 保留既有 `player.ts` 分包提示。

第六批新增“重扫曲库”：从数据库读取曾由系统目录选择器授权的目录，调用与导入共用的后台扫描流程；新增/更新/跳过/遍历异常继续走同一全局计数进度，不删除失联曲目，也不扩展文件访问范围。重叠目录扫描会对音频路径去重；符号链接不作为普通音频文件跟随；无法解析的文件跳过，避免只凭文件名创建无效条目。Rust 命令注册与无目录/授权目录读取/路径归一化/损坏音频测试覆盖。当前 `npm run build`、`npm run lint`、前端 172 项测试、`cargo fmt -- --check`、`cargo clippy --offline -- -D warnings`、Rust 79 项测试通过；10 项真实网络/服务测试按设计忽略。实际页面检查 960px 与 720px 下操作按钮成组可见。完整目录管理和健康诊断仍待补。

第七批把两个曲库能力接入现有应用：歌单支持 M3U/M3U8 导入与导出；导入仅将清单路径映射到已索引的本地曲目，保持顺序、去重、忽略远程项并统计未命中项，不导入音频或扩展目录权限；导出只写入用户在保存对话框中选定的目标。修复了原有前端歌单 tracks/add/remove 调用名与 Rust 命令不一致的问题。新增 SQLite 迁移 005 和本地曲目信息编辑：曲名、艺人、专辑只写应用数据库；手动曲名/艺人覆盖在重扫后保留，文件时长与封面仍可更新，实际音频标签不变。编辑入口覆盖曲库列表、历史、文件夹、重复候选、歌单和队列中的本地曲目。`npm run test`（172 项 / 27 个文件）、`npm run build`、`npm run lint`、`cargo fmt -- --check`、`cargo clippy --offline -- -D warnings`、Rust 测试（85 项通过，10 项真实网络/服务用例按设计忽略）和 `npm run tauri build` 均通过，NSIS 安装包成功生成。960px / 720px 浏览器检查确认歌单操作与元数据编辑布局未溢出，并验证浏览器演示态编辑；原生文件选择/保存对话框未在浏览器预览中触发，仍需桌面运行时人工验收。Vite 仍有既有 `player.ts` 同时静态/动态导入的分包提示。

第八批补齐本地歌词 sidecar 的双命名和翻译读取：主歌词支持 `track.lrc` 与 `track.mp3.lrc`，保留 LRC > VTT > TTML > QRC > KRC 格式优先级；翻译支持 `track.t.lrc` / `track.t.vtt`，解码后并入现有翻译歌词渲染。可选翻译缺失、无效或单独不可读时仍保留主歌词；主歌词无效时继续使用原在线匹配回退。无需新增依赖、数据库字段或界面入口。Rust 查找/序列化用例 8 项、前端解析用例 5 项通过；全量 `npm run test`（174 项 / 27 个文件）、build、lint、Rust fmt、clippy 与 Rust 测试（87 项通过，10 项真实网络/服务用例按设计忽略）通过；`npm run tauri build` 成功生成 NSIS 安装包。此批没有改动歌词视图布局。

第九批把 Folia 的分层 `.foliaignore` 过滤接入 Rust 扫描器：规则相对各自目录解析，父级继承、子级覆盖、后写覆盖前写，支持注释/转义、`*` / `?` / `**` / 字符类、根路径、目录规则与否定；忽略目录直接剪枝，遵守“先重新包含目录，才可能扫描其内部文件”的遍历语义。规则文件限制为 1 MiB / 10,000 行 / 4,096 字符每行，拒绝符号链接；规则读取失败会计入扫描错误，继续应用父级规则并完成扫描。无需新依赖、数据库迁移或 UI。与 Folia 的重扫不同，Ome 不会因规则新增而自动删除既有索引/歌单引用；这项差异在功能总账中保留，待曲库可恢复的删除/忽略管理一起补齐。`.foliaignore` 解析/层级/剪枝用例 9 项通过；全量前端 174 项 / 27 个文件、Rust 96 项通过（10 项真实网络/服务用例按设计忽略），lint、fmt、clippy 与 `npm run tauri build` 均通过，安装包生成成功。此批没有改动可见 UI。

第十批补上音乐源设置中的本地目录管理：列出已登记路径、目录状态和该目录下的本地曲目数；可按目录 ID 单独重扫、从系统选择器重新选择目录，或二次确认将目录移出后续扫描范围。单目录扫描只从目录登记表按 ID 取路径；移出仅删除扫描登记，曲目、歌单关联和音频文件均保留，现有本地曲目的媒体读取继续按曲库路径工作。目录已迁移到新位置时，新位置会作为独立登记项导入，旧登记可单独移出。未增加依赖、数据库迁移或新路径输入框。Rust memory DB 测试覆盖目录状态与分段计数、ID 登记校验、移出后曲目和歌单引用保留；全量前端测试 174 项、`npm run build`、`npm run lint`、Rust fmt/clippy 与 100 项 Rust 测试通过（10 项真实网络/服务用例按设计忽略）。1440px 与 720px 设置页检查没有横向溢出，桌面预览态明确提示目录管理须在桌面版使用；原生目录选择器和真实用户数据库没有启动验证。截图已留在 `.playwright-mcp` 输出目录；本机视觉描述服务因缺少 OpenCode 会话 ID 无法返回像素描述，改以可访问性树和元素尺寸核验。全局 `player.ts` 分包提示仍是既有构建提示。

第十一批补齐 `.foliaignore` 对已有曲目的可恢复处理：SQLite 迁移 006 为索引增加软排除标记；重扫遇到忽略文件/目录时标记匹配的本地曲目，只有成功读取元数据的曲目才会自动恢复。无效规则文件所在范围内保留原排除状态。曲库新增“已排除”视图，展示曲名、艺人与可悬停查看的完整路径，说明编辑适用目录/上级目录的 `.foliaignore` 后重扫即可恢复；不提供会被生效规则再次排除的误导按钮。普通曲库、歌单内容与计数、M3U 导入匹配会隐藏排除项；SQLite 行、歌单成员和播放历史都保留，规则撤回后歌单原位重现。全量 Vitest 174 项 / 27 个文件通过；Rust 105 项通过、10 项网络/服务测试按设计忽略，fmt 与 Clippy 通过；`npm run build` 与 `npm run lint` 通过。浏览器演示样例在 960px 和 720px 截图/DOM 尺寸核验无页面横向溢出，窄屏状态说明与曲目信息对齐，控制台无 warning/error。没有启动连接真实用户数据库的 Tauri 实例。健康诊断和独立索引删除仍待做；Vite 的 `player.ts` 分包提示仍是既有提示。

第十二批加入曲库只读健康检查和最近扫描摘要：SQLite 迁移 007 保存最近一次完成扫描的计数；设置页按钮检查 SQLite `quick_check(1)`、曲目/艺人/专辑/歌单/播放事件计数、已授权目录状态、登记范围内本地曲目的文件元数据、数据库/WAL/SHM 和封面缓存大小。规则排除项单列且不做文件探测；离线目录和登记范围外的曲目只计数，不尝试访问其文件；扫描与媒体文件内容均不读取。Rust 内存数据库 + 临时目录用例验证可访问/缺失/离线/范围外/排除分类、缓存元数据、最近摘要及无音频路径泄露；前端全量 174 项通过，`npm run build`、`npm run lint`、Rust fmt/clippy 与 Rust 106 项通过（10 项网络/服务测试按设计忽略）。设置页在 960px 与 720px 预览检查统计表和长路径可折行、无水平溢出；使用独立演示报告预览，未连接或启动真实用户数据库。Vite 仍有既有 `player.ts` 静态/动态导入提示。失联索引修复、独立索引删除及 ECHO watcher 仍未移植。

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

**前端**：Preact 3 + @preact/signals + @tauri-apps/api + 纯手写 CSS（分四个文件：`theme.css` 主题 tokens、`layout.css` 布局与组件、 `motion.css` 动效与沉浸光标）。构建 Vite。测试 Vitest（54 个测试文件 / 371 项测试）。

**后端**：Tauri 2 + Rust（模块见下）。测试 `cargo test --workspace`（当前 213 通过 / 10 忽略，10 个忽略项均为需要真实网络或真实 LLM 的用例，不是失败）。数据 SQLite（rusqlite bundled），迁移 001–017 位于 `src-tauri/migrations/`。

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
    library.ts             曲库列表/导入/重扫/喜欢/扫描进度事件订阅
    lyrics.ts              歌词解析(lrc/yrc/tlyric)/匹配/偏移/候选弹窗状态
    desklyrics.ts          桌面歌词第二窗口：快照协议/发布循环/窗口生命周期
    theme.ts tint.ts       主题预设 + 四变量自由配色 + 封面取色（--accent/--ambient-a/b）
    equalizer.ts fade.ts audioout.ts   B1 声音三件套（DSP）
    stage.ts visualizer.ts 歌词舞台 / 视觉器开关与动效选择
    commands.ts            命令面板纯逻辑（模糊匹配/最近使用）
    settings-nav.ts        设置页信息架构（四组分区/关键词搜索定位）
    hotkeys.ts             全局键盘快捷键（含 SHORTCUTS 参考表数据）
    mediasession.ts        Media Session 系统媒体键
    dj.ts radio.ts tts.ts  DJ 配置/电台流程/语音合成
    netease.ts bilibili.ts danmaku.ts playlists.ts sleeptimer.ts
  components/              TrackList/PlayerBar/Rail/CommandPalette/QueueDrawer/
                           LibraryImportStatus(全局扫描进度)/QueueDrawer(队列搜索)/
                           StageView/VisualizerView/MiniPlayer/LyricsMatchPicker/
                           DesktopLyricsWindow(桌面歌词窗体)/WelcomeCard/
                           ImmersiveCursor(环+点双光标)/Icon 等
  views/                   Home/Search/Library/Settings/Playlists
  lib/                     api.ts(invoke 封装/coverUrl)、audio.ts(toPlayableSrc)、
                           lyricfmt.ts(VTT→LRC；TTML/QRC/KRC→LRC+YRC)、
                           theme-transfer.ts(白名单主题 JSON 导入/导出)、
                           queue-search.ts(保留源索引的队列筛选)
dev-preview/desklyrics.html  桌面歌词视觉调试页（mock Tauri IPC，仅 dev 服务器可用）
```

**Rust 目录地图**：

```
src-tauri/src/
  lib.rs      入口 + ome-media 协议注册 + 命令注册
  db.rs       SQLite 打开（WAL/busy_timeout/foreign_keys）、迁移执行
  data_backup.rs 数据备份导出/恢复（一致性 SQLite 快照、本机回退点）
  library.rs  导入(walkdir+lofty 元数据/封面提取/阶段进度)、喜欢、播放历史、播放事件
  library_ignore.rs .foliaignore 规则解析与忽略曲目过滤
  metadata_sources.rs 在线资料候选搜索（网易云/QQ 音乐/酷狗，固定来源）
  lyrics_sources.rs   在线歌词候选检索（AMLL/LRCLIB/QQ/酷狗/酷我）
  lyrics_backfill.rs  缺失歌词回填队列与可恢复进度
  media.rs    /local 伺服 + /remote 代理（SSRF 白名单 + 逐跳重定向校验）
  netease/    登录(QR)、搜索、取流(eapi 加密)、歌词
  bilibili.rs 搜索、取流、弹幕
  subsonic.rs 会话级 Navidrome/OpenSubsonic 曲库、受限封面与原生歌词
  jellyfin.rs 会话级 Jellyfin/Emby 曲库、分段播放与封面
  webdav.rs   会话级只读 WebDAV 目录浏览与有界 Range 播放
  smb_share.rs 会话级只读 SMB 浏览（限指定主机/共享/TCP 445）
  local_video.rs 本地 MV 候选登记与有界 Range 播放
  dj.rs       DJ 命令：LLM 调用、人格 prompt、记忆存取
  playlists.rs 歌单 CRUD
```

---

## 三、功能全景（v0.7.0）

**播放核心**：队列管理（下一首播放/追加/移除/清空/**拖拽重排 + 定位当前曲目**）、进度拖动、音量、上一首/下一首、播放历史自动记录；**全局快捷键**（Space 播放暂停 · ←→ ±5s · ↑↓ 音量 · M 静音 · N/P 上下曲 · L 舞台 · V 视觉器 · Q 队列；输入框/按钮焦点/组字/面板打开时不劫持）；**Media Session 系统媒体键**（媒体浮层元数据/封面/进度，键盘媒体键可控播放）。

**三个音乐源**：本地文件夹导入（ authorized_directories 授权机制）；网易云扫码登录、搜索、VIP 检测（fee/freeTrialInfo）、逐字歌词(yrc)+翻译(tlyric)；B站视频音频（CDN 防盗链走 /remote 代理）+ 同屏弹幕氛围层（可关）。

**DJ 电台**：OpenAI 兼容 LLM 配置（服务商/接口/模型/密钥）；开播问候、歌前介绍（TTS 说完淡入）、播完自动接播（自动电台开关）、记忆（聊天/播放事件入库）、画像页。TTS 三层兜底：WebView2 speechSynthesis → Edge 神经语音 → OpenAI 兼容 TTS。

**声音（DSP）**：10 段参数 EQ（31Hz-16kHz，±12dB，6 预设，localStorage 持久化；**SVG 频响曲线可视化 + 节点纵向拖拽调增益**，RBJ 幅频数学与 WebAudio 滤波同参数）；输出设备选择（setSinkId，拔出自动回退）；`ome.fade` 默认关闭的双 deck 等功率淡变，最长 3 秒。

**视觉**：11 种主题选择（跟随系统、9 套预设、自由配色；默认浅/深色主题采用鲜明紫色系与双色氛围光）+ 四变量自由配色（背景/面板/文字/强调色，本机持久化）+ 封面取色（accent + 双团氛围光背景）；首页旋转黑胶（封面=唱片套，播放渐转/暂停缓停，rAF 驱动）；专辑墙在播专辑点亮（accent 描边+内发光）；全屏歌词舞台（浮流/群唱/心象三动效，逐字+扫光双模式）；全屏视觉器（极光/圆环/脉冲 Canvas 三模式）；首页歌词组按句整体轻滑入场；沉浸光标（环慢随 + 点快随，黑白双层描边；首次定位后才接管系统指针，离窗/失焦/页面隐藏时恢复）；Kimi 式设置页（**四组分区导航：常用=播放/外观/声音 · 内容=音乐源/歌词 · DJ · 高级=快捷键/关于；设置内搜索关键词定位分区；统一 SettingRow 行 + Switch 开关 + kbd 快捷键参考表 + 重置偏好两步确认**，信息架构见 state/settings-nav.ts）；页面切换过渡、细滚动条。

**功能入口**：Ctrl+K 命令面板（模糊匹配+最近使用置顶：导航/曲库视图/播放控制/音量/歌词重匹配与候选挑选/睡眠定时/主题/桌面歌词/歌单一键播放；**面板底部内嵌音量条**）；新手引导卡（首启可关）；迷你播放器（非首页悬浮，切歌自动弹出；带播放列表入口并复用现有队列抽屉，抽屉打开时暂隐避免遮挡）；桌面歌词（独立第二窗口，设置页外观区与命令面板可开关，**工具条可切横排/竖排**）；歌词偏移微调（±0.5s 步进，按曲目记忆）。

**曲库视图**：列表 / 专辑墙 / 艺人 / 文件夹（按磁盘目录分组）/ 歌单 / 播放历史（**统计摘要卡：今天/7天/总次数/不重复曲目/累计时长 + 全部/今天/7天/30天时间筛选**；条目=每次播放一条，新命令 `playback_history_entries`），「只看收藏」过滤，全部 localStorage 记忆上次视图。

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

`theme.ts` 的 THEME_PRESETS 是唯一事实源；`data-theme` 落到 `<html>`（system 会先解析成 light/dark）。**改主题必须检查所有 `[data-theme="dark"]` 选择器**——v0.6.2 的指针消失就是因为 A1 新增 noir/ember/jade 后，光标/暗角/封面调光还只挂旧 dark。当前暗色选择器覆盖 `dark/noir/ember/jade/aurora`。沉浸光标已改 `mix-blend-mode: difference` 纯白，不再受主题变量影响。

外观设置保留九套预设和系统跟随，并提供自由配色：背景、面板、文字、强调色四项即时应用，衍生弱文字/半透明底色/边框；颜色与选择在本机 `localStorage` 持久化。首次与系统浅/深色使用更鲜明的薰衣草紫、玫粉和青色氛围光。封面取色仍只覆盖强调色；手动编辑强调色时切换到固定色。

### 4.4 播放链与淡变

```
primary/secondary HTMLAudioElement(crossOrigin)
  → MediaElementSource → per-deck ReplayGain GainNode → per-deck transition GainNode
  → shared EQ×10 → shared EQ preamp → Channel Tools / bypass → Analyser
  → master volume → destination
```
播放元素按需创建，两个 deck 共用 EQ、声道处理、频谱和主音量链；ReplayGain 与过渡增益各自独立，两个 deck 都应用当前输出设备。既有 `ome.fade` 设置关闭时直接切歌；开启时，新音源先解析并实际开始播放，再按等功率曲线淡变，最长 3 秒；短曲按曲长和自动接播的剩余时间缩短。Web Audio 曲线不可用时使用定时器渐变，单 deck 图不完整则硬切。

手动切歌/选曲在有正在播放的旧音源时会用空闲 deck 起播新歌；失败请求不覆盖旧音源，request token 会丢弃过期加载。普通队列仅在曲尾附近启动自动淡变；配置 DJ 歌前介绍时让既有 DJ 电台流程接管自动接播，“播完当前”睡眠也会禁止自动过渡。手动切歌若有 DJ 介绍，等介绍结束后才起新曲，旧曲仍播放时再淡变。暂停、搜索进度或再次切歌会先收束当前过渡并清理旧 deck。曲库恢复播放点若遇到尚未可 seek 的音源，会保留位置并在元数据/时间更新后重试。

### 4.5 歌词系统

解析：lrc（一行多时间戳）/ yrc 逐字 / tlyric 翻译按时间戳就近对齐（容差 0.6s）/ **VTT（cue 行级时间戳）/ ttml（词级 span）/ qrc、krc（`[ms,ms]<ms,ms>字`；krc 文件在 Rust 侧 XOR+zlib 解密为明文）**。本地 sidecar 优先级 `.lrc > .vtt > .ttml > .qrc > .krc`，内容嗅探在 `lib/lyricfmt.ts`（XML → TTML；`WEBVTT` → 行级 VTT；`[ms,ms]` 行头 → qrc 族；其余 lrc 直通），统一合成标准 lrc + 可用时的 yrc 风格字级文本，下游解析渲染零改动。来源优先级：本地同目录歌词（base64→UTF-8 严格解码，失败回退 GBK）> 网易云直取（sourceId）> 智能匹配（标题归一化：完全一致 > 互相包含 > 第一首）。匹配结果内存缓存；手动重匹配/候选挑选会清缓存重拉。偏移按曲目存 localStorage（`ome.lyric.offsets`），±20s 上限，调时立即重解析生效。

### 4.6 持久化键清单（localStorage）

`ome.theme` `ome.theme.custom` `ome.accentMode` `ome.library.view` `ome.library.likedOnly` `ome.eq.gains/enabled/preset` `ome.fade` `ome.audioout` `ome.palette.recent` `ome.lyric.offsets` `ome.welcome.dismissed` `ome.danmaku` `ome.radio` `ome.desklyrics.on/size/rect/locked/vertical/color` 等；后端另有 saveLastPlayback（续播恢复）与 DB（曲目/歌单/播放事件/播放历史/DJ 记忆/授权目录）。

### 4.7 桌面歌词独立窗口（第二窗口 + 事件快照）

架构：主窗口持有全部状态，第二窗口 `label=desklyrics` **复用同一前端 bundle**，`main.tsx` 按 `getCurrentWindow().label` 分流渲染 `DesktopLyricsWindow`。跨窗同步不走共享信号（各窗 JS 上下文独立），而是主窗每 250ms `emitTo` 一帧快照（当前行/字级时间轴/翻译/下一行/position+sentAt），歌词窗用 `Date.now()` 差值本地 rAF 插值出连续进度驱动卡拉OK，无需逐帧 IPC；暂停时快照字节级不变，发布循环按 JSON 去重零流量。要点：

- 窗口 `focus:false` + 组件自行 show（定位就绪后），**永不抢焦点**；`visible:false` 避免原点闪现。
- 开关意图持久化（`ome.desklyrics.on`），开机随主窗恢复；位置物理像素自存自愈（显示器拓扑变化回中）；字号三档 s/m/l 联动窗口尺寸。
- **锁定穿透**（ECHO 三态思路的诚实版）：歌词窗工具条锁定 → 主窗 `setIgnoreCursorEvents(true)` 全鼠标穿透；穿透后歌词窗收不到任何鼠标事件，解锁只能回主窗设置页/命令面板（无托盘不做 hover 唤出）。锁定态持久化（`ome.desklyrics.locked`），开机恢复时补 applied。
- **无歌词自动隐藏**：播放中且无歌词（无当前行/预览行）持续 8s → `hide()`；来歌词/切歌/暂停立即回显。
- emitTo 失败自愈：歌词窗被外部销毁时发布循环捕获并自动关停状态。
- **新窗口必踩坑**：index.html 的 `<html class="booting">` 会遮蔽 `#app`，第二窗口分支必须同样在双 rAF 后移除 booting，否则窗口永久隐形（窗口显隐由 CSS 与 show() 双重控制）。
- capabilities `windows` 必须包含 `desklyrics`，否则歌词窗内所有 window/event IPC 被拒。
- 远期扩展位：鼠标穿透锁定模式、颜色/双行排布设置。

---

## 五、工程质量与发布流程

**门禁（每批必跑全绿才提交）**：
```bash
# 前端
npx tsc --noEmit && npm run lint && npx vitest run        # 54 files / 371 tests
# 后端
cd src-tauri && cargo test --workspace                     # 213 passed / 10 ignored
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
| 指针整个消失 | 全局隐藏系统指针早于自绘光标首次定位；离窗/失焦后也未恢复；舞台还会单独隐藏系统指针 | 仅在自绘指针已定位后接管；离窗、失焦和隐藏页面时还原系统指针；使用黑白双层描边并移除舞台局部隐藏规则 |
| 封面批量 404 | app_cache 被系统清理 | media.rs 自愈重提取 |
| 第二窗口内容永久隐形 | 新窗口没移除 index.html 的 `.booting` 遮蔽 | 分流分支双 rAF 后 remove("booting") |
| 歌词窗 IPC 全部被拒 | capabilities `windows` 没含新窗口 label | main.json windows 加 `desklyrics` |
| 本机构建失败 | 卡巴斯基隔离 build-script | 退出杀软 |
| push 443 超时 | 网络直连被断 | 开代理重试 |

---

## 七、远期路线图（已记录在案，按优先级）

1. ~~桌面歌词独立窗口~~ **已实现**（第二窗口 + 事件快照同步，见 4.7；锁定穿透已随移植批次完成）。
2. **壁纸模式**（WorkerW SetParent，把播放器钉到桌面壁纸层）。
3. ~~歌词格式扩展：TTML / qrc / krc~~ **已实现**（本地 sidecar，见 4.5）；VTT 行级歌词已接入。
4. Sync Server / Now Playing 接入 / gapless 播放。
5. 继续挖 Folia/ECHO：已借鉴主题预设、四变量自由配色、旋转黑胶、专辑点亮、桌面歌词三态；ECHO 队列已在迷你播放器加入入口并复用现有抽屉；Folia 歌词走带已移植为首页歌词组按句轻滑入场。后续候选：评估其他功能是否符合轻量、沉浸、音乐优先原则。

**Spec 索引**（`docs/superpowers/specs/`）：设计总纲 `2026-09-21-ome-lightweight-personal-radio-design.md`、UI 改版 `2026-09-23-ui-redesign-folia-echo-design.md`、移植计划 `2026-09-23-v060-folia-echo-port.md`、**v0.7.0 批次进度 `2026-09-23-v070-ui-deep-dive.md`（每批 hash 与验收点在此追加）**。

---

## 八、常用命令

```bash
npm run tauri dev          # 开发（Rust 改动会自动重编译）
npm run test               # 前端测试
npm run tauri build        # 本地出安装包（先退卡巴斯基）
```

桌面歌词视觉调试（无需起 Tauri）：`npm run dev` 后浏览器开
`http://127.0.0.1:1420/dev-preview/desklyrics.html?state=yrc&size=m&bg=dark`
（state: yrc/lrc/idle/nolyric · size: s/m/l · bg: dark/light，mock IPC 推真实快照帧）。

DJ 人格、B站从属原则、PersonalConfig/ 禁读禁印等纪律条款见 AGENTS.md 与 PROJECT.md，本文不再重复。

## 2026-09-25 第十三批：本地曲目索引移除

在曲库主列表、文件夹曲目和重复候选行加入本地曲目“从曲库移除”入口，并用二次确认说明：曲库索引、歌单引用和播放历史会被清理；磁盘音频文件保留。Rust 命令以单一曲目 ID 在事务中限制并删除 `source='local'` 记录，使用现有外键级联，不读取或操作任何文件；远程曲目、未知 ID 会报错。成功后清理内存队列中的该曲目副本、续播记忆，并更新历史/歌单状态；若当前正在播该曲目，则接播相邻曲目。该批不新增依赖或迁移。

工程验证：`npm run build`、`npm run lint`、`cargo fmt --all -- --check` 与 `cargo clippy --offline -- -D warnings` 通过；测试套件未运行。Playwright 在 1280×720、960×720 和 720×720 预览确认框；720px 下文档宽度仍为 720px、对话框完整落在视口内。通过演示数据验证保留按钮关闭确认框、确认后曲目计数由 3 首变为 2 首。控制台只有既有 `/favicon.ico` 404；构建仍提示 `player.ts` 静态/动态导入分包。没有启动 Tauri，也未连接真实用户数据库。

视觉基线来自 `?demo=library`；本批后的确认框和窄窗曲库截图保存在 `.playwright-mcp/after-v1-track-removal-confirm.png`、`.playwright-mcp/after-v1-track-removal-960.png`、`.playwright-mcp/after-v1-track-removal-720.png` 与 `.playwright-mcp/after-v1-track-removal-list-720.png`。后续曲库失联索引修复与 ECHO watcher 仍待总账排期。

## 2026-09-25 第十四批：内嵌时间轴歌词回退

本地歌词命令现在先返回有效侧车，并额外携带音频标签中的 `Lyrics` / `UnsyncLyrics` 文本；前端只在侧车缺失或无法形成有效时间轴时尝试内嵌内容，再按原逻辑回退网易云匹配。UTF-8 标签文本沿用既有 Base64 传输和歌词解析链，无需读取或改写音频样本，也没有新增依赖、数据库字段或 UI。纯文本 USLT 和 ID3 SYLT 暂不转成歌词行：Ome 当前呈现链要求时间戳，因此不会虚构时间轴。读取标签失败时安静回退，不阻断在线播放/歌词匹配。

工程验证：`npm run build`、`npm run lint`、`cargo fmt --all -- --check` 与 `cargo clippy --offline -- -D warnings` 通过；本批没有运行测试套件。此批不改动 UI，也未启动 Tauri 或连接真实用户数据库。Vite 仍提示既有 `player.ts` 静态/动态导入分包。

## 2026-09-25 第十五批：失联本地曲目路径修复

音乐源设置的曲库健康报告现可展开失联曲目列表，并逐首通过系统文件选择器重新关联。只处理未被规则排除、且所在登记目录当前在线的本地曲目；后端验证目标扩展名、音频可读性、旧路径仍失联及新路径未被其他曲目占用，再在 SQLite 事务中更新同一曲目 ID 的路径和显式访问标记。新增迁移 008。歌单、播放历史、当前队列与续播关系保留；若正在播放该曲目，会从新路径恢复，并尽量回到原播放位置。音频文件不移动、不复制、不改写。

若新文件位于既有扫描目录外，授权范围只包含用户选择的单个 canonical 文件，不会把父目录加入扫描范围；诊断只检查该文件。离线目录需先由用户重新授权，规则排除项不可从此入口恢复。相同文件再次移动后需重新选择；批量修复、网络匹配和实体纠错仍在总账中。

工程验证：`npm run build`、`npm run lint`、`npm run test`（174 项）、`cargo build --offline`、`cargo fmt --all -- --check`、`cargo clippy --offline -- -D warnings` 与 `cargo test --offline`（107 项通过，10 项网络/服务测试按设计忽略）均通过。Vite 保留既有 `player.ts` 同时静态/动态导入提示。Playwright 演示态验证查看列表、逐首修复、列表清空与成功提示；720px 下页面宽度为 720px，无横向溢出。预览服务关闭前控制台无错误或警告；关闭 1421 端口后浏览器记录的 Vite WebSocket 拒连是停止服务的结果。截图位于 `.playwright-mcp/after-v1-unavailable-repair-1280.png`、`.playwright-mcp/after-v1-unavailable-repair-720.png` 与 `.playwright-mcp/after-v1-unavailable-repair-success-720.png`。像素描述服务因缺少会话 ID 未能读取截图，因此布局核验基于可访问性树和 DOM 尺寸；未启动 Tauri、未连接真实用户数据库，原生文件选择器仍需桌面运行时验收。

## 2026-09-25 第十六批：本地资料网易云候选匹配

本地曲目信息编辑器新增可折叠网易云候选区，默认关键词由曲名和艺人组成，用户可自行修改并显式搜索；调用现有 Tauri 网易云搜索，最多显示 10 项曲名、艺人、专辑、时长及与本地曲目的时长差。选择候选只进入预览，点击“填入资料表单”仅修改待编辑字段，必须再点“保存资料”才写入现有曲库覆盖逻辑。检索关键词会发送给网易云；不读取/上传音频、不修改标签、不增加依赖、数据库迁移或 Rust 命令。浏览器演示使用静态候选夹具，不发送网络请求。字段与结果共用弹窗内滚动区，底部保存/取消操作保持可见。

来源/隐私边界：只复用已有网易云搜索端点；QQ/酷狗回退、批量自动匹配、扫描资料快照恢复、逐字段来源追踪及封面/歌词/音频标签写入仍待移植评审。没有连接真实账号或用户数据库。

工程验证：`npm run test`（28 个测试文件、176 项）与 `npm run lint` 通过；停止预览服务后 `npm run build`（含 `tsc`）通过。构建仍有既有 `player.ts` 静态/动态导入提示。Playwright 在 1280×720 与 720×600 走通候选搜索、预览和填入；弹窗范围分别为 x=430/y=80/w=420/h=560 与 x=150/y=48/w=420/h=504，保存操作区均在弹窗内可见；720px 宽时文档宽度为 720px。填入候选后资料区滚动复位至顶部，三个字段可见，保存按钮仍可访问。控制台无错误/警告，仅有自动化焦点已存在时浏览器忽略 `autoFocus` 的 info；演示检索无网易云网络请求。截图为 `.playwright-mcp/after-v1-metadata-candidates-1280.png` 与 `.playwright-mcp/after-v1-metadata-candidates-720.png`。像素描述脚本因服务缺少 `x-opencode-session` 连续返回 `MissingSessionID`，故本批依据可访问性快照和真实 DOM 尺寸复核；未启动 Tauri 或连接真实网易云账号/用户数据库。桌面真实搜索仍待运行时验证。全量功能与资产状态以 `docs/REFERENCE-FEATURE-INVENTORY.md` 为准。

## 2026-09-25 第十七批：本地资料快照恢复

SQLite 迁移 009 为本地人工资料覆盖保存首次修改前的曲名、艺人和专辑；同一事务先记录快照，再更新当前展示资料，后续修正不会覆盖快照。编辑器提供二次确认的“恢复原始资料”；恢复成功后同步曲库、队列和续播状态、移除覆盖标记，并锁定当前编辑器状态。桌面端可离线使用数据库快照。演示模式使用固定本地夹具，不访问网络。

资产核对时发现导入器此前只读取音频专辑标签，却没有写入现有 `albums` 关系。本批修复导入和重扫时的专辑关联；人工覆盖曲目重扫仍保留已修正的艺人和专辑关系，不创建无用的重扫实体。数据库快照保留的是 Ome 首次人工修正时已保存的展示值。迁移前已有覆盖项无法还原历史快照，只在当前音频仍位于用户明确授权的文件/目录范围内且标签可读时使用文件标签回退；不可访问、格式不支持或读标签失败时拒绝恢复且不更改曲目资料。

工程验证：`npm run test`（28 个测试文件、177 项）、`npm run lint`、`npm run build`（含 `tsc`）、`cargo fmt --all -- --check`、`cargo clippy --offline -- -D warnings`、`cargo build --offline` 均通过；`cargo test --offline` 为 109 项通过、10 项按设计忽略的网络/服务用例。Vite 保留既有 `player.ts` 静态/动态导入提示。Playwright 演示态在 1280×720 与 720×600 完成确认、恢复、字段回填和完成操作；窄窗对话框为 x=150/y=79/w=420/h=442，底部按钮区位于弹窗内；页面宽度与视口同为 720px。恢复后候选入口禁用，状态提示可见；控制台 0 错误、0 警告，演示页面未发出动态网络请求。截图为 `.playwright-mcp/after-v1-metadata-restore-confirm-1280.png`、`.playwright-mcp/after-v1-metadata-restore-confirm-720.png`、`.playwright-mcp/after-v1-metadata-restore-success-1280.png` 与 `.playwright-mcp/after-v1-metadata-restore-success-720.png`。视觉描述脚本因服务返回 `MissingSessionID` 不能读取截图，布局复核依据可访问性快照和实际 DOM 尺寸；未启动 Tauri、未连接真实用户数据库，也未读取 `PersonalConfig/`。桌面真实迁移启动与旧覆盖项可访问标签回退仍需在用户实际桌面数据上验收。

## 2026-09-25 第十八批：系统鼠标光标可见性修复

移除沉浸式光标启用时给根节点及所有后代统一设置 `cursor: none` 的规则。跟随环和中心点现在只是鼠标装饰层，保留 `pointer-events: none` 和原有悬停反馈；系统光标始终由操作系统绘制，窗口失焦、页面隐藏、输入设备能力变化或组件卸载时只收起装饰层，不再切换全局隐藏状态。新增组件测试覆盖鼠标移动与窗口失焦。

工程验证：`npm run test`（29 个测试文件、179 项）、`npm run lint`、`npm run build`、`cargo fmt --all -- --check`、`cargo clippy --offline -- -D warnings`、`cargo build --offline` 均通过；`cargo test --offline` 为 109 项通过、10 项网络/服务测试按设计忽略。Vite 仍提示既有 `player.ts` 静态/动态导入分包。Playwright 实测系统光标计算样式为 `auto`，移动事件后装饰环点正常显示，未设置旧隐藏 class；720×600 下无横向溢出，控制台 0 错误、0 警告。截图保存在 `.playwright-mcp/after-v1-system-cursor-visible-1280.png` 与 `.playwright-mcp/after-v1-system-cursor-visible-720.png`。视觉描述服务仍因缺少 `x-opencode-session` 返回 `MissingSessionID`，因此依据 DOM/可访问性尺寸和计算样式核对；此批未启动 Tauri 或访问用户数据。

## 2026-09-25 第十九批：艺人/专辑改名与旧名别名

SQLite 迁移 010 为专辑增加别名字段，艺人沿用现有字段。艺人墙和专辑墙卡片上的编辑入口可修改曲库展示名；保存时同一事务更新实体、保留旧名别名并返回关联本地曲目，前端同步曲库、队列、当前歌单和续播记录。音频重扫和手动资料编辑按当前名优先、别名次之找实体，因此旧文件标签仍会归到改名后的实体。操作不访问网络、不读写音频标签。

若目标名已属于其他实体的当前名或别名，或目标实体关联在线曲目，事务拒绝改名并提示；不会自动合并或拆分实体。改名前弹窗显示曲目数量和作用范围。现有老曲库如缺失 `album_id` 关系，需要用户对已授权目录执行重扫以补齐可编辑的专辑实体；启动迁移不会主动扫描音乐文件夹。

工程验证：`npm run test`（30 个测试文件、181 项）、`npm run lint`、`npm run build`、`cargo fmt --all -- --check`、`cargo clippy --offline -- -D warnings`、`cargo build --offline` 均通过；`cargo test --offline` 为 111 项通过、10 项网络/服务测试按设计忽略。Vite 保留既有 `player.ts` 静态/动态导入提示。SQLite 用例覆盖改名、旧标签重扫归并、重名冲突与在线曲目保护；Playwright 演示态完成专辑/艺人改名和同步，1280px 对话框为 420×257，720×600 对话框 x=182/y=262/w=420/h=257、按钮区仍在视口内；无横向溢出，控制台 0 错误、0 警告，演示没有动态网络请求。截图包括 `.playwright-mcp/before-v1-entity-edit-artists-1280.png`、`.playwright-mcp/before-v1-entity-edit-albums-1280.png`、`.playwright-mcp/after-v1-entity-edit-dialog-1280.png`、`.playwright-mcp/after-v1-entity-edit-dialog-720.png` 与 `.playwright-mcp/after-v1-entity-edit-success-1280.png`。视觉描述服务因缺少 `x-opencode-session` 无法读取截图，依照 DOM 与可访问性布局数据核验；未启动 Tauri、未连接真实用户数据库，也未访问 `PersonalConfig/`。

## 2026-09-25 第二十批：艺人/专辑实体预览后合并

在艺人墙和专辑墙现有编辑器中加入目标选择、影响预览和单独确认。艺人合并会将来源艺人的本地曲目及其专辑并入目标；按专辑名称/别名唯一对应的来源专辑一并整理，其他来源专辑保留 ID 并转挂目标艺人。专辑合并限同一艺人。执行时在 SQLite 事务内重新检查来源与目标、别名唯一性和在线曲目约束；艺人/专辑旧名、艺人流派、曲目 ID、歌单成员和播放历史均保留。若来源侧混有关联在线曲目、别名冲突或映射不唯一则拒绝，目标侧在线曲目保持原样。实现复用现有表和别名列，无新迁移、无网络、无音频标签/文件改动。

第20批完成时，合并是本地曲库关系调整，来源实体会被移除且没有一键恢复；界面在确认前明确显示此限制。较短窗口下弹窗改为贴近视口顶部并在内部滚动。Playwright 演示已确认艺人合并后的分组/数量同步，并完成专辑合并预览；1280×720 弹窗 x=430/y=112/w=420/h=536/bottom=648，720×600 弹窗 x=150/y=52/w=420/h=536/bottom=588，两者均完整落在视口，窄窗 document width=720px。截图为 `.playwright-mcp/after-entity-merge-preview-1280.png` 和 `.playwright-mcp/after-entity-merge-preview-720.png`。当前演示页控制台错误为 0、动态网络请求为 0。

第20批交接时，艺人/专辑拆分、批量候选来源回退和文件标签写入仍未完成；后续状态见第21批，总体缺口见 `docs/REFERENCE-FEATURE-INVENTORY.md`。

## 2026-09-25 第二十一批：艺人/专辑按曲目手动拆分

实体编辑器增加默认收起的拆分区：输入新艺人/专辑名、勾选一部分本地曲目、预览曲目余留及艺人拆分中的专辑转挂/复制，再单独确认。至少保留一首本地曲目属于原实体，名称/别名冲突、重复或已失效的曲目选择会被拒绝。艺人拆分如果某张专辑所有引用都在所选曲目中且专辑归属来源艺人，会保留专辑 ID 并转挂；否则为新艺人复制专辑资料，来源关联和在线曲目保持不变。专辑拆分限制为同一艺人下的新专辑，继承年份/封面引用且不复制旧别名。所有更新在 SQLite 单一事务内复核并提交，保留曲目 ID、队列/歌单/播放历史引用、路径和媒体文件。

所选曲目写入现有 `track_metadata_overrides` 首次资料快照，以便扫描时保留拆分后的实体关系；已存在的首次快照不会覆盖，使用已有曲目资料恢复入口可返回已保存的资料。方案复用迁移 005/009 与实体表，不加新依赖/迁移、不请求网络、不读写音频文件。合并历史没有被拆分数据伪装成可撤销；本操作会建立新实体，合并后的来源归属并没有作为一键恢复记录。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo clippy --offline -- -D warnings` 和 `cargo build --offline` 通过；测试套件未运行。Vite 保留既有 `player.ts` 静态/动态导入提示。Playwright 演示中按曲目完成艺人拆分预览、明确确认、艺人卡片和曲目数同步；专辑实体编辑入口显示单曲专辑不能拆分的约束。720×600 弹窗 x=150/y=52/w=420/h=536，1280×720 弹窗 x=430/y=100/w=420/h=560，内容都可在弹窗内部滚动、页面宽度等于视口；控制台错误 0、动态网络请求 0。截图为 `.playwright-mcp/after-entity-split-preview-720.png` 与 `.playwright-mcp/after-entity-split-preview-1280.png`。截图像素描述工具因 `MissingSessionID` 不可用，依据可访问性快照和 DOM 尺寸核对；未启动 Tauri 或触碰用户数据库/`PersonalConfig/`。后端仅对曲目 ID 使用参数化查询，本批不访问网络或音频路径。剩余 QQ/酷狗回退、批量匹配、逐字段来源和媒体文件标签写入仍在总账中。

## 2026-09-25 第二十二批：MP3 ID3 SYLT 本地歌词

继续沿用第十四批的本地歌词入口：同目录 sidecar 仍优先；sidecar 缺失或不能解析时，读取 MP3 ID3v2 的 SYLT 同步歌词。只接受内容类型为歌词且时间单位为毫秒的帧，将时间码转换为标准 LRC 后交给现有歌词解析与舞台/桌面歌词；MPEG 帧计数与其他 SYLT 内容不猜时间，并继续回退普通音频标签歌词和原在线匹配。读取仅发生在本地曲目，不写标签、不上传音频，不新增依赖、数据库字段或 UI。Lofty 锁定 0.24.0 的 API 已依据官方文档核对。

工程验证：`cargo fmt --all -- --check` 与 `cargo check --offline` 通过；Clippy 待执行。测试套件未运行。桌面实曲播放未验证；总账仍将纯文本内嵌歌词呈现、罗马音、歌词无障碍、舞台配置及其他 P1/P2/P3/P4 缺口列为后续工作。

## 2026-09-25 第二十三批：纯文本内嵌歌词呈现

参考快照中，ECHO 的歌词数据区分 plain / synced，桌面歌词也有纯文本回退；Folia 的 Navidrome 歌词适配器接受 plainLyrics。本批在 Ome 现有标签歌词读取和解析链中加入静态纯文本分支：有效歌词侧车继续优先，其次是可解析的内嵌时间轴歌词，再次才呈现 `Lyrics` / `UnsyncLyrics` 纯文本标签。纯文本不会进入时间轴解析，不显示卡拉 OK 扫光，也不会触发网易云匹配覆盖这份已找到的本地歌词。

首页提供内部滚动的静态歌词区，歌词舞台完整显示并在内容较长时内部滚动，桌面歌词窗口显示前两行且不做伪同步。滚动区域可键盘聚焦；短横向窗口下首页调整为紧凑的唱片与歌词并排布局，避免歌词被播放器栏裁掉。没有新依赖、迁移、命令或音频文件写入；处理只在本机进行。未复制上游实现或素材。

工程验证：`npm run build`、`npm run lint` 与 `cargo check --offline` 通过；未运行测试套件。浏览器预览以本地编码的纯文本夹具走过 `parseLocalLyricPayload` 和首页/舞台显示：1280×720 与 720×600 两档均无横向溢出，纯文本不生成逐行/逐字高亮，浏览器控制台无 error/warn。窄屏确认歌词区域可滚动，紧凑首页可见。截图：`.playwright-mcp/after-plain-home-1280.png`、`.playwright-mcp/after-plain-home-720.png`、`.playwright-mcp/after-plain-stage-1280.png`、`.playwright-mcp/after-plain-stage-720.png`。本地视觉描述脚本因执行环境缺少 `x-opencode-session` 未能生成文字报告；依照运行截图和 DOM 几何数据核对。未启动 Tauri 实际桌面歌词第二窗口，也未访问用户曲库或 `PersonalConfig/`。

## 2026-09-25 第二十四批：命令面板固定快捷槽

参考 Folia 的三槽固定命令能力，在现有 Ctrl+K 命令面板中增加最多三个本地快捷槽。默认放入上一首、下一首和打开播放队列；命令列表的图钉按钮可固定/取消，固定项在顶部常用区一键执行，最近使用仍单独排序。快捷项只保存命令 ID 到 `localStorage`，歌单被删除等动态命令消失时会清除过期 ID；满槽时禁用其他固定入口并说明先取消一项。固定快捷也纳入上下键选择，保留已有 Enter 执行行为。

没有新增依赖、数据库迁移、网络调用或第三方源代码/素材。工程验证：`npm run build` 与 `npm run lint` 通过，`git diff --check` 无空白错误；未运行测试套件。浏览器 `?demo=palette` 预览确认默认快捷槽、取消/重新固定、刷新后仍保留、满槽禁用状态，以及上下键高亮沿着快捷项顺序移动；截图审阅尺寸为 1280×720。既有 Vite `player.ts` 静态/动态导入分包提示仍存在；未启动 Tauri 桌面运行时。

## 2026-09-25 第二十五批：罗马音副字幕与本地 sidecar

本地曲目同目录新增 `.r.lrc` / `.r.vtt` 罗马音文件读取，保持音频文件只读；有时间戳时按歌词时间对齐，无时间戳时按行序和主歌词对应。歌词设置新增“翻译 / 罗马音 / 不显示”副字幕选择，沿用单一偏好状态并同步至首页、三种歌词舞台效果和桌面歌词快照。纯文本内嵌歌词不会推断或生成罗马音；没有匹配到副字幕时保持空白。未新增依赖、数据库迁移或网络请求，未复制上游代码或资产。

工程验证：`npm run build`、`npm run lint`、`cargo check --offline` 与 `git diff --check` 通过；测试套件未运行。浏览器本地演示夹具走过 base64 解码、本地副字幕解析、首页/舞台显示和设置切换；1280×720 截图审阅中歌词层级清楚，副字幕未遮挡主句，设置控件与现有分段样式一致。预览切换设置后已恢复为“翻译”。真实 Rust 文件读取、Tauri 独立桌面歌词窗口及在线音源的罗马音尚未连接验证；既有 Vite `player.ts` 分包提示仍存在。

## 2026-09-25 第二十六批：纯文本歌词罗马音配对

补齐上一批遗留的纯文本歌词路径：本地 `.r.lrc` / `.r.vtt` 或其他已支持格式的罗马音行，先归一化为按内容行序排列的文本，再与无时间轴内嵌歌词的非空行配对。首页和歌词舞台沿用已有副字幕样式；副字幕模式为“罗马音”时显示在主句下方，“翻译 / 不显示”不显示这份罗马音。桌面歌词快照随模式附带首行罗马音；主歌词仍无伪造时间轴，空行分段保留。新增 `?demo=plain-romanization` 仅用于本地视觉检查，不持久化改写用户副字幕偏好。没有添加依赖、迁移、网络请求或第三方代码/资产。

工程验证：`npm run build` 与 `npm run lint` 通过；未运行测试套件。浏览器本地预览以 652×780 窗口检查首页及舞台，AX 树确认每条主句后紧跟对应罗马音，舞台滚动正常；截图中副字幕较主句弱化且可辨。Tauri 独立桌面歌词窗口和实际磁盘 sidecar 尚未验证。既有 Vite `player.ts` 静态/动态导入提示仍存在。

## 2026-09-25 第二十七批：网易云在线罗马音

网易云歌词请求现使用已有 `netease_lyric` 通路请求 `romalrc`，Tauri 命令把可选结果作为 `rlyric` 返回；前端原有的歌词时间对齐、翻译/罗马音/隐藏选择、首页/舞台/桌面歌词渲染因此也覆盖网易云在线歌词。若接口没有 `romalrc`，原文、翻译与逐字歌词继续照常工作。为保持现有 Rust 测试调用兼容，保留三字段辅助读取器并限于测试构建；生产命令使用完整四字段结果。未新增依赖、网络域名或凭据；没有读取用户会话/个人配置，也没有把完整歌词响应写入日志。该在线接口未使用本机账号实曲验证，字段按开源 NetEase 客户端对 `rv=-1` / `romalrc` 的映射实现。

工程验证：`npm run build`、`npm run lint`、`cargo fmt --all -- --check` 与 `cargo check --offline` 通过；未运行测试套件。构建仍有 `player.ts` 静态/动态导入提示。

## 2026-09-25 第二十八批：候选资料逐字段填入

扩展本地曲目信息编辑器的网易云候选预览：保留“填入全部”，新增“仅填曲名 / 仅填艺人 / 仅填专辑”三个草稿操作；候选缺少对应字段时按钮禁用。所有操作只更新弹窗表单，用户手动编辑会撤销候选填入提示，只有“保存资料”才提交到本地曲库；未改数据库结构、音频标签或网络搜索行为。这个批次实现了逐字段采纳，不代表已实现来源追踪、QQ/酷狗回退或批量匹配。

工程验证：`npm run build` 与 `npm run lint` 通过，未运行测试套件。浏览器 `?demo=library-removal` 使用内置候选验证“仅填专辑”保留原曲名和艺人、“仅填曲名”保留其他字段、“填入全部”覆盖三字段，以及手动编辑清除提示；未提交表单。652px 窄窗口候选操作区无水平溢出，弹窗仍可滚动。既有 Vite `player.ts` 静态/动态导入提示仍存在。

## 2026-09-25 第二十九批：逐字段资料来源留档

SQLite 迁移 011 为本地资料覆盖增加曲名、艺人、专辑三个来源字段。显式采纳网易云候选时只标记被填入的字段；手动输入将对应字段标为手动；恢复原始资料会删除覆盖并回到音频标签来源。编辑器字段标签旁显示来源，保存后在曲库 DTO 中返回，重开仍可见。旧覆盖默认“未记录”，实体拆分生成的覆盖也沿用该值；QQ/酷狗枚举为后续候选来源预留，尚无对应查询入口。

来源字段与展示值、首次原始资料快照在同一 SQLite 更新事务中处理。候选只查询已有网易云端点，未上传本地音频；资料覆盖仍只影响 Ome 数据库，不写媒体标签。演示恢复分支同步回填“音频标签”来源。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo check --offline` 与 `git diff --check` 通过；测试套件未运行。浏览器演示中验证逐字段来源从“音频标签”切为“网易云候选”、手动编辑切为“手动修改”、保存后重开仍显示各自来源；快照恢复后三个字段显示“音频标签”。来源文字改为 11px 后检查对话框布局，候选使用本地夹具且无网络请求。Vite 仍有既有 `player.ts` 静态/动态导入提示。没有启动 Tauri 或把迁移应用到个人数据库；旧覆盖在真实桌面数据库中的迁移与启动行为仍待实际运行确认。

## 2026-09-25 第三十批：网易云 / QQ 音乐 / 酷狗候选搜索

曲目信息编辑器候选区增加网易云、QQ 音乐和酷狗的来源切换，维持同一个搜索框、候选列表、预览和逐字段/整项填入流程。Rust 新增独立 `metadata_sources` 查询命令：固定三个来源的服务地址，输入限 200 字、候选限 10 项、请求超时 8 秒、拒绝 HTTP 跳转、响应体上限 1 MiB；不发送音频、文件路径或网易云 Cookie，不将原始响应和含查询词的 URL写进错误。网络候选只返回曲名、艺人、专辑和时长，写入来源字段使用 `netease` / `qq` / `kugou`，保存仍需用户显式确认。未新增依赖、迁移或前端运行时包，也未复制上游实现代码。

参考快照提供 QQ / 酷狗搜索接口形状；QQ / 酷狗网页搜索接口没有可用的官方稳定性承诺，服务端可能限流或改版。只在用户切换来源并点击搜索时才发送检索文字，界面按当前来源显示出站提示。演示候选为本地夹具，不会访问网络。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo check --offline` 与 `git diff --check` 通过；测试套件未运行。浏览器演示覆盖来源切换、候选重置、QQ 与酷狗来源标签、候选预览/逐字段填入；1280×720 弹窗内候选列表可滚动，操作区仍可见，演示页不发出网络请求。Vite 保留既有 `player.ts` 静态/动态导入提示。依照 Context7 Reqwest `Response::chunk()` 文档，在 Cargo.lock 锁定的 reqwest 0.12.28 API 上逐块累计并执行 1 MiB 响应上限，不需打开 `stream` feature；该锁定版本为依据，未升级依赖。当前没有发起真实 QQ / 酷狗 / 网易云搜索请求，也没有启动 Tauri；外部接口与启动期迁移仍待实际桌面环境验证。

## 2026-09-25 第三十一批：批量资料匹配与来源回退

曲库工具栏新增批量匹配入口。用户可选最多 20 首本地曲目；每首只用曲名和艺人文字，按网易云 → QQ 音乐 → 酷狗顺序查找，遇到首个有候选的来源时停止回退，并展示该来源最多 5 个候选供切换。逐字段默认勾选非空值，用户可以改选候选、排除曲目或字段，再通过“保存已选”逐首更新曲库。搜索不写入资料；保存复用既有快照、更新状态同步与迁移 011 字段来源。即使展示值相同，确认保存也会记录此次选用的来源。停止时没有走完来源链的曲目会保留在待继续队列中。

批量审核弹窗挂在应用级浮层，以避开视图入场变换造成的视口裁切；弹窗内容内部滚动、页脚操作固定，窄窗使用可视区域宽度。用户开始匹配后，实际调用只向本次回退经过的来源发送所选曲目的曲名/艺人文字，不上传音频、路径或 Cookie。文件标签写入、封面/歌词候选、导入期间无人值守匹配仍未实现。浏览器演示使用本地固定夹具，覆盖 QQ 与网易云来源命中、多候选切换、字段预览、确认保存，以及编辑器重开后来源标签仍为 QQ；演示不发起网络请求。

工程验证：`npm run build`（含 `tsc`）、`npm run lint` 与 `git diff --check` 通过；未运行测试套件。浏览器演示在约 650×837 窄窗检查选择、审核和应用级全窗遮罩；最初发现视图容器裁切后，移至应用级浮层并复核右边界、底部播放条遮罩及固定操作区。可访问性快照确认最多 5 个候选可切换、所选字段更新，并在演示保存后确认曲库资料及来源标签同步；Dev Server 输出无构建/HMR 错误。构建仍有既有 Vite `player.ts` 静态/动态导入提示。当前未验证真实 Tauri 请求、QQ/酷狗/网易云在线响应或用户曲库；视觉截图通过 CUA 实时审阅，未输出到仓库文件。

## 2026-09-25 第三十二批：单曲音频标签写入与整首恢复

曲目信息编辑器新增单首本地音频的曲名、艺人、专辑标签写回。曲库资料保存与文件写入明确分开；写入需再次确认，并在确认面板列出实际三项内容。只对未被规则排除、当前仍有授权、路径无符号链接且格式受支持的本地文件开放。当前播放器选中的曲目禁止写入/恢复，避免 WebView 占用文件。写入后回读校验标签，再把曲库字段同步为 `fileTags` 来源并清除数据库覆盖。

首次写入前在 `app_data_dir()/audio-tag-backups/` 保存整首音频副本，后续写入保留同一首次恢复点；写入使用同目录临时副本，校验后替换源文件，出现失败时尝试回滚。编辑器显示备份大小并提供逐次确认的“恢复整首文件”和“删除备份”。恢复是完整替换音频文件，不只恢复三个标签；删除备份不改当前音频。备份是本机未加密媒体副本，文件级操作不出网。沿用 Cargo.lock 中的 Lofty 0.24.0，无新增依赖、数据库迁移或文件权限范围；接口依据 [Lofty 0.24.0 官方文档](https://docs.rs/lofty/0.24.0/lofty/file/trait.TaggedFileExt.html)。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo check --offline`、`cargo clippy --offline -- -D warnings` 与 `git diff --check` 通过；未运行测试套件。CUA 在约 650×837 的 `?demo` 窗口检查编辑器展开态、桌面版提示、固定页脚和内部滚动；网页演示不显示虚假的文件状态或成功结果。未启动 Tauri、未修改用户音频/数据库，也未读取 `PersonalConfig/`。因此 Rust 编译已确认，Lofty 实际写文件、权限拒绝/回滚和首次备份恢复仍需后续桌面运行时验证。构建保留既有 Vite `player.ts` 静态/动态导入提示。封面/歌词标签和批量文件写入仍在总账中。

## 2026-09-25 第三十三批：已加载主歌词内嵌写入

沿用曲目信息编辑器中的授权路径与单曲文件标签命令，增加“嵌入已加载的主歌词”。歌词来自现有内存缓存：优先保留有效 LRC，其次将网易云逐字 YRC 行折算为普通 LRC 时间戳，最后使用纯文本主歌词。翻译与罗马音不混入，按钮不触发新的歌词查询。目标曲目若仍是播放器当前曲目，写入入口保持禁用；用户需看过行数、预览和整首恢复说明后再次确认。

Rust 写入端对歌词长度设上限；ID3v2 使用 `UnsyncLyrics`，其他支持的标签格式使用 `Lyrics`，不支持的格式明确拒绝。歌词与原有三项元数据通过同一临时文件、首次整首备份、回读校验及失败回滚链写入；歌词单独写入不会改动曲库资料。成功后只移除本次临时恢复副本，首次备份保留。实现依据锁定 Lofty 0.24.0 的 `Tag::insert_text` / `remove_key` API：[Lofty 0.24.0 Tag 文档](https://docs.rs/lofty/0.24.0/lofty/tag/struct.Tag.html)。未新增依赖、迁移、授权目录或网络请求。

总账修正：本地/网易云罗马音副字幕已由此前批次实现，不再列为待移植；MV 匹配仍待评估。歌词标签单曲写入已接入，但封面写入、封面/歌词候选和批量媒体标签仍缺。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo check --offline`、`cargo clippy --offline -- -D warnings` 与 `git diff --check` 通过；未运行测试套件，未在 Tauri 桌面运行时实际改写用户音频。CUA 在 1280×720 和 650×837 检查编辑器展开态；窄窗弹窗宽 420px、无横向溢出，控制台 error/warn 为 0。网页演示只显示桌面版提示，不暴露文件写入或确认状态，因此不能据此评审桌面专属确认面板；Lofty 对实际格式的读写、ID3 写入和故障回滚仍需后续在隔离夹具或桌面验证。既有 Vite `player.ts` 静态/动态导入提示保留。

## 2026-09-25 第三十四批：单曲封面写入

在曲目信息编辑器的本地音频操作中增加单曲正面封面选择、预览与二次确认。仅接受 PNG/JPEG，前端与 Rust 均限制最大 8 MB、最长边 10,000 像素、总像素 4,000 万；只把选择图片的 base64 和 MIME 交给本机 Rust 命令，不发送文件路径或网络请求。桌面端仅对仍授权且未被当前播放器选中的曲目开放写入；网页演示只允许本地预览，不伪造写入成功。

写入沿用 Lofty 0.24.0 的标签能力和现有首次整首音频备份。生成音频临时副本后回读确认正面封面字节/MIME；封面缓存也先暂存并校验，随后更新曲目 `cover_path`。音频、缓存或曲库同步失败时，尝试恢复源音频和先前缓存；成功后播放器各曲库视图同步新路径。缓存继续使用曲目 ID 文件名，保持现有 `ome-media` 404 自愈路径。未新增依赖、数据库迁移、文件授权范围或远程请求。Lofty API 依据锁定版本源码与 [Lofty 0.24.0 Picture 文档](https://docs.rs/lofty/0.24.0/lofty/picture/struct.Picture.html)。

工程验证：`npm run build`（含 `tsc`）、`npm run lint`、`cargo fmt --all -- --check`、`cargo check --offline`、`cargo clippy --offline -- -D warnings` 与 `git diff --check` 通过；未运行测试套件，未在 Tauri 桌面运行时实际改写用户音频。网页演示在 1280×720 与 650×837 检查单曲封面选择、合法 PNG 预览、对话框滚动和横向溢出；弹窗宽 420px，窄窗无横向溢出。浏览器控制台只有既有 `/favicon.ico` 404，无新增错误或警告。构建仍有原有 Vite `player.ts` 静态/动态导入提示。Lofty 对具体音频格式的实际写入、首次备份、文件占用与故障回滚仍待隔离音频夹具或桌面运行时验证；本轮没有写入用户音频或数据库。

视觉证据保存在 `artifacts/cover-write-before.png`、`artifacts/cover-write-after-1280.png` 与 `artifacts/cover-write-after-650.png`。总账后续仍需处理导入期间无人值守匹配、封面/歌词候选、批量媒体标签、MV 与其他待评估能力；整轮参考项目移植尚未完成。

## 2026-09-25 第三十五批：单曲资料候选封面预览

网易云、QQ 音乐和酷狗的单曲资料候选现在会携带经 Rust 校验的封面地址。用户点按“预览封面”后，图片才经现有 `ome-media` 协议的 `/remote-cover` 路由请求。代理仅接受 HTTPS 的 `126.net`、`gtimg.cn`、`kugou.com` 及其子域；每次跳转都重新校验，最多 5 次，连接/总超时为 5/8 秒，并限制为 8 MB PNG/JPEG、最大边长 10,000 像素且总像素不超过 4,000 万。代理不写磁盘缓存。

“选为待写入封面”只把这张图交给已有的本地音频封面操作，并展开其确认区域；候选预览和选择本身不会修改曲库或音频。真正写入仍需用户在现有确认面板单独确认，并沿用首次整首备份、回读校验和失败回滚。网页演示使用本机 Canvas 生成图片，仅用于检查预览与选择流程，不访问图片服务，也不模拟文件写入。

工程验证：`cargo fmt --all -- --check`、`cargo check --offline`、`cargo clippy --offline -- -D warnings`、单测 `metadata_cover_urls_require_https_and_known_provider_hosts`、`npm run lint` 与停止开发服务器后的 `npm run build` 均通过。构建保留既有 Vite `player.ts` 静态/动态导入提示。Playwright 检查了 1280×720 与 650×837：对话框内容区可滚动、420px 弹窗无横向溢出，固定页脚保持可见；控制台错误 0，演示网络请求仅为本机 Vite 资源。视觉截图位于 `artifacts/metadata-cover-before-results.png`、`artifacts/metadata-cover-after-preview.png`、`artifacts/metadata-cover-after-preview-loaded.png`、`artifacts/metadata-cover-after-select.png` 和 `artifacts/metadata-cover-after-650.png`。尚未启动 Tauri 或验证实际提供方响应及其跳转行为；没有修改用户音频或数据库，也未读取 `PersonalConfig/`。

## 2026-09-25 第三十六批：本地曲目网易云歌词候选

本地曲目信息编辑器新增折叠式在线歌词候选区。用户显式搜索后，以曲名/艺人文字调用现有网易云搜索；选择一项预览后才读取那一首歌词。候选主歌词可“记住到本次会话”，只写入进程内缓存，退出应用后不保留；也可选为待嵌入歌词，编辑器将其送入已有音频标签操作区，只有在独立的写入确认后才可能修改授权音频。歌词翻译和罗马音不混入，预览限制行数，写入长度遵守既有 Lofty 命令限制。

视觉验收中发现预览面板起初出现在弹窗滚动区之外。本批为预览增加自动滚入可视区的行为，并在系统开启减少动态效果时使用即时滚动。会话缓存、待嵌入和音频写入保持分离；未新增依赖、数据库迁移或文件权限。ECHO 的 LRCLIB / AMLL / QQ / 酷狗 / 酷我候选来源、持久歌词库和候选风险评分仍未移植，本批不是 ECHO 歌词抽屉的完整移植。

工程验证：`npm run test`（30 个文件、185 项）、`npm run lint`、`npm run build`（含 TypeScript 检查）与 `git diff --check` 全部通过。首次全量测试暴露艺人编辑器旧断言同时匹配重命名和拆分提示；断言已限定到重命名说明，修正后全量通过。构建保留既有 Vite `player.ts` 静态/动态导入提示。Playwright `?demo=library` 覆盖本机搜索、候选预览、会话内记住和待嵌入状态；预览和选择候选后，结果及音频操作区会各自滚入可视区。演示明确不访问网络、不模拟文件写入。1280×720 与 650×837 下弹窗内部滚动和固定页脚正常；650px 宽时弹窗 420px、内容区 390px、无横向溢出，待嵌入状态可见。页面控制台 error/warn 均为 0，演示无外部网络请求。截图位于 `artifacts/lyrics-candidates-before.png`、`artifacts/lyrics-candidates-after-preview.png`、`artifacts/lyrics-candidates-after-pending.png` 和 `artifacts/lyrics-candidates-after-650.png`。真实 Tauri 网易云请求、歌词内容与 Lofty 实际写入/回滚未在本批验证；没有改动用户音频或数据库，未读取 `PersonalConfig/`。

## 2026-09-25 第三十七批：AMLL 与 LRCLIB 歌词候选

曲目信息编辑器的折叠歌词候选区新增 AMLL 与 LRCLIB 来源切换，网易云现有流程保留。AMLL 使用其原生 `/v1/lyrics/search` 返回曲目信息，只有用户预览时才按 ID 请求 TTML，并经既有 TTML 解析器转成标准歌词文本；LRCLIB 使用 `/api/search` 与 `/api/get/{id}`，候选搜索响应本身包含歌词字段，Rust 只把曲名、艺人、专辑、时长和编号交给前端，预览按钮再请求所选 ID。候选可继续记入本次会话或设为待嵌入；嵌入仍需独立确认并复用既有整首备份、校验与回滚链。

两个固定 HTTPS 服务均由 Rust 命令访问，限制搜索词 200 字、候选最多 8 项、响应最多 1 MiB、超时 8 秒、拒绝跳转；编号只接受范围内的十进制数字。429 会遵守服务给出的 `Retry-After` 提示，等待期间不自动重试。只发送用户输入的检索文字，不发送音频、文件路径或网易云 Cookie。没有持久歌词库、数据库迁移、新依赖或随包媒体资产。权威 API 约定见 [AMLL 原生接口](https://amll.dev/reference/http-api/native)、[AMLL LRCLIB 兼容接口](https://amll.dev/reference/http-api/lrclib) 和 [LRCLIB 官方 API 文档](https://lrclib.net/docs)。

视觉复查发现添加来源切换后，候选列表首屏被弹窗滚动边界遮住；现已在搜索结束时自动把候选滚入视区，预览仍独立滚入视区并遵守减少动态效果。演示页面的来源切换、候选搜索、AMLL TTML 转换和预览在 `?demo=library` 中使用本机夹具，不调用外部服务或模拟音频写入。截图位于 `artifacts/lyrics-sources-before-expanded.png`、`artifacts/lyrics-sources-after-search-v2.png`、`artifacts/lyrics-sources-after-preview-1280.png` 与 `artifacts/lyrics-sources-after-preview-650.png`。

工程验证：歌词编辑器与歌词状态的 14 项前端测试通过；Rust 歌词来源解析/编号 3 项单测通过；`npm run build`、`npm run lint` 与 `git diff --check` 通过。构建保留既有 Vite `player.ts` 静态/动态导入提示。Playwright 检查 1280×720、650×837：候选列表与预览自动滚入可见区域，窄窗无横向溢出；控制台错误 0。真实 Tauri 对 AMLL/LRCLIB 网络服务的请求与实际音频标签写入仍未验证；没有改动用户音频、数据库或私密目录。

## 2026-09-25 第三十八批：QQ 音乐、酷狗与酷我歌词候选

现有本地曲目信息编辑器新增 QQ 音乐、酷狗和酷我来源；连同网易云、AMLL 和 LRCLIB 共六种单曲歌词来源。沿用折叠候选区、用户显式搜索、选中后预览、会话记忆或待嵌入，以及独立音频写入确认。QQ 返回的 QRC、可用翻译和罗马音归一到现有歌词解析/副字幕状态；逐字时间轴作为现有 `RawLyric` 内容进入缓存。LRCLIB 搜索响应若含歌词正文，Rust 只返回曲目信息，预览阶段才按候选编号读取正文。

新接入来源由 Rust 使用固定 HTTPS 主机/路径和提供方专属编号验证，搜索关键词限制 200 字，最多 8 个候选，响应体不超过 1 MiB、请求超时 8 秒并拒绝重定向。查询只发送用户输入的曲名/艺人文字，不发送音频、路径或网易云 Cookie。酷狗候选编号中的 accesskey 只用于该候选对应的固定歌词下载请求，不是账户凭据。QQ、酷狗、酷我端点依据工作区外 ECHO 本地参考快照适配，可能变化或限流，不能视为官方稳定 API；酷狗官方开放页面描述开放平台和播放器组件，不足以证明网页歌词路径的稳定性：[酷狗开放平台](https://open.kugou.com/control/list)、[酷狗曲库开放组件](https://open.kugou.com/docs/open-player/)。未新增依赖、数据库迁移、文件权限、持久歌词库或随包资产。

这批接入的是单曲候选搜索/预览，不包含 ECHO 的本地歌词候选聚合、持久歌词库、候选置信度/风险评分、批量媒体标签写入、导入期间自动匹配或全部歌词 UI。候选不自动更新曲库或音频；记入会话仅驻留当前进程，待嵌入仍经过单独确认并沿用整首音频备份、回读校验和回滚流程。

CUA 在本机 `?demo=library` 固定夹具中检查了 1280×720 和 650×837：来源按钮五加一换行；窄窗文档宽度 650 CSS 像素、对话框边界 115–535、预览边界 134–508，均未越出视口；内部滚动与固定页脚工作正常。选择 QQ 来源后，演示候选和歌词预览均由本机固定夹具提供，明确不访问网络。视觉检查截图在本轮即时查看，未新增截图文件。

工程验证：`npm run test`（30 个文件、192 项）、`npm run lint`、`npm run build`（含 TypeScript 检查）、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo test --locked --offline --manifest-path src-tauri/Cargo.toml`（125 项通过、10 项真实网络/凭据测试忽略）、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 与 `git diff --check` 均通过；歌词来源单独 10 项测试也通过。构建保留既有 Vite `player.ts` 静态/动态导入提示。干净的本机演示页控制台 error/warn 为 0；QQ 搜索/预览由固定夹具提供，不访问外网。CUA 检查 1280×720、650×837 窗口的换行、弹窗滚动、预览范围和固定页脚；窄窗文档宽度等于视口宽度。本轮即时查看截图，未另存图片文件。真实 Tauri 端点响应、速率限制行为和 Lofty 实际音频写入/恢复未在本批验证；没有修改用户音频或数据库，也未读取 `PersonalConfig/`。

## 2026-09-25 第三十九批：歌词候选本地匹配估算

在六种歌词来源候选卡片上增加纯本地匹配估算，参考曲名、艺人、专辑、时长和版本标记，并以短理由解释分数。对现场版、翻唱、伴奏/卡拉 OK、混音、原声、短版/电视版、完整版、重制版、Demo、电台剪辑等版本差异优先提示；身份信息缺失或不符时采用保守上限。界面明确标注分数不是概率。估算不更改提供方顺序，不触发额外搜索，不自动选曲、不更新元数据/会话缓存，也不准备音频写入。

新增 `src/lib/lyrics-match.ts` 与 5 项纯逻辑测试；曲目信息编辑器组件新增 1 项界面/副作用测试。仅新增 TypeScript/CSS 源码和测试，没有数据库迁移、运行时依赖、外部媒体资产或网络行为。资产盘点已将本地单曲候选估算标为已接入；ECHO 跨来源歌词候选聚合、持久歌词库、导入期间无人值守匹配及批量媒体标签仍待处理。

工程验证：`npm run test`（31 个文件、198 项）、`npm run lint`、`npm run build`（含 TypeScript 检查）通过。构建保留既有 Vite `player.ts` 静态/动态导入提示；Rust 未改动。CUA 干净本机演示页加载检查视口为 1280×720、文档宽度无溢出，控制台 error/warn 为 0；候选分数与版本警示的桌面/窄窗截图已在本轮即时查看，未另存新文件，窄窗检查为 650×837。浏览器演示使用本地固定歌词夹具，不访问第三方网络。真实 Tauri 来源请求和音频写入仍未在本批验证；没有修改用户音频、数据库或私密目录。
## 2026-09-25 第四十批：用户触发的歌词多来源汇总

本地曲目信息编辑器新增次级“搜索全部来源”动作，保留原有单来源搜索。用户点击后并行查找网易云、AMLL、LRCLIB、QQ 音乐、酷狗和酷我，每个来源最多取 8 个候选；结果用上一批完成的本地匹配估算降序组织，评分相同时按固定来源顺序稳定排列。每张结果显示来源标签；候选 ID 按“来源 + 编号”区分，预览时始终用候选自己的来源读取歌词。

网络请求只在用户点击后发出，向六个服务发送当前检索关键词；搜索接口只回传候选元数据，预览时才读取选中的歌词。不上传音频、路径或 Cookie。采用独立错误收集，某个来源失败会说明来源并保留其他成功结果；全失败则给出单独错误。没有自动选取、会话缓存写入、媒体文件修改或持久歌词库。

演示模式固定候选覆盖六个来源和版本冲突排序，不进行网络访问。新加两项组件回归测试覆盖显式触发/六源并行/本地排序/按源预览，以及单源失败时保留成功候选。CUA 在 1280×720 与 650×837 检查结果来源标记和排序、弹窗内滚动、固定页脚及无横向溢出；本轮复查 650×837 窄窗截图后，将来源标签字号由 9px 调整为 10px，标签与候选说明更易区分；截图即时查看、未另存新文件。真实 Tauri 网络延迟、并发限流与各服务实际故障形态仍待端到端观察。

工程验证：`npm run test`（31 个文件、200 项）、`npm run lint`、`npm run build`（含 TypeScript 检查）与 `git diff --check` 均通过。构建保留既有 Vite `player.ts` 动静态导入提示；本批未改 Rust、依赖或数据库结构。真实 Tauri 网络延迟、并发限流与各服务实际故障形态仍待端到端观察；演示仅访问本机固定夹具，没有修改音频或数据库，也未读取 `PersonalConfig/`。

## 2026-09-25 第四十一批：用户保存的本地歌词库

本地曲目信息编辑器在候选歌词预览中新增“保存到歌词库”。只有用户显式保存才持久化；它独立于会话缓存和音频嵌入。每首本地曲目仅保留一个保存候选，替换需确认，移除需确认。播放顺序为 sidecar/音频标签优先，其次读取保存的候选，最后尝试在线匹配；移除曲目会级联删除歌词记录。

新增 `src-tauri/migrations/012_saved_track_lyrics.sql`、Rust DTO/校验及保存/读取/删除 Tauri 命令，并在 `src/lib/api.ts` 暴露前端接口。输入限制来源、候选编号、字段长度和 JSON 大小/结构；仅接受本地且未排除曲目。保存记录留在 SQLite，不改音频字节、文件路径或网络状态。没有运行时依赖和静态媒体新增。

前端用例覆盖预览后明确保存且不调用音频嵌入、移除需确认和本地播放回退顺序。后端内存 SQLite 用例覆盖记录往返、同曲替换、主动删除、曲目外键级联和非法/过大输入拒绝。验证结果：`npm run test`（31 个文件、205 项）、`npm run lint`、`npm run build`、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo test --locked --offline --manifest-path src-tauri/Cargo.toml`（127 项通过、10 项网络/凭据测试忽略）、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 均通过。`git diff --check` 已通过；Windows Git 输出的换行转换提示不是差异错误。

CUA 使用本机 `?demo=library` 固定夹具检查 1280×720 和 650×838：弹窗内歌词列表可滚动、固定页脚完整可见、文档横向宽度与视口相同；演示保存按钮按预期禁用，演示不调用 Tauri 写库。控制台 error/warn 为 0。截图在本轮即时查看，未写入资产目录。真实桌面 Tauri IPC、升级用户现存数据库与设备上的播放回退仍待桌面运行时验收；没有修改用户音频、实际数据库或 `PersonalConfig/`。

## 2026-09-25 第四十二批：文件夹范围的批量资料匹配

曲库页现按上下文复用同一个“批量匹配资料”动作：全库页面沿用原有范围，进入文件夹详情后，动作改为“匹配当前文件夹”，只把当前文件夹内的曲目送入现有批量审核弹窗。每批仍最多 20 首；网络查询由用户在弹窗继续显式启动，候选逐首、逐字段审核，确认后才更新曲库。

本批将 Folia 文件夹“整理歌曲信息”入口适配到 Ome 已有的批量来源回退/审核流程，没有引入自动保存、后台网络请求、新接口、数据库迁移、运行时依赖或媒体资源。选择当前文件夹不会改变音频文件，也不改变匹配的曲名/艺人文本隐私边界。

CUA 在固定演示库打开“夜行”文件夹，确认按钮文案和帮助文本体现当前范围；弹窗仅列出该文件夹的“远处的灯”，匹配后仍显示原曲/候选选择与逐字段审核。1280×720、650×838 下入口和弹窗页脚均可见，文档宽度与视口一致；控制台 error/warn 为 0。截图即时查看，未写入资产目录。

验证：npm run test（31 个文件、205 项）、npm run lint、npm run build 通过；构建仍有既存的 player.ts 静态/动态导入提示。Rust 未改动，迁移 012 的后端验证沿用第四十一批结果。Folia 导入期间自动匹配和批量音频标签写入仍待迁移；真实 Tauri 服务响应/数据库写入不在本次演示验证范围内。

## 2026-09-25 第四十三批：专辑音频标签逐曲批量编辑

参考 ECHO 的专辑标签编辑抽屉，在 Ome 专辑墙增加“编辑专辑标签”入口。用户可先读取首曲目的内嵌专辑标签，再统一编辑专辑名、专辑艺人、年份、流派；也可选择 PNG/JPEG 封面并预览。保存前再确认目标曲目数和将写入的值。年份限四位有效数字；没有先读取标签时不能开始写入，避免空白字段误清除已有标签。专辑名混有其他音源时不开放批量改名。

写入只处理该专辑的本地文件，按曲目顺序复用现有 Lofty 0.24.0 命令、授权范围检查、首次整首备份、临时副本、回读验证与失败恢复。当前播放中的专辑禁用写入，并在批处理中再次检查播放状态；标签操作只写专辑字段，不改曲名、曲目艺人或歌词。封面逐曲单独嵌入并更新封面缓存。任一曲目失败即停止后续写入，界面显示已完成数量；跨文件不做自动回滚，每个已写文件仍有其最初恢复点。曲库专辑名只在所有文件写入成功后同步。

这批没有数据库迁移、运行时依赖或联网行为；封面只接受用户本地选择的 PNG/JPEG。ECHO 的网络专辑候选、直接打开专辑目录和删除专辑尚未移植。Lofty 依据 `Cargo.lock` 锁定 0.24.0，并检查该版本本地 crate 源码中的 `ItemKey` 和 `Tag` 写入/读取接口。

验证：`npm run test`（31 个文件、205 项）、`npm run lint`、`npm run build`、Rust 单测（129 项通过、10 项需要真实网络/凭据而忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 与 `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 通过。构建保留既有 Vite `player.ts` 静态/动态导入提示。CUA 在 470×658 演示视口检查标签编辑弹窗、字段校验、未保存关闭确认与内部滚动；弹窗边界为 8–462px，弹窗内容没有横向溢出，页面横向滚动宽度也已收回至视口宽度。控制台 error/warn 为 0。演示写入按钮在浏览器模式中按预期禁用；未启动 Tauri、未修改用户音频或数据库，也未读取 `PersonalConfig/`。

## 2026-09-25 第四十四批：自选曲目批量写入共同专辑标签

曲库列表和文件夹详情新增“批量写标签”入口。用户可搜索并手选最多 20 首本地曲目，列表去重后进入同一个标签编辑器；选择范围可以跨专辑。编辑器先读取首曲目的内嵌专辑名、专辑艺人、年份和流派，用户可选择 PNG/JPEG 封面，再二次确认本批曲目数和字段值。写入范围只包含共同专辑字段与可选封面，不改曲名、曲目艺人或歌词。

音频写入沿用 Lofty 0.24.0、已有目录/单文件授权检查、软排除/失联/符号链接/不支持格式拦截、首次整首备份、临时副本、回读校验和失败恢复。逐曲串行执行，播放中的目标曲目会被拒绝；遇错即停并显示部分完成数量，不跨文件自动回滚。每个已成功文件保留自己的首次恢复点，并逐首同步曲库专辑归属；同步保留曲名、曲目艺人字段来源和已有首次修正快照。没有新增迁移、运行时依赖、文件权限或网络请求。

设计沿用现有批量匹配选择范围和标签编辑器，不引入常驻选择状态或后台批处理。列表和文件夹入口都明确显示操作范围，选择器支持按曲名/艺人/专辑筛选；二次确认前可取消。浏览器演示不暴露 Tauri 写入命令，不能用于证明真实媒体写入成功。

工程验证：`npm run test`（32 个文件、209 项）、`npm run lint`、`npm run build`（含 TypeScript 检查）、Rust 全量单测（130 项通过、10 项因真实网络/凭据依赖而忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 与 `git diff --check` 通过。构建仍有原有 Vite `player.ts` 静态/动态导入提示。

Playwright/CUA 在固定 `?demo=library` 页面检查列表入口、跨专辑选择、选择数量和编辑器状态。1280×720、650×838 与 470×658 视口均无横向溢出；470px 宽时页面文档宽度为 470px，编辑器页脚完整可见，正文可滚动。截图位于 `artifacts/batch-audio-tags-list-1280.png`、`artifacts/batch-audio-tags-selector-1280.png`、`artifacts/batch-audio-tags-editor-1280.png`、`artifacts/batch-audio-tags-editor-650.png` 与 `artifacts/batch-audio-tags-editor-470.png`。演示写入保持禁用。浏览器控制台报告开发页 `/favicon.ico` 404，未发现其他错误/警告；这是开发预览静态资源请求，未改动应用图标或资源配置。

真实 Tauri 文件写入、具体格式的 Lofty 行为及文件故障回滚仍需隔离音频夹具或桌面运行时验证。本批未改动用户音频、实际数据库或 `PersonalConfig/`。剩余批量差距为任意字段/歌词批量写入和导入期间自动匹配；整轮参考项目移植仍未完成。

上一条记录的 ECHO 单曲音轨号/碟号/BPM/备注缺口已由本批接入；原始基线仍保存在 `artifacts/batch-track-fields-before.png`、`artifacts/batch-track-fields-editor-before.png`、`artifacts/track-metadata-before.png` 与 `artifacts/audio-tag-panel-before.png`。

## 2026-09-25 第四十五批：单曲完整内嵌标签编辑

曲目信息编辑器的本地音频区新增完整单曲标签读取与编辑：曲名、艺人、专辑、专辑艺人、年份、流派、音轨号、碟号、BPM 和备注。用户先读取当前文件标签，再逐字段修改并二次确认。音轨号/碟号的总数只展示、不编辑；写入时保留原总数。只改专辑艺人、年份、流派、音轨号、碟号、BPM 或备注不会更新曲库展示资料；曲名、艺人、专辑任一改变时，三项标签一起写回并同步曲库资料。原有“写入当前三项曲库资料”快捷操作保持独立。

前端按差异只发送变更字段，写入仍复用本地目录/单文件授权、拒绝规则排除/失联/符号链接/不支持格式、当前播放曲目锁、首次整首备份、临时副本、回读校验、替换后校验及失败回滚。数字校验限制音轨号/碟号为正整数或清除、年份为 1000–9999、BPM 为 1–999；备注上限 4,000 字。超长原备注在界面中只显示前 4,000 字并禁用备注编辑，其他标签写入时保持原备注不变。全程不联网、不上传路径或音频，也没有数据库迁移或新运行时依赖。

Lofty API 依据 `Cargo.lock` 锁定的 0.24.0：先用 Context7 核对当前文档，再直接核对本机该锁定版本源码中的 Accessor、`ItemKey::Bpm` / `IntegerBpm` 和 `TagType` 行为。In-memory Rust 用例覆盖正整数/BPM/备注长度校验、保留音轨和碟片总数、ID3 BPM 键选择、Vorbis BPM 键以及超长备注读取截断。

前端组件用例覆盖读取、只写变更字段、额外标签不更新曲库资料、核心三字段整组同步，以及浏览器演示中的实际音频写入禁用。`?demo=library` 使用固定示例，不读本机文件或发起网络请求。Playwright 在 1280×720、650×838、470×658 下核对对话框边界、字段栅格、内部纵向滚动和页面横向宽度；三个视口的文档宽度分别等于 1280、650、470px。截图为 `artifacts/track-audio-tags-after-1280.png`、`artifacts/track-audio-tags-after-650.png`、`artifacts/track-audio-tags-after-470.png` 与 `artifacts/track-audio-tags-after-470-details.png`。浏览器控制台只有开发预览的 `/favicon.ico` 404，没有其他错误/警告；浏览器演示中标签写入按钮保持禁用。

工程验证：`npm run test`（32 个文件、212 项）、`npm run lint`、`npm run build`、Rust 单测（134 项通过、10 项真实网络/凭据用例忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 与 `git diff --check` 通过。Vite 保留既有 `player.ts` 静态/动态导入提示。本机截图识别脚本因缺少 `x-opencode-session` 返回 `MissingSessionID`，因此未完成基于像素的独立视觉评审；本轮只依据 Playwright 可访问性快照与实际 DOM 尺寸核对布局，不能据此宣称视觉评审通过。真实 Tauri IPC、具体音频格式的 Lofty 文件写入与故障回滚仍待桌面端或隔离音频夹具验证；本批未改用户音频、实际数据库或 `PersonalConfig/`。剩余差距以参考功能总账为准，整轮移植仍在进行。
## 2026-09-25 第四十六批：所选曲目逐首完整内嵌标签批量编辑

列表和当前文件夹的批量标签选择器保留“共用专辑标签”，并新增“逐首编辑完整标签”。最多选择 20 首本地曲目；每首都要显式读取自己的内嵌标签，编辑曲名、艺人、专辑、专辑艺人、年份、流派、音轨号、碟号、BPM 和备注。顶部会显示已读取数、改动曲目数，曲目列表标记待读取/已读取/有改动；桌面端为曲目列表加字段表单，窄窗切换为单列曲目选择器。重新读取会覆盖草稿，因此有未写入改动时禁止重读，关闭时要求确认是否丢弃。

提交前列出每首曲目与变更字段并二次确认。只发送变化字段；修改曲名、艺人或专辑时才同步该曲曲库资料。音轨号/碟号总数保留不变；超长备注保持原文且不可改写；无效年份、编号、BPM 或必填核心标签会阻止开始写入。写入沿用已有安全命令：桌面授权、拒绝规则排除/失联/符号链接/不支持格式、当前播放锁、每曲首次整首备份、临时副本、回读校验、失败回滚。按选择顺序串行执行，途中失败即停，不跨文件自动回滚；已成功曲目保持各自恢复点。没有新网络请求、数据库迁移、运行时依赖或文件授权。

共享层新增 src/lib/track-audio-tags.ts 保存单曲和批次共用的标签表单转换、变更计算与输入校验；单曲编辑器使用同一转换逻辑。新增 BatchTrackAudioTagEditor 与共享字段视图；原来的共同专辑标签流程继续独立。

验证：npm run test 全量 33 个文件、215 项通过；npm run lint、npm run build（含 TypeScript）通过。Vite 继续报告已有 player.ts 静态/动态导入提示。Playwright 固定 ?demo=library 检查选择器和逐首编辑流程；1280×720、650×838、470×658 对话框均在视口内，470px 下表单单列纵向滚动、底部按钮保持可见。浏览器演示写入按钮禁用，动态请求为 0，控制台错误/警告为 0。截图位于 artifacts/batch-track-complete-tags-before-1280.png、artifacts/batch-track-complete-tags-editor-before-1280.png、artifacts/batch-track-complete-tags-after-1280.png、artifacts/batch-track-complete-tags-after-650.png、artifacts/batch-track-complete-tags-after-470.png。

截图识别脚本因缺少 x-opencode-session 返回 MissingSessionID，因此未完成截图像素评审；本批只依据 Playwright 辅助功能快照和元素边界检查交互与布局，不能宣称视觉评审通过。真实 Tauri IPC、实际文件格式兼容、真实媒体写入与回滚仍待隔离音频夹具或桌面端验证。未修改用户音频、实际数据库或 PersonalConfig/。总账复核：Folia 的批量资料匹配是用户显式启动，当前项目已接入；快照没有导入期间后台自动匹配的证据。ECHO 快照仅实现单曲歌词嵌入，多首批量歌词写入不列为上游缺口。整轮移植继续。

## 2026-09-25 第四十七批：专辑墙打开专辑文件夹

专辑墙的本地专辑卡片新增文件夹图标入口，桌面端可打开其中首个当前有效授权的本地曲目所在目录；曲库中的单曲分组和没有本地曲目的专辑不提供该操作。浏览器演示保持禁用。后端只接受专辑 ID，从数据库查询本地、未按规则排除的曲目，逐项复核已授权目录/单文件访问、文件存在及无符号链接，再规范化目录并调用系统文件管理器。界面不传文件路径，进程使用固定平台命令与单独路径参数，不经过 shell。无新增依赖、数据库迁移、网络访问或用户媒体修改。

产品取舍：入口复用现有专辑墙的圆形动作按钮，放在封面左上角，不挤压专辑名、艺人或播放信息。窄窗布局仍使用相同卡片栅格与控件尺寸。验证通过 `AlbumGrid` 桌面可用/网页禁用的 2 项前端用例、Rust 授权成功与未授权拒绝的 2 项测试、前端 lint/build 和 Rust targeted tests；构建保留原有 `player.ts` 动静态导入提示。Playwright 在 1280×720 与 650×838 确认按钮边界、可访问名称、桌面版禁用状态与卡片布局；真实 Tauri 进程启动及 Windows 文件管理器行为未做端到端验证。截图：`artifacts/open-album-folder-before.png`、`artifacts/open-album-folder-after-1280.png`、`artifacts/open-album-folder-after-650.png`。截图识别因 MissingSessionID 未能完成像素级独立审查；未修改用户音频、真实数据库或 `PersonalConfig/`。

## 2026-09-25 第四十八批：可调舞台歌词字号

参考 ECHO 歌词视觉设置中的主/副歌词字号调节，在 Ome 的“设置 → 歌词”增加舞台字号滑杆，并在沉浸舞台顶栏提供同一项实时控制。范围为 75%–145%，每档 5%，初始 100%；主歌词、前后歌词、纯文本歌词及翻译/罗马音副字幕共同缩放，效果选择与现有断点布局保持一致。数值保存在本机 `localStorage` 的 `ome.stage.font-scale`，不新增数据库迁移、运行时依赖、网络请求或媒体资源。

验证：`npm run test -- src/state/stage.test.ts`（3 项）、`npm run lint`、`npm run build` 通过；构建继续显示既有 `player.ts` 动态/静态导入提示。Playwright 在 1280×720、650×838 和 470×658 的演示电台页检查舞台滑杆、键盘步进、状态保存和布局；470px 时文档宽度等于视口，舞台顶栏控件均落在 x=14–456px 内。设置页在 650px 与 470px 下文档没有横向溢出，470px 设置行边界为 x=55–415px。检查结束后把演示字号恢复到 100%。截图：`artifacts/stage-font-scale-before-1280.png`、`artifacts/stage-font-scale-after-1280.png`、`artifacts/stage-font-scale-after-650.png`、`artifacts/stage-font-scale-after-470.png`、`artifacts/stage-font-scale-settings-650.png`、`artifacts/stage-font-scale-settings-470.png`。基线图通过临时隐藏新控件并还原原始字号 CSS 尺寸生成。

本机截图识别工具返回 `MissingSessionID`，因此没有完成像素级独立视觉审查；本批只依据可访问性快照、键盘操作及 DOM 边界/溢出数据核验。没有启动真实 Tauri，也未改音频、数据库或 `PersonalConfig/`。后续 ECHO 差距以功能总账为准，其中缺词扫描和后台歌词回填队列需要单独处理网络同意、可恢复任务状态和播放期间限速。

## 2026-09-25 第四十九批：缺失歌词回填队列

参考 ECHO 的缺词扫描与后台回填队列，在“设置 → 歌词”接入快速/全来源任务、自动匹配阈值、逐曲进度、停止及继续。快速模式查询网易云、LRCLIB、QQ 音乐；全来源再加入 AMLL、酷狗和酷我。每首只处理授权且未排除的本地曲目；若 sidecar 或音频标签已有主歌词则跳过。任务最多 20,000 首，逐曲串行搜索，播放期间等待后再处理下一首；遇到提供方 429 响应自动暂停，用户可在设置页继续或停止。进程重启后保留任务和逐曲状态，用户显式点“继续上次进度”恢复。

默认自动保存阈值为 88%，可调范围 82%–95%。候选必须达到现有本地匹配阈值、没有版本冲突且含可用歌词才会写入；当前匹配器的 `high` 级还需满足曲名/艺人身份约束。阈值范围高于 ECHO 原始 45% 设定，因为 Ome 的本地匹配器分数不是 ECHO 的风险分，不能直接互换标尺。没有可靠高匹配时标为未匹配或失败，不自动落库。

SQLite 迁移 013 新增 `backfilled_track_lyrics`、`lyrics_backfill_jobs` 与 `lyrics_backfill_items`，自动匹配缓存独立于迁移 012 的用户手选歌词；播放时本地 sidecar/内嵌优先，其次手选版本、自动版本，再进行既有在线匹配。自动写入会在同一 SQLite 事务中保存歌词并完成队列项，不覆盖手选记录，不写音频文件。新 Tauri 命令只向前端返回 track ID、标题、艺人、专辑和时长；路径只在 Rust 侧授权/存在/格式/符号链接检查中使用，网络检索词仅由曲名与艺人构成，不发音频、路径或 Cookie。

`local_lyric` 现在复核曲目来源、软排除状态、有效目录/单文件授权、受支持音频格式和无符号链接后才读文件；sidecar 读取同时拒绝链接文件。该检查也保护回填已有歌词检查，不改变原有歌词格式顺序。授权路径比较会先归一化 Windows `\\?\` / `\\?\UNC\` 长路径前缀，避免文件规范路径与曲库保存路径表示不同而误拒绝；对应的常规路径访问和前缀归一化用例均通过。没有新增运行时依赖、静态媒体资源或文件授权范围。

验证：前端全量测试 34 个文件、218 项通过；`npm run lint`、`npm run build`、Rust 全量单测（138 项通过、10 项真实网络/凭据测试忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 与 `git diff --check` 通过。新增内存 SQLite 迁移测试覆盖三张歌词回填表。Vite 构建仍显示既有 `player.ts` 静态/动态导入提示。

CUA 在本机设置演示页查看了歌词设置区和回填面板；约 652px 视口的文档宽度等于视口，按钮与阈值控件在面板内，浏览器模式下回填按钮按预期禁用。浏览器夹具不提供 Tauri 数据库或真实授权曲库，因此未启动真实在线回填、升级个人 SQLite 数据库或验证持久队列实机中断恢复；未修改真实数据库、用户音频或 `PersonalConfig/`。ECHO 回填队列本批已接入；其他待移植能力仍见功能总账。

## 2026-09-25 第五十批：棱镜多色视觉器

对照 Folia 的预设切换交互与 ECHO 的音乐响应视觉配置思路，在 Ome 的全屏视觉器新增“棱镜”模式：112 根环形频谱线沿完整色相谱着色，频谱可用时按音频强度伸缩；暂停或音频频谱不可用时保留低幅慢呼吸。新安装默认进入棱镜，用户已保存的视觉器选择优先保留。原有极光、圆环、脉冲仍跟随主题强调色。

模式复用现有 Canvas、预设按钮与设备本地偏好，不引入参考项目代码、图像、字体、运行时依赖或网络请求。继续遵守 `prefers-reduced-motion`，控件保留 radio 语义与 Escape 退出。当前只移植多色默认视觉这一项；大型视觉器库、背景编辑和更多参数仍记录在功能总账中。

验证：`npm run test`（34 个文件、218 项）、`npm run lint` 与 `npm run build` 通过；构建保留既有 `player.ts` 动静态导入提示。CUA 在本机 `?demo=radio` 页面检查 652×838 与 470×658：棱镜选择状态可见、窄窗四个模式按钮均完整落在视口内；切换为圆环后重载仍保留所选模式，之后恢复棱镜；Escape 能退出。截图以本轮界面观察核验，未写入截图文件。浏览器演示的模拟播放不能替代真实 Tauri 音频频谱验证；未改音频、数据库或 `PersonalConfig/`。

## 2026-09-26 第五十一批：失联曲目的多选批量重新关联

曲库设置的失联曲目列表新增多选、全选/清空和批量重新关联。批量任务按曲目顺序逐首打开已有的系统音频文件选择器；用户为每首指定文件，后端沿用单曲修复校验，成功后仅更新该曲目的文件路径并授予该文件的显式访问。曲目 ID、歌单关联和播放历史不变。取消选择或首个错误会停止后续处理，显示已完成数量并保留余项供用户继续。

该能力没有加入后台目录监视、自动候选匹配、目录授权、网络请求、数据库迁移、运行时依赖或打包素材。浏览器演示用两首固定样例验证多选与完成反馈；桌面原生文件对话框、真实曲库和实际路径修复仍需在 Tauri 运行时确认。

验证：`npm run test`（34 个文件、218 项）、`npm run lint`、`npm run build` 通过；构建仍显示既有 `player.ts` 动静态导入提示。Playwright 演示检查 1280×720、650×838 与 470×658，批量完成后状态信息可见；470px 文档宽度为 470px。截图：`artifacts/recovery-batch-before-1280.png`、`artifacts/recovery-batch-after-1280.png`、`artifacts/recovery-batch-after-650.png`、`artifacts/recovery-batch-after-470.png`。控制台仅有既有 `/favicon.ico` 404，无新增运行时错误或警告。没有改动用户音频、数据库或 `PersonalConfig/`。

## 2026-09-26 第五十二批：本地文件移动候选诊断

对照 ECHO Library Core 的文件移动候选/修复阶段，先移植只读候选检查。SQLite 迁移 014 为新导入及重扫的本地音频保存版本 1 快速摘要：文件大小、开头最多 64 KiB 和末尾最多 64 KiB；只访问当前登记并有效授权的常规文件。它是本地候选筛选线索，不是安全校验或完整文件哈希。没有新依赖、网络请求或参考媒体资源。

音乐源设置中的“检查文件移动候选”仅检查失联本地曲目与已索引且当前存在、授权有效的本地文件。失联曲目和候选必须有当前版本相同的摘要，并满足曲名/艺人规范化后一致、时长相差不超过 1 秒、双方专辑资料不冲突；候选文件会在显示前重新读取摘要以排除过期索引。重复匹配显式标记歧义。候选只给出路径和比较依据，不自动关联、合并记录或改写路径；旧记录没有摘要、候选已变化或不满足条件时，不猜测，继续使用现有逐首/多选人工选文件流程。

验证期间发现 Windows 路径安全校验会受规范化路径与登记路径的大小写拼写差异影响。候选仍先通过已有有效授权目标校验；重新读取摘要时使用曲库登记的原始路径拼写，使目录前缀检查与授权记录保持一致。Rust 用例覆盖摘要只读授权、重扫刷新、唯一/歧义候选、无摘要和文件变化失效，并确认候选检查不改曲库记录。

验证：Rust 全量 `cargo test --locked --offline` 140 项通过、10 项网络/服务用例按设计忽略；`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 与 `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings` 通过。前端 `npm run test`（34 个文件、218 项）、`npm run lint`、`npm run build` 通过；构建仍提示 `player.ts` 静态/动态导入共存。`git diff --check` 通过，Git 同时提示多份已有工作文件将从 LF 转 CRLF。浏览器候选演示在 1280×720 与 470×658 复核；窄窗文档宽 470px，候选列表内部滚动（内容 537px、可视高度 460px），控制台 error/warn 为空。仅视觉检查了当前真实页面截图，没有为本批新增可交付截图文件。未修改用户音频、实际曲库数据库或 `PersonalConfig/`。总账继续保持进行中：后台文件监听、旧摘要补建和自动应用候选仍待移植/评估。

## 2026-09-26 第五十三批：候选置信度与 Move Repair Lab 门槛

继续对照 ECHO Move Repair Lab 明确的阶段门槛：先 dry-run，拒绝歧义和低置信候选，只有无 blocker 才能在确认后 apply。当前代码仅使用首尾快速摘要；它不是可信文件身份，因此 DTO 把候选置信度显式标为 `low`，列表最多返回 100 项，歧义项同时显示“多重匹配 · 低置信”。将元数据核对放在实时摘要重读之前，减少不符合曲名/艺人/时长条件时的文件读取。

当前 Windows 稳定工具链不提供可用的标准库 trusted file ID：本机 Rust 为 1.96，官方 `MetadataExt::file_index()` / `volume_serial_number()` 文档仍标为 nightly-only experimental。遵循 ECHO 自己的低置信 apply blocker，不用摘要或元数据冒充强身份，不加 nightly API、Win32 FFI 或新依赖。候选面板继续只读；原有逐首/多选文件选择修复仍更新同一曲目 ID 的路径/单文件授权，保留关联的歌单、播放历史和歌词，不删除或合并曲库行。

验证：候选 Rust 用例通过；`cargo fmt`、前端全量测试（34 个文件、218 项）、Lint 和 Build 通过，构建仍有 `player.ts` 动静态导入提示。实际设置演示的 1280×720 与 470×658 截图检查确认置信文案及歧义可见；470px 文档宽 470px，候选内容宽 345px、滚动内容 537px / 可视 460px，标签宽度最大约 78px 且不溢出；浏览器控制台异常和日志条目为 0。截图仅在浏览器中复核，未新增截图文件或产品素材。ECHO watcher、trusted Windows file ID、Move Repair Lab dry-run/apply 仍未移植；功能总账保持持续更新。

## 2026-09-26 第五十四批：均衡器 Headroom 前级衰减

对照 ECHO DSP Center 的 Headroom 能力，在现有 10 段 EQ 滤波器之后串接一个 WebAudio GainNode。设置页新增本机记忆的 −12 至 0 dB 前级衰减滑杆（0.5 dB 步进）、估算峰值和按建议预留按钮。建议以 512 个对数频点采样 Ome 当前 20 Hz–20 kHz 的整条 EQ 响应，抵消模型中的正向峰值，并将推荐衰减限制在可调范围；超出范围仍提示残余值。EQ 关闭时滤波器归零且该 GainNode 固定为单位增益，不改变用户主音量。

UI 明确说明这是频响模型估算，不是实测削波或真峰值保证；不引入 limiter、额外算法依赖、数据库迁移、网络请求或媒体资产。该项只覆盖 ECHO DSP Headroom 的轻量交互；ReplayGain、耳机校正、FIR、声道工具、APO 与原生 DSP 仍待逐项评估。

验证：均衡器曲线、建议衰减及 GainNode 旁路状态共 9 项用例通过，前端全量测试 34 个文件、222 项通过，`npm run lint` 与 `npm run build` 通过；Build 保留既有 `player.ts` 动静态导入提示。设置演示检查 EQ 关闭时前级禁用、低音预设估算 +8.4 dB、按建议衰减至 −8.5 dB 后估算 −0.1 dB，键盘方向键可按步进控制；470×658 下余量卡片及子项均在视口内，文档宽度 470px。交互期间控制台仅有既有 `/favicon.ico` 404，无新增应用运行错误或警告；停止本地 Vite 后热更新 WebSocket 记录连接关闭重试。未改用户音频、SQLite 数据库或 `PersonalConfig/`；没有添加外部资产。

## 2026-09-26 第五十五批：确认式偏好迁移文件

新增独立 `ome-preferences` v1 JSON，与既有只含主题的 `ome-theme` 文件和 ECHO 的全量数据备份区分。偏好文件只打包外观选择/自由配色/封面取色模式、自动电台与切歌淡变、10 段 EQ/预设/前级、弹幕/视觉器/歌词舞台模式与字号、歌词副字幕/回填阈值五类常用偏好。文件最大 64 KiB（UTF-8 字节）；根字段及每类字段精确白名单，枚举、颜色、EQ 频段数值、字号步进和阈值全部校验后才可进入预览。导出逐字段组装，不遍历 localStorage。

导入先解析完整文件并展示将覆盖的五类设置，自动电台打开时特别提示下次启动可能续播；用户点击“确认覆盖五类偏好”后才调用现有状态 setter，EQ 状态用单次完整恢复更新信号和已注册音频链。未知字段整体拒绝。排除 DJ/TTS 配置和密钥、账号会话、曲库/数据库/歌词内容、播放历史、桌面歌词窗口位置/锁定/开关、固定命令槽、设备路径与输出设备。无需新增依赖、SQLite 迁移、网络请求或媒体资源；主题单独文件继续保留。

验证：新增白名单/往返/额外凭据字段拒绝/枚举与数组边界/UTF-8 文件大小测试，以及完整 EQ 恢复测试；`npm run test` 35 个文件、228 项通过，`npm run lint`、`npm run build` 与 `git diff --check` 通过。Build 仅保留既有 `player.ts` 动静态导入提示。Playwright 演示状态检查 1280×720 与 470×850 的导入预览/确认卡片；预览区带礼貌播报，470px 文档宽 470px，预览框位于 x=119–407px，确认与取消按钮可见；取消会清除待导入预览。控制台 error/warn 为 0。真实桌面 Tauri 文件选择器和确认覆盖流程未在本批浏览器演示中提交；未确认应用任何偏好，也未改变实际用户设置、曲库数据库、音频文件或 `PersonalConfig/`。测试临时 JSON 已移除。无新增分发资产。

总账仍在进行：当前只实现跨设备常用偏好迁移；ECHO 的完整数据库/曲库/缓存备份恢复、日志脱敏与数据库修复仍未接入，其他未完成功能以 `docs/REFERENCE-FEATURE-INVENTORY.md` 为准。

## 2026-09-26 第五十六批：视觉器默认多彩与主题色回退

全屏视觉器的四种 Canvas 模式（极光、圆环、脉冲、棱镜）现在默认使用多彩表现，覆盖原先只跟随 `--accent` 的三种模式；用户可在顶栏切回“主题色”。色彩表现通过渐层、频段色相和粒子色相由 Canvas 程序化生成，既有四种模式、播放状态与 `prefers-reduced-motion` 处理继续复用。视觉器模式和色彩模式分别本机记忆。

偏好迁移文件升级为 `ome-preferences` v2，纳入视觉器色彩项；严格校验仍拒绝未知字段，旧 v1 文件继续可导入并按旧的主题色表现恢复。没有 SQLite 迁移、网络请求、文件权限或新依赖；不复制 Folia/ECHO 的图像、字体、图标、音频或代码。轻量方案采用渐变/色相绘制，不新增图片背景和多余细项面板。

验证：视觉器状态与偏好白名单定向测试 9 项通过；全量前端测试 35 个文件、230 项通过，`npm run lint`、`npm run build`（含 TypeScript）和 `git diff --check` 通过。Build 保留既有 `player.ts` 静态/动态导入提示。桌面 1280×720 和窄屏 470×850 均通过浏览器检查；窄屏文档宽度等于视口宽度，顶栏六个选项不遮挡退出按钮。主题色选择在刷新和重开视觉器后保留，切回多彩、四模式点击和键盘 Space 切换正常。截图为 `artifacts/visualizer-after-1280.png`、`artifacts/visualizer-after-470.png`。应用运行期间只有既有 `/favicon.ico` 404；关闭临时 Vite 预览后记录到 HMR WebSocket 断连重试，不涉及应用运行错误。

实际 Tauri 窗口、真实音频数据下频谱强度及桌面系统减少动态效果需另作桌面验证。视觉器剩余背景/字体/细项调校、其余参考功能以功能总账为准，整轮移植仍进行中。

## 2026-09-26 第五十七批：曲库本地索引批量移除

曲库列表、当前文件夹和重复候选新增多选模式：复用曲目行的播放槽显示原生复选框，工具条显示所选范围/数量，支持全选范围、清空和退出；明确确认后才移除。确认框最多列出五首并用专辑与末级目录/文件名区分同名曲目。列表过滤、文件夹范围和重复组都按本地曲目去重；导入/重扫期间禁用勾选和批量提交。保留单曲删除入口。

前端调用新增批量 Tauri 命令，Rust 事务先验证全部 ID 存在且 source 为 local，拒绝重复 ID、空批次和超过 10,000 首的批次，再逐条删除并统一提交。任一 ID 无效时整批回滚；既有外键级联清理歌单、历史及两种本地歌词缓存；没有外键的自动歌词回填待处理项同步改标为跳过，避免留下死任务。音频文件路径不用于文件操作。前端索引、播放队列、续播记忆、诊断状态和歌单仅在成功后更新；播放队列用一次集合过滤，当前曲目被移除时最多切换一次。没有数据库迁移、网络请求、新依赖或分发媒体。

验证：新增 Rust 原子性/重复 ID/多首删除用例，定向 3 项通过；前端新增曲目选择、确认框导入/重扫锁和批量队列下标测试，全量 37 个文件、233 项通过；npm run lint、npm run build、cargo fmt --check 通过。Build 保留已有 player.ts 静态/动态导入提示。Playwright 在 ?demo=library 下检查 1280×720 与 470×850：3 首本地曲目被正确选入，在线曲目不提供复选框；多选确认清楚列出同名曲目所属专辑/文件名；窄窗文档宽度为 470px，无横向溢出，确认按钮在对话框内。只取消演示确认，没有提交删除。停止本地预览前仅有既有 /favicon.ico 404 与浏览器焦点信息提示，无应用运行警告/错误；停止服务后出现 Vite HMR WebSocket 连接重试。截图：artifacts/batch-remove-after-1280.png、artifacts/batch-remove-after-470.png、artifacts/batch-remove-confirm-470.png、artifacts/batch-remove-confirm-1280.png。

本批未操作实际用户曲库数据库或音频文件，未读取/修改 PersonalConfig/。外部参考整轮移植继续进行；跨设备路径定位、其他未完成项以功能总账为准。

## 2026-09-26 第五十八批：手动重新关联后刷新移动摘要

修正旧曲目经用户手动选择新音频并重新关联后，曲库仍保留缺失或过期快速摘要的问题。路径修复、显式单文件授权和摘要更新现在在同一个 SQLite 事务内完成。摘要仅采样文件大小、开头与结尾的有界片段；如果读取失败，仍完成用户确认的路径修复并清空旧摘要，避免下一次移动检查误用原文件身份。摘要不被当作可信文件身份，也不会自动应用候选。

为正确覆盖目录外的单文件授权，摘要计算现在显式接收授权类型；候选实时复核同样按候选记录的目录授权或显式单文件授权重新检查。测试覆盖用户选择的新路径得到当前摘要且原曲目 ID、歌单、历史保留。已有且仍可访问的旧索引摘要尚未批量补建，缺摘要的失联旧曲目仍需用户手选文件；后台 watcher 和可信文件 ID 仍未移植。

验证：`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、定向路径修复/显式单文件候选复核用例、Rust 全量测试（143 通过、10 项真实网络/服务用例按设计忽略）以及 `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过。没有数据库迁移、网络请求、依赖、音频修改或授权范围扩展；未读取/修改 `PersonalConfig/`。

## 2026-09-26 第五十九批：本地 ReplayGain 标签播放

对照 ECHO DSP Center 移植首阶段 ReplayGain：沿用锁定 Lofty 0.24.0 读取本地曲目的 Track/Album Gain 与 Peak 标签，在曲库导入、重扫时保存到 SQLite 迁移 015；手动重新关联时也按新选音频刷新标签，避免继续使用旧文件的增益。播放器在现有 EQ 前级之后新增独立 WebAudio GainNode，按曲目/专辑模式应用 dB 增益；专辑增益缺失时回退曲目增益。只处理本地曲目，线上源单位增益直通。

切歌启用淡变时，新曲目 ReplayGain 在音源实际切换时更新；上一首淡出期间继续沿用自己的增益，避免异步解析期间提前切换补偿。

声音设置加入默认关闭的响度归一化、曲目/专辑参照、标签峰值保护与 −12 至 +12 dB 前级。界面明确峰值保护只依赖标签、未分析音频，也不能保证 EQ 后不削波。设置保存在本机；`ome-preferences` 升级为 v3，严格白名单加入这些声音项，v1/v2 仍可导入，旧格式给 ReplayGain 默认关闭/track/峰值保护开启/0 dB。无新依赖、网络、分发资产或额外文件访问范围。

验证：ReplayGain Rust 标签读取及 SQLite 写入/移除标签后清空用例通过；Rust 全量测试 145 项通过、10 项真实网络/服务测试按设计忽略；前端全量 38 个文件、237 项通过；`npm run lint`、`npm run build`、Cargo fmt/clippy 与 `git diff --check` 通过。构建保留既有 `player.ts` 动静态导入提示。Playwright 在 1280×720 和 470×850 检查设置，控件切换可用；文档宽度分别为 1280px/470px，控制台 error/warn 为 0。截图：`artifacts/replaygain-after-1280.png`、`artifacts/replaygain-after-470.png`。

真实 Tauri 音频输出与用户文件的标签读取尚未在桌面运行时实测；此批只用标签单元测试和浏览器 UI 夹具。未操作实际用户曲库数据库/音频、未读取/修改 `PersonalConfig/`。完整 ReplayGain 分析/标签写入、真峰值 limiter、耳机校正、FIR、声道工具和原生 DSP 仍待逐项盘点；整轮参考移植仍在进行，其他差距以 `docs/REFERENCE-FEATURE-INVENTORY.md` 为准。

## 2026-09-26 第六十批：ECHO Channel Tools WebAudio 声道处理

把 ECHO Channel Tools 适配进 Ome 唯一 WebAudio 链路：新增 `state/channel-tools.ts` 管理设置、范围验证、路由矩阵和音频节点；播放器在 ReplayGain 后串接独立的左右分离、每侧低/中/高滤波、0–10 ms 延迟、极性控制和矩阵合并。支持平衡、左右增益、恒功率曲线、左右交换、mono sum/left/right 与每侧三段 EQ。关闭状态通过 20 ms 参数过渡回独立直通支路，保留原有多声道/立体声播放通道数；启用后才进入显式双声道 speaker mixing。mono sum 左右各乘 0.5 再送两端，避免相关信号相加时额外提高 6 dB。声道工具默认关闭；正增益可能产生削波，本功能不含 limiter。

声音设置增加主开关、平衡与左右增益；延迟、mono 路由、交换、单侧反相、恒功率和三段左右滤波收进可折叠高级区。参数只保存在本机。偏好白名单升级到 `ome-preferences` v4；严格验证新增完整声道结构，并仍接受 v1/v2/v3 文件，旧版导入给声道工具默认旁路。无 SQLite 迁移、依赖、网络或分发媒体；没有读取/修改 `PersonalConfig/`。

验证：声道状态/范围/平衡、路由矩阵、mono 混合、禁用旁路和音频支路单元测试 8 项通过；偏好传输测试 7 项通过，覆盖旧版本与无效结构；前端全量 39 个文件、246 项通过；`npm run lint` 和 `npm run build` 通过，保留既有 `player.ts` 动静态导入警告。浏览器 `OfflineAudioContext` 渲染确认旁路保持左右样本 `[0.25, -0.25]`，mono-left 在两侧输出 `[0.25, 0.25]`。Playwright 在 1280×720 与 470×850 浏览器视口检查；平衡滑杆变化即时更新读数和 localStorage，重置恢复关闭/立体声/0% 默认；移动端根文档宽度等于视口，声道面板/滑杆均未超出 470 px；console error/warning 各 0。截图：`artifacts/channel-tools-after-1280.png`、`artifacts/channel-tools-after-470.png`。

真实 Tauri/WebView2 设备输出和用户音乐文件尚未实测。ECHO 的命名声道预设及管理、A/B 快捷比较仍待移植；ReplayGain 分析/写标、真峰值 limiter、耳机校正、FIR、APO 和原生 DSP 仍在差项清单。总移植继续进行，其他功能以 `docs/REFERENCE-FEATURE-INVENTORY.md` 为准。

## 2026-09-26 第六十一批：ECHO 声道预设与 A/B 试听

在现有 WebAudio 声道工具之上加入四个内置路由预设，以及最多 24 个本机命名预设的保存、套用、覆盖更新、改名和删除。A/B 槽各自保存一份完整声道状态，按键立即切换当前播放链；继续编辑参数时会清除“正在试听”标记。预设区在总开关关闭时仍可使用，便于直接套用预设启用处理；具体滑杆仍按主开关分别禁用。

`ome-preferences` 升级至 v5，白名单加入用户预设和 A/B 快照；严格校验预设 ID/名称唯一性、24 个上限、完整声道设置和 A/B 结构。v1–v4 继续可导入，缺少的新资料默认为空；导入仍需预览和确认，文件 64 KiB 上限不变。没有数据库迁移、依赖、网络、分发资产或额外文件访问，也没有读取/修改 `PersonalConfig/`。

验证：声道状态/预设管理/A-B 对比和偏好文件测试合计 20 项通过；前端全量 39 个文件、250 项通过；`npm run lint`、`npm run build` 通过，保留既有 `player.ts` 动静态导入警告。浏览器演示设置在 470×850 与 1280×720 视口中操作内置预设、保存自定义预设、分别记住 A/B 并切换；预设更新后声道状态正确，根文档宽度分别等于视口，控制台 error/warning 各 0。截图：`artifacts/channel-tools-profiles-after-470.png`、`artifacts/channel-tools-profiles-after-1280.png`。像素识别脚本因接口缺少 session ID 返回 `MissingSessionID`，因此本批记录了真实浏览器 DOM/边界与交互验证，没有宣称完成像素级截图评审；真实 Tauri/WebView2 音频输出仍未实测。

当前 DSP 总差项见 `docs/REFERENCE-FEATURE-INVENTORY.md`：ReplayGain 音频分析/标签写入、真峰值 limiter、耳机校正、FIR、APO 与原生 DSP/HiFi 引擎仍待后续评估；整轮参考功能迁移仍在进行。

## 2026-09-26 产品方向纠偏：云端仓库复核

对照云端 `zerolyx/ome-music` 的 `PROJECT.md`、2026-09-21 私人电台设计 spec 与 2026-09-23 Folia/ECHO UI 设计稿后，恢复产品核心为「不必选歌，按下播放就好」的小而美 AI 私人电台：本地音乐与歌词、网易云、默认关闭且从属的 Bilibili 氛围、带本地记忆与声音的 DJ。约 10MB 级包体与仅三项前端运行时依赖仍是目标。

这次复核纠正了移植总账把“上游存在/当前未实现”误写成后续待办的做法。Folia/ECHO 参考的是交互模式与少量核心能力，不做功能对等；整套 DSP/输出链路、远程曲库、插件、云同步和重型批量媒体工具继续暂缓。已经进入工作区的能力按可选扩展记录维护，本次不批量删除或改写本地曲库；未来每个候选必须直接改善核心听歌/电台/歌词/视觉场景，并说明轻量、隐私、文件授权和维护边界。`PROJECT.md`、中英文 README 与 `docs/REFERENCE-FEATURE-INVENTORY.md` 已按此收敛。

资产复核：重新枚举外部快照后，ECHO 19 项、Folia 42 项的路径/大小/SHA-256 全部与登记表吻合；检查产品源目录中的 2 个图片类资源，与任一参考资产均无哈希匹配。外部快照继续只读保留，产品不打包这些参考资产。

本地产品文件已纠偏；云端独立草稿 PR [#16](https://github.com/zerolyx/ome-music/pull/16) 只改产品说明和 ADR，不直接改动默认分支，也不包含工作区代码。

## 2026-09-26 第六十二批：视觉器多彩预设扩展

延续已确认的默认多彩方向，视觉器新增熔岩、海潮、幻紫三组轻量色彩预设，覆盖极光、圆环、脉冲和棱镜 Canvas 模式；保留默认多彩及主题色回退。偏好仍走 `ome-preferences` v5 校验/迁移，不新增数据库字段、网络请求、运行时依赖或媒体资产。Canvas 设置为不接收鼠标事件，避免覆盖配色/模式按钮；系统指针继续保持可见。

验证：前端全量 39 个文件、251 项通过；`npm run lint` 与 `npm run build` 通过，保留既有 `player.ts` 动静态导入提示。Playwright 在 470×850 与 1280×720 实际点击“熔岩/海潮”配色，aria 选中项和 localStorage 正确，文档宽度与视口一致；系统 `cursor:none` 样式命中数为 0，控制台无 error/warning。截图：`artifacts/visualizer-palettes-after-470.png`、`artifacts/visualizer-palettes-after-1280.png`。像素识别脚本返回 `MissingSessionID`，因此保留浏览器 DOM/边界与交互证据，不声称完成像素级独立视觉审查；真实 Tauri/WebView2 与音频设备未在本批实测。

## 2026-09-26 第六十三批：增加轻量横向频谱模式

在全屏视觉器中新增“频谱”模式：横向柱条按当前 analyser 频段从中心镜像扩展，沿用默认多彩、主题色、熔岩、海潮、幻紫五组色彩；没有播放数据时用低幅慢速待机波动。模式继续写入既有 `ome.viz.mode`，不改播放/电台默认行为，不新增运行时依赖、网络请求、音频处理链、分发素材或后端权限。系统减少动态效果时继续停止 Canvas 动画，Canvas 不拦截鼠标事件、系统指针保持可见。

浏览器检查在 1280×720 与 470×850 实际点击“频谱”，单选状态和本机模式偏好正确，页面宽度分别等于视口宽度；截图：`artifacts/visualizer-spectrum-after-1280.png`、`artifacts/visualizer-spectrum-after-470.png`。项目视觉识别脚本因服务缺少 session ID 返回 `MissingSessionID`，本批仅记录浏览器可访问性/状态/边界和交互证据，不声称完成像素级评审。打开 Ctrl+K 时复现相同标签的命令分组键冲突，已在键中加入行位置；重新加载后再次打开命令面板，控制台错误和警告均为 0。真实 Tauri/WebView2 和音频设备上的频段响应尚未验证。

本批继续以云端产品说明为边界：频谱是可选的核心视觉表现，不扩成重型视觉器工作站；两参考项目仍按总账逐项筛选，整轮移植进行中。

## 2026-09-26 第六十四批：歌词舞台自动对比度与遮罩点击修复

为歌词舞台加入无需新控件的可读性适配：封面来自当前已显示的本地/应用内安全来源时，绘制 24×24 小样本，综合舞台 `brightness(0.42)` 与主题遮罩估算主歌词及副字幕的对比度；对比不足时只覆写当前歌词前景色/演唱强调色并加轻量阴影。无封面时按主题底色评估，未获安全读取许可或采样失败时不主动访问图片、退回主题色。纯装饰封面与遮罩层不接收指针事件，修复遮罩挡住舞台动效控件的点击；全局没有 `cursor:none`，系统光标保留。

该适配借鉴两参考项目的沉浸歌词可读性目标，在现有 Preact/Canvas/主题系统独立实现；不复制参考代码/资产，不新增运行时依赖、数据库迁移、网络请求或设置项，未改产品愿景/范围。

验证：`npm run test` 40 个文件、256 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。构建保留既有 `player.ts` 动态/静态导入提示。Playwright 在 1280×720 与 470×850 快照确认舞台与歌词边界均在视口内，窄屏控制栏完整；键盘可切换舞台模式并用 Esc 退出；浏览器控制台 error/warning 均为 0，`cursor:none` 命中数为 0，装饰层 `pointer-events` 为 `none`。修复前 Playwright 明确复现遮罩截获点击；首次修复后的自动化定位器在 2.8 秒自动隐藏期间超时，尚未构成鼠标结果验证。随后在隔离的本地 `?demo=1` 播放器中实际鼠标点击“群唱”，舞台选项从“浮流”切换为“群唱”，确认修复后控件可点。截图：`artifacts/stage-readable-after-1280.png`、`artifacts/stage-readable-review-after-470.png`。截图识别脚本因服务缺少 session ID 返回 `MissingSessionID`，因此记录尺寸/无障碍树/交互验证，不声称已完成人工像素级评审。真实 Tauri/WebView2 的媒体协议取样和物理设备光标呈现尚未实测。

没有访问或修改真实曲库、音频文件、用户数据库或 `PersonalConfig/`。产品定位保持「小而美 AI 私人电台」不变，参考项目功能仍按功能总账选择性适配，后续差距见 `docs/REFERENCE-FEATURE-INVENTORY.md`。

## 2026-09-26 补充核验：舞台鼠标与在线歌词副字幕边界

舞台回归补测在隔离的本地 `?demo=1` 页面完成：打开歌词舞台后，鼠标点击“群唱”能将已选效果从“浮流”切换为“群唱”。源代码检查确认全局没有 `cursor: none`，沉浸光标只是 `pointer-events: none` 的装饰，舞台封面/遮罩也不拦截输入。此证据覆盖本地浏览器交互；实际 Tauri/WebView2 与物理设备光标仍需桌面复测。

歌词副字幕评估遵循“小而美 AI 私人电台”范围：罗马音能帮助外语歌词阅读，且现有翻译/罗马音切换无需增加主流程控件；网易云 `romalrc` 与 QQ `trans` / `roma` 已进入现有显示链。对照 ECHO 的酷狗歌词 provider，只发现按候选 ID 读取主歌词内容，没有稳定的翻译或罗马音字段传递证据。无需扩音源或自动联网来填表；更轻的做法是只适配各来源已验证返回的副字幕字段。新增大体积转写依赖的体积/准确率成本高于该增益，隐私也应继续限于用户明确预览的候选，因此其他来源罗马音暂缓，待有稳定字段证据再逐源移植。

## 2026-09-26 第六十五批：默认主题多彩环境氛围

修复主题 CSS 级联问题：原先较后的 `:root` 透明回退值会覆盖浅色主题声明的环境光，使界面看起来近乎单色。现将中性回退放回主题定义之前；默认浅色主题恢复粉、青、琥珀三层柔和环境光，深色主题使用亮粉、青蓝、暖橙。首页唱片增加玫红、琥珀、青绿、紫色的柔光外晕和唱片心形渐层，文本、按钮强调色和页面结构不随之改动。未增加设置项、运行时依赖、网络访问或静态媒体，产品方向仍是小而美 AI 私人电台。

验证：全量前端 40 个文件、256 项测试通过；`npm run lint`、`npm run build`、`git diff --check` 通过。Playwright 在 1280×720 与 470×850 检查浅/深主题实际 CSS 色值、唱片边界和光标样式；两种宽度下文档宽度等于视口宽度。窄屏自动收起播放条时文档高度仍超过视口，这是现有沉浸窗口行为。截图：`artifacts/default-theme-after-1280.png`、`artifacts/default-theme-dark-1280.png`、`artifacts/default-theme-after-470.png`。构建保留既有 `player.ts` 动态/静态导入提示。截图像素描述脚本因缺少 OpenCode session ID 返回 `MissingSessionID`，因此像素级独立视觉批评未能完成；真实 Tauri/WebView2 仍待桌面复核。

## 2026-09-26 补充核验：参考素材清单与播放过渡边界

重新核对工作区外两个只读快照的 HEAD 与媒体类文件：ECHO `d25d5c97aa1950514bc4299c9820e9a038287bb5` 的登记范围 19 个文件 / 13,294,407 B，Folia `9cf822015328e47ee5e22061213010a70b4ec5c9` 的登记范围 42 个文件 / 16,064,937 B；逐路径、字节数、SHA-256 全部匹配登记表，无遗漏或差异。当前 Ome 可发布范围内仅 2 个应用图标，与参考素材的 SHA-256 匹配数仍为 0。

播放过渡代码核对发现：Ome 目前只有一个 HTMLAudio 与一条共享 WebAudio 链（EQ、ReplayGain、声道处理）；开启淡变时是先淡出旧曲、换源、再淡入新曲。Folia 的普通交叉淡化使用两个 audio deck，完整 Automix 还依赖轨道分析与可选模型；ECHO 的 gapless/Automix 走原生音频 host 路线。当前播放清单已更新此架构差异：普通双 deck 交叉淡化仍需另行设计每 deck ReplayGain、设备输出、并发切歌取消和自动接播边界；重型 Automix/原生 host 不作为默认产品移植项。该核验没有更改播放行为或上游产品说明。

整合门禁补核：前端 40 个文件、256 项测试、Lint、Build 通过；Rust 格式检查、Clippy `-D warnings` 通过，145 项本地 Rust 测试通过，10 项需真实网络/服务的用例按设计忽略。构建仍保留既有 `player.ts` 动态/静态导入提示。

## 2026-09-26 第六十六批：沉浸窗口竖向溢出修复

修复沉浸式窗口在播放条自动收起时，根文档高度仍被底部控制器内容撑大的问题：`#app` 继续裁切横向溢出，并新增竖向裁切；主视图仍保留独立 `overflow: auto`，曲库、设置、歌词等长内容照常在视图内滚动。没有改变窗口结构、控件布局、默认播放、上游产品说明或依赖。

Playwright 在 470×850 与 1280×720 验证根文档始终等于视口；主视图分别可滚动到 150 px 和 180 px，根文档 `scrollTop` 保持 0。窄屏设置页“再次确认重置”按钮仍完整位于视口内（只进入确认步骤，没有执行重置）；`cursor:none` 样式命中为 0。浏览器控制台 error/warning 均为 0。截图：`artifacts/chrome-overflow-final-470.png`、`artifacts/chrome-overflow-final-1280.png`。截图像素识别服务仍返回 `MissingSessionID`，本批只记录视口尺寸、DOM 边界、滚动和交互状态，不声称完成像素级独立视觉评审；真实 Tauri/WebView2 窗口仍需桌面复核。

交叉淡化候选复核：用户价值是让连续听歌更像电台；体验代价是两首曲目短时叠音，并可能与 DJ 歌前介绍/自动接播竞争；实现代价是双 deck 各自的 ReplayGain、EQ/声道链、输出设备、取流和切歌竞态；不增加权限、数据上传或隐私影响。更简单的替代仍是当前 1.2 秒顺序淡变。结论：这批不移植完整 Automix，也不改播放行为；普通双轨淡化需另立轻量方案，确认自动电台介绍与播放链边界后再做。

验证：`npm run test`（40 个文件、256 项）通过，`npm run lint` 与 `npm run build` 通过，`git diff --check` 通过。Build 保留既有 `player.ts` 动静态导入提示。未触碰曲库、用户音频、数据库或 `PersonalConfig/`。

## 2026-09-26 第六十七批：轻量双 deck 交叉淡化

将“参考素材清单与播放过渡边界”中列为待另行设计的普通双轨淡化落地。`ome.fade` 键和原有设置项不变，默认仍关闭；播放时按需创建第二个 `HTMLAudioElement`，新曲音源解析并开始播放后，两轨通过等功率曲线最多交叠 3 秒，短曲/曲尾剩余时间更短时同步缩短。两轨各自使用 ReplayGain、设备输出和过渡 GainNode，同时共用 EQ、EQ 前级、声道处理、analyser 与主音量链。未增加依赖、权限、网络请求、数据库迁移、设置项或分发媒体。

普通队列在曲尾最后 `min(3 秒, 曲长 10%)` 尝试自动接播。配置 DJ 后由“播完当前”睡眠与 DJ 歌前介绍分别优先：两者都会阻止自动双 deck 调度，DJ 介绍完成后用户手动跳曲才处理新曲。快速连点/异步取流通过 request token 取消过期结果；暂停、定位、再选曲会先收束当前淡变。播放源失败时保留旧曲；恢复点在新元素尚不可 seek 时继续等待可 seek 事件。Web Audio 退化时使用元素音量渐变；只有一个 deck 成功接入处理图时硬切。

按产品方向审查，本批只接受能改善连续听歌的普通淡化，不移植 Folia BPM/ONNX/人声分离或 ECHO 原生 host/gapless Automix。省下的体积/运行时成本也避免加入与 DJ 及轻量电台相冲突的第二套播放调度；上游产品定位未变。

验证：`npm run test` 41 个文件、262 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。Build 仍报告原有 `player.ts` 动态/静态导入提示。Playwright 使用内存合成的静音 WAV：确认曲尾自动接播从第 1 首进入后续队列；手动跳曲的过渡中两 deck 同时处于播放态；音量改为 0.42 时信号保持，暂停会清理旧 deck 并暂停新 deck，恢复后只继续新曲。测试恢复淡变开关到默认关闭，并清理队列。清理后的 1280×720 和 470×850 演示窗口中，根文档尺寸分别匹配视口，`cursor:none` 命中为 0；截图为 `artifacts/crossfade-after-1280.png`、`artifacts/crossfade-after-470.png`。网页控制台曾报告 Vite 演示页 `/favicon.ico` 404；非 Tauri 浏览器夹具不验证播放历史 IPC。真实 Tauri/WebView2 输出设备、音量和音源协议仍需桌面复核。未访问真实曲库、用户音频/数据库或 `PersonalConfig/`。

## 2026-09-26 第六十八批：视觉器封面氛围层

参考 Folia/ECHO 的视觉背景能力，只为本地或网易云当前曲目增加低亮柔焦封面层；Bilibili 封面不作视觉器背景。复用 `coverUrl` 和现有封面数据，不新增网络源、素材、权限、设置、持久化或依赖；Canvas 和控制层仍在上方，封面穿透鼠标，入场动效遵守 `prefers-reduced-motion`。没有改动 `PROJECT.md` 的 Goal 定位。

真实浏览器 `?demo=1` 页面确认演示曲封面正常加载、背景 `pointer-events:none`、Canvas/控件层级分别为 1/2；470×850 下根文档与视觉器尺寸匹配视口，视觉器模式可点击切换，`cursor:none` 命中为 0。`npm run test` 41 个文件、262 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。Build 仍有既存 `player.ts` 动静态导入提示。截图识别辅助脚本因缺少 OpenCode session ID 返回 `MissingSessionID`，本批未完成独立像素级视觉批评；实际 Tauri/WebView2 与 Bilibili 来源边界仍需桌面运行时核验。未访问真实曲库、用户音频/数据库或 `PersonalConfig/`。

## 2026-09-26 第六十九批：自动电台按时段与曲风学习

补齐已确认私人电台规格中的“时段 × 风格”本地评分。导入、重扫和用户手动重新关联本地音频时，复用 Lofty 0.24.0 读取曲风标签，清理、去重并限制为每首最多 8 个标签；既有曲库字段 `genres_json` 已存在，无需数据库迁移。DJ 画像只读取最近最多 10,000 条本地/网易云播放、听完、跳过、收藏和取消收藏事件，每个本地小时最多保留 32 种风格；收藏状态变更与 `liked` / `unliked` 事件在同一 SQLite 事务内保存，重复设置相同状态不会生成新反馈。前端仅为当前小时的同风格候选加入渐进、小幅加权。

产品约束评估：用户价值是让“打开即听”的选曲更贴近个人曲风；体验代价是不增加界面，旧曲需经现有用户触发的扫描/重关联后才获得标签；技术与包体成本为有界查询和现有音频标签读取，不加依赖/迁移；隐私影响仅限本机已有授权音频元数据和播放事件，无上传；更简单的旧评分保留为没有标签或画像失败时的回退。因此只接受这项核心电台能力，未扩音源或增加云端推荐，`PROJECT.md` 的 Goal 未修改。

运行时复核还修正了一个会让曲风画像查询失败并静默回退旧评分的 SQLite 外层别名错误；收藏/取消收藏事件也已接入真实状态操作，而非仅在测试数据中计数。Bilibili 与规则排除曲目不进入主画像；不启动旧曲目后台回填。

验证：前端 41 个文件、264 项测试通过；`npm run lint`、`npm run build`、`cargo test --locked --offline`（147 通过、10 个网络/服务用例忽略）、严格 Clippy `-D warnings`、Rust 格式检查和 `git diff --check` 均通过。构建保留原有 `player.ts` 动态/静态导入提示。Lofty 标签实读和桌面 Tauri/WebView2 画像尚未用用户曲库实测；本批未访问真实曲库、用户音频/数据库或 `PersonalConfig/`。

## 2026-09-26 第七十批：歌词翻译与罗马音并显

参考 ECHO 的独立翻译/罗马音歌词展示，补齐 Ome 的“双语”副字幕模式。产品 Goal 与私人电台定位未修改；用途是听歌时同时理解歌词含义并跟读发音，不增加主流程控件。

产品评估：用户价值是减少翻译和罗马音间来回切换；体验代价是多一行辅助文字，因此主歌词仍保持唯一视觉焦点，舞台将两行副字幕收成紧凑一组；技术成本是扩展现有模式、同一时间匹配函数和桌面歌词快照，没有新增依赖、音源、网络、数据库迁移或打包资源；隐私影响为零新增，仍只显示已经获得的歌词字段。更简单的替代是继续手动二选一；考虑到两类数据已存在且默认行为不变，本批接受双语选项。

实现包括设置页“翻译 / 罗马音 / 双语 / 不显示”、偏好导入白名单对 combined 值的校验，以及首页、沉浸舞台、桌面歌词窗三处一致显示。双语顺序为罗马音后接翻译；缺少其中一类时只显示已有字段。无时间轴纯文本歌词仅按主歌词行序显示已存在的罗马音，不推测翻译对应行。偏好数据仍只包含非敏感模式值。

验证：前端 41 个测试文件、269 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。构建仍保留既有 `player.ts` 动态/静态导入提示。真实浏览器检查确认偏好选项可点击并写入 combined；1280×720 与 470×850 下根文档均等于视口，舞台两行副字幕完整且紧凑；纯文本演示只有逐行罗马音。独立干净预览页控制台 error/warning 为 0。截图：`artifacts/lyrics-dual-stage-after-1280.png`、`artifacts/lyrics-dual-stage-after-470.png`、`artifacts/lyrics-dual-plain-stage-470.png`。真实 Tauri/WebView2 桌面歌词窗口未运行复核。

本批仅改动歌词显示与偏好白名单，并添加演示夹具和回归用例；没有接触曲库、音频、用户数据库、远端仓库或 `PersonalConfig/`。后续参考项目能力仍需逐项通过产品范围门槛，整轮移植继续进行。

## 2026-09-26 第七十一批：舞台歌词点击定位

参考 ECHO Community `src/renderer/components/lyrics/LyricsLine.tsx` 的逐行 seek 交互，为 Ome 沉浸舞台当前显示的带时间戳 LRC/YRC 前句、当前句和后句提供按钮语义。点击或键盘激活后复用 `state/player.ts` 的 `seek()`，跳转到该行开始时间。翻译/罗马音副字幕继续只展示；无时间轴纯文本歌词不提供定位入口。

产品评估：用户价值是回听上一句或预听下一句；体验成本是歌词增加轻量交互，主歌词、字幕层级、进度条和默认界面保持现有结构；技术成本只复用已有时间戳与播放器 seek；无新增依赖、状态持久化、网络、权限、数据库迁移或包内资产；隐私影响为零。更简单的替代是继续拖动进度条，但对短歌词段落不够精确。接受此窄范围交互，保持“打开即听”的私人电台定位。

验证：新增 StageView 组件测试覆盖 LRC、YRC 和无时间轴纯文本；前端全量 42 个文件、272 项通过，`npm run lint`、`npm run build` 与 `git diff --check` 通过。浏览器实际鼠标点击和键盘空格激活均可更新进度；1280×720 和 470×850 视口下根文档与视口等宽等高，按钮边界保持在舞台内，预览控制台 error/warning 为 0。最终舞台截图 `artifacts/stage-lyric-seek-after.png`。真实 Tauri/WebView2 仍待桌面运行时复核。没有接触曲库、音频、用户数据库或 `PersonalConfig/`。
## 2026-09-26 补充评估：ECHO MV 匹配

检查参考快照的 `src/shared/types/mv.ts` 与 `src/main/mv/MvService.ts`：MV 子系统不只是查找链接，还涵盖本地/Bilibili/YouTube 等 provider、自动搜索和预加载、候选排序、清晰度与流协议解析、音视频同步和沉浸背景配置。

按产品门槛，价值是给主动观看 MV 的用户增加视觉内容；代价是视频层与自动检索会争夺音乐/歌词/DJ 注意力；工程成本涉及 provider 与流协议、质量/同步、播放状态及相应维护；隐私方面网络搜索需发送曲名/艺人；更简单的现有选择是歌词舞台与从属氛围效果。建议从默认移植范围暂缓，避免把小而美私人电台扩成通用视频播放器；后续只有在产品说明明确允许可选 MV 场景时再重开。

## 2026-09-26 第七十二批：沉浸舞台全曲歌词浏览

舞台顶栏新增全曲歌词开关。面板列出整首带时间戳的 LRC/YRC 歌词，点击或键盘激活后用现有 `seek()` 定位；当前句随播放状态高亮，副字幕复用已有翻译/罗马音时间匹配。打开面板时仅将当前句居中一次，之后用户可自由浏览。Esc 先收起面板并将焦点还给开关，再按一次退出舞台。无时间轴纯文本歌词没有全曲 seek 入口，原来的静态显示保留。

产品定位门禁：此功能只在用户主动开启后占据舞台区域；未新增独立页面/主导航、持久状态、网络行为、依赖、权限、数据库迁移或应用静态资源。它改善歌词内定位并保留原沉浸主视图；产品 Goal 没有变化。

验证：组件用例覆盖 LRC 全曲行、当前句、seek、YRC 行和无时间轴文本无入口。前端全量 42 个测试文件、273 项通过；`npm run lint`、`npm run build` 通过。Playwright 在 1280×720、470×850 检查面板布局、鼠标行定位、Esc 收起/焦点返回和根文档溢出，刷新后 error/warning 为 0。基线与验收截图见参考资产登记；生产构建仍提示既有 `player.ts` 静态/动态导入。桌面 Tauri/WebView2 仍待运行时复核；未访问真实曲库、用户音频、数据库或 `PersonalConfig/`。

## 2026-09-26 第七十三批：桌面歌词配色预设

桌面歌词主句新增四种 CSS 配色：默认极光渐变，以及晚霞、霓虹、雾白。歌词窗工具条按需展开色板，横排将选项放在工具条内，竖排在玻璃面板左侧显示窄列，避免覆盖歌词；选择只保存在歌词窗本机 localStorage 的 `ome.desklyrics.color`，不进入偏好导出。翻译/罗马音副字幕保持中性色。

产品评估：用户价值是延续已有丰富多彩的视觉基调到桌面歌词；实现仅用现有组件/CSS/localStorage，不增加依赖、网络、权限、迁移或打包素材。更简单的替代是固定白字；四种有限预设保留个性化同时避免新增主题编辑器。维持 PROJECT.md Goal 原文不变。ECHO 的 native gapless nextItem 依赖原生 chained playback，和当前 HTMLAudio/WebAudio 双 deck 架构不兼容；整套原生播放 host 会牵动 DJ 介绍、睡眠定时、队列和在线流，本批暂缓，现有默认关闭交叉淡化保留。

验证：43 个前端测试文件、277 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。真实 Preact 组件的 Tauri mock 预览确认横排色板在工具条旁；竖排 CSS 位置夹具的 DOM 几何检查显示选项框与逐字主歌词不相交。截图见参考资产登记。真实 Tauri/WebView2 独立窗口仍待运行时验证；Vite 仍提示既有 `player.ts` 静态/动态导入重叠。

## 2026-09-26 P1 补充验证：系统鼠标与跟随装饰分离

复核 `ImmersiveCursor`：跟随环/点只在自身首次定位后显示，不写全局 `cursor: none`，不占鼠标事件（`pointer-events: none`）；窗口失焦、指针离窗、页面隐藏或减少动态效果时只隐藏装饰。全仓前端未发现系统指针隐藏规则。

隔离 Chrome 对 Vite 浏览器演示页 `?demo=library` 做运行验证：移动后环/点出现，`html` / `body` 计算光标仍为 `auto`、`pointerLockElement` 为空；失焦、离窗和 `prefers-reduced-motion: reduce` 后装饰隐藏且系统光标样式保持 `auto`。控制台只有演示页 `/favicon.ico` 的 404。截图 `output/playwright/cursor-qa-library-1280.png` 仅作开发证据；浏览器验证不能替代 Windows Tauri/WebView2 的原生光标实机验证。

该段记录的是第七十四批修复前的行为；当前失焦/后台处理以“第七十四批：沉浸光标失焦稳定性”为准。

## 2026-09-26 第七十四批：沉浸光标失焦稳定性

将 `ImmersiveCursor` 的窗口失焦和页面切后台行为改为暂停 `requestAnimationFrame`，保留已定位的环/点及最后位置；窗口重新聚焦或页面恢复可见时继续动画。鼠标离开窗口、输入设备能力变化或系统启用减少动态效果时，仍隐藏装饰层。系统光标继续使用浏览器/系统默认样式，环点保持 `pointer-events: none`，未引入依赖、权限或新 UI 控件。

产品评估：这项改动只修复已有沉浸光标在短暂失焦后的视觉中断，不改变电台、导航和播放流程，也不更改 PROJECT.md Goal。

验证：新增组件用例覆盖窗口 blur/focus 和页面 hidden/visible；定向测试 1 个文件、3 项通过；`npm run lint` 与 `npm run build` 通过。Playwright 在 1280×720 和最小桌面宽度 960×620 检查页面无溢出、环点可见且不拦截点击；模拟失焦/恢复后环点保持可见，系统光标为 `auto`、`pointerLockElement` 为空；点击“视觉器”成功，减少动态效果时环点隐藏并可在恢复后重新启用。基线/验收截图 `output/playwright/cursor-blur-before-v2.png`、`output/playwright/cursor-focus-after-1280.png`。控制台错误/警告为 0；构建保留既有 `player.ts` 动静态导入提示。截图像素识别服务返回 `MissingSessionID`，未完成独立像素级视觉评审；真实 Windows Tauri/WebView2 物理光标仍需桌面复核。

## 2026-09-26 第七十五批：队列随机与循环播放

对照 Folia 与 ECHO 两边的队列模式，Ome 在播放列表抽屉新增“打乱尚未播放曲目”和循环模式切换（关闭 / 列表循环 / 单曲循环）。随机操作保留当前曲目以及已播放队列前缀，只打乱之后的曲目；循环模式本机保存。曲尾循环复用现有播放器和淡化逻辑；单曲循环只影响自然播完，用户手动下一首仍跳到队列中的下一曲。

产品定位门禁：只补齐普通队列的基础聆听控制。AI 电台启用且 DJ 已配置时，曲尾仍由本地画像选曲，模式控件禁用并提示电台接管，不更改电台决策。没有移植上游 Automix、原生 gapless、播放会话后端或远程队列；未增加依赖、数据库迁移、媒体资源或权限。`PROJECT.md` 的 Goal 保持原文。

验证：`npm run lint` 与 `npm run build` 通过；构建保留原有 `player.ts` 动态/静态导入提示。浏览器演示曲库的无障碍树确认随机与循环控件可见，3 首队列由“情歌、会呼吸的痛、宁夏”变为“情歌、宁夏、会呼吸的痛”；循环状态可切换并已恢复为关闭；885×665 演示窗口的队列标题栏容纳全部控件。没有运行测试套件；真实 Tauri/WebView2 音源的曲尾循环行为尚未在本批验证。未访问真实曲库、用户音频/数据库或 `PersonalConfig/`。

## 2026-09-26 第七十六批：显式恢复最近手动队列

重新核对云端 [`zerolyx/ome-music` README](https://github.com/zerolyx/ome-music)：上游定位仍是轻量 Windows 音乐播放器，面向打开即可听，围绕本地音乐、用户自己的网易云会话、Bilibili 音乐/视频氛围与弹幕、私人音乐策展人，并让收听数据留在本机。本批没有修改 `PROJECT.md` 的 Goal，也没有改动远端仓库。

参照 ECHO 的队列快照恢复与 Folia 的最近播放缓存，为普通手动播放队列增加本机“恢复上次队列”。最近一次手动队列只保留当前曲目和后续最多 99 首，总快照限制 256 KiB；本地曲目仅保存 ID，恢复时从当前曲库取得路径，已移除或失联曲目会跳过并告知；网易云/Bilibili 只留曲目 ID 与限长显示资料。音频路径、在线流直链、封面 URL、Cookie/账号凭据均不进入快照。队列非空时，抽屉标题栏提供一个明确替换入口；队列为空时显示带曲目数的次级按钮。快照留在本机 `localStorage`，不进入偏好导出。

恢复仅由用户点击触发，不改变开机电台启动。AI 电台和 DJ 已配置时，用户恢复后 DJ 按序承接手动队列，播完后回到电台选曲。普通手动队列的创建、插播、追加、重排和删除会更新快照；清空列表后保留最近快照以供找回，用户也能显式删除快照而不停止当前播放。没有新增依赖、SQLite 迁移、权限、网络请求或静态资产。命名多队列快照与单独 Tauri 原生任务栏桥接仍未接入。

验证：`npm run test` 44 个测试文件、286 项通过；`npm run lint`、`npm run build` 和 `git diff --check` 通过。生产构建保留既有 `player.ts` 动态/静态导入提示。1280×720 本地演示界面确认重启后没有自动恢复，手动点击可恢复队列；点击“忘记”后活动队列仍保留，空队列恢复入口能显示曲目数并完成恢复。演示队列已清空且快照已删除。真实 Tauri/WebView2 音源与用户曲库未用于浏览器验证；未修改用户数据库、音频文件或 `PersonalConfig/`。

## 2026-09-26 第七十七批：本机曲库数据备份与恢复

继续参照 Folia/ECHO 的数据保护能力，但沿用 Ome 的本机私人电台边界：设置页允许用户选择一个文件夹，生成独立目录，包含 SQLite 在线一致快照、`ome-preferences` 白名单偏好，以及可选的 100 首 / 256 KiB 手动队列快照。恢复先检查清单、大小、SQLite quick_check、外键和曲目/歌单计数；文件夹选择后绑定本次预览，恢复时再次验证数据库摘要与快照内容，并要求二次确认。

便携备份不含网易云登录、DJ API 密钥、本机目录/单文件授权、音频文件或封面缓存；它保留数据库中的歌曲路径、歌单、播放历史、歌词、DJ 对话与本地记忆。文件未加密，若用户选择共享/同步文件夹也会保存到该位置。恢复前将当前完整 SQLite、偏好和队列快照留在应用数据目录作为最近一次回退点；只保留本机当前仍存在且非链接的目录/文件授权和当前 DJ 配置，不采纳备份授权。手动队列只进入待恢复快照，不自动播放；自动电台偏好随白名单恢复，并在预览说明其可能导致刷新后按原设置接播。

实现复用现有 Tauri 文件夹选择器、SQLite migrations 与 `ome-preferences` / queue snapshot 格式；仅启用锁定 rusqlite 0.32.1 已带的 backup feature，没有新增 crate、前端运行时依赖或迁移。新增 `src-tauri/src/data_backup.rs`、设置页“数据与备份”卡片和对应 API；扫描与恢复期间互斥，数据库写入/队列状态错误时保留或使用本机回退点。

产品定位门禁：本批没有修改 `PROJECT.md` 的 Goal，不增加云同步、媒体文件复制、账号迁移或新音乐源，依然服务本地曲库与私人电台。

验证：Rust 162 项中 152 项通过、10 项按设计因真实网络/服务凭据忽略；前端 44 个文件、287 项通过；`npm run lint`、`npm run build`、`cargo fmt --check`、`cargo clippy --locked --offline -- -D warnings` 与 `git diff --check` 通过。构建保留既有 `player.ts` 动静态导入提示。浏览器固定预览在 1280×720、650×837、470×658 检查；650/470 下文档宽度分别为 650/470，无横向溢出，控制台 error/warn 为 0。浏览器演示只展示固定备份预览，没有打开真实文件夹、写出备份或接触用户数据库。真实 Tauri 原生目录选择、真实数据库在线快照/恢复与 Windows WebView2 仍需桌面运行时复核。未读取 `PersonalConfig/`，未触碰用户音频、真实数据库或远端仓库。

## 2026-09-26 第七十八批：手动补建旧曲目快速摘要

继续补齐迁移 014 的旧曲目摘要缺口。曲库健康报告现在显示待补建数量；用户可显式启动补建，每批最多 100 条，并按当前页面会话游标继续。仅处理未排除的本地音频；每条都重新核验既有目录授权或显式单文件授权、受支持格式、普通文件和无符号链接路径，再复用现有算法读取文件大小及开头/结尾各至多 64 KiB。成功时只写 `quick_hash` / `quick_hash_version`；不可读、缺失、失权、远程、排除记录均跳过，失败摘要不覆盖旧值。

产品定位门禁：入口留在音乐源设置的健康报告中，不加入播放主流程、不自动读取、不监听文件移动，也不自动关联候选。摘要继续是低置信线索；用户仍需手动选文件修复路径。没有更改 `PROJECT.md` Goal、上游仓库、默认电台、Bilibili 从属边界；没有新增依赖、数据库迁移、权限或网络请求。用户价值是让现有曲库恢复线索覆盖可访问旧曲目；体验成本为需手动分批且缺失/失权曲目不能补建；实现复用现有 Rust 摘要与授权校验、无包体增加；隐私限定为本机有界读取；更简单的替代是等待下次显式重扫，但需用户额外等待。

安全复核确认批次游标仅用于参数化 ID 顺序查询，长度及控制字符受限；读取前复用授权/路径/链接校验；在线、规则排除和失联记录不能写摘要；操作不改变文件路径或授权。新增 Rust 用例覆盖 100 条批次上限、分页、目录授权、显式单文件授权、存在但未授权/缺失/在线/排除记录跳过、旧版本摘要更新及授权字段保持。

验证：Rust 全量 163 项中 153 项通过、10 项按设计因真实网络/服务凭据忽略；定向补建用例通过，`cargo fmt --check` 与 `cargo clippy --locked --offline --all-targets -- -D warnings` 通过。前端 44 个文件、287 项通过，`npm run lint` 与 `npm run build` 通过；构建保留既有 `player.ts` 动静态导入提示。诊断演示中完成 12→7→2→0 的模拟补建，0 项后完成状态仍可见；1280×720、650×837、470×658 下页面文档宽度均与视口一致，浏览器控制台 error/warn 为 0。浏览器仅使用固定演示数据；没有调用真实 Tauri 命令、访问用户曲库或音频，也没有接触 `PersonalConfig/`。未保存独立截图文件。

## 2026-09-26 第七十九批：无 LLM 电台接播与可选启动曲库扫描

修复核心规格差距：自动电台开启且播放器空闲时，启动路径不再要求 DJ/LLM 已配置；离线时沿用本地画像恢复上次播放或选择候选，不问候、不发网络请求、不生成歌前介绍。曲尾在手动队列与循环规则后回到本地画像；配置 DJ 后原有介绍逻辑保持不变。首页仅在电台开启、本地有曲目且播放器空闲时显示原有的“按下播放”入口；有曲库且电台待启动时使用简短准备状态，不再把新按钮挤入较长的新手卡片下方。

按 DEC-044 接入第一项可选后台自动化：设置页“启动时自动更新曲库”默认关闭；用户开启后，本次启动等待 Tauri 桌面端处于前台聚焦、播放空闲且没有其他曲库任务时，复用现有 `rescan_music_folders` 扫描已登记可用目录一次。静默扫描复用进度与曲库互斥状态，结果只在设置状态行报告。开关只写入本机 localStorage；不新增网络、文件访问范围、依赖、迁移或包体。持续目录 watcher 和自动移动修复仍是路线图第一阶段的后续工作。

产品门禁：保持 `PROJECT.md` Goal、首页主叙事、默认开机电台和 DJ 主流程；全部功能拓展仍是本机私人电台的从属能力。远端云仓库只读，未触碰 `PersonalConfig/`、用户音频或真实用户数据库。

验证：前端 45 个测试文件、294 项通过；`npm run lint`、`npm run build`、`git diff --check` 通过。Playwright 检查电台入口在 1280×720 与 960×620 主内容区域内，设置页自动扫描开关在 1280×720 与 960×620 可见/可滚动；浏览器预览中开关按设计禁用，页面无横向溢出，控制台 error/warning 为 0。截图：`artifacts/radio-offline-cta-after-1280.png`、`artifacts/radio-offline-cta-after-960x620.png`、`artifacts/startup-library-rescan-1280-open.png`、`artifacts/startup-library-rescan-960x620.png`。像素描述脚本因 OpenCode 会话 ID 缺失返回 `MissingSessionID`，故完成几何、可访问性树和浏览器日志复核，未完成独立像素级视觉评审。真实 Tauri 文件扫描未触发；真实桌面 IPC 和已授权用户目录仍需桌面运行时验证。构建保留原有 `player.ts` 静态/动态导入提示。

## 2026-09-27 第八十批：Navidrome / Subsonic 远程曲库首片

按 DEC-042 / DEC-045，将远程个人曲库列入分阶段移植，并保持 AI 私人电台主叙事、首页、默认来源与开机播放不变。设置页增加用户显式连接 Navidrome / OpenSubsonic 的入口；搜索页可切到远程曲库、搜索后将结果放入现有队列。未连接时的引导按钮会直接切到设置并展开音乐源卡片。断开连接会移除队列中的远程曲目并保留其他曲目。

Rust 后端复用现有 reqwest 与 Tauri 状态，连接密码只驻应用进程内存，应用重启后需重连。登录请求只发送 Subsonic 盐值摘要，不发送原始密码；公网地址仅允许 HTTPS，HTTP 仅允许本机/局域网；禁用重定向，并限制 URL、账号、搜索词、结果数量、响应体、超时及曲目 ID。音频只通过本机 /subsonic 媒体代理按单个 Range 分段读取，每次最多 4 MiB，响应 no-store；认证参数不出现在 WebView 音频地址中。远程曲目不写进本地历史、上次播放或手动队列恢复快照，也不自动加入默认电台；无第三方依赖、数据库迁移、静态资源或音频文件授权变化。

安全复核：远程服务 URL 是用户主动提供的目标，公共明文 HTTP 被拒绝且请求不跟随重定向；身份信息仅用于该服务的 Subsonic API。媒体代理要求本机桌面进程仍持有连接会话，校验 ID / Range / Content-Range / 响应类型并有界读取；错误只返回通用提示，不包含 URL、账号、密码或认证摘要。局域网 HTTP 的盐值摘要仍可能被同网观察，建议服务器开启 HTTPS。没有读取 PersonalConfig/、修改用户曲库、联网账号或云端上游仓库。

产品门槛：用户价值是把自管服务器音乐纳入现有搜索与播放队列；体验成本是增加一个设置连接入口和搜索来源，不改变默认启动；实现/体积成本复用已有 HTTP 客户端和播放器，未增加依赖；隐私影响限于用户显式发起的服务端连接、搜索与播放请求；更简单替代是使用服务自带网页播放器，但不能复用 Ome 队列与控制。结论：接受为从属、可关闭的音源切片，后续协议仍按阶段逐项设计。

浏览器验收：Playwright 走通“搜索—选择远程曲库—未连接提示—前往音乐源设置—自动展开连接表单”；1280×800 与 960×620 文档宽度均等于视口，远程标题、连接按钮和输入字段处于视口范围，连接按钮在非 Tauri 预览中禁用。截图：artifacts/remote-library-after-search-1280.png、artifacts/remote-library-after-settings-1280.png、artifacts/remote-library-after-settings-960x620.png。独立图片描述器因缺少 OpenCode session ID 返回 MissingSessionID，因此本批完成了无障碍快照、控件边界、溢出与交互检查，但未完成像素级人工视觉复核。真实 Navidrome/Tauri 连接和实际远程音频播放未在本机服务上验收。播放器统一排除了 Subsonic 曲目在开始播放、手动跳过和曲尾产生的本地收听历史/画像事件，且不保存远程上次播放位置；新增策略回归测试。验证：前端 46 个测试文件、303 项通过，npm run lint、npm run build、git diff --check 通过；Rust 169 项中 159 项通过、10 项按设计因真实网络/服务凭据忽略，cargo fmt --check 与 cargo clippy --locked --offline --all-targets -- -D warnings 通过。构建保留既有 player.ts 动静态导入提示。

## 2026-09-27 第八十一批：远程服务器歌单浏览与浏览器预览命令提示

按 DEC-042 / DEC-045 / DEC-046，在远程曲库搜索来源中增加次级“服务器歌单”浏览方式。用户切换该模式才请求歌单列表，选择后读取歌单详情；最多显示 100 个歌单、每歌单最多 200 首，超过上限或有不可读条目时提示。只读浏览复用现有 TrackList 与队列播放，不写本地歌单、不修改服务器资料、不落盘远程元数据，也不加入电台候选或收听历史。

Rust `subsonic.rs` 新增 `getPlaylists` / `getPlaylist` 命令，复用当前进程 Subsonic 会话和 1 MiB 有界 JSON 响应。解析验证 ID、名称、详情 ID 与请求 ID 一致，并限制条目数；没有新增依赖、数据库迁移、媒体文件访问或后台同步。

根据浏览器评论排查“Cannot read properties of undefined (reading 'invoke')”：该页面位于 `127.0.0.1:1421` 普通 Vite 浏览器预览，缺少 Tauri WebView 的 `window.__TAURI_INTERNALS__.invoke`，故网易云扫码/搜索与本地 Rust 命令没有桌面后端可调用。统一 API wrapper 现在在普通浏览器里返回桌面端提示；搜索框与按钮禁用并显示预览提示，网易云扫码按钮禁用并说明桌面端要求。真实 Tauri 桌面端仍走原来的 Rust 命令。

产品门禁：远程歌单保持从属、显式、只读；搜索仍是远程来源默认模式；不变更私人电台 Goal、首页、开机播放、DJ 主流程或云端上游文档。

验证：前端 47 个测试文件、307 项通过；`npm run lint`、`npm run build`、`git diff --check` 通过。Rust 170 项中 160 项通过、10 项按设计忽略；`cargo fmt --check` 与 `cargo clippy --locked --offline --all-targets -- -D warnings` 通过。构建保留既有 `player.ts` 动静态导入提示。Playwright 以模拟 Subsonic 响应走通模式切换、歌单列表和详情；960×620 与 1280×800 远程详情页面均无横向溢出。浏览器预览实测搜索输入和按钮 disabled、桌面端说明可见；设置页扫码按钮 disabled、原因文案可见；该检查页控制台 error/warn 为 0。截图：`artifacts/remote-playlists-detail-1280.png`、`artifacts/remote-playlists-detail-960.png`、`artifacts/remote-library-browser-preview-settings-960.png`、`artifacts/remote-library-browser-preview-search-960.png`。图片描述器因 OpenCode session ID 缺失返回 `MissingSessionID`，因此通过无障碍快照和控件几何/页面宽度核验布局，未完成独立像素级视觉评审。真实 Navidrome 服务端歌单与 Tauri 桌面扫码/搜索尚未在本机服务上实测。

## 2026-09-27 第八十二批：最近专辑浏览、封面代理与扫码预览复核

在远程曲库来源下增加“浏览专辑”模式，只有用户显式进入时才按 `newest` 顺序分批读取 Subsonic 专辑；每页显示 24 张专辑，多取 1 条判断是否还有下一页。选中专辑后读取详情，最多显示 200 首可读曲目，继续复用 TrackList 和现有队列。专辑列表、详情和封面均只留在当前进程；不写服务器歌单、不进入本地历史或私人电台候选。

封面按需经 `ome-media` Tauri 本机代理从已连接服务器读取，认证只保存在 Rust 请求中，不出现在 WebView URL。封面限制 2 MiB、PNG/JPEG 签名、最长边 2,048 像素和 4,194,304 像素面积；不跟随重定向，10 秒请求超时，响应 `no-store` / `nosniff`。分页与详情加入请求代次保护，断开或关闭详情后忽略迟到响应。没有新增依赖、数据库迁移、包内静态资源、用户目录读取或云端修改。

再次复核扫码评论中的 `demo=settings-data-backup-preview`：这是普通 Vite 浏览器预览，`window.__TAURI_INTERNALS__.invoke` 未定义，当前源码因此禁用“扫码登录”并给出需使用桌面应用的提示。网易云二维码由原生 `netease_qr_key` 命令获取，网页演示页不能生成登录码；用户截图显示的是旧的可点击预览状态。本批未更改认证协议或令牌处理。

产品门禁：扩展仍位于远程曲库搜索来源的次级只读浏览模式，不更改 `PROJECT.md` Goal、上游仓库、默认电台、首页主叙事或 DJ 主流程。远程歌词及 Jellyfin / Emby / WebDAV / SMB 仍在路线图后续阶段。

验证：前端 47 个测试文件、310 项通过；`npm run lint`、`npm run build` 通过。Rust 175 项中 165 项通过、10 项按设计因真实网络/服务凭据忽略；`cargo fmt --check` 与 `cargo clippy --locked --offline --all-targets -- -D warnings` 通过；`git diff --check` 通过。构建保留已有的 `player.ts` 静态/动态导入提示。Playwright 检查 1280×800 专辑列表/详情及 650×800 详情；无横向溢出，列表可滚动到分页；扫码按钮在浏览器预览 disabled、原因文案可见，控制台 error/warn 为 0。截图：`artifacts/remote-albums-after-1280.png`、`artifacts/remote-albums-after-650.png`、`artifacts/remote-albums-after-650-scrolled.png`、`artifacts/remote-album-detail-after-1280.png`、`artifacts/remote-album-detail-after-650.png`、`artifacts/qr-login-browser-preview-disabled.png`。图像描述脚本再次因缺失 OpenCode Session ID 返回 `MissingSessionID`；已以无障碍树、页面/控件几何、滚动和控制台日志完成结构验收，像素级独立视觉评审未能完成。真实 Tauri WebView、网易云二维码和 Navidrome 服务器尚未在本机端到端验收。

## 2026-09-27 第八十三批：Subsonic 原生歌词接入共享歌词舞台

按 DEC-048 接入 OpenSubsonic `songLyrics`：远程曲目播放时依据 `getOpenSubsonicExtensions` 协商 v1/v2，再以服务器曲目 ID 调用 `getLyricsBySongId`。v1 行级歌词转现有 LRC；v2 的逐字 cue 转现有 YRC，翻译和 pronunciation 分别进入既有副字幕状态；无时间轴主歌词使用已有静态歌词展示。旧服务无扩展、请求失败或没有有效歌词时继续走现有网易云匹配回退。

所有请求和认证仍留在 Tauri Rust 侧；复用 1 MiB JSON 响应、10 秒超时和禁重定向，并限制歌词条目、行长度、时间与归一化输出大小。服务器偏移统一折算到歌词时间；多声部重复 cue 索引退回完整行级歌词。远程歌词仅放在进程缓存，切换/断开曲库会清除缓存并使迟到响应失效；无数据库、偏好、音频标签或服务端写入，也没有新增依赖或资源。桌面歌词、舞台与首页继续共用现有状态和解析器，没有增加新主流程控件。

产品门禁：直接补强用户自有曲库的聆听与歌词体验；远程歌曲仍不加入本地播放历史/画像或默认电台候选；不更改 `PROJECT.md` Goal、上游仓库、首页主叙事或 DJ 主流程。其他远程协议与后台/插件/音频/视频大项继续按路线图推进。

来源依据：[OpenSubsonic getLyricsBySongId](https://opensubsonic.netlify.app/docs/endpoints/getlyricsbysongid/) 与 [getOpenSubsonicExtensions](https://opensubsonic.netlify.app/docs/endpoints/getopensubsonicextensions/)；使用协议文档而非复制参考项目实现。真实 Navidrome / Tauri 端到端歌词播放仍待可用服务器验证；此批未改 UI 布局，浏览器行为由歌词状态测试覆盖。

验证：`npm test -- --run`（47 个测试文件、314 项通过）、`npm run lint`、`npm run build`、`cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`（170 项通过、10 项真实网络/服务用例按设计忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 与本批文件 `git diff --check` 均通过。构建保留既有 `player.ts` 同时静态/动态导入提示。浏览器复核确认当前普通 Vite 预览禁用曲库搜索并提示需使用桌面应用；设置页扫码分支同样由 `isTauriRuntime()` 禁用。未启动 Tauri 或发起真实网易云登录；Navidrome 服务端端到端歌词仍待真实服务器验收。

## 2026-09-27 第八十四批：Jellyfin 会话级曲库接入

按 DEC-049 把 Jellyfin 接入音乐源设置与搜索页。用户可显式连接自己的服务器并搜索音频；结果进入既有播放器队列，播放时由 `ome-media` 本机代理携带仅驻 Rust 进程的认证信息，请求单段 Range 音频。曲目封面按需通过同一受控代理读取。搜索最多返回 30 条；JSON 1 MiB、流分段 4 MiB、封面 2 MiB，禁用重定向并设置请求超时；公网只接受 HTTPS，HTTP 仅限本机/私有局域网。

用户名/密码仅用于连接时，成功后清空设置表单；访问令牌、用户 ID 留在本次应用进程，断开或退出清除。搜索元数据只在前端会话中用于当前结果/队列；Jellyfin 曲目不写入本地歌单、收听历史、手动队列快照或 AI 电台画像，不更改默认电台和 DJ 主流程。浏览器预览不可连接，未连接时搜索控件禁用并提供音乐源设置入口。

来源依据：[Jellyfin AuthenticateByName](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/UserController.cs)、[Jellyfin Audio stream](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/AudioController.cs)、[Jellyfin Items API](https://github.com/jellyfin/jellyfin-sdk-typescript/blob/master/src/generated-client/api/library-api.ts)。依据公开协议独立实现，没有复制 Folia/ECHO 源码或素材；无依赖、迁移和包内静态资源变更。Emby/WebDAV/SMB 及 Jellyfin 歌单/歌词仍属后续工作；本机没有真实 Jellyfin 服务，故未作服务器端到端验收。

对扫码评论复核：当前截图地址是普通浏览器预览，网易云 QR Key 命令属于 Tauri 原生后端；浏览器预览不具备 `invoke` 桥接。工作树的 `isTauriRuntime()` 已要求实际 `invoke` 函数存在，设置页在该预览中禁用扫码并显示桌面端提示；接口边界与扫码状态测试通过。Tauri 开发入口由 `npm run desktop` 启动。

验证：`npm run build` 通过（保留既有 `player.ts` 动静态导入提示）；前端全量测试 48 个文件、319 项通过，新增 Jellyfin 状态测试后定向测试 16 项通过；`npm run lint` 通过。Rust 全量测试 177 项通过、10 项真实网络/服务测试按约定忽略；`cargo fmt` 已运行；`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过。真实 Tauri WebView、网易云扫码和 Jellyfin 服务端登录/播放仍待设备与服务器验证。

## 2026-09-27 第八十五批：Emby 会话级曲库接入

按 DEC-050 将 Emby 加入音乐源设置和搜索来源，可显式连接、搜索最多 30 首音频、加入现有队列播放，并按需加载经过限制的封面。复用 Rust 远程媒体会话和 `ome-media` 代理；Emby 使用授权请求头登录，后续请求通过 `X-Emby-Token` 传令牌。播放使用单段 Range，JSON / 音频 / 封面分别受 1 MiB / 4 MiB / 2 MiB 限制，并继续执行 HTTPS/本机或局域网地址限制、禁重定向、超时与图片签名/尺寸校验。

用户名/密码只用于连接请求，成功后清空界面表单；令牌只驻当前 Rust 进程，断开或退出清除。Emby 曲目只留在当前搜索/播放会话，不进入本地歌单、播放历史、持久队列快照或默认电台画像；不修改服务端资料、自动同步曲库或更改 AI DJ 主流程。没有新增依赖、数据库迁移或打包资源。当前不支持 Emby 歌单、专辑浏览或服务器原生歌词；没有真实 Emby 服务可做端到端验收。

协议依据：[Emby AuthenticateByName](https://dev.emby.media/reference/RestAPI/UserService/postUsersAuthenticatebyname.html)、[Emby Items API](https://dev.emby.media/reference/RestAPI/ItemsService/getItems.html)、[Emby authentication](https://dev.emby.media/doc/restapi/User-Authentication.html)、[Emby audio streaming](https://dev.emby.media/doc/restapi/Audio-Streaming.html)。代码按公开 API 独立实现，没有复制参考项目源代码或素材。

产品门禁：Emby 仅是显式连接的可选远程私人曲库，继续沿用搜索、队列和播放控制；本地 AI 电台仍是默认主路径，上游产品定位不变。

验证：`npm test -- --run` 通过（49 个测试文件、325 项）；`npm run lint`、`npm run build` 通过；Rust 全量测试 180 项通过、10 项真实网络/服务用例按设计忽略；`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 与 `git diff --check` 通过。构建保留既有 `player.ts` 动/静态导入提示。没有真实 Emby 服务，因此未验证服务端登录/播放；本批没有运行 Tauri 桌面端。

## 2026-09-27 第八十六批：Jellyfin 原生歌词

按 DEC-051 将 Jellyfin 当前曲目原生歌词接入既有 Rust 远程会话和统一歌词状态。Tauri 只读调用 `GET /Audio/{itemId}/Lyrics`；行时间转 LRC，服务端 cue 在字符区间完整覆盖整行、时间有效且可由共享解析器表达时转 YRC，纯文本仍走现有静态歌词显示。404、没有有效歌词、旧服务或网络错误均保留网易云匹配回退；Emby 不猜测调用此 Jellyfin 路径。

远程 JSON 复用 1 MiB 响应上限，额外限制 2,000 行、每行 2,000 字符和 24 小时时间范围。时间偏移按 Jellyfin LyricMetadata 归一化。远程原始歌词仅存当前进程缓存；Jellyfin 会话变化时清缓存并让旧响应失效，不写本机数据库、音频、偏好或服务器。歌词沿用首页/舞台/桌面歌词现有呈现，没有新的 UI 控件、依赖、数据库迁移或打包资产。

来源依据：[Jellyfin SDK LyricApi](https://typescript-sdk.jellyfin.org/classes/generated-client.LyricApi.html)、[LyricDto](https://typescript-sdk.jellyfin.org/interfaces/generated-client.LyricDto.html)、[LyricLine](https://typescript-sdk.jellyfin.org/interfaces/generated-client.LyricLine.html)、[LyricLineCue](https://typescript-sdk.jellyfin.org/interfaces/generated-client.LyricLineCue.html)。代码按公开协议独立实现；未复制 Folia/ECHO 源码或素材。

验证：前端全量测试 49 个文件、331 项通过，含歌词来源/回退/会话失效和既有舞台渲染测试；`npm run lint`、`npm run build` 通过；Rust 全量测试 184 项通过、10 项真实网络/LLM 用例按约定忽略；`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 与 `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过。构建仅保留既有 `player.ts` 动/静态导入警告。没有已连接 Jellyfin 服务，因此未验证真实服务器版本、响应和舞台端到端歌词；本批未改 UI 布局，也未运行 Tauri 桌面端。

## 2026-09-27 第八十七批：Jellyfin / Emby 只读专辑与歌单浏览

按 DEC-052 在已连接的 Jellyfin / Emby 搜索来源下增加“浏览专辑”和“服务器歌单”次级模式。用户显式进入后才读取列表，选中条目才读取详情；专辑每页呈现 24 张、歌单最多 100 个、每个专辑/歌单详情最多 200 首可读曲目。专辑按服务器条目顺序分页，详情使用服务端音轨顺序；播放、下一首和入队复用现有 TrackList / 播放队列。浏览为只读，不写服务器、本地曲库、历史、持久队列或默认电台画像；账号与令牌仍只驻当前 Rust 会话。

Rust 复用 Jellyfin/Emby 认证会话、目标地址验证、禁重定向、超时和 1 MiB JSON 上限；只开放 GET 查询，验证条目 UUID 和音频类型。没有新增依赖、迁移或打包资源，未复制参考仓库源码/素材。公开接口依据：[Jellyfin LibraryApi](https://typescript-sdk.jellyfin.org/classes/generated-client.LibraryApi.html)、[Jellyfin PlaylistApi](https://typescript-sdk.jellyfin.org/classes/generated-client.PlaylistApi.html)、[Emby Items](https://dev.emby.media/reference/RestAPI/ItemsService/getItems.html)、[Emby playlists](https://dev.emby.media/doc/restapi/Playlists.html)。AI 个人音乐与 DJ 私人电台仍是产品定位和默认路径；远程曲库是可选聆听扩展。

浏览器视觉/交互复核使用演示数据：专辑列表 6 项、专辑详情 3 条曲目、歌单列表 3 项、歌单详情 3 条曲目均正常；1280px 与 720px 视口下文档宽度等于视口，页面无横向溢出，控制台无错误。复核中修正两个只影响预览的种子条件：专辑详情现在正确匹配单数 `album`，歌单详情的初始模式也按 `playlist` 匹配。截图：`output/remote-album-grid-after-1280.png`、`output/remote-album-detail-after-1280.png`、`output/remote-album-detail-after-720.png`、`output/remote-playlists-after-720.png`、`output/remote-playlist-detail-after-720.png`。像素图像描述工具因缺少 OpenCode session ID 返回 `MissingSessionID`；完成了无障碍树、状态、控件边界和溢出检查，未完成像素级人工复核。无可连接的真实 Jellyfin/Emby 服务，未验收实际服务器数据和音频播放。

前端全量测试 50 个文件、337 项通过；`npm run lint` 与 `npm run build` 通过，构建仅保留既有 `player.ts` 动/静态导入提示。Rust 全量库测试 196 项中 186 项通过、10 项真实网络/LLM 用例按设计忽略；`cargo fmt --check` 与 `cargo clippy --locked --offline --all-targets -- -D warnings` 通过。

扫码评论复核：`http://127.0.0.1:1421/?demo=settings-data-backup-preview` 是普通浏览器界面预览，没有 Tauri `invoke` 桥接，不能生成网易云二维码。重新载入该地址后，音乐源明确显示“预览不可登录”，按钮禁用，控制台无 invoke 错误；原截图仍显示旧的可点击文案。正式扫码需在 Ome Music 桌面端正式页面打开音乐源设置，再用网易云 App 扫码。本轮未触发真实登录请求。

## 2026-09-27 第八十八批：歌词舞台可选 Bilibili MV

按 DEC-053 把 MV 作为当前歌曲/歌词舞台里的从属影像入口接入。用户主动打开面板并点击搜索后才提交当前曲名/艺人，最多呈现 12 个候选；选中候选后才解析视频流，继续使用现有 `ome-media` 代理与 Bilibili CDN 校验。视频静音，跟随当前音频播放、暂停和 seek，以主音频为时钟；收起面板只隐藏控制，已选视频继续播放；主动停止 MV、切曲或退出舞台会清除候选、流地址和视频元素。浏览器或 `?demo=` 页面禁用 Tauri 与网络调用。当前只完成 Bilibili 第一提供方；本地/其他 Provider、质量选择和更精细音视频同步仍是后续阶段。

浏览器演示验收：歌词舞台 MV 面板及桌面端提示可见，浏览器中的“搜索 B 站 MV”禁用；检查网络请求未发现 Bilibili 请求。1280×720 与 470×850 下页面文档宽度分别等于视口；窄窗面板边界为 x=92 至 x=462，处于 470px 视口内。截图 `artifacts/mv-stage-after-1280x720.png`、`artifacts/mv-stage-after-470.png` 仅作开发证据。页面控制台仅有开发服务器缺少 `/favicon.ico` 的 404，没有 MV 运行错误。截图描述工具再次因缺少 OpenCode session ID 返回 `MissingSessionID`，因此没有像素级视觉评审；完成了实际浏览器状态、可访问性树、控件禁用状态和溢出检查。没有真实 Tauri/Bilibili CDN 环境做端到端视频播放验收。

验证：`npm test` 51 个测试文件、343 项通过；`npm run lint` 通过；`npm run build` 通过，仍保留既有 `player.ts` 动态/静态导入提示。焦点测试 `src/state/music-video.test.ts` 与 `src/components/StageView.test.tsx` 10 项通过。未新增 Rust 命令、依赖、数据库迁移或打包媒体资源，未访问上游仓库、用户曲库、真实登录或 `PersonalConfig/`。

## 2026-09-27 第八十九批：WebDAV 只读私人曲库与搜索预览错误收敛

按 DEC-054 加入 WebDAV 只读远程曲库：设置页可显式连接，搜索页可逐层浏览直接子项、按当前目录名称过滤音频，并用既有队列播放。Rust 使用 `PROPFIND Depth: 1`，目录最多 500 项、XML 响应 2 MiB、Range 分段最多 4 MiB；拒绝 DTD/自定义 XML 实体、跨源或逃逸 href、不安全编码路径和重定向。凭据与远程 URL/opaque ID 映射仅驻当前 Rust 进程；断开/切换连接会清除旧映射并取消迟到结果，前端亦忽略旧连接响应；远程曲目不写本地曲库、歌单、历史、快照或默认电台画像。用户授权直接依赖 `quick-xml` 0.39.4（同版本此前已在锁文件中），未新增前端依赖、迁移或资源。

安全复核补充了媒体响应 MIME 和 Range 字节长度检查；搜索页在浏览器预览环境隐藏热更新遗留的 Tauri `invoke` 错误，并提示桌面版能力。扫码和搜索的桌面能力都需要正式 Tauri 应用桥接，浏览器预览不能实际登录/搜索。此次当前浏览器无障碍快照停留在首页，未能操作到 WebDAV 设置/搜索页；像素级视觉检查工具仍因 `MissingSessionID` 不可用，所以没有声称完成桌面 UI 视觉验收。未连接真实 WebDAV 服务器，Rust TCP 协议 mock 验收了 Depth、Basic Auth、目录列表及有效单 Range 播放链路。

验证：前端全量测试 53 个文件、353 项通过；`npm run lint`、`npm run build`、`git diff --check` 与 `cargo fmt --check` 通过；Rust 全量库测试 208 项中 198 项通过、10 项网络/LLM 用例按项目约定忽略；`cargo clippy --offline --manifest-path src-tauri/Cargo.toml --lib -- -D warnings` 通过。生产构建仍有既有 `player.ts` 动态/静态导入提示。未改远端/上游仓库，未访问 `PersonalConfig/` 或连接真实登录、WebDAV 服务。

## 2026-09-27 第九十批：SMB2/3 只读私人曲库

按 DEC-055 增加用户显式连接的 SMB 来源：设置页填写主机、共享、可选子路径和账号密码；搜索页按需浏览直接子目录、过滤当前目录文件名，并通过既有队列播放支持的音频。只接受 DNS/IPv4 主机和 TCP 445，不做网络发现或 DFS 跳转，跳过 SMB reparse point。Rust 仅使用通用读取权限，单目录最多 500 项、每会话最多 20,000 个不透明 ID、连接超时 10 秒、目录/单 Range 读取总时限 30 秒、Range 最大 4 MiB；连接与目录查询命令在 blocking worker 运行，媒体代理在受限会话锁内同步读取，同一 SMB 会话的请求串行化。切换/断开时旧代次失效并关闭会话。浏览器预览显示桌面版提示。

SMB 曲目可进入当前播放队列，但不进入本地索引、歌单、播放历史、持久队列快照或默认电台画像；断开会让旧 opaque ID 失效。凭据只在表单编辑期间短暂驻前端，连接成功后清空密码；Rust 会话使用凭据，地址和凭据不写入偏好、SQLite、日志、错误详情或媒体 URL。没有新增数据库迁移或打包媒体素材。

用户授权加入 Rust `smb = 0.12.1`，锁文件增加 125 个依赖包；禁用默认特性，只启用 `multi_threaded`、`sign`、`encrypt`，许可证 MIT，已更新 `THIRD_PARTY_NOTICES.md`。没有复制 Folia/ECHO 代码或素材。SMB 真实服务器/Samba 未配置，所以尚未端到端验证真实身份认证、目录查询、偏移读取及服务端断开行为；仅有输入/路径/文件类型/Range 逻辑测试、Tauri 媒体代理无会话保护、前端会话状态和命令映射测试。

浏览器检查 `?demo=settings-data-backup-preview`：SMB 来源显示桌面端连接提示；720px 与 470px 窗口下设置表单无横向溢出，470px 时字段顺序单列；搜索来源选项在 470px 下保持按钮文案单行并换行成两行，文档宽度仍等于视口。控制台仅有开发服务器缺少 `/favicon.ico` 的 404；浏览器预览没有 Tauri `invoke` 桥接，因此没有触发 SMB 登录或读取。

验证：`npm test` 54 个测试文件、361 项通过；`npm run lint`、`npm run build`、`git diff --check`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo check --offline --manifest-path src-tauri/Cargo.toml` 与 `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过；Rust `--lib` 205 项通过、10 项真实网络/LLM 测试按既有约定忽略。前端产物仍有既有 `player.ts` 动/静态导入提示。真实 SMB 服务端和 Tauri 桌面端验收待可用环境；本批未访问 `PersonalConfig/`、用户音乐、云端仓库，也没有 Git 远程操作。

安全复核补充：`smb-rs 0.12.1` 的 `FileAttributes` 提供 reparse-point 标志；目录枚举现跳过所有此类条目，避免沿服务器返回的链接/挂载目标越出已选共享。SMB Rust 逻辑 7 项测试、前端会话/命令状态 5 项测试通过；全量 Rust 库测试 223 项中 213 项通过、10 项按项目约定忽略；Rust 格式检查与全 target Clippy `-D warnings` 通过。没有真实 SMB 服务端，协议认证与音频偏移读取仍未端到端验证。

## 2026-09-27 第九十一批：舞台 MV 画质上限与 Rust 测试接线修复

按 DEC-056 为歌词舞台 Bilibili MV 增加 360p、480p、720p 最高画质选择，默认 720p，映射 `qn` 16/32/64。后端只接受白名单画质并显示 playurl 实际返回等级；返回画质高于用户上限时拒绝加载。切换上限会重新解析当前候选；普通 Bilibili 音频请求不携带 MV 画质参数，失败时不影响原有音频。设置仅保存在当前舞台会话。

全量 Rust 测试第一次编译时发现 `media.rs` 中既有忽略型 Bilibili 网络测试仍调用被移除的旧取流包装函数；已把该测试切换到新接口的兼容默认参数，线上播放行为不变。

浏览器演示在 1280×720 与 470×850 检查舞台面板：选择器与搜索控件处于面板内，470px 时文档宽度为 470px，浏览器预览选择器按设计禁用；控制台无错误或警告。截图 `artifacts/mv-quality-before-1280.png`、`artifacts/mv-quality-after-1280.png`、`artifacts/mv-quality-after-470.png` 仅作为开发证据。页面处于 `?demo=1`，没有 Tauri 桥接，也没有发起 Bilibili 请求。未连接真实 Bilibili CDN 或桌面 WebView，端到端视频播放仍待可用环境。

验证：前端全量测试 54 个文件、364 项通过；`npm run lint`、`npm run build`、`git diff --check`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 和 `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过；Rust `--lib` 206 项通过、10 项按既有约定忽略。构建只有既有 `player.ts` 动/静态导入提示。没有新增依赖、迁移或打包媒体资源，也未访问 `PersonalConfig/`、用户曲库、上游仓库或执行 Git 远程操作。

## 2026-09-27 第九十二批：本地 MV 候选与播放

按 DEC-057，在可选 MV 面板增加仅对当前本地曲目开放的本地查找。扫描范围是已登记音乐目录内的歌曲文件夹、MV/mv/video/videos 子目录及歌曲文件夹父级下约定的 MV/video 目录；每个目录最多读 500 个直接条目，MP4/M4V/WebM 按曲名/艺人排序、最多显示 12 项。必须由用户点击触发，不递归、不联网、不读取单文件授权的邻近文件；浏览器预览禁用查询。文件系统路径只留 Rust，WebView 使用 12 小时短期随机 opaque ID；每段媒体最多 4 MiB，访问时重验曲目/目录授权与文件状态。

面板区分本地与 B 站候选；本地条目只展示文件名、大小和匹配理由。候选选择复用现有静音 MV 元素及音频时钟，停止、切曲、退出舞台和播放错误复用现有清理逻辑。未新增数据库迁移、依赖、素材或插件权限。

验收：浏览器演示在 1280×720 与 470×850 检查面板；窄屏面板为 x=92..462，文档宽度保持 470。演示当前曲目来自网易云，因此本地入口按设计隐藏；桌面端提示与禁用状态可见。候选卡片标题/大小/匹配理由及文件路径不暴露由 StageView 组件测试验证。演示没有 Tauri bridge，没有非静态网络请求；本次页面错误/警告均为 0。截图 `artifacts/stage-local-video-after-1280.png`、`artifacts/stage-local-video-after-470.png` 仅作为开发证据。真实 Tauri WebView 的路径授权及 Range 播放未端到端运行。

验证：前端全量测试 54 个文件、371 项通过；`npm run lint`、`npm run build`、`git diff --check`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo check --offline --manifest-path src-tauri/Cargo.toml` 和 `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过；Rust `--lib` 212 项通过、10 项真实网络/LLM 测试按既有约定忽略。构建仍显示已有 `player.ts` 动/静态导入提示。没有新增依赖、数据库迁移或打包媒体资源，也未访问 `PersonalConfig/`、真实用户曲库或云端仓库；未执行 Git 远程操作。
