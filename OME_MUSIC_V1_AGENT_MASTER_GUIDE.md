# Ome Music 1.0 — 产品与架构重构总指导手册

> **文档定位**：Ome Music 1.0 的产品设计稿、架构蓝图、AI DJ 规范、工程重构路线与 Agent 执行手册  
> **版本**：Draft 1.0  
> **日期**：2026-09-10  
> **适用对象**：ChatGPT Desktop / Codex / MiMo Desktop / 其他代码 Agent  
> **文档优先级**：高于零散历史提示词。若历史实现与本文冲突，以本文的 1.0 目标为准。  
> **核心原则**：大重构，但不做失控的“大爆炸重写”；以可运行、可回滚、可验证的阶段性迁移完成 1.0。

---

## 0. 给 Agent 的唯一启动提示词

今后不需要再给 Agent 一长串重复上下文。只需要：

```text
请完整阅读仓库中的《OME_MUSIC_V1_AGENT_MASTER_GUIDE.md》，把它作为 Ome Music 1.0 的产品与工程最高指导文档。

先执行 Phase 0：冻结当前基线、审计现状、建立性能与架构基线，不要立即开始大规模改代码。
然后严格按照文档中的阶段顺序推进。每一阶段都必须保持项目可运行、可测试、可回滚，并给出代码证据、测试证据和人工验收清单。

QQ Music 在 1.0 当前阶段只保留稳定的 Provider 接口和实验性能力，不继续投入完整成品化；不得擅自覆盖原贡献者后续迭代方向。
```

---

# 第一部分：为什么要做 Ome Music 1.0

## 1.1 版本战略重新定义

Ome Music 不再继续把当前路线作为 `0.4.x` 发布。

当前 0.3.x / 未发布 0.4 工作应视为 **探索期与原型期**。其中已经验证了大量有价值的设计判断，也暴露了旧架构的极限。

接下来直接进入：

```text
1.0.0-alpha
→ 1.0.0-beta
→ 1.0.0-rc
→ 1.0.0
```

推荐版本节奏：

```text
1.0.0-alpha.1   新架构骨架可运行
1.0.0-alpha.2   新 Playback / Source / UI 主链迁移
1.0.0-beta.1    私人 DJ 与轻记忆进入真实体验
1.0.0-beta.2    性能、稳定性、迁移与跨平台收口
1.0.0-rc.1      Release Candidate
1.0.0           正式版
```

**不要为了“版本号大”而赶进度。1.0 的含义不是功能更多，而是产品身份和技术底座第一次真正稳定。**

## 1.2 为什么旧架构必须重构

旧架构不是失败，而是探索阶段自然形成的“生长型架构”。

它的问题已经逐渐明显：

- `App.tsx` 承担过多职责；
- 播放、来源、UI、Overlay、会话、队列、歌词、氛围之间耦合越来越深；
- 音乐来源增加后出现大量 `source === xxx` 分支扩散；
- Provider 抽象存在，但没有彻底成为系统边界；
- Queue、Library、Playlist 等状态曾经出现语义混用；
- 封面、媒体代理、在线 metadata、重启恢复形成多条重复链路；
- 多个设置入口与 Overlay 造成产品层的“功能堆积”；
- AI 能力逐渐像“功能模块”而不是产品灵魂；
- 第三方登录与 Source Auth 各自生长，缺乏统一模型；
- UI 重渲染、视频氛围、Blur、长列表、远程封面等带来异常资源占用；
- 测试体系逐渐补齐，但仍有不少静态护栏代替真实行为测试；
- Rust `lib.rs` 与来源模块体积持续增大；
- 产品设计被实现细节牵着走，开始偏离最初“小而美、音乐优先”的定位。

因此 1.0 的任务不是“继续修补”，而是：

> **保留已经验证正确的体验，重建承载这些体验的架构。**

---

# 第二部分：Ome Music 1.0 的产品定义

## 2.1 一句话定位

> **Ome Music 是一个由 AI 驱动、以音乐承载情绪与记忆的私人 DJ。**

它不是一个“有 AI 功能的播放器”。

它应该让用户感觉：

> **有一个懂我的 DJ，在替我组织今晚的音乐。**

