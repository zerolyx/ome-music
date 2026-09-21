# Ome Music 轻量化重构设计：AI 时代的私人电台

日期：2026-09-21 · 状态：已经用户确认方向

## 1. 愿景与目标

把 Ome Music 从一个功能堆积的多源播放器，重构成一个**小而美的 AI 私人电台**：
打开软件 → 沉静美观的界面瞬间呈现 → DJ 说出欢迎词 → 自动播放并推荐音乐 → 每首歌前有电台式的介绍 → 随时可对话。

**目标**

1. 极致轻量：安装包 ~150MB → ~10MB；前端 ~9000 行 → ~3000 行；Rust 15600 行 → ~3500 行。
2. DJ 电台是灵魂：有情感、有记忆、懂时间与心情的私人 DJ。
3. 极美观 UI：双主题跟随系统，开机即沉浸。
4. 只保留四类能力：本地音乐+歌词、NetEase、Bilibili 氛围/弹幕、AI DJ。

**非目标（明确砍掉）**

- QQ 音乐源（含 QR/Cookie/WebView2 登录链路）
- 云端 STT/TTS（CosyVoice/SenseVoice）——TTS 改用系统语音，语音输入砍掉
- Ome Radio 旧会话系统、rule-based curatorAgent 旧实现（由新 DJ 取代）
- 语音输入（STT）

## 2. 总体架构

**策略：同仓库重建核心，打捞验证过的部件，删除旧代码，git 全新 init。**

打捞部件：SQLite 表结构（tracks/playlists/playback_events/mood_entries）、Bilibili 抓取与弹幕逻辑、媒体代理（Range 请求）、NetEase 就绪探测的教训（spawn ≠ ready）。

### 前端（Preact + 手写 CSS）

- 运行时依赖仅 3 个：`preact`、`@preact/signals`、`@tauri-apps/api`
- 删除：React、Tailwind、PostCSS、lucide-react、clsx、qrcode（登录二维码由 Rust 端用 `qrcode` crate 生成 PNG base64 下发，前端零依赖渲染）
- 图标：~15 个内联 SVG
- 主题：CSS 自定义属性双主题，`prefers-color-scheme` 跟随系统 + 手动覆盖
- 结构：
  ```
  src/
    main.tsx, app.tsx
    styles/        theme.css（双主题 tokens）、layout.css、components.css
    lib/           tauri invoke 封装、类型
    state/         signals：player、dj、library
    views/         Home(DJ电台) / Search / Library / Settings
    components/    PlayerBar、LyricsView、DjDrawer、QueueSheet、AtmosphereLayer、DanmakuLayer
  ```

### 后端（Tauri/Rust，模块化）

```
src-tauri/src/
  main.rs, lib.rs     装配（lib.rs 仅 ~100 行）
  db.rs               SQLite + 迁移
  library.rs          本地扫描 / 标签 / 封面
  netease/
    crypto.rs         weapi/eapi 加密（AES-CBC/ECB + RSA，公开常数）
    auth.rs           QR 登录：/login/qr/key → create → check，Cookie 会话
    api.rs            搜索 /song/url/v1 /lyric /personalized /user/playlist /like
  bilibili.rs         从旧代码裁剪：搜索/视频流/弹幕
  media.rs            本地与远程媒体代理
  dj.rs               LLM 客户端 + 记忆 + 电台编排
  tts.rs              （可选）系统 TTS 兜底；首选 WebView2 speechSynthesis
```

- 删除：`qqmusic.rs`（-5000 行）、node sidecar（resources/node 82MB + netease-runtime 33MB）、speech 云依赖

## 3. NetEase Rust 原生客户端（最大风险点）

- 用 Rust `aes/cbc/ecb/rsa/reqwest` 实现 weapi 加密，重写约 600 行，替代 115MB Node 运行时。
- 必需端点：QR 登录三步、云搜索、歌曲 URL（v1）、歌词、每日推荐/私人FM 候选、用户歌单、红心操作。
- **风险声明**：协议若变化则登录/取流失效。实施顺序上尽早做（M3），若 QR 登录受挫，回退方案是保留裁剪版 Node sidecar（体积代价 ~115MB），第一时间告知用户。
- 会话 Cookie 持久化在系统 keyring/本地库（沿用现有 PersonalConfig 习惯，禁印）。

## 4. DJ 私人电台（核心）

### 4.1 人格设定

**温暖、克制、带一点文艺气质的深夜电台主持人；中文为主。**

- 说话像人，不像播报机器：短句、留白、不堆形容词、不刷表情符号。
- 严格保持角色：欢迎词、歌曲介绍、聊天回复全部在角色内（LLM system prompt 硬约束 + 语言守卫，参考旧 curatorLanguageGuard 思路）。
- 主动但不聒噪：歌曲介绍 1-2 句；不打断歌；用户没说话时不闲聊刷屏。

### 4.2 记忆系统（全部本地 SQLite）

