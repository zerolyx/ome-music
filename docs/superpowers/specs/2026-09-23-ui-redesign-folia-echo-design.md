# Ome Music UI 重设计：借鉴 Folia 与 ECHO Next

日期：2026-09-23 · 状态：用户已授权方向（"把参考项目的优秀之处全部放进来"）

## 十问速答

1. **产品**：AI 时代私人电台——本地 + 网易云 + B站，DJ 有记忆/情绪/声音的轻量桌面播放器（Tauri + Preact）。
2. **当前页面任务**：首页 = 沉浸电台舞台；搜索 = 找歌；曲库 = 管理本地收藏；设置 = 配置。
3. **用户**：Owner 自己及同类"深夜电台听众"——打开即播、少操作、重氛围。
4. **用户最想完成**：开机即播，看着舒服，偶尔找歌/管理收藏。
5. **最重要信息**：正在播什么 + 歌词；其次是导航与队列。
6. **视觉问题**：舞台只有居中堆叠一种布局；左侧纯图标 rail 无文字；播放条满宽死板；曲库只有列表、缺专辑维度。
7. **交互问题**：导航项含义依赖记忆；专辑维度缺失。
8. **该突出**：歌词舞台、封面、DJ 电台气质。
9. **该弱化**：设置/配置（已在折叠卡），chrome（已有自动隐没）。
10. **已有系统**：theme.css 双主题 tokens、`--ease-signature` 动效语言、cinema 暗场模式、yrc 逐字/扫光歌词、水印排版、弹幕层。**全部保留，不推翻。**

## Pattern Extraction（只取 what works & why，禁止 Pixel Copy）

**Folia（folia-major）**
- 全屏文字舞台：歌词即主角，巨型 display 字 + 唱词辉光 → 氛围感。**适用**：舞台大字改用衬线 display stack，加大字号。
- 左盘右词分栏（pendolo 主题）：宽屏利用率高，像唱片封套展开。**适用**：宽屏 home 两栏舞台。
- 底部浮动胶囊控制条（blur 药丸）：不切断画面、聚焦舞台。**适用**：PlayerBar 改浮动胶囊。
- 水印/星空点缀：已有 watermark，保留。

**ECHO Next（echonext.moe）**
- 文字标签侧边导航：可发现性。**适用**：rail → 图标+文字导航。
- 视图头模式（标题 + 计数 + 操作 + 视图切换）：信息层级清晰。**适用**：曲库/搜索页头。
- 专辑墙网格 + 圆角封面 + 元信息：浏览效率与美感。**适用**：曲库增加专辑墙视图。
- 彩色强调播放键：操作焦点。**适用**：播放键微调为 accent 实心圆（已有雏形）。

**不适用**：Folia 的 AI 主题生成系统（过重）、ECHO 的 DSP/输出链路（产品无此域）、移动端 PWA（桌面优先）。

## Design Direction

"**深夜电台的舞台感 + 工作台式的清晰导航**"。保留全部现有 token 与动效语言；不新增运行时依赖；不动 Rust 后端。

## 布局策略

- **导航**：64px 图标 rail → 约 200px 图标+文字导航（首页/搜索/曲库置顶，设置沉底），chrome 自动隐没逻辑不变。
- **首页舞台**：宽屏（≥1080px）两栏——左封面光环盘、右 kicker+曲目信息+大字歌词（左对齐）；窄屏保持居中堆叠。
- **播放条**：满宽条 → 浮动胶囊（圆角 16、半透明毛玻璃、悬浮阴影），chrome 隐没时同步下沉消失。
- **曲库**：页头（标题 + 共 N 首 + 视图切换 列表/专辑墙 + 导入按钮）；专辑墙按 album+artist 分组，卡片 = 封面+专辑名+艺人+曲数，点击整专播放；视图选择持久化 localStorage。
- **搜索**：输入框成为页头视觉焦点，结果计数行，音源切换保持分段控件。
- **设置/DJ 抽屉**：结构不变，DJ 抽屉加宽至 380px，视觉与新导航协调。

## 字体 / 间距 / 色彩 / 交互 / 响应式