## 2.2 产品的四个核心身份

### A. 音乐播放器

它首先必须是一个稳定、轻快、安静的音乐播放器。

播放、切歌、队列、歌词、封面、音量、历史、来源切换必须可靠。

### B. 私人 DJ

AI DJ 是产品灵魂，不是插件。

它负责：

- 开场；
- 歌与歌之间的衔接；
- 对下一首歌做简短而有气质的介绍；
- 根据时间、情绪、上下文调整音乐流；
- 在恰当时刻说话；
- 更重要的是知道什么时候不说话。

### C. 情绪音乐空间

Ome Music 不应该只是“列表 + 播放器”。

它是一个 Listening Room：

- 封面；
- 歌词；
- 光影；
- 氛围；
- 视频；
- 弹幕；
- DJ 声音；

共同构成一间会随着音乐变化的空间。

### D. 轻记忆的音乐陪伴者

它会逐渐知道：

- 你常听什么；
- 你什么时候会听什么；
- 哪些歌会被你反复循环；
- 哪些歌和某些状态有关；
- 你明确告诉过它什么。

但它不建立沉重、令人不适的“用户画像系统”。

---

# 第三部分：产品设计原则

## 3.1 Music First

任何界面都先问：

> 这是否让用户更接近音乐？

如果答案是否定的，就应该隐藏、下沉或删除。

## 3.2 AI Inside, Not AI Everywhere

Ome Music 是 AI 驱动的，但界面不能充满：

- AI Assistant
- Large Language Model
- Smart Algorithm
- AI Recommendation
- Generate
- Copilot

AI 应该被用户感受到，而不是被文字反复强调。

推荐产品语言：

- DJ
- Curator
- Taste
- Listening Memory
- Radio
- Notes
- Mood
- Session

## 3.3 Quiet by Default

Idle 状态必须安静。

低频能力通过：

- Hover Reveal
- Contextual Action
- Drawer
- Command Palette
- Secondary Settings

出现。

不是所有能力都常驻在屏幕上。

## 3.4 Emotion Before Decoration

视觉不是为了“炫技”。

动画、模糊、渐变、歌词曲率、视频氛围都必须服务于：

> **情绪。**

如果一个视觉效果只会增加 GPU 占用，却没有增加音乐体验，应删掉。

## 3.5 Memory With Restraint

记忆只保存真正能改善音乐体验的信息。

不把每次点击都变成永久画像。

默认：

- 少；
- 可解释；
- 可查看；
- 可删除；
- 可关闭。

## 3.6 Reliability Is Part of Design

“高级感”不仅来自 UI。

真正的高级感还来自：

- 点播放就播放；
- 封面不会突然消失；
- 切回来状态还在；
- 登录状态诚实；
- 重启后恢复自然；
- 不会因为后台任务导致卡顿；
- 不出现半成品入口。

---

# 第四部分：视觉与交互设计稿

## 4.1 总体视觉定位

### 关键词

> **British Late-Night Radio × Modern Editorial Minimalism × Emotional Listening Room**

中文理解：

> 英伦深夜电台气质 × 现代编辑式极简设计 × 情绪化聆听空间

不是：

- 科技蓝；
- 赛博朋克；
- 玻璃拟态大杂烩；
- AI 控制台；
- “大模型聊天软件”；
- 过度霓虹。

## 4.2 视觉气质

建议基调：

- 暖黑 / 炭黑 / 深棕灰作为夜间底色；
- 奶油白 / 象牙白作为文字与明亮状态；
- 少量铜、酒红、暗金、森林绿等“唱片与电台”气质色作为动态 Accent；
- Accent 优先从当前封面提取，而不是固定彩色 UI；
- 降低大面积高饱和渐变；
- 模糊效果只用于氛围，不用于遮掩结构问题。

### 字体关系

可以采用“编辑式”双字体气质：

- UI / 数字 / 控件：现代无衬线；
- DJ 标题、唱片信息、少量情绪文案：高质量衬线字体或具有编辑感的字体。

目的不是“复古字体堆砌”，而是建立一种：

> **广播杂志 / 唱片内页 / 深夜节目单**

的感觉。

