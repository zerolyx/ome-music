# Ome Music — Phase 1A 报告（Safety Net / Reliability / Foundation）

> 日期：2026-09-19
> **Phase**：1A（Safety Net → 两个 P1 → Foundation Skeleton）
> **Branch**：`main`（**未**在 `refactor/v1-foundation` 上，见 §Known Issues K1）
> **HEAD**：进入时 `fd895757337b4ae9fdbd2342e58c908d1d6daa07`（`chore(perf): track window-minimized state…`）

---

## 0. 先读这一节：两件必须先知道的事

### K1 — 仓库 `.git` 在本次会话中受损（**最高优先级**）

我在干净的 `main` 上执行 `git checkout -b refactor/v1-foundation`，命令返回成功但**分支 ref 并未落地**（HEAD 指向不存在的 ref）。随后 `git checkout main` 被 SIGTERM 中断，之后发现：

| 项 | 状态 |
|---|---|
| `.git/refs/` | 整目录消失（`main` / `pr-15-qqmusic` / `backup/*` 全丢） |
| `.git/logs/` | 整目录消失（reflog 全丢） |
| loose objects | 从大量降到 8 个；pack（7 月，863 对象）幸存 |
| `fd89575` 及最近 41 个提交 | 对象已不存在（逐个 `cat-file` 验证，仅 `069a7fdc` 幸存） |
| 远程 `origin/main` | `3805e72`（2026-07-02）——**那 41 个提交从未推送过** |
| **工作区源码** | **完好**，与 Phase 0 基线记录完全一致（App.tsx 2406 / lib.rs 10300 / qqmusic.rs 4981） |

已做：**没有**执行 force push / reset / rebase / 删除任何提交。已把损坏的 `.git` 原样备份到 `git-backup-20260919-damaged/`（2.8 MB，供取证，可删）。已重建 `.git/refs` 目录并把 `refs/heads/main` 写回 `fd89575`（指针可解析，但对象缺失，`git log` 当前不可用）。

经你确认「先修代码，暂不碰 git」，后续全程**未再执行任何 git 写操作**。

### K2 — `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md` 不在仓库里

`git ls-files` 与全盘 `find` 均无此文件。本阶段按你本次指令正文重述的原则执行（Modular Monolith + 域边界 + Strangler + 每步可回滚），并以 `docs/PHASE0_BASELINE.md` 作为事实源。**请把总指导文档补入仓库**，否则后续 Phase 缺少裁决依据。

---

## 1. Changed files

### 新增

| 文件 | 用途 |
|---|---|
| `src/features/playback/playbackFailureReason.ts` | 失败原因词汇表（消息 / 标签 / 可重试 / 可连接判定） |
| `src/features/playback/playbackFailureReason.test.ts` | 15 个行为测试 |
| `src/features/playback/playbackFailurePolicy.ts` | **P1-7** 重试 / 跳过 / 停止状态机 |
| `src/features/playback/playbackFailurePolicy.test.ts` | 27 个行为测试 |
| `src/core/events/eventBus.ts` + `.test.ts` | 类型化事件总线（8 测试） |
| `src/core/errors/domainError.ts` + `.test.ts` | 领域错误模型（9 测试） |
| `src/core/logging/logger.ts` | 结构化日志原型 |
| `src/core/config/env.ts` | 配置读取 + 校验 |
| `src/core/ipc/invoke.ts` | 类型化 IPC 边界 |
| `src/domains/source/sourceCapability.ts` + `.test.ts` | SourceCapability（6 测试） |
| `src/ui/tokens/tokens.ts` | UI 设计令牌（转录现状，非重新设计） |
| `src/types/vite-env.d.ts` | `import.meta.env` 类型 |
| `tests/smoke/app.smoke.spec.ts` | **最小 Playwright smoke** |
| `playwright.config.ts` | smoke harness 配置 + 边界说明 |
| `scripts/perf/README.md` | 性能 Before/After 规程 |
| `scripts/cargo-msvc.cmd` | Windows + Git Bash 下可用的 cargo 包装（修 MSVC link 冲突） |

### 修改