- **字体**：UI 保持现有 sans；舞台大字（lyric-current、yrc-line）引入 `--font-display` 衬线栈（Noto Serif SC → Source Han Serif SC → SimSun → serif），仅用于歌词 display。
- **间距**：view padding 24/32 → 28/36；专辑墙 gap 18。
- **色彩**：不改双主题色板；cinema 模式不变。
- **交互**：专辑卡 hover 浮起+播放键浮现；尊重 prefers-reduced-motion（已有全局规则）。
- **响应式**：1080px 断点两栏/堆叠；<760px 导航收起为纯图标。

## 组件

- **复用**：TrackList、segmented、设置 Card、dj-drawer、弹幕/水印/光环全部复用。
- **新增**：`AlbumGrid.tsx`（专辑墙）、Icon 增加 list/grid 两个图标。
- **修改**：Rail（加文字）、PlayerBar（胶囊样式类）、Home（两栏舞台）、Library（页头+视图切换）、Search（页头）、layout.css/theme.css（主战场）。

---

# Phase 2：功能深挖（2026-09-23 续）

用户在 Phase 1 基础上授权继续：挖掘 Folia / ECHO Next 的功能优点，让 Ome 功能与视觉同样丰富。

## 深挖结论（两个项目还能给什么）

**Folia**
- AI 主题生成 → 轻量替代：**唱片取色**（Rust 提取封面主色 → 全局 accent 跟随唱片，@property 平滑过渡）。AI 生成主题系统本身过重，不搬。
- 智能歌词匹配（本地歌曲配在线歌词）→ 前端实现：非网易云曲目按 标题+艺人 搜网易云、标题归一化匹配后拉歌词，内存缓存。
- 壁纸模式（WorkerW 挂桌面）→ 过重（需常驻 helper 进程），记录为远期建议。
- 本地 .lrc 同目录识别 → 需改扫描器，远期。

**ECHO Next**
- 曲库多视图 → 艺术家视图（封面 2×2 拼贴卡）+ 只看收藏筛选 + **播放历史**（playback_events 表已在记录，补一个 Rust 只读命令）。
- 队列管理 → 下一首播放 / 加入队列 / 单首移除 / 清空。
- DSP/EQ/输出链路 → 超出轻量定位，明确不搬。

## Phase 2 范围

| 编号 | 功能 | 实现 |
| --- | --- | --- |
| P2-1 | 唱片取色 | Rust `cover_dominant_color`（image crate 仅 jpeg/png，缩样 32px 饱和像素均值）+ 前端 tint.ts + 外观设置开关（默认开） |
| P2-2 | 全源歌词匹配 | lyrics.ts 扩展：非网易云曲目走网易云搜索匹配，缓存 |
| P2-3 | 舞台频谱 | AnalyserNode + 底部镜像柱状可视化；CORS 污染自动隐藏（数据全零 1s 即隐） |
| P2-4 | 曲库增强 | 列表/专辑墙/艺术家三视图 + 只看收藏 + 历史视图（Rust 命令） |
| P2-5 | 队列管理 | playNext / appendToQueue / removeAt / clearQueue + TrackList 行内操作 |
| P2-6 | 播放历史 | Rust `playback_history` 只读命令（JOIN tracks，按最近播放排序） |

**不搬**：AI 主题生成、壁纸模式、DSP/EQ、移动端 PWA、天气 API（需外部密钥，远期）。

## Phase 2 实施修正（实施时记录）

- P2-1 实现方式调整：本机 crates.io 不可达，Rust `image` crate 装不上 → 改为**前端 canvas 取色**（`<img crossOrigin="anonymous">` + 32px 缩样饱和像素均值 + HSL 亮度钳制）。配套 Rust 改动：`ome-media` 响应补 `Access-Control-Allow-Origin: *`，远程代理白名单加 `126.net`（网易云封面域），`coverUrl()` 把远程封面统一走代理。设置外观新增「强调色：唱片取色/固定主题」，默认开；`@property --accent` 注册实现全站渐变过渡。
- P2-6 播放历史：Rust 新增 `playback_history` 只读命令（JOIN tracks 按 MAX(played_at) 倒序），曲库第 4 个视图「历史」。
- 调试备忘：旧版 Edge headless + `--virtual-time-budget` 与持续 rAF（频谱循环）组合会让截图随机截到入场动画中途（全窗低透明度"洗白"），属截图伪影；加 `--run-all-compositor-stages-before-draw` 并多次截图可规避，勿据此改代码。