## 4.3 1.0 主界面：Listening Room

建议主界面从“播放器功能面板”重构成：

```text
┌──────────────────────────────────────────────────────┐
│  Ome                                         • On Air │
│                                                      │
│  ┌───────────────┐     ┌─────────────────────────┐   │
│  │               │     │                         │   │
│  │  Album /      │     │       Lyrics Room       │   │
│  │  Artwork      │     │     / Atmosphere /      │   │
│  │               │     │                         │   │
│  └───────────────┘     └─────────────────────────┘   │
│                                                      │
│  Track / Artist                 DJ presence / cue     │
│                                                      │
│  ───────────── progress ─────────────────────────     │
│            previous    play    next                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 主界面只保留：

- 当前音乐；
- 封面；
- 歌词 / 氛围；
- 基础播放；
- 很轻的 DJ Presence；
- Queue 快速入口；
- 必要的音量/更多操作。

### 不应该主界面常驻：

- Provider Diagnostics；
- Token；
- 大量来源状态；
- 全套 Settings；
- 技术名词；
- 一排 AI 功能按钮；
- 调试信息；
- 低频管理动作。

## 4.4 Lyrics Room

保留之前已经验证的正确方向：

- `Calm`
- `Arc Room`
- `Dream`
- `Stage`

其中 `Arc Room` 仍可作为默认视觉语义。

歌词不是普通 `overflow-y: auto` 列表。

核心：

- 当前句是情绪中心；
- 前后歌词形成空间纵深；
- 曲率、模糊、缩放、透明度服务于焦点；
- 点击 seek；
- 翻译歌词自然伴随；
- 无歌词时转为 Artwork / DJ Notes / Atmosphere。

## 4.5 Queue

Queue 应像“今晚的节目单”，而不是数据库表格。

保留：

- 当前曲高亮；
- 来源 Badge；
- 轻量封面；
- 拖拽 / Remove；
- 清晰的 Next；
- 推荐插入。

减少：

- 每行过多按钮；
- 常驻 Retry / Debug；
- 巨大来源标签；
- 过多文字。

## 4.6 Settings

重新收束成四个顶层组：

```text
Listening
Sources
DJ & Memory
System
```

### Listening
- Playback
- Lyrics
- Atmosphere
- Crossfade / Transition

### Sources
- Local
- NetEase
- Bilibili
- QQ Music (Experimental / Interface Ready)

### DJ & Memory
- DJ Voice
- Talk Frequency
- Memory
- Privacy
- Conversation

### System
- Appearance
- Storage
- Diagnostics
- About

不要再让 Quick Start / Guide / Onboarding / Full Settings 重复表达同一件事。

---

# 第五部分：私人 DJ — 产品灵魂设计

## 5.1 DJ 的身份

它不是“AI 助手”。

它是一位：

> **受过良好音乐教育、说话有分寸、略带英伦广播气质的私人夜间 DJ。**

关键词：

- calm
- elegant
- literate
- understated
- warm
- restrained
- slightly vintage
- never cheesy

## 5.2 语气

它应该：

- 简短；
- 有停顿；
- 有音乐感；
- 偶尔文学，但不过度；
- 不教训用户；
- 不解释自己是 AI；
- 不说“根据算法分析”；
- 不频繁总结用户。

它更像：

> “这首歌很适合今晚。”

而不是：

> “根据你最近的听歌历史和情绪分析模型，我为你推荐……”

## 5.3 英伦气质的边界

目标是“英伦复古电台感”，不是模仿任何真实主持人。

语音可以体现：

- soft British / RP 倾向；
- 低而温暖；
- 语速偏慢；
- 句尾收得干净；
- 像深夜广播，而不是广告配音。

## 5.4 DJ 什么时候说话

默认只在四类时刻说话：

### 1. Session 开场

用户第一次进入并开始播放时。

时长：

`5–12s`

内容：

- 现在的时间/氛围；
- 一句非常轻的欢迎；
- 为什么从这一首开始。

### 2. 歌曲之间

核心场景。

建议：

`6–14s`

不要每一首都说。

默认频率可以动态调整，例如：

- 连续安静听歌：每 3–5 首说一次；
- 用户主动进入 DJ Mode：每 1–2 首；
- 用户关闭 DJ：完全不说。

### 3. 用户主动问它

此时进入 Conversation。

### 4. 特别时刻

例如：

- 用户连续循环一首歌；
- 很久没听过的一首旧歌重新出现；
- 一个长期偏好的艺术家出现；
- 用户明确标记的“有记忆的歌”。

## 5.5 DJ Transition Engine

理想播放衔接：

```text
Current Song
   │
   │ last 20–30s: prepare next context
   ▼