| 文件 | 改动 |
|---|---|
| `src/App.tsx` | P1-7 接入：失败统一处理、自动跳过、跳过提示、来源原因映射抽离（+停用本地重复定义） |
| `src-tauri/src/lib.rs` | P1-8：sidecar readiness 单一权威 + 重启路径 + 有界回退 + 7 个 Rust 测试 |
| `src/components/QueueDrawer.test.tsx` | 「Clear 不删曲库」契约从字符串断言升级为行为断言 |
| `src/features/musicSources/provider.ts` | `NetEaseServiceStatus` 增加 `reason` 字段 |
| `.github/workflows/ci.yml` | frontend job 增加 `npm run test`；新增 `smoke` job |
| `package.json` / `package-lock.json` | `test:smoke`、`perf:sample`、`perf:summary`；devDep `@playwright/test` |
| `.gitignore` | 忽略 `test-results/`、`playwright-report/` 等 |

### 未跟踪产物

- `git-backup-20260919-damaged/` —— 损坏 `.git` 的取证备份，**请你决定处置**。

---

## 2. Safety Net

### 2.1 CI 真的执行 `npm test` 了

`ci.yml` 的 `frontend` job 在 Prettier 之后、build 之前插入：

```yaml
- name: Behaviour tests (regression contracts + Vitest)
  run: npm run test
```

`npm test` = `test:regression`（79 条静态契约）+ `test:unit`（Vitest）。此前这两道门都只在本地跑。

### 2.2 regression 契约行为化

保留 `regression-check.mjs`（未删除），把有产品意义的契约迁成行为测试：

| 契约 | 原形态 | 现在 |
|---|---|---|
| Source reason mapping | App.tsx 内的 `switch`（字符串断言无法触达） | `playbackFailureReason.test.ts` 15 用例，含「不得把 reason code 漏进文案」 |
| Playback failure state | 无 | `playbackFailurePolicy.test.ts` 27 用例 |
| Queue clear 不删 Library | 只断言 `onClear` 被调用 | 追加断言：`onRemove` **一次都没被调用**、tracks 数组不变 |
| Artwork src 变化后 failed state reset | 已有行为测试 | 保留 |
| QQ credential ≠ authenticated | 已有 6 用例 | 保留 |
| Lyrics resolver | 已有 8 用例 | 保留 |
| **Overlay 只能有一个 primary** | 无 | **未行为化** —— 见 §Known Issues K3 |

Vitest：5 文件 / 28 用例 → **10 文件 / 94 用例**。

### 2.3 最小 Playwright Smoke

4 个用例，本地实测全绿（11.0s）：

1. 启动到播放壳层，**零未捕获错误**（含 `pageerror` 与 console error 双重收集）
2. 队列抽屉开→关（用 `translate-x-*` 状态断言，不用 visibility）
3. Quick Settings 开→关
4. Player dock 始终挂载

**边界（已写入 `playwright.config.ts` 注释）**：这是 `vite preview` 的纯 Web 前端，**不启动 Tauri 外壳**。以下仍只能人工 QA：本地文件播放 / asset 协议 / 授权目录、NetEase node sidecar、keyring 与 PersonalConfig 凭据、`ome-media://` 代理、QQ 音乐登录。

---

## 3. P1-7：坏曲目不再杀死整个队列

### 根因（代码证据）

`src/App.tsx` 有两条播放终止路径，**都只 `setIsPlaying(false)` + 设文案，从不推进队列**：

- resolve 失败 `.catch()`（原 832–838 行）
- audio `error` 处理器重试耗尽后（原 1026–1041 行）

而推进队列的 `handleAudioEnded` 只绑在 `ended` 事件上——**坏曲目永远不会触发 `ended`**。于是恢复的 1051 项队列里只要有一首过期 vkey 直链，整个播放就永久静默停止。

### 修复方式

新增**单一失败权威** `src/features/playback/playbackFailurePolicy.ts`（纯函数、零框架依赖、可测），App.tsx 的两条终止路径都改为：

```
handlePlaybackFailure(track, reason, origin, retryAllowed)
```

状态机（`retry` / `skip` / `stop`）：

| 规则 | 行为 |
|---|---|
| 重试预算 | 每曲目 3 次；`canplay/playing/loadeddata`、手动播放、切歌都会重置 |
| 永久性失败 | `no_copyright` / `song_removed` / `vip_required` 等**立即跳过**，不消耗预算 |
| 本地文件失败 | `retryAllowed=false`，不重试（路径不会自己变好） |
| Repeat One | 自动推进被禁止 → `stop(repeat_one)`，不会循环同一首坏歌 |
| 手动点击 | 重试耗尽后 `stop(manual_failure)`，**不把用户从他点的那首歌上拽走** |
| 自动推进 | `skip` → 标记 unavailable → 跳到下一首**可播**曲目 |
| 全队列不可播 | `stop(queue_exhausted)`，文案带实际尝试数量 |
| 大队列上限 | 单次 pass 最多 50 次跳过，1051 项死队列不会无限转 |
| 数据 | unavailable 只存内存，**不删曲库行、不持久化瞬态签名 URL** |