---

# Phase 3：DJ 电台主持台（2026-09-23 续）

用户在 Phase 2 收尾后授权继续：把 DJ 抽屉从「纯对话框」升级为「电台主持台」——DJ 记住了什么、感知到什么，都对听众可见、可管理。

## 范围

DJ 抽屉分三个标签页：**对话 / 记忆 / 画像**（抽屉宽度 380 不变，头部加 tab 行）。

| 页 | 内容 | 实现 |
| --- | --- | --- |
| 对话 | 原有聊天 + 输入，零改动 | DjDrawer 拆分为条件渲染块 |
| 记忆 | 当前氛围 chip（可清除）+ 记忆事实列表（kind badge / 内容 / 权重 ×N / 单条删除） | `dj_memory_list` / `dj_memory_delete` 命令此前已在 api.ts 就绪，本 Phase 只接前端；DJ `mood` 动作从「只写 localStorage」升级为同时写 `mood` 信号 |
| 画像 | 「现在是{时段} · N 点」+ 24 小时 SVG 柱状图（accent=播放、暗红=跳过占比、当前小时虚线标记）+ 洞察列表 | `profile_hour_preferences` 命令此前已就绪；洞察为纯函数 `src/lib/insight.ts`（峰值小时 / 分时段完播率最高 / 跳过率偏高提醒），口径与 dj.rs `time_band` 一致（5-10 清晨 / 11-13 午后 / 14-17 傍晚 / 18-22 夜晚 / 其余深夜），配 7 例 vitest |

## 实施要点

- `src/state/dj.ts` 新增：`djTab`、`memoryFacts` / `hourProfile`（null=未加载，失败时仅当仍为 null 才置 []，demo 预置数据不被覆盖）、`mood`（初始读 localStorage `ome.dj.mood`）、`clearMood` / `loadMemoryFacts` / `forgetFact` / `loadHourProfile`。
- `DjDrawer.tsx` 重写为三段：ChatPanel（原样保留）/ MemoryPanel / ProfilePanel；tab 切换按需加载。
- 演示种子：`?demo=dj-memory` / `?demo=dj-profile` 预置假数据 + 已配置 djConfig（隐藏离线横幅）+ 直接打开抽屉。
- 洞察阈值：分时段判断要求 plays ≥ 3（样本不足不下结论）；跳过提醒要求 skip/plays ≥ 0.5 且 skips ≥ 2，最多一条。
- 验证：前端 65/65、Rust 60/60、clippy 干净；两页截图审查通过。

---

# Phase 3.5：本地 .lrc 同目录识别（2026-09-23 续）

Phase 3 汇报时建议的下一步，用户批准。补上本地歌曲离线歌词的最后一块。

## 方案

- **Rust**（`library.rs`）：新增 `local_lyric` 命令——按曲目 id 查 `file_path`/`source`，仅 local 源在同目录找 `<音频主名>.lrc`（兼容 `.LRC`），命中则读原始字节 **base64** 返回（base64 已在依赖树，零新依赖）。
- **编码探测在前端**：不加 encoding_rs（crates.io 不可达）。浏览器 `TextDecoder("utf-8", {fatal:true})` 严格解码，失败回退 `gbk`——Windows 存量 LRC 大量是 GBK，Node/vitest 均内置完整 ICU，可测。
- **前端**（`state/lyrics.ts`）：local 源走独立缓存的分支——同目录 .lrc 优先（离线可用、版本对应准确），没有再回退已有的网易云搜索匹配。Bilibili 等其余源行为不变。
- 防陷阱：同名**目录**而非文件不命中（`is_file` 判断）。

## 验证

Rust 4 例新单测（同目录命中 + base64 往返、大写扩展名、缺失返回 none、目录陷阱）；前端 3 例（UTF-8 中文、GBK 回退、解码→parseLrc 链路）。前端 68/68、Rust 64/64、clippy 零警告。

---

# Phase 4：Kimi 设计对齐 + 开源项目第二轮功能移植（2026-09-23 续）