DJ Planner
   │
   ├── decide: speak or stay silent
   ├── choose next track
   ├── generate 6–14s script
   └── prepare TTS
   ▼
Transition Window
   │
   ├── current song fades / ducks
   ├── DJ speaks
   ├── next track enters as subtle bed
   └── DJ hands off
   ▼
Next Song
```

必须满足：

- DJ 生成不能阻塞切歌；
- TTS 没准备好时直接无缝切歌，不等待；
- 用户 Skip 时立即取消 DJ；
- 任何 AI 服务失败，都不能破坏播放。

## 5.6 DJ 输出必须结构化

不要让 LLM 直接控制播放器。

AI 只输出受约束数据，例如：

```json
{
  "shouldSpeak": true,
  "durationTargetSec": 9,
  "spokenText": "...",
  "mood": "late-night-warm",
  "handoff": "soft",
  "memoryRefs": ["taste:soft-rock", "session:night"],
  "nextTrackIntent": "slightly-warmer"
}
```

Playback Engine 决定真正播放行为。

---

# 第六部分：轻记忆系统

## 6.1 记什么

只保存能改变音乐体验的信息：

### Taste Memory
- 常听 artist / genre；
- like / skip 的长期趋势；
- 常见音量、播放时间；
- 熟悉度偏好。

### Context Memory
- 夜间偏好；
- 学习 / 放松 / 通勤等明确场景；
- 用户主动告诉 DJ 的偏好。

### Emotional Association
只在用户明确表达或行为证据很强时记录：

- “这首歌让我想起高中”
- “失眠时会听”
- “这是我最喜欢的歌之一”

不要从一次播放就推断复杂人生状态。

## 6.2 不记什么

默认不建立：

- 详细心理画像；
- 私密聊天全文永久存储；
- 隐式敏感属性；
- 每一次点击的永久日志；
- 用户没有必要知道的神秘分数。

## 6.3 记忆必须可解释

DJ 使用记忆时，理由应能被理解。

例如：

> “You often come back to this one late at night.”

而不是：

> “Your emotional score is 0.82.”

---

# 第七部分：Ome Music 1.0 目标架构

## 7.1 架构原则

使用：

> **Modular Monolith + Domain Boundaries + Event-Driven Application Layer**

不要为了“现代化”直接拆微服务。

这是桌面播放器，微服务只会增加复杂度。

## 7.2 前端目标结构

建议演进到：

```text
src/
├─ app/
│  ├─ AppShell.tsx
│  ├─ bootstrap.ts
│  ├─ providers/
│  └─ routes/
│
├─ core/
│  ├─ ipc/
│  ├─ events/
│  ├─ logging/
│  ├─ performance/
│  └─ config/
│
├─ domains/
│  ├─ playback/
│  │  ├─ engine/
│  │  ├─ state/
│  │  ├─ hooks/
│  │  └─ types.ts
│  ├─ queue/
│  ├─ library/
│  ├─ sources/
│  ├─ lyrics/
│  ├─ artwork/
│  ├─ dj/
│  ├─ memory/
│  └─ session/
│
├─ features/
│  ├─ search/
│  ├─ now-playing/
│  ├─ source-settings/
│  ├─ dj-conversation/
│  └─ onboarding/
│
├─ ui/
│  ├─ primitives/
│  ├─ tokens/
│  ├─ typography/
│  ├─ motion/
│  └─ icons/
│
└─ shell/
   ├─ overlays/
   ├─ windows/
   └─ keyboard/