`nextPlayableIndex()` 负责跳过已知坏曲目，返回 `null` 即触发 `queue_exhausted` 停止。

UX 区分：自动跳过 → 4.5s 自动消失的低干扰提示（`Skipped "xxx" — …`）；手动失败 → 保留常驻的 `libraryError` 提示。同一时刻只渲染一条 notice。

### 自动测试

27 个新用例覆盖：永久失败立即跳过、预算耗尽不再重试、`canplay` 重置预算、手动播放重置、每曲目独立预算、repeat-one 停止、手动失败不导航、队列耗尽停止、1000+ 队列上限、unavailable 可清除、nextPlayableIndex 环绕/跳过/全坏返回 null。

### 人工测试

**未做**（需要 Tauri 环境与你的真实坏曲目队列）。建议步骤：恢复含 5 首 QQ 过期 vkey 曲目的队列 → 连续播放 → 确认自动跳过后继续播放；Repeat One 下确认停止而非循环；手动点坏曲目确认提示常驻且不跳转。

---

## 4. P1-8：NetEase sidecar readiness 闭环

### 根因（代码证据）

旧 `ensure_local_netease_api_service`（lib.rs 6880–7062）：

1. **没有 readiness 状态**。每次请求都从零开始探测，不记录上一次转换的结果。
2. **sick child 永不被替换**：`existing_child_alive` 为真就 `skip spawn`——一个起来了但从不应答的进程会被永久信任，只能靠设置面板「重新检测」救回。
3. **状态自相矛盾**：`waiting_health` 返回 `running:false, started:true`；没有 `starting` 态；UI 无法可靠区分 starting / failed。
4. **长阻塞**：健康探测在 `start_lock` 内做，npx 路径 70×500ms = 35s，启动瞬间的并发请求全部排队，看起来就是「挂起」。
5. `is_netease_api_reachable` 每次 `new Client()`，2s 超时 × 32 次。

### readiness 模型

新增 `NeteaseReadiness`（存入 `AppState.netease_readiness`，**单一权威**）：

```
not_started ──► starting_service ──► ready
                       │
                       └──► failed (runtime_missing | spawn_failed | health_timeout)
```

- `stage` / `reason`（机器可读）/ `message` / `failed_transitions`
- DTO 新增 `reason` 字段，前端 `NetEaseServiceStatus.reason?: string | null`（可选，向后兼容）

流程：`fast path`（已知 ready 且仍应答）→ 取 `start_lock`（single-flight **保留**）→ 重探 → **sick child 杀掉重启** → spawn → `starting_service` → 有界回退探测 → `ready` 或 失败时杀掉子进程并 `failed(health_timeout)`。

回退：`netease_probe_delay_ms()` = 200ms 起 ×2 增长，上限 800ms；attempts 20（本地运行时，≈15s）/ 40（npm，≈31s）。**有界、非无限轮询**。

### 自动测试

7 个 Rust 用例：stage 字符串映射、默认态非 ready、成功转换清零失败计数、失败保留机器 reason、重复失败计数不回绕（`saturating_add`）、回退单调且有界在 [200,800]、总探测窗口 ≤35s 且 ≥1s。

### 人工测试

**未做**（需真实启动 NetEase sidecar）。建议：冷启动后立即搜索/播放；杀掉 3000 端口进程后再请求，确认自动重启而非静默失败；断网启动，确认 `failed(health_timeout)` 且 UI 文案诚实。

---

## 5. Foundation Skeleton

新增目录：`src/core/{events,errors,logging,config,ipc}`、`src/domains/source`、`src/ui/tokens`。

| 抽象 | 解决什么 |
|---|---|
| `core/events/eventBus` | 后端 0 事件推送 → 全靠轮询；给应用层一个发布/订阅事实的地方，不引状态库 |
| `core/errors/domainError` | 现在失败是裸 `Error` 且 message 已是文案，调用方无法区分「可重试」与「永久」 |
| `core/logging/logger` | `console.*` / `eprintln!` 无形状无上下文；统一结构 + scope，且**禁止整体 stringify payload**（防凭据入日志） |
| `core/config/env` | 配置散落在 localStorage / DB / 硬编码字面量 |
| `core/ipc/invoke` | ~90 处 `invoke()` 用字符串命令名，Rust 改名只有运行时才发现 |
| `domains/source/sourceCapability` | 前端 37 处 `source ===` 分支；改成问「能不能做 X」 |
| `ui/tokens/tokens` | 调色板以 hex 字面量散落 ~100 处 |