用户要求：学习 Kimi 网站的优秀设计，并继续从 Folia / ECHO Next 移植功能，让软件更丰富、视觉更优秀。

## 调研结论

**Kimi（kimi.com / Kimi Code web）可借鉴**：全 APP 唤起的 **Ctrl+K 命令面板**（模糊搜索 + 最近使用排序）；**设置页分组侧栏**；圆角卡片 + 柔和阴影 + 玻璃质感 + 克制的强调色；统一的模态与微交互。

**Folia 未移植清单**（按价值/成本排序）：命令面板（见上）、**睡眠定时**、**歌词手动偏移按歌曲保存**、歌曲信息窗、队列拼贴 Lattice（重，不搬）、Automix（重，不搬）、壁纸模式（不搬）、FFmpeg 转码（不搬）。

**ECHO Next 未移植清单**：**播放列表**（曲库管理能力缺口，最高优先）、**歌词偏移**、**翻译歌词**（网易云 tlyric 已在 API 响应里没接）、重复歌曲筛选（记录为远期）、桌面歌词（需置顶透明窗，远期）、DSP（明确不搬）、远程曲库（不搬）。

## Phase 4 范围

| 编号 | 功能 | 实现要点 |
| --- | --- | --- |
| P4-1/2 | 播放列表 | Rust：`playlists` + `playlist_tracks` 两表（新迁移）+ CRUD/增删曲目命令；前端：曲库第 5 视图「歌单」+ TrackList 行内「加入歌单」+ 歌单页播放 |
| P4-3 | 命令面板 | Ctrl+K 唤起，模糊搜索命令（导航/播放控制/视图/歌单/DJ），最近使用 localStorage 排序置顶 |
| P4-4 | 睡眠定时 | 15/30/45/60 分钟 / 播完当前，到时暂停；入口在命令面板与播放条 |
| P4-5 | 歌词体验 | ① 歌词偏移 ±0.5s，localStorage 按曲目记忆；② 网易云 tlyric 翻译歌词，舞台主行下小字渲染 |
| P4-6 | Kimi 视觉润色 | 设置页改分组侧栏；面板玻璃质感（backdrop-filter）；圆角/阴影/间距对齐 Kimi 设计系统；命令面板本身即 Kimi 风格 |

**不搬**（记录）：Lattice 队列拼贴、Automix、壁纸模式、FFmpeg 转码、桌面歌词、DSP、远程曲库、重复歌曲筛选（远期候选）。

## 验证计划

前端 vitest + Rust 单测（播放列表迁移与 CRUD 回环）、tsc/eslint/clippy 全绿；截图审查：歌单视图、命令面板、设置分组侧栏。

## Phase 4 实施修正（实施时记录）

- P4-1 重要发现：**001 初始迁移早就有 playlists / playlist_tracks 表**（playlists 带 `source CHECK('local','imported','ai')` 与 description），之前只是没有命令层。本轮直接复用既有表，无需新迁移，写入时 source 固定 'local'；中途误加的 005_playlists.sql 已删除。
- TRACK_SELECT 提取为 `library.rs` 的 `pub(crate)` 常量，load_tracks / playback_history / playlist_tracks 三处共用，列序与 row_to_track 锁定。
- P4-3 命令面板：Tauri 参数 serde 自动 camelCase↔snake_case 转换，Rust 命令参数保持 snake_case（clippy non-snake-case 会拦）。
- P4-5 歌词：网易云 eapi 拉歌词需 `tv: 1` 才返回 tlyric；偏移钳制 ±20s、按曲目存 `ome.lyric.offsets`；翻译行按时间戳最近匹配（容差 0.6s），yrc 逐字模式不挂翻译。
- P4-6 设置页卡片从「自带 useState」改为受控（open/onToggle），侧栏导航才能展开并 smooth 定位；玻璃质感用 `color-mix + backdrop-filter` 落在 dj-drawer 与 player-bar。
- 验证：前端 88/88、Rust 68/68、clippy --all-targets 零警告；截图审查通过歌单总览/详情、命令面板、设置侧栏、舞台翻译歌词+偏移控件五处（Edge headless 洗白伪影按备忘用 budget=12000 规避）。