```

### 核心目的

`App.tsx` 最终只负责：

- composition；
- top-level lifecycle；
- provider wiring。

它不再负责：

- Source 业务分支；
- Playback 状态机；
- Queue 操作细节；
- Cover hydrate；
- DJ 业务；
- Auth 业务。

## 7.3 状态管理

1.0 建议区分三类状态。

### A. Playback Realtime State

使用专用 external store / state machine。

特点：

- 高频；
- 不应让整棵 React Tree 重渲染；
- position update 与 UI display 解耦。

### B. Application State

例如：

- active overlay；
- UI mode；
- active source；
- settings；
- DJ mode。

可使用轻量集中 Store。

### C. Async Resource State

例如：

- 搜索；
- provider metadata；
- playlists；
- remote profile；
- cover hydrate。

采用 Query/Cache 风格管理：

- request dedupe；
- stale control；
- cancellation；
- retry policy。

不要所有异步状态都堆进组件 `useState/useEffect`。

## 7.4 Playback Engine

建立真正唯一的：

```text
PlaybackEngine
```

负责：

- load；
- play；
- pause；
- seek；
- next；
- previous；
- repeat；
- shuffle；
- source resolution；
- retry budget；
- audio candidate fallback；
- transition；
- DJ ducking；
- cancellation。

UI 只发送 command，订阅 snapshot。

禁止多个组件直接控制同一个 `HTMLAudioElement` 生命周期。

## 7.5 Event Bus

业务事件采用 typed domain event：

```text
TrackStarted
TrackEnded
TrackSkipped
QueueChanged
PlaybackFailed
SourceAuthChanged
DJTransitionStarted
DJTransitionEnded
MemoryUpdated
```

用途：

- DJ；
- history；
- analytics/local stats；
- UI reaction；
- memory；

不要让模块互相直接 import 一长串 callback。

Event Bus 必须进程内、轻量、typed。

不是 Kafka，不是网络消息系统。

---

# 第八部分：Rust / Tauri 后端目标架构

## 8.1 Rust 模块结构

建议逐渐从巨大 `lib.rs` 演进：

```text
src-tauri/src/
├─ lib.rs
├─ app/
│  ├─ state.rs
│  ├─ commands.rs
│  └─ events.rs
│
├─ playback/
│  ├─ media_proxy.rs
│  ├─ resolver.rs
│  └─ candidates.rs
│
├─ library/
│  ├─ repository.rs
│  ├─ scanner.rs
│  └─ metadata.rs
│
├─ sources/
│  ├─ mod.rs
│  ├─ traits.rs
│  ├─ local/
│  ├─ netease/
│  ├─ bilibili/
│  └─ qqmusic/
│
├─ auth/
│  ├─ credential_store.rs
│  ├─ session.rs
│  └─ diagnostics.rs
│
├─ dj/
│  ├─ context.rs
│  └─ bridge.rs
│
├─ memory/
│  ├─ repository.rs
│  └─ model.rs
│
├─ db/
│  ├─ connection.rs
│  ├─ migrations.rs
│  └─ repositories/
│
└─ observability/
   ├─ logging.rs
   └─ metrics.rs