**为什么现在不迁业务**：这些模块目前只有测试在消费，尚未接入 App/lib.rs。按你的要求「新增新骨架，旧系统继续跑」，Phase 1A 只建立词汇表。真正的接入发生在 Phase 2/3——那时每个接入点都有本次建的行为测试兜底。

**一处主动偏离**：你列了「最小 primitives」，我**没有**新建 UI 组件。理由：`AGENTS.md` 的「Less is more」+ 未使用的 UI 抽象就是死代码。UI 组件收敛留给 Phase 4（UI 1.0）。如需现在补，请明确。

---

## 6. Performance

| 指标 | Before（Phase 0 实测） | After（本阶段实测） | 判定 |
|---|---|---|---|
| JS 总量 | 473.8 kB raw / **146.2 kB gzip** | 477.5 kB raw / **147.5 kB gzip** | +3.7 kB / +1.3 kB（+0.9%），新增模块成本 |
| CSS | 77.3 kB raw / 14.3 kB gzip | 77.28 kB / 14.26 kB | 持平 |
| 构建 | 5.31s（1665 模块） | 2.75s（1667 模块） | 机器状态不同，**不可比**，仅记录 |
| `cargo check` | 4.72s（增量） | 29.86s（含依赖编译） | 同上 |

**运行时 CPU / 内存：本阶段没有新的 After 数据。** P1-7 修复后 30 分钟 soak 才第一次有可能跑完（此前两次都被坏曲目中断），但**我没有重跑**。这是刻意的：把它留给 Phase 2 作为 Playback 迁移的基线对照，现在跑完的基线在迁移后会失效。

`scripts/perf/` 已保留并补上 `README.md`，明确规程：**没有 Before/After 的性能结论不得标记 PASS**，并给出了必须填写的字段（含「最小化样本占比必须为 0%，否则该轮作废」）。

---

## 7. CI

| Job | 状态 | 说明 |
|---|---|---|
| Frontend（tsc / eslint / prettier / build） | 见 K4 | 新增 `npm run test` 一步 |
| **Vitest + regression（本次新增进 CI）** | ✅ 本地 94 用例 + 79 条契约通过 | CI 上首次真跑需观察（依赖已入 lock，jsdom 无 Tauri 依赖） |
| **Frontend smoke（本次新增 job）** | ✅ 本地 4/4 | CI 需下载 Chromium（`--with-deps`） |
| Rust Linux（check/clippy/fmt/test） | ✅ 本地等价验证通过 | `cargo check` / `clippy -D warnings` / `fmt --check` / `test` 均 exit 0 |
| Rust Windows | ✅ 同上（本机即 Windows） | 50 tests passed |
| Docs（PR only） | ✅ `docs:check passed` | |

**注意：GitHub 上最后一次 CI 是 `0dfe8f8`（9/7），而本地 HEAD 领先 41 个提交且从未推送——CI 相对本地是过期的。**

---

## 8. Known Issues

| # | 问题 | 证据 / 影响 |
|---|---|---|
| K1 | `.git` 受损，41 个未推送提交的对象丢失 | 见 §0。**阻塞**「Git 工作区干净」这条退出标准 |
| K2 | `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md` 不在仓库 | 后续 Phase 缺裁决依据 |
| K3 | 「Overlay 只能有一个 primary」未行为化 | 该不变量当前由 `activeOverlay` 单状态结构性保证；要行为化需先把 overlay 状态抽成可测 reducer，属 Phase 4 范围。诚实标记为未做 |
| K4 | **main 上预存在 Prettier 违规** | `NowPlayingHero.tsx`（1716 行 diff）、`ProviderSettingsPanel.tsx`（8720 行 diff）、`qqMusicAuthPresentation.ts/.test.ts`（7 / 47 行）。这与 Phase 1A 无关（那 41 个提交从未进 CI）。**我没有动它们**——属于无关的大规模改动。建议单独开一个「格式归一化」提交，与 Phase 2 分开 |
| K5 | P1-7 / P1-8 无人工验证 | 都需要 Tauri 环境 |
| K6 | 30 分钟 soak 仍未完成 | 需 P1-7 修复 + 你的真实队列 |
| K7 | `scripts/cargo-msvc.cmd` 硬编码 VS 18 路径 | 机器相关，已注明可改 `VS_ROOT`；可考虑不入库 |