- `dj_messages(id, session_id, role, content, created_at)`：对话滚动窗口；超过阈值让 LLM 压缩成摘要存入 facts。
- `dj_memory_facts(id, kind[pref/habit/fact], content, weight, source, updated_at)`：DJ 对用户的认知，对话与播放事件后增量更新（LLM 可用时）。
- 口味画像（无 LLM 也可用）：从 `playback_events` 按小时段聚合 red-heart/skip/complete → 时段 × 风格的自动习惯画像。

### 4.3 三个核心时刻

1. **开机**：界面淡入 → DJ 用时间+记忆+近期历史生成欢迎词 → TTS 说出 → 自动开播（选曲：画像评分最高且未听腻的候选）。
2. **歌前介绍**：正式播放前 TTS 说 1-2 句（歌名/艺人/为什么是这首/与你记忆的关联），说完起播。
3. **对话**：DJ 抽屉输入文字 → LLM 输出结构化动作 JSON（`play/search/queue/set_mood/chat`）+ 角色内回复 → 前端执行。

### 4.4 LLM 与降级

- 复用现有 OpenAI 兼容通道（`base_url/model/api_key` 用户自配，如 DeepSeek）。
- 未配置 LLM：纯画像评分自动电台，无语音、无聊天，UI 明示"DJ 离线模式"。
- LLM 失败：重试一次 → 降级为规则动作，不阻塞播放。

### 4.5 语音必须贴合人格（硬性要求）

- TTS 使用 WebView2 `speechSynthesis`（Windows 系统中文语音），零依赖零网络。
- 设置页提供：语音选择（列出已装 zh 声音，默认推荐贴合"温暖克制"气质的声线，如 Huihui 类自然音色）、**语速略慢（rate 0.9–1.0）、音高略沉（pitch ≈ 0.95）**，提供"试听"按钮播一句角色台词。
- 全程同一声线，不换音；TTS 不可用时静默降级为纯文字气泡，DJ 状态仍显示"正在说话"的字幕样式。

## 5. UI 设计（双主题跟随系统）

- 深色：近黑底（#0A0A0C）+ 封面实时取色柔光晕，歌词逐行淡入——深夜电台沉浸感。
- 浅色：暖白纸感 + 细阴影大留白，同布局不同气质。
- 布局：左侧 4 图标窄栏（首页/搜索/曲库/设置）+ 主区沉浸播放画面 + 底部极细播放条 + 右侧 DJ 抽屉。
- 开机即景：无仪表盘感，直接是正在播放画面 + DJ 问候气泡逐字浮现。
- Bilibili 氛围/弹幕：默认关闭、淡而弱、永远 subordinate 于音乐，单开关控制。

## 6. 错误处理

- 所有外部依赖（NetEase/Bilibili/LLM/TTS）失败都不崩溃：状态标注 + 降级路径（见 4.4）。
- NetEase 失效显示具体原因（未登录/VIP/版权/网络），沿用旧 playbackFailureReason 的分类思想。
- 媒体全部走代理，带 Range 支持，失败自动重取一次。

## 7. 测试策略

- Rust：crypto 往返、QR 状态机、db 迁移、DJ 动作解析（单元）；真机 QR 登录 + 搜索 + 取流（手动验收，密钥不落仓库）。
- 前端：signals 状态逻辑与动作解析（vitest）；Playwright 截图走 frontend-design-loop 视觉审查（双主题 × 主要视图）。
- 门禁：`tsc`、`eslint`、`vitest`、`cargo clippy -D warnings`；删除旧 `regression-check`/size-audit 体系，用更轻的检查替代。

## 8. 清理清单（M6，验证通过后执行）

| 删除 | 说明 |
|---|---|
| 旧 `src/`、`src-tauri/src/{lib,qqmusic}.rs` 旧实现 | 被新核心替换 |
| `src-tauri/resources/{node,netease-runtime}` | 115MB sidecar |
| 根目录恢复文档：`PHASE1R_*`、`RECOVERY_COMMIT_MAP.md`、`OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`、`.git-verify-pack.txt` | 恢复期产物 |
| `git-backup-20260919-damaged/`、损坏的 `.git/` | 重新 init |
| `node-v22.17.1-win-x64.zip` | 35MB |
| `dist/`、`test-results/`、`src-tauri/target/` | 构建产物 ~9.5GB |
| `D:\Download\ome-perf-baseline`、`D:\Download\ome-recovery-snapshot-20260919-1245` | 547MB 仓库外残留 |
| `docs/` 过时报告、`.workbuddy/`、`.codex/`、`.trae/`、`playwright.config.ts` 旧测试体系 | 以新文档地图为准 |

**保留**：`PersonalConfig/`（凭据，禁读禁印）、README/LICENSE/icons、`.env.example`。

## 9. 里程碑

1. **M1** 新前端骨架 + 双主题 UI（Preact + 手写 CSS，含截图视觉审查）
2. **M2** Rust 后端模块化（db/library/media，本地播放全通）
3. **M3** NetEase Rust 客户端（风险验证点：QR 登录）
4. **M4** DJ：记忆 + 编排 + 贴合人格的 TTS
5. **M5** Bilibili 氛围/弹幕回归
6. **M6** 全量清理 + git 全新 init + 首个干净提交