```

## 8.2 Source Adapter

建立真正统一的 Provider Contract。

概念接口：

```text
MusicSourceAdapter
├─ capabilities()
├─ search()
├─ metadata()
├─ resolve_playable()
├─ lyrics()
├─ playlist()
├─ artwork()
└─ auth()
```

不同来源通过 `capabilities` 声明：

```text
SEARCH
PLAYBACK
LYRICS
PLAYLISTS
AUTH
VIDEO
DANMAKU
LOSSLESS
```

UI 不再猜：

```text
if source === "bilibili"
```

而是问：

```text
source.capabilities.video
```

## 8.3 QQ Music 在 1.0 当前阶段的定位

QQ Music：

> **Interface Ready / Experimental**

要求：

- Provider contract 保留；
- 数据结构保留；
- UI 可以显示 Experimental；
- 默认不作为主推荐来源；
- 未完成登录/播放链路不得伪装 Stable；
- 不继续大改原贡献者领域实现；
- 等原贡献者下一轮迭代后再集成。

## 8.4 Auth 统一模型

所有来源逐步统一：

```text
AuthState
├─ signed_out
├─ credential_present
├─ verifying
├─ authenticated
├─ expired
├─ unknown
└─ failed
```

能力通过：

```text
AccountSessionProvider
```

统一：

- login methods；
- credential persistence；
- verify；
- refresh；
- logout；
- profile；
- membership；
- diagnostics。

---

# 第九部分：性能与“异常占用”专项重构

## 9.1 必须先测，再优化

Phase 0 必须记录：

- Idle CPU；
- 播放 CPU；
- Lyrics Room CPU；
- Video Atmosphere CPU/GPU；
- 内存；
- 30 分钟播放内存增长；
- React render frequency；
- Queue 100 / 1000 项；
- Cover load 数量；
- Media Proxy cache 大小；
- 后台 timer 数量。

没有数据，不允许说“性能已优化”。

## 9.2 性能预算

### Idle
- 不应持续高 CPU；
- 没有不必要轮询；
- 隐藏窗口时动画暂停。

### Playback
- Progress 不驱动整个 App Tree；
- UI tick 可降低到视觉需要的频率；
- audio timeupdate 与 animated progress 分离。

### Lyrics
- window rendering；
- active line 附近少量 DOM；
- inactive animation 降级。

### Queue
- 虚拟化 / windowing；
- 1000 项仍流畅。

### Artwork
- bounded memory cache；
- request dedupe；
- decode 不阻塞主线程；
- 不持久化瞬态 proxy URL。

### Atmosphere
- Video hidden 时 pause；
- blur/backdrop-filter 数量受限；
- Reduced Motion 支持；
- GPU heavy effect 有自动降级。

---

# 第十部分：设计系统

## 10.1 建立真正 Design Tokens

不要继续在组件里散落：

- radius；
- opacity；
- blur；
- spacing；
- shadows；
- font size；
- motion duration。

统一：

```text
Color Tokens
Surface Tokens
Typography
Spacing
Radius
Elevation
Motion
Opacity
Z-index
```

## 10.2 组件原则

建立少量高质量 primitives：

- Button
- IconButton
- Surface
- Drawer
- Popover
- Menu
- Tooltip
- Slider
- Artwork
- Badge
- EmptyState
- Dialog

不要每个 Feature 自己重新做一套按钮。

---

# 第十一部分：AI DJ 技术架构

## 11.1 DJ 不直接依赖 UI

```text
DJ Orchestrator
      │
      ├─ Playback Events
      ├─ Session Context
      ├─ Taste Memory
      ├─ Track Metadata
      ├─ User Conversation
      └─ Time / Environment
      │
      ▼
DJ Planner
      │
      ▼
Structured Transition Plan
      │
      ├─ TTS
      ├─ Playback ducking
      └─ UI presence