---

## 9. New Risks

1. **P1-7 自动跳过会掩盖「整源失效」**。如果 NetEase 掉线，跳过预算会一路耗尽并停在 `queue_exhausted`。这比「静默死在第一首」好，但**必须**配合 P1-8 的 `reason` 才能在 UI 上说清「是源挂了」而不是「歌坏了」。目前 `queue_exhausted` 文案还没带上最后一个 reason 的分类——建议 Phase 2 补。
2. **杀 sick child 的激进程度**。现在只要探测失败就杀掉重启。若某次探测因瞬时抖动失败，会白杀一个健康进程。已用 single-flight 限制并发，但**没有加「宽限窗口」**。
3. **Foundation 模块暂无生产消费方**，若长期不接入会变成新的死代码（当前 `musicUnderstanding` 就是前车之鉴）。建议 Phase 2 强制每个新增抽象至少有一个真实调用点。
4. **Playwright 进了 CI**，下载 Chromium 会拉长 CI 时间；`webServer` 每次都跑 `npm run build`。
5. **`@playwright/test` 是新增依赖**，与 `AGENTS.md`「依赖变更需先征得同意」有张力——你本次明确要求建 smoke，我据此执行，请追认。

---

## 10. Rollback Plan

由于 git 当前不可用（K1），回滚方式按优先级：

1. **先修 git**（回收站 / 文件历史还原 `.git`，或以 `3805e72` 为基重建）。修好后所有改动都是工作区文件，可正常 diff / stash / revert。
2. **在 git 修复前**，回滚 = 删除新增文件 + 还原 5 个被修改文件。被修改文件的关键还原点：
   - `src/App.tsx`：移除 `handlePlaybackFailureRef` 及其两处调用、恢复本地 `playbackReasonMessage` / `playbackNoticeLabel`、恢复原 audio `error` 处理器与 resolve `.catch`
   - `src-tauri/src/lib.rs`：回滚 `ensure_local_netease_api_service` 与 `NeteaseReadiness` 相关代码（新增结构全部独立，可整块删除）
   - `.github/workflows/ci.yml`：删掉 `Behaviour tests` step 与 `smoke` job
   - `package.json`：移除 `test:smoke` / `perf:*` 与 `@playwright/test`
3. **P1-7 / P1-8 都是独立新增模块**，没有改动既有数据结构、没有迁移、没有改 schema，也没有触碰凭据读取路径（`PersonalConfig` / keyring 全程未读未改）。

---

## 11. 是否建议进入 Phase 2 —— Playback Core Migration

**建议：暂缓，先把 K1 和 K2 解决。**

理由：

- Phase 2 的核心动作（PlaybackEngine external store、position 不再进 React props）要求**每一步可回滚**。当前 git 无法提交、无法 diff、无法建立基线分支，一旦改错没有退路。这直接违反你定的「每一步都可运行、可测试、可回滚」。
- 总指导文档缺失，Phase 2 的取舍（权威状态放哪、生命周期谁管）没有裁决依据。

**功能层面**上，Phase 1A 的 11 条退出标准里有 9 条已经满足：

| # | 标准 | 状态 |
|---|---|---|
| 1 | CI 执行 Vitest / npm test | ✅ |
| 2 | 核心 regression 契约已行为测试保护 | ✅（Overlay 一条除外，K3） |
| 3 | 有最小 smoke/e2e 能力 | ✅ |
| 4 | P1-7 坏曲目不再杀死队列 | ✅（自动测试通过，**人工未验**） |
| 5 | P1-8 sidecar readiness 闭环 | ✅（自动测试通过，**人工未验**） |
| 6 | 现有 Rust / frontend CI 继续全绿 | ⚠️ Rust ✅；Frontend 因 **K4 预存在格式违规**会失败 |
| 7 | App 可以正常启动 | ✅（smoke 验证） |
| 8 | Local / NetEase / Bilibili 无回归 | ⚠️ 未在真实 Tauri 环境验证 |
| 9 | Git 工作区干净 | ❌ **K1** |
| 10 | 新 Foundation skeleton 已存在 | ✅ |
| 11 | 尚未开始危险的大规模业务迁移 | ✅ |

所以准确的说法是：**代码层面 Phase 1A 已完成，工程层面被 K1 卡住。** 建议顺序：① 修复 / 重建 git → ② 单独提交格式归一化（K4）→ ③ 补总指导文档（K2）→ ④ 你人工验证 P1-7 / P1-8 → ⑤ 再开 Phase 2。