```

## 11.2 AI Failure 必须可降级

LLM 超时：

→ 不说话。

TTS 超时：

→ 不说话。

网络断开：

→ 正常播放。

DJ 失败绝不能：

- 卡住 Next；
- 阻塞播放；
- 导致 Queue 错乱；
- 弹出吓人的错误。

**Silence is always a valid fallback.**

---

# 第十二部分：1.0 重构迁移策略

## 12.1 禁止真正的 Big Bang Rewrite

虽然这是一次“大重构”，但禁止：

```text
删掉旧 src
→ 几天后再看看能不能跑
```

采用：

> **Strangler Migration**

新模块逐步取代旧模块。

每个阶段结束：

- 可编译；
- 可启动；
- 核心播放可用；
- 测试可跑；
- Git 可回退。

## 12.2 分支建议

建议创建：

```text
refactor/v1-foundation
```

或：

```text
next/v1
```

不要覆盖现有稳定分支。

保留旧版本历史作为迁移参考。

---

# 第十三部分：Agent 执行路线

## Phase 0 — Freeze & Baseline

只审计，不重构。

交付：

- 当前架构图；
- 组件依赖图；
- Rust 模块图；
- App.tsx / lib.rs 职责分析；
- CPU / memory 基线；
- Bundle size；
- 当前测试清单；
- P0/P1/P2 technical debt；
- 迁移风险；
- 1.0 重构计划。

**没有 Baseline，不进入 Phase 1。**

## Phase 1 — Foundation

建立：

- 新目录边界；
- Design Tokens；
- Typed Events；
- Core IPC；
- Error model；
- Source capability model；
- Observability；
- Feature flags。

此时 UI 看起来可以几乎不变。

目标：

> 先换骨架，不先装修。

## Phase 2 — Playback Core Migration

优先迁移最核心系统：

- PlaybackEngine；
- Queue Controller；
- Playback external store；
- retry/cancellation；
- audio lifecycle；
- DJ transition hook point。

验收：

- 本地音乐；
- NetEase；
- Bilibili；
- A→B→A；
- Like 不重置；
- Queue 不污染 Library；
- 30min soak。

## Phase 3 — Source Architecture

把来源逻辑真正收束到 Adapter。

目标：

- App 不再 source-specific；
- QQ 保留 Experimental interface；
- Bilibili video/danmaku 通过 capability；
- NetEase auth 通过统一 Session Provider；
- Artwork 统一 pipeline。

## Phase 4 — UI 1.0 Rebuild

这阶段允许大幅视觉变化。

重点：

- Listening Room；
- Player controls；
- Lyrics Room；
- Queue；
- Overlay；
- Settings；
- Design System；
- responsive window sizes；
- reduced motion。

每轮必须：

```text
Implement
→ Run
→ Screenshot
→ Visual Review
→ Fix
```

不允许只看代码宣布视觉完成。

## Phase 5 — DJ Core

完成：

- DJ Persona；
- DJ Planner；
- transition scheduler；
- TTS abstraction；
- ducking；
- cancellation；
- talk frequency；
- silent fallback。

先用固定/Mock 文本证明体验，再接 LLM。

## Phase 6 — Memory & Conversation

实现：

- Taste Memory；
- explicit memory；
- session context；
- DJ conversation；
- privacy controls；
- delete/reset memory。

保持轻量。

## Phase 7 — Performance & Hardening

必须真实测：

- idle；
- playback；
- video；
- lyrics；
- 1000 queue；
- memory leak；
- restart；
- installer；
- source failure；
- offline。

## Phase 8 — 1.0 Release

只有：

- architecture gates；
- product gates；
- security gates；
- performance gates；
- manual QA；

全部通过，才进入：

```text
1.0.0-rc.1
```

最终：

```text
1.0.0
```

---

# 第十四部分：Agent 工作纪律

Agent 必须遵守：

1. **先读代码，再改代码。**
2. 不根据文件名猜实现。
3. 大改前建立依赖图。
4. 每次只迁移一个清晰边界。
5. 每个阶段都保持 runnable。
6. 所有重要 Bug 必须有 regression test。
7. 没有真实证据不能标 PASS。
8. UI 必须截图审查。
9. Performance 必须测量。
10. 不为了“现代化”引入无意义依赖。
11. 不做微服务。
12. 不重写来源贡献者代码只为了代码风格统一。
13. 不让 AI DJ 阻塞 Playback。
14. 不让 Source Auth 泄露凭据。
15. 不用巨型 `useEffect` 重新制造新 App.tsx。
16. 不把所有状态放进一个 Global Store。
17. 不把所有 Rust command 放回新的巨大 `commands.rs`。
18. 不一次性修改几千行却没有阶段性 commit。
19. 不删除旧功能后再说“之后补”。
20. 任何资源占用优化都必须有 Before/After。

---

# 第十五部分：1.0 必须保留的历史成果

重构不是推翻产品探索结果。

以下方向已经证明正确，应保留并升级：

- PlayerDock / Listening-focused controls；
- Lyrics Room；
- Arc Room / Calm / Dream / Stage 思路；
- Hover Reveal；
- Active Overlay 单焦点；
- Queue 与 Library 分离；
- ArtworkImage / unified cover resolver；
- Media Proxy；
- Source Provider；
- Bilibili Video Atmosphere；
- Danmaku as atmosphere；
- NetEase `service ready ≠ signed in`；
- Auth 状态诚实；
- OS keyring 优先；
- Regression Gate；
- CI；
- 人工 QA 才算 Done；
- “功能强，但表面安静”；
- AI 不应该到处写 AI。

这些不是旧架构包袱，而是 1.0 的产品资产。

---

# 第十六部分：1.0 应删除或降级的东西

Agent 必须主动寻找并处理：

- 重复设置入口；
- 半完成入口；
- Debug UI；
- Provider 技术状态常驻主界面；
- 低价值按钮；
- 不必要常驻动画；
- AI 营销式文案；
- 重复 fallback；
- 重复 Source branch；
- 无边界 useEffect；
- 临时兼容层；
- 过时 Feature Flag；
- 未使用 state；
- 未使用 dependency；
- 大量历史注释；
- “为了曾经某个 Bug”永久留下但无测试说明的 hack。

删除前必须确认：

- 无引用；
- 有迁移路径；
- 不影响用户数据；
- 有 git history 可追溯。

---

# 第十七部分：1.0 产品成功标准

正式版不是“能启动”。

必须达到：

## Product

- 第一次打开就知道这是一个音乐产品，而不是 AI 工具；
- 主界面安静且高级；
- DJ 有清晰人格；
- 音乐之间有自然衔接；
- AI 存在感来自“理解”，不是按钮；
- Memory 有温度但不冒犯。

## Engineering

- App Shell 轻；
- Playback 单一权威；
- Provider 边界清晰；
- Auth 统一；
- Cover 统一；
- Async 可取消；
- 错误可诊断；
- 资源有上限；
- CI 可靠；
- 测试覆盖历史 P0。

## Performance

- Idle 不异常占用；
- 30 分钟播放无明显增长；
- 长 Queue 流畅；
- 歌词无明显掉帧；
- Video Atmosphere 可降级；
- Background/hidden 状态主动降载。

## Reliability

- A→B→A；
- restart restore；
- offline；
- source unavailable；
- login expired；
- media URL expired；
- artwork failure；

都必须有正确 fallback。

---

# 第十八部分：最后的产品宣言

Ome Music 1.0 不应该成为：

> “一个拥有很多音乐源、很多 AI 功能的播放器。”

它应该成为：

> **一个在你打开之后，就已经开始理解今晚应该播放什么的私人 DJ。**

它记得的不是“用户画像”。

它记得的是：

> **你曾经在哪些夜晚反复听过哪些歌。**

它做的不是“AI 推荐”。

它做的是：

> **替你把一首歌，接到另一首歌里。**

它说话不是为了证明自己聪明。

它只在真正值得说一句的时候开口。

而当音乐本身已经足够表达一切时：

> **它应该保持安静。**

这就是 Ome Music 1.0 的灵魂。

---

# 附录 A：每阶段报告模板

Agent 每完成一个 Phase，必须输出：

```text
Phase:
HEAD:
Changed files:
Architecture decisions:
Removed debt:
New risks:
Performance before:
Performance after:
Automated tests:
Manual QA:
Screenshots:
Known issues:
Rollback plan:
Next phase recommendation:
```

# 附录 B：优先级规则

```text
P0
数据丢失 / 播放不可用 / 安全泄露 / 崩溃 / 无法启动

P1
核心功能错误 / 状态错乱 / 严重性能问题 / 登录错误 / 主要 UI 不可用

P2
架构债务 / 边界不清 / 中等性能问题 / 体验不统一

P3
视觉细节 / 文案 / 低频边角问题
```

1.0 重构期间：

> P0/P1 永远优先于视觉继续扩张。

# 附录 C：QQ Music 1.0 暂行策略

QQ Music 当前：

```text
Status: Experimental / Interface Ready
```

原则：

- 保留 Provider；
- 保留贡献者历史；
- 保留可用搜索/metadata 等能力；
- 不再把完整 Auth/Playback 作为本轮主线；
- UI 明确 Experimental；
- 默认不影响其他来源；
- 新架构必须为后续贡献者迭代留下清晰 Adapter 接口；
- 原贡献者下一版到来后，通过 Adapter Contract 集成，不再让其功能侵入 App 主逻辑。

# 附录 D：一句话检验所有设计决策

每当团队/Agent 不知道该不该加一个功能、按钮、动画、状态或抽象时，问：

> **它是否让 Ome Music 更像一个懂我、安静、有品位的私人 DJ？**

如果不是，就应该谨慎。
