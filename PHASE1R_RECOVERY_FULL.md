# Ome Music 1.0 · Phase 1R 仓库恢复报告合集

> **生成时间**：2026-09-19
> **适用范围**：Ome Music 1.0 重构项目 · Phase 1R（仓库恢复）
> **文档性质**：由 4 份独立文档合并而成，内容**未作删改**，仅将各篇标题统一降一级以形成层级。
> **第一原则**：先保存证据，不重建。全程未执行 `checkout` / `reset` / `clean` / `gc` / `prune` / `repack` / `force-push` / `rebase`。
> **最终判定**：**Tier B（部分恢复）**

---

## 合并说明

| 部分 | 内容 | 来源文件 | 行数 |
|---|---|---|---|
| 第一部分 | Phase 1R 恢复总报告（结论先行） | `PHASE1R_RECOVERY_REPORT.md` | 189 |
| 第二部分 | 提交级映射表 RECOVERY_COMMIT_MAP | `RECOVERY_COMMIT_MAP.md` | 160 |
| 第三部分 | Git 取证报告 GIT_RECOVERY_REPORT | `docs/GIT_RECOVERY_REPORT.md` | 144 |
| 第四部分 | Ome Music 1.0 总指导手册（原件附录） | `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md` | 1555 |

> 原 4 份文件仍保留在仓库中，未删除。合并件仅为便于通读。

## 目录

- [第一部分 · Phase 1R 恢复总报告（结论先行）](#第一部分--phase-1r-恢复总报告结论先行)
  - [0. 结论先行](#0-结论先行)
  - [1. Phase 2 — Git 取证结果](#1-phase-2--git-取证结果)
  - [2. Phase 3 — 提交映射](#2-phase-3--提交映射)
  - [3. Phase 4 — 档位判定](#3-phase-4--档位判定)
  - [4. Phase 5 — Master Guide 恢复 ✅](#4-phase-5--master-guide-恢复-)
  - [5. Phase 6 — Phase 1A 代码复验（只记录，不改代码）](#5-phase-6--phase-1a-代码复验只记录不改代码)
  - [6. Phase 7 — K4 Prettier 诊断（单独处理）](#6-phase-7--k4-prettier-诊断单独处理)
  - [7. Phase 8 — Phase 1A 退出标准复核（11 条）](#7-phase-8--phase-1a-退出标准复核11-条)
  - [8. 本轮做了什么 / 没做什么](#8-本轮做了什么--没做什么)
  - [9. 建议的下一步顺序](#9-建议的下一步顺序)
  - [10. 诚实标注的遗留](#10-诚实标注的遗留)
- [第二部分 · 提交级映射表 RECOVERY_COMMIT_MAP](#第二部分--提交级映射表-recoverycommitmap)
  - [0. 事故范围一句话](#0-事故范围一句话)
  - [1. 状态图例](#1-状态图例)
  - [2. 已推送历史（本地 pack，完好）](#2-已推送历史本地-pack完好)
  - [3. Segment A — 可从远端无损取回（27 个提交）](#3-segment-a--可从远端无损取回27-个提交)
  - [4. Segment B — 完全丢失（41 个提交，不可恢复为原 SHA）](#4-segment-b--完全丢失41-个提交不可恢复为原-sha)
  - [5. 内容层（非历史层）完整性 —— 关键结论](#5-内容层非历史层完整性--关键结论)
  - [6. 取证覆盖情况（逐项）](#6-取证覆盖情况逐项)
  - [7. 恢复判定](#7-恢复判定)
- [第三部分 · Git 取证报告 GIT_RECOVERY_REPORT](#第三部分--git-取证报告-gitrecoveryreport)
  - [1. 事故定性](#1-事故定性)
  - [2. 取证过程（全部只读）](#2-取证过程全部只读)
  - [3. 关键证据摘录](#3-关键证据摘录)
  - [4. 内容层完整性（本次取证最重要的正面结论）](#4-内容层完整性本次取证最重要的正面结论)
  - [5. 三档判定](#5-三档判定)
  - [6. Tier B 恢复方案（待你确认后执行）](#6-tier-b-恢复方案待你确认后执行)
  - [7. 事故教训（建议写入 `AGENTS.md`）](#7-事故教训建议写入-agentsmd)
- [第四部分 · Ome Music 1.0 总指导手册（原件附录）](#第四部分--ome-music-10-总指导手册原件附录)
- [Ome Music 1.0 — 产品与架构重构总指导手册](#ome-music-10--产品与架构重构总指导手册)
- [第一部分：为什么要做 Ome Music 1.0](#第一部分为什么要做-ome-music-10)
- [第二部分：Ome Music 1.0 的产品定义](#第二部分ome-music-10-的产品定义)
- [第三部分：产品设计原则](#第三部分产品设计原则)
- [第四部分：视觉与交互设计稿](#第四部分视觉与交互设计稿)
- [第五部分：私人 DJ — 产品灵魂设计](#第五部分私人-dj--产品灵魂设计)
- [第六部分：轻记忆系统](#第六部分轻记忆系统)
- [第七部分：Ome Music 1.0 目标架构](#第七部分ome-music-10-目标架构)
- [第八部分：Rust / Tauri 后端目标架构](#第八部分rust--tauri-后端目标架构)
- [第九部分：性能与“异常占用”专项重构](#第九部分性能与异常占用专项重构)
- [第十部分：设计系统](#第十部分设计系统)
- [第十一部分：AI DJ 技术架构](#第十一部分ai-dj-技术架构)
- [第十二部分：1.0 重构迁移策略](#第十二部分10-重构迁移策略)
- [第十三部分：Agent 执行路线](#第十三部分agent-执行路线)
- [第十四部分：Agent 工作纪律](#第十四部分agent-工作纪律)
- [第十五部分：1.0 必须保留的历史成果](#第十五部分10-必须保留的历史成果)
- [第十六部分：1.0 应删除或降级的东西](#第十六部分10-应删除或降级的东西)
- [第十七部分：1.0 产品成功标准](#第十七部分10-产品成功标准)
- [第十八部分：最后的产品宣言](#第十八部分最后的产品宣言)
- [附录 A：每阶段报告模板](#附录-a每阶段报告模板)
- [附录 B：优先级规则](#附录-b优先级规则)
- [附录 C：QQ Music 1.0 暂行策略](#附录-cqq-music-10-暂行策略)
- [附录 D：一句话检验所有设计决策](#附录-d一句话检验所有设计决策)

---

# 第一部分 · Phase 1R 恢复总报告（结论先行）

> **来源**：`PHASE1R_RECOVERY_REPORT.md`
> **本部分定位**：Phase 1R 的最高层交付物：结论、档位判定、复验结果、退出标准复核。

## PHASE1R_RECOVERY_REPORT.md

> 日期：2026-09-19
> **范围**：仓库恢复（Phase 1R）· 不重跑 Phase 0 / 1A · **不进入 Phase 2**
> **第一原则**：先保存证据，不重建。全程未执行 `checkout` / `reset` / `clean` / `gc` / `prune` / `repack` / `force-push` / `rebase`
> **最终判定：Tier B（部分恢复）**

---

### 0. 结论先行

| 问题 | 结论 |
|---|---|
| 41 个未推送提交能救回来吗？ | **历史不能**（对象已不存在，且不伪造 SHA）；**内容能**（100% 保留在工作区，已逐文件校验） |
| 有没有远端备份？ | **有，且是意外的**：fork `chinokoyuki/ome-music` + PR #15 完整保留了 `3805e72 → 0dfe8f85` 共 **27 个提交**的真实对象 |
| 档位 | **Tier B** |
| Phase 1A 的代码还站得住吗？ | **站得住**。全部门禁复验通过（94 单测 + regression + 4/4 smoke + tsc + lint + docs:check + CI YAML） |
| Master Guide | 已找到原件并恢复入仓库（K2 解除） |
| K4 Prettier | 已定位真实根因：**这 4 个文件从未被格式化过**（非 CRLF、非版本漂移）。建议单独提交，不混入恢复提交 |
| 能否进 Phase 2 | **还不能**。Tier B 恢复写入 `.git` 需你先确认；P1-7 / P1-8 人工验证仍缺 |

---

### 1. Phase 2 — Git 取证结果

完整过程见 `docs/GIT_RECOVERY_REPORT.md`。摘要：

| 证据源 | 结果 |
|---|---|
| `git fsck --full` | 仅 2 个 unreachable commit（`069a7fd` / `02caf16`），**两者 tree 均已丢失**（空壳） |
| `git verify-pack -v` | pack 855 对象 exit 0，**无损坏** → v0.1.0–v0.3.8 历史完好 |
| reflog | **全丢**（`.git/logs` 空目录） |
| `git-backup-20260919-damaged/` | 与当前 `.git` 对象完全一致 → **损坏之后制作，零证据价值** |
| 其他本地克隆 | 无 |
| Windows 以前的版本 | `vssadmin` 卷影副本**只覆盖 C:** 盘，仓库在 **D:** 盘 → 不可用 |
| GitHub | `origin/main` = `3805e72`；**fork `chinokoyuki/ome-music` = `0dfe8f85`**；`refs/pull/15/head` 可达 |
| `.git/index` | **完好**（141 条）→ 成为内容层完整性的判定依据 |

**关键突破**：`069a7fd` 幸存对象的 `parent` 字段 = `0dfe8f85`，而 `0dfe8f85` 正是 fork 与 PR #15 的 tip。这条父子关系直接指认了远端恢复源，把"不可恢复"变成"部分可恢复"。

---

### 2. Phase 3 — 提交映射

已产出 **`RECOVERY_COMMIT_MAP.md`**，逐条标注 27 + 41 个提交的存在状态与来源。

| 区段 | 范围 | 数量 | 状态 |
|---|---|---|---|
| 已推送 | → `3805e72` | 59（pack 内） | ✅ 完好 |
| **Segment A** | `3805e72 → 0dfe8f85` | **27** | ✅ 可从 fork 无损取回（真实 SHA） |
| **Segment B** | `069a7fd → fd89575` | **41** | ❌ 对象丢失；内容保留在工作区 |

---

### 3. Phase 4 — 档位判定

#### **Tier B**

- **A 不成立**：41 个提交对象不存在，伪造 SHA 被明确禁止。
- **B 成立**：Segment A 可取回真实对象；Segment B 内容完整（141 条索引中 80 条逐字节一致、53 条仅 CRLF、**仅 8 条真实改动且恰好等于 Phase 1A 的改动清单**）。
- **C 不需要**：内容未丢失。

**Tier B 执行方案已写在 `docs/GIT_RECOVERY_REPORT.md` §6，只增不删；但会写入 `.git`，因此等你确认后再动手。**

---

### 4. Phase 5 — Master Guide 恢复 ✅

| 项 | 内容 |
|---|---|
| 原件位置 | `D:\Download\OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`（30,886 字节，2026-09-10） |
| 仓库内 | **原本不存在** → K2 属实 |
| 动作 | 已复制到仓库根目录 `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md` |
| gitignore 影响 | 无（`.gitignore` 只忽略 `/*usage*.md` `/*config*.md` 等模式，不匹配） |

**K2 解除。**

---

### 5. Phase 6 — Phase 1A 代码复验（只记录，不改代码）

| 门禁 | 结果 | 证据 |
|---|---|---|
| `npm run test:regression` | ✅ | `Regression checks passed: settings ownership, source isolation, auth boundaries, service startup, compact layout and v0.4.0 hardening are guarded.` |
| `npm run test:unit`（Vitest） | ✅ **94 passed / 10 files** | 含新增 `playbackFailureReason`（15）、`playbackFailurePolicy`（27）、`eventBus`（8）、`domainError`（9）、`sourceCapability`（6） |
| `npm run test:smoke`（Playwright） | ✅ **4 passed** | boot 无未捕获错误 / queue drawer 开关 / quick settings 开关 / 播放控件稳定 |
| `npx tsc --noEmit` | ✅ exit 0 | |
| `npm run lint` | ✅ 0 错误 | |
| `npm run docs:check` | ✅ | `README, versions, links, screenshots, and sensitive text all clean.` |
| CI YAML | ✅ 合法 | `ci.yml` jobs = `rust, rust-windows, frontend, smoke, docs`（`smoke` 为 Phase 1A-1 新增） |
| Rust（check/clippy/fmt/test） | ✅ | Phase 1A 时已验证，本轮未重跑（本轮为只读取证，避免任何写操作） |
| P1-7 人工验证 | ⚠️ **未做** | 需真实 Tauri 环境 |
| P1-8 人工验证 | ⚠️ **未做** | 需真实 Tauri 环境 |

**结论：Phase 1A 的代码在本次事故中没有受到任何连带损害。**

---

### 6. Phase 7 — K4 Prettier 诊断（单独处理）

#### 现象

`npm run format:check` 报 4 个文件违规：`NowPlayingHero.tsx`、`ProviderSettingsPanel.tsx`、`qqMusicAuthPresentation.ts`、`qqMusicAuthPresentation.test.ts`

#### 逐项排除（**含一次自我证伪**）

| 假设 | 验证方式 | 结果 |
|---|---|---|
| ① CRLF 换行符导致 | 把文件转 LF 后再跑 `--check` | ❌ **证伪**：转 LF 后仍然失败；且 `qqMusicAuthPresentation.ts/.test.ts` 本来就是纯 LF（0 个 CRLF）也失败 |
| ② Prettier 版本漂移 | 声明 `^3.4.2`、实际装 3.9.0；用 `npx prettier@3.4.2 --check` 复验 | ❌ **证伪**：3.4.2 同样报这 4 个文件 |
| ③ 配置漂移 | `.prettierrc`（`endOfLine: lf` 等 8 项） | ❌ 无变更记录，且 ① 已排除换行因素 |
| ④ **从未被格式化过** | 上述三项排除后剩下的唯一解释 | ✅ **成立** |

#### 真实根因

**这 4 个文件从来没有被 Prettier 格式化过。** 它们所属的那 41 个提交从未推送、从未进 CI，`format:check` 这一步在它们身上从未运行过。差异内容是实打实的排版问题（三元表达式断行、函数签名换行、`import type` 折叠等），不是环境问题。

#### 建议

- **单独开一个「格式归一化」提交**，不要混进 Git 恢复提交（否则恢复提交的 diff 会被几千行格式噪声淹没，失去可审查性）。
- 该提交只做 `npm run format`，不改任何逻辑；提交后再跑一遍全量门禁确认零行为变化。
- 顺带建议：把 `format:check` 加进本地 pre-commit，避免同类问题再次只在 CI 才暴露。

---

### 7. Phase 8 — Phase 1A 退出标准复核（11 条）

| # | 标准 | Phase 1A 时 | **本轮复验** | 说明 |
|---|---|---|---|---|
| 1 | CI 执行 Vitest / npm test | ✅ | ✅ | ci.yml 含 `frontend` job + `Behaviour tests` step |
| 2 | 核心 regression 契约已行为测试保护 | ✅（Overlay 除外） | ✅（Overlay 除外，K3） | K3 属 Phase 4 范围 |
| 3 | 有最小 smoke/e2e 能力 | ✅ | ✅ **4/4 通过** | |
| 4 | P1-7 坏曲目不再杀死队列 | ✅（人工未验） | ✅ 自动 / ⚠️ **人工仍未验** | 需 Tauri 环境 |
| 5 | P1-8 sidecar readiness 闭环 | ✅（人工未验） | ✅ 自动 / ⚠️ **人工仍未验** | 需 Tauri 环境 |
| 6 | 现有 Rust / frontend CI 继续全绿 | ⚠️（K4） | ⚠️ **仍被 K4 阻塞** | 根因已定位，待单独提交 |
| 7 | App 可以正常启动 | ✅ | ✅ | smoke 验证 |
| 8 | Local / NetEase / Bilibili 无回归 | ⚠️ | ⚠️ **未验证** | 需真实 Tauri 环境 |
| 9 | Git 工作区干净 | ❌ K1 | ⚠️ **判定为 Tier B，待执行** | 不再是不可恢复的黑盒 |
| 10 | 新 Foundation skeleton 已存在 | ✅ | ✅ | `src/core|domains|features/playback|ui/tokens` |
| 11 | 尚未开始危险的大规模业务迁移 | ✅ | ✅ | Phase 1R 全程只做取证 + 文档 + 恢复 Master Guide |

**计分：✅ 7 条 / ⚠️ 4 条 / ❌ 0 条**（Phase 1A 时为 ✅6 ⚠️3 ❌1 → 净改善：K1 从「不可恢复」降级为「Tier B 待执行」）。

> 注：你给的清单写的是「10 条」，实际文档里是 **11 条**。这里按实际的 11 条复核。

---

### 8. 本轮做了什么 / 没做什么

#### 做了（只增不删）

| 动作 | 位置 |
|---|---|
| 只读安全副本 | `D:\Download\ome-recovery-snapshot-20260919-1245\`（516 MB） |
| 提交映射文档 | `RECOVERY_COMMIT_MAP.md`（新增） |
| Git 取证报告 | `docs/GIT_RECOVERY_REPORT.md`（新增） |
| 本报告 | `PHASE1R_RECOVERY_REPORT.md`（新增） |
| Master Guide 恢复 | `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`（新增，K2 解除） |
| 索引一致性校验产物 | `D:\Download\ome-index-verify.txt`、`ome-index-verify-lf.txt` |
| K4 验证产物 | `D:\Download\k4_test.py`、`k4_diff.py`、`k4-lftest\`、`k4-diff\` |

#### 没做

- ❌ 未执行任何 git 写操作（fetch / commit / checkout / reset / gc 全都没跑）
- ❌ 未改动 Phase 1A 的任何代码
- ❌ 未修 K4（刻意留作单独提交）
- ❌ 未进入 Phase 2

---

### 9. 建议的下一步顺序

| 序 | 动作 | 阻塞关系 |
|---|---|---|
| ① | **你确认 Tier B 执行方案**（fetch fork + 重建一个新提交） | 需要你点头，因为会写 `.git` |
| ② | 单独提交「格式归一化」（K4） | 必须在 ① 之后，否则 diff 不可审 |
| ③ | 你人工验证 P1-7 / P1-8（真实 Tauri 环境） | 独立于 ①②，可并行 |
| ④ | 确认 11 条退出标准中的 ⚠️ 项清零 | 依赖 ①②③ |
| ⑤ | 才开 Phase 2（Playback Core Migration） | 依赖 ④ |

---

### 10. 诚实标注的遗留

1. **41 个提交的历史永久丢失**，无法恢复为原 SHA。能做的只有把内容诚实重建为一个新提交，并在文档中留痕。
2. **"41"这个数字在 `PHASE1A_REPORT.md` 里口径不一致**（一处以 `origin/main` 为基准、一处以 `0dfe8f8` 为基准）。本报告采用"以 `0dfe8f85` 为基准 = 41 个"；若以 `3805e72` 为基准则总数为 68 个。
3. `796894d`（ORIG_HEAD）的身份未确定 —— 不知道它是哪个提交的旧值。
4. **Rust 门禁本轮未重跑**（为保持"只读取证"的纯粹性）。Phase 1A 时已验证通过，本轮无代码改动，风险极低，但严格说属于"未复验"。
5. `.git/index` 的 141 条中，53 条是 CRLF 差异 —— 这本身不是问题（`core.autocrlf=true` 的正常表现），但它意味着**恢复后如果不加 `.gitattributes`，其他人克隆仍会踩到 K4 这类换行相关坑**。建议后续补一个 `.gitattributes`。


---

# 第二部分 · 提交级映射表 RECOVERY_COMMIT_MAP

> **来源**：`RECOVERY_COMMIT_MAP.md`
> **本部分定位**：逐条列出 27 + 41 个提交的存在状态与恢复来源；含内容层完整性的逐文件校验结果。

## RECOVERY_COMMIT_MAP.md

> 生成时间：2026-09-19（Phase 1R）
> 用途：记录 `.git` 受损事故的**提交级取证结果**，逐条标注每个已知 SHA 的存在状态与恢复来源。
> 原则：**只记录证据，不伪造 SHA**。凡标注 `LOST` 的提交，均不得以任何方式"重建"为原 SHA。

---

### 0. 事故范围一句话

`refs/heads/main` = `fd89575` 的**最近 41 个提交**（`069a7fd` → `fd89575`）从未推送到 `origin`，其对象在本次事故中全部丢失；
更早的 **27 个提交**（`3805e72` → `0dfe8f85`）虽也未推送到 `origin/main`，但**完好存在于 fork `chinokoyuki/ome-music` 与 PR #15**，可无损取回。

---

### 1. 状态图例

| 标记 | 含义 |
|---|---|
| ✅ `PACK` | 对象在本地 pack 中（可立即读取） |
| ✅ `REMOTE` | 对象不在本地，但可从远端 fork / PR 取回（真实对象、真实 SHA） |
| ⚠️ `SHELL` | 仅 commit 对象幸存，**tree / blob 全部丢失**，无法 checkout，只有元数据价值 |
| ❌ `LOST` | 对象完全不存在，任何来源均不可得 |

---

### 2. 已推送历史（本地 pack，完好）

| SHA | 日期 | 说明 | 状态 |
|---|---|---|---|
| `3805e72c3380c03a52bccc5a0fb7bba48ce1f75b` | 2026-07-02 | `fix: make NetEase runtime hash check portable` · `origin/main` · tag `v0.3.8` | ✅ `PACK` |
| （更早 58 个 commit） | 2026-06-27 → 07-02 | 完整 v0.1.0 → v0.3.8 历史 | ✅ `PACK`（pack 内共 59 commit / 342 tree / 450 blob / 4 tag，`verify-pack` exit 0） |

**pack 校验**：`pack-d10c36e03ba95ac490dc672bd80455950e4dcbca`（2.5 MB，2026-07-11 克隆时生成），`git verify-pack -v` 无错误、无损坏对象。

---

### 3. Segment A — 可从远端无损取回（27 个提交）

来源：`chinokoyuki/ome-music`（fork，`refs/heads/main`）与 `zerolyx/ome-music` 的 `refs/pull/15/head`，二者均指向 `0dfe8f85`。
**这 27 个提交的对象、tree、blob 全部完好可取，SHA 为原始真实值。**

| # | SHA | 日期 | 说明 | 状态 |
|---|---|---|---|---|
| A1 | `e3548f9b5d7dd31984db39f61eef6f382c2521d0` | 2026-07-02 | Merge branch 'zerolyx:main' into main | ✅ `REMOTE` |
| A2 | `7bf60b47079903a0dcf89965a487171a055b3b95` | 2026-07-09 | feat: 新增QQ音乐音乐源支持 | ✅ `REMOTE` |
| A3 | `8691ccd4450fb58d55c9e425dba566e8ecc4357b` | 2026-07-09 | chore: 更正版本（0.3.8 + 条件编译） | ✅ `REMOTE` |
| A4 | `d1cfd0ec67d21a230b7159888982bc4b8345e002` | 2026-07-09 | refactor(qqmusic): WebView2 Cookie Windows 适配 | ✅ `REMOTE` |
| A5 | `e524cbd8f788c76b3d81d70da4f5c06f43279da4` | 2026-07-11 | refactor(qqmusic): 移除冗余调试信息 | ✅ `REMOTE` |
| A6 | `1af57d8020386e91b957b9372efb585f55c30c22` | 2026-07-12 | fix: harden QQ Music authentication / network | ✅ `REMOTE` |
| A7 | `e835424ea8df310794b8144ecb8af3e10183ea8f` | 2026-07-12 | fix: keep QQ Music search stable | ✅ `REMOTE` |
| A8 | `d4b46026a18e458a81e37de735fe854d603aa292` | 2026-07-12 | chore: restore unrelated project specs | ✅ `REMOTE` |
| A9 | `69c979441ebb3ad86b86db26a2c47c83a3a19c70` | 2026-07-12 | test: cover QQ Music authentication and safety paths | ✅ `REMOTE` |
| A10 | `87abe6c94d7eea2cbdb2edb0747067e2d2bbc86b` | 2026-09-01 | fix(security): masking / URL parsing / proxy boundaries | ✅ `REMOTE` |
| A11 | `976e8fd7092c8db5983ccddea67ae71060605c56` | 2026-09-01 | fix(qqmusic): QR polling lifecycle + source gating | ✅ `REMOTE` |
| A12 | `f70221aef228b63848fb3a1ec633c1ae0fa78ed0` | 2026-09-01 | fix(playback): cover / lyric / queue / idle | ✅ `REMOTE` |
| A13 | `4ede7257ebffc4526dfc29537732c26f23b88508` | 2026-09-01 | test+ci+docs: Vitest, CI, v0.4.0 release docs | ✅ `REMOTE` |
| A14 | `151f2f0c80fe6d3716b52461bbc9914aecb4af7e` | 2026-09-01 | docs(qa): v0.4.0 manual acceptance checklist | ✅ `REMOTE` |
| A15 | `f50f23517dc6f009241ba17ec7bff7b50a1a46be` | 2026-09-01 | docs(report): final audit report for v0.4.0 | ✅ `REMOTE` |
| A16 | `bb6c2ca357118189b5fd90cbc4c72cd15500562d` | 2026-09-06 | fix(ci): align QR polling regression guards | ✅ `REMOTE` |
| A17 | `7bd9b868e8297a5e9d4f72e6522b1713bcae44cb` | 2026-09-06 | fix(qqmusic): QR continuity + stale-poll guards | ✅ `REMOTE` |
| A18 | `4137422477400a3b0b8fed64f7891ed8041aa549` | 2026-09-06 | chore(deps): vite 6.4.3 等安全更新 | ✅ `REMOTE` |
| A19 | `02caf169fad7703fc28bbfdf6013c1db7c6ab988` | 2026-09-06 | fix(qqmusic): satisfy clippy -D warnings | ⚠️ `SHELL`（本地仅 commit 对象） + ✅ `REMOTE` |
| A20 | `c2c46be44187a8ad8b67db210f04ddacaba85dbe` | 2026-09-06 | docs(report): 09-06 audit round | ✅ `REMOTE` |
| A21 | `8d8840876332bfb12a3f514039db6d1d3fa593a` | 2026-09-07 | docs(security): NetEase plaintext mirror as P1 | ✅ `REMOTE` |
| A22 | `2aba96db64d510b74105d2047af3300ab9f301d2` | 2026-09-07 | fix(rust): clear Linux-only clippy failures | ✅ `REMOTE` |
| A23 | `abaa85a01ffb43e65763b2dad76129ac8014789a` | 2026-09-07 | fix(test): platform-native path assertions | ✅ `REMOTE` |
| A24 | `871e967284055be27a574b362b67735bc91cfce3` | 2026-09-07 | fix(qqmusic): official WebView login as primary path | ✅ `REMOTE` |
| A25 | `09a012bca44c2fc5ba9e399ad45ab6c4e9254e3f` | 2026-09-07 | docs(changelog): QQ Music sign-in rebuilt | ✅ `REMOTE` |
| A26 | `2b85c40256c457578acb11da81aa11b46e4fec3d` | 2026-09-07 | fix(rust): allow cfg-idle login metrics on non-Windows | ✅ `REMOTE` |
| A27 | `0dfe8f8522290263ae6f99b130e017d8c4bfad7f` | 2026-09-07 | fix(qqmusic): bootstrap QQ cookies into real session | ✅ `REMOTE` · **fork tip / PR #15 head / `069a7fd` 的父提交** |

---

### 4. Segment B — 完全丢失（41 个提交，不可恢复为原 SHA）

来源：`refs/heads/main` 指针值、`FETCH_HEAD`、`ORIG_HEAD`、`COMMIT_EDITMSG`、`docs/PHASE0_BASELINE.md`、`docs/PHASE1A_REPORT.md` 的书面记录。
**对象、tree、blob 全部不存在；仅提交信息/父子关系可从文档与幸存对象中推断。**

| # | SHA | 日期/来源 | 说明 | 状态 |
|---|---|---|---|---|
| B1 | `069a7fdcfb0df49bcb15efc11888f121df162899` | 2026-09-10 12:30 +0800 | `fix: classify Direct QR 403 and expand QQ Music login state machine` · parent = `0dfe8f85` · **Phase 0 基线 HEAD** | ⚠️ `SHELL`（commit 对象幸存，tree `d0d5d2b8` 已丢失） |
| B2 | `3968ae5` | 2026-09-11 | UI 微调（NowPlayingHero 空态文案/透明度） | ❌ `LOST` |
| B3 | `9fe20f5` | 2026-09-11 | 文档入库（PROJECT / ARCHITECTURE / DECISIONS / design） | ❌ `LOST` |
| B4 | `2fcf3f5` | 2026-09-11 | agent 技能入库 · **锚点标签 `v1-phase0-baseline`** | ❌ `LOST`（标签本身亦丢失） |
| B5 | `229fde5` | 2026-09-11 | CSP `media-src` 播放阻塞修复（P0） | ❌ `LOST` |
| B6–B40 | 未知 | 2026-09-11 → 09-19 | Phase 0 附加产出（性能采样工具、实测数据文档等） | ❌ `LOST` |
| B41 | `fd895757337b4ae9fdbd2342e58c908d1d6daa07` | 2026-09-19 前 | `chore(perf): track window-minimized state and auto-restore during soaks` · **事故前本地 HEAD** | ❌ `LOST`（`COMMIT_EDITMSG` 保留了完整标题） |
| ? | `796894d752d8316dc4c9dcaf1842e098af954066` | 未知 | `ORIG_HEAD` 指向（事故前某次 merge/reset 的旧值） | ❌ `LOST` |

**计数说明（诚实标注）**：`docs/PHASE1A_REPORT.md` 中"41"出现两次且口径不一致 ——
- §0 K1 表："`fd89575` 及最近 41 个提交"（未明确基准）
- §7："本地 HEAD 领先 41 个提交"（明确以 `0dfe8f8` 为基准）

本表采用后者（以 `0dfe8f85` 为基准，**41 个**）。若以 `3805e72` 为基准则总数为 27 + 41 = **68 个**未推送提交。

---

### 5. 内容层（非历史层）完整性 —— 关键结论

历史丢了，**内容没丢**。逐文件校验 `.git/index`（141 条，完好）中记录的 blob SHA 与工作区实际内容：

| 分类 | 数量 | 含义 |
|---|---|---|
| `EXACT`（完全一致） | **80** | 与 `fd89575` 内容逐字节相同 |
| `CRLF_ONLY`（仅换行符差异） | **53** | 内容相同，只是工作区为 CRLF、`core.autocrlf=true` 入库时归一为 LF |
| `REAL_DIFF`（真实改动） | **8** | 恰好等于 Phase 1A 修改的 8 个文件 |
| `MISSING_IN_WORKTREE` | **0** | 无缺失文件 |

**8 个真实改动文件**（与 Phase 1A 报告完全一致，无附带损伤）：

| 文件 | Phase 1A 中的改动 |
|---|---|
| `.github/workflows/ci.yml` | 1A-1：加 `Behaviour tests` step 与 `smoke` job |
| `.gitignore` | 1A-1：`test-results/` `playwright-report/` `blob-report/` `.playwright/` |
| `package.json` | 1A-1：`test:smoke` / `perf:sample` / `perf:summary` + `@playwright/test` |
| `package-lock.json` | 1A-1：依赖锁 |
| `src-tauri/src/lib.rs` | 1A-2：P1-8 NetEase readiness 单一权威 |
| `src/App.tsx` | 1A-2：P1-7 故障决策单一权威 |
| `src/components/QueueDrawer.test.tsx` | 1A-1：强化"Clear 不删库"断言 |
| `src/features/musicSources/provider.ts` | 1A-2：`NetEaseServiceStatus.reason` |

→ **结论：工作区 = `fd89575` 完整内容 + Phase 1A 的 8 处改动 + 新增未跟踪文件。内容层 100% 可恢复，可安全地在其上重建一个诚实的新提交。**

---

### 6. 取证覆盖情况（逐项）

| 取证项 | 结果 |
|---|---|
| `git fsck --full --dangling --unreachable` | 已执行（只读）。2 个 unreachable commit、1 个 unreachable tree、2 个 unreachable blob；大量 `missing blob` |
| `git verify-pack -v` | 已执行。`pack-d10c36e0…` 855 对象，exit 0，无损坏 |
| `.git/objects`（松散） | 30 个目录仅剩 **8 个对象**（22 个目录已空） |
| `.git/refs/` | 仅 `refs/heads/main` → `fd89575`（事故后重建的指针，对象缺失） |
| `.git/packed-refs` | 完好：`origin/main`=3805e72 + 9 个 tag（v0.1.0 → v0.3.8） |
| `.git/logs/`（reflog） | **目录存在但为空 —— reflog 全丢** |
| `.git/ORIG_HEAD` | `796894d`（记录，对象丢失） |
| `.git/FETCH_HEAD` | `069a7fd` · branch `pr-15-qqmusic` of . |
| `.git/COMMIT_EDITMSG` | `chore(perf): track window-minimized state and auto-restore during soaks` |
| `.git/index` | **完好**，141 条，含全部 blob SHA |
| `.git/objects/info/alternates` | 不存在（无共享对象库） |
| `commit-graph` | 不存在 |
| stash | 无（`.git/refs/stash` 不存在） |
| 其他本地克隆 | 全盘扫描无第二份 ome 克隆（`ome-perf-baseline` 仅为 CSV 采样数据） |
| Windows 以前的版本 / VSS | `vssadmin list shadows` 仅覆盖 **C:** 卷；仓库在 **D:** 卷，**不可用** |
| GitHub 远端分支 | `zerolyx/ome-music` 仅 `main`（=3805e72）；fork `chinokoyuki/ome-music` 仅 `main`（=0dfe8f85） |
| GitHub PR | 15 个 PR，其中 **PR #15（open）head = fork `main` @ `0dfe8f85`**；`refs/pull/15/head` 可达 |
| 受损前备份 | `git-backup-20260919-damaged/` 与当前 `.git` **对象完全一致**（备份在损坏之后制作，无额外证据） |

---

### 7. 恢复判定

**→ Tier B（部分恢复）**

- ❌ **非 Tier A**：41 个提交对象已不存在，且严禁伪造 SHA，无法恢复完整原始历史。
- ✅ **Tier B 成立**：
  - Segment A（27 提交）→ 可从 fork 取回**真实对象、真实 SHA**。
  - Segment B（41 提交）→ 历史不可恢复，但**内容完整存在于工作区**（已逐文件校验），可重建为**一个新提交**，并在提交信息与 `GIT_RECOVERY_REPORT.md` 中如实记载。
- ❌ **非 Tier C**：内容未丢失，无需降级到"仅保留当前快照、放弃历史"的最坏方案。


---

# 第三部分 · Git 取证报告 GIT_RECOVERY_REPORT

> **来源**：`docs/GIT_RECOVERY_REPORT.md`
> **本部分定位**：取证过程全记录（全部只读命令）、关键证据摘录、Tier B 执行方案、事故教训。

## GIT_RECOVERY_REPORT.md

> 生成时间：2026-09-19 · Phase 1R
> 关联文档：`RECOVERY_COMMIT_MAP.md`（提交级映射）、`docs/PHASE1A_REPORT.md` §0 K1（事故首发记录）
> **最终判定：Tier B（部分恢复）**

---

### 1. 事故定性

| 项 | 事实 |
|---|---|
| 触发动作 | `git checkout -b refactor/v1-foundation`（命令返回成功，但 ref 未落地），随后 `git checkout main` 被 SIGTERM 中断 |
| 直接后果 | `.git/refs/` 与 `.git/logs/` 目录内容被清空；`.git/objects/` 下 30 个松散目录只剩 8 个对象 |
| 幸存 | pack（855 对象，2026-07-11 克隆时生成）、`.git/index`（141 条，完好）、`.git/packed-refs`、`COMMIT_EDITMSG`、`ORIG_HEAD`、`FETCH_HEAD` |
| 工作区 | **完好**（已逐文件校验，见 §4） |
| 未执行 | 全程未执行 `checkout` / `reset` / `clean` / `gc` / `prune` / `repack` / `force-push` / `rebase` |

---

### 2. 取证过程（全部只读）

| 取证项 | 命令 / 方法 | 结果 |
|---|---|---|
| 全量一致性检查 | `git fsck --full --dangling --unreachable` | 2 个 unreachable commit（`069a7fd`、`02caf16`）、1 个 unreachable tree、2 个 unreachable blob；大量 `missing blob`；`refs/heads/main` 与 `HEAD` 为无效指针 |
| pack 完整性 | `git verify-pack -v` | exit 0，855 对象（59 commit / 342 tree / 450 blob / 4 tag），**无损坏** |
| 对象计数 | `git count-objects -v` | count 8 / in-pack 855 / packs 1 |
| 引用 | 读取 `HEAD`、`ORIG_HEAD`、`FETCH_HEAD`、`packed-refs`、`refs/` | 见 §3 |
| reflog | `find .git/logs -type f` | **0 个文件 —— reflog 全丢** |
| alternates | `.git/objects/info/alternates` | 不存在 |
| commit-graph | `.git/objects/info/` | 不存在 |
| stash | `.git/refs/stash` | 不存在 |
| 受损前备份 | `git-backup-20260919-damaged/` | 与当前 `.git` **对象完全一致**（备份在损坏之后制作，**无额外证据价值**） |
| 其他本地克隆 | 全盘 `find -name .git -maxdepth 4` | 无第二份 ome 克隆 |
| Windows 以前的版本 | `vssadmin list shadows` | 卷影副本**仅覆盖 C:** 卷；仓库在 **D:** 卷 → **不可用** |
| GitHub 远端 | `git ls-remote` + GitHub API | `zerolyx/ome-music` 仅 `main`（=`3805e72`）；fork `chinokoyuki/ome-music` 仅 `main`（=`0dfe8f85`）；`refs/pull/15/head` = `0dfe8f85` |
| GitHub PR | 列举 15 个 PR | **PR #15（open）head = fork `main` @ `0dfe8f85`** ← 关键恢复源 |

#### 安全副本

`D:\Download\ome-recovery-snapshot-20260919-1245\`（516 MB）——完整工作树只读副本，排除 `src-tauri/target`（9.5 GB）与 `node-v22.17.1-win-x64.zip`（34 MB）。制作期间未对原仓库做任何写操作。

---

### 3. 关键证据摘录

```
.git/HEAD              → ref: refs/heads/main
.git/refs/heads/main   → fd895757337b4ae9fdbd2342e58c908d1d6daa07   （对象缺失）
.git/ORIG_HEAD         → 796894d752d8316dc4c9dcaf1842e098af954066   （对象缺失）
.git/FETCH_HEAD        → 069a7fdcfb0df49bcb15efc11888f121df162899  branch 'pr-15-qqmusic' of .
.git/COMMIT_EDITMSG    → chore(perf): track window-minimized state and auto-restore during soaks
.git/packed-refs       → origin/main=3805e72 + 9 个 tag (v0.1.0 … v0.3.8)
.git/objects           → 30 个目录中仅 8 个对象存活
.git/logs              → 目录存在，0 个文件
```

**幸存的两个 commit 对象（均为"空壳"）**：

| SHA | 日期 | tree | tree 是否存在 |
|---|---|---|---|
| `069a7fdc…` | 2026-09-10 12:30 +0800 | `d0d5d2b8…` | ❌ 不存在 |
| `02caf169…` | 2026-09-06 14:06 UTC | `3319660e…` | ❌ 不存在 |

两者都只有提交元数据（author / committer / message / parent），**无法 checkout**，但为历史重建提供了父子关系与语义锚点。`069a7fd` 的 parent = `0dfe8f85`，正是 fork 与 PR #15 的 tip —— 这条线索直接定位了远端恢复源。

---

### 4. 内容层完整性（本次取证最重要的正面结论）

对 `.git/index` 的 141 条记录逐文件比对工作区实际内容（按 Git blob 规则 `sha1("blob <len>\0" + content)` 计算，区分 CRLF 归一化）：

| 分类 | 数量 | 含义 |
|---|---|---|
| `EXACT` | **80** | 与 `fd89575` 逐字节一致 |
| `CRLF_ONLY` | **53** | 内容一致，仅换行符不同（`core.autocrlf = true`，全局设置，仓库无 `.gitattributes`） |
| `REAL_DIFF` | **8** | 真实改动 |
| `MISSING_IN_WORKTREE` | **0** | 无缺失 |

**8 个 `REAL_DIFF` 恰好等于 Phase 1A 修改的文件清单**，无一处附带损伤：

`.github/workflows/ci.yml`、`.gitignore`、`package.json`、`package-lock.json`、`src-tauri/src/lib.rs`、`src/App.tsx`、`src/components/QueueDrawer.test.tsx`、`src/features/musicSources/provider.ts`

→ **工作区 = `fd89575` 完整内容 + Phase 1A 的 8 处改动 + 新增未跟踪文件。内容层 100% 可恢复。**

---

### 5. 三档判定

| 档位 | 判定 | 依据 |
|---|---|---|
| **A — 完整恢复（原始 SHA 全在）** | ❌ **不成立** | 41 个提交对象已不存在；幸存的两个 commit 只是空壳。严禁伪造 SHA。 |
| **B — 部分恢复** | ✅ **成立** | ① `3805e72 → 0dfe8f85` 共 27 个提交可从 fork / PR #15 取回**真实对象与真实 SHA**；② 丢失的 41 个提交其**内容完整保留在工作区**，可诚实重建为一个新提交。 |
| **C — 不可恢复** | ❌ 不需要 | 内容未丢失，无需降级。 |

#### **最终判定：Tier B**

---

### 6. Tier B 恢复方案（待你确认后执行）

以下操作**只增不删**，不触碰任何现有对象；但在执行前需要你点头，因为会写入 `.git`。

```bash
# 0) 前置：安全副本已存在
#    D:\Download\ome-recovery-snapshot-20260919-1245\

# 1) 取回 Segment A 的 27 个真实提交（只 fetch，不 merge、不 checkout）
git fetch https://github.com/chinokoyuki/ome-music.git main:refs/recovery/pr15-head

# 2) 校验取回结果
git log --oneline refs/recovery/pr15-head | head -30      # 应止于 0dfe8f8
git cat-file -t 0dfe8f8522290263ae6f99b130e017d8c4bfad7f # commit
git rev-list --count 3805e72..refs/recovery/pr15-head     # 应为 27

# 3) 把当前工作区内容（fd89575 状态 + Phase 1A）落成一个诚实的新提交
#    —— 新 SHA，绝不使用 fd89575
git add -A
git commit -m "chore(recovery): rebuild v1 working tree after .git object loss

41 commits (069a7fd..fd89575) were never pushed and their objects were
lost in the 2026-09-19 .git incident. Their cumulative content is preserved
in this commit. History before 0dfe8f85 is restored from PR #15 head.

See RECOVERY_COMMIT_MAP.md and docs/GIT_RECOVERY_REPORT.md."

# 4) 把 main 指向恢复后的链（只改指针，不删历史）
#    —— 具体做法待你选择：
#    (a) 以 0dfe8f85 为父，把新提交接上去 → 线性历史最干净
#    (b) 保留 refs/recovery/pr15-head 作为证据分支，main 另起
```

**待你裁决的两个点**：
1. 是否执行第 1 步 fetch（写入 `.git`，只增不删）。
2. 第 4 步选 (a) 还是 (b)。

---

### 7. 事故教训（建议写入 `AGENTS.md`）

1. **未推送的工作必须在事故前先打 tag 或推到远端分支**。41 个提交全部只存在于本地松散对象，是本次损失放大的唯一原因。
2. `git checkout -b` 返回成功 ≠ ref 已落地。后续应在命令后立刻 `git rev-parse --verify HEAD` 复核。
3. 备份必须在**损坏之前**才有价值 —— 本次 `git-backup-20260919-damaged/` 是损坏之后做的，等于零证据。
4. 建议把仓库移到有卷影副本保护的卷，或配置定时 `git bundle` 导出（`git bundle create` 可生成单文件完整备份，成本极低）。


---

# 第四部分 · Ome Music 1.0 总指导手册（原件附录）

> **来源**：`OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`
> **本部分定位**：Phase 1R 中恢复入仓库的 1.0 产品与架构最高指导文档（原件，未作任何修改）。

## Ome Music 1.0 — 产品与架构重构总指导手册

> **文档定位**：Ome Music 1.0 的产品设计稿、架构蓝图、AI DJ 规范、工程重构路线与 Agent 执行手册  
> **版本**：Draft 1.0  
> **日期**：2026-09-10  
> **适用对象**：ChatGPT Desktop / Codex / MiMo Desktop / 其他代码 Agent  
> **文档优先级**：高于零散历史提示词。若历史实现与本文冲突，以本文的 1.0 目标为准。  
> **核心原则**：大重构，但不做失控的“大爆炸重写”；以可运行、可回滚、可验证的阶段性迁移完成 1.0。

---

### 0. 给 Agent 的唯一启动提示词

今后不需要再给 Agent 一长串重复上下文。只需要：

```text
请完整阅读仓库中的《OME_MUSIC_V1_AGENT_MASTER_GUIDE.md》，把它作为 Ome Music 1.0 的产品与工程最高指导文档。

先执行 Phase 0：冻结当前基线、审计现状、建立性能与架构基线，不要立即开始大规模改代码。
然后严格按照文档中的阶段顺序推进。每一阶段都必须保持项目可运行、可测试、可回滚，并给出代码证据、测试证据和人工验收清单。

QQ Music 在 1.0 当前阶段只保留稳定的 Provider 接口和实验性能力，不继续投入完整成品化；不得擅自覆盖原贡献者后续迭代方向。
```

---

## 第一部分：为什么要做 Ome Music 1.0

### 1.1 版本战略重新定义

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

### 1.2 为什么旧架构必须重构

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

## 第二部分：Ome Music 1.0 的产品定义

### 2.1 一句话定位

> **Ome Music 是一个由 AI 驱动、以音乐承载情绪与记忆的私人 DJ。**

它不是一个“有 AI 功能的播放器”。

它应该让用户感觉：

> **有一个懂我的 DJ，在替我组织今晚的音乐。**

### 2.2 产品的四个核心身份

#### A. 音乐播放器

它首先必须是一个稳定、轻快、安静的音乐播放器。

播放、切歌、队列、歌词、封面、音量、历史、来源切换必须可靠。

#### B. 私人 DJ

AI DJ 是产品灵魂，不是插件。

它负责：

- 开场；
- 歌与歌之间的衔接；
- 对下一首歌做简短而有气质的介绍；
- 根据时间、情绪、上下文调整音乐流；
- 在恰当时刻说话；
- 更重要的是知道什么时候不说话。

#### C. 情绪音乐空间

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

#### D. 轻记忆的音乐陪伴者

它会逐渐知道：

- 你常听什么；
- 你什么时候会听什么；
- 哪些歌会被你反复循环；
- 哪些歌和某些状态有关；
- 你明确告诉过它什么。

但它不建立沉重、令人不适的“用户画像系统”。

---

## 第三部分：产品设计原则

### 3.1 Music First

任何界面都先问：

> 这是否让用户更接近音乐？

如果答案是否定的，就应该隐藏、下沉或删除。

### 3.2 AI Inside, Not AI Everywhere

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

### 3.3 Quiet by Default

Idle 状态必须安静。

低频能力通过：

- Hover Reveal
- Contextual Action
- Drawer
- Command Palette
- Secondary Settings

出现。

不是所有能力都常驻在屏幕上。

### 3.4 Emotion Before Decoration

视觉不是为了“炫技”。

动画、模糊、渐变、歌词曲率、视频氛围都必须服务于：

> **情绪。**

如果一个视觉效果只会增加 GPU 占用，却没有增加音乐体验，应删掉。

### 3.5 Memory With Restraint

记忆只保存真正能改善音乐体验的信息。

不把每次点击都变成永久画像。

默认：

- 少；
- 可解释；
- 可查看；
- 可删除；
- 可关闭。

### 3.6 Reliability Is Part of Design

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

## 第四部分：视觉与交互设计稿

### 4.1 总体视觉定位

#### 关键词

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

### 4.2 视觉气质

建议基调：

- 暖黑 / 炭黑 / 深棕灰作为夜间底色；
- 奶油白 / 象牙白作为文字与明亮状态；
- 少量铜、酒红、暗金、森林绿等“唱片与电台”气质色作为动态 Accent；
- Accent 优先从当前封面提取，而不是固定彩色 UI；
- 降低大面积高饱和渐变；
- 模糊效果只用于氛围，不用于遮掩结构问题。

#### 字体关系

可以采用“编辑式”双字体气质：

- UI / 数字 / 控件：现代无衬线；
- DJ 标题、唱片信息、少量情绪文案：高质量衬线字体或具有编辑感的字体。

目的不是“复古字体堆砌”，而是建立一种：

> **广播杂志 / 唱片内页 / 深夜节目单**

的感觉。

### 4.3 1.0 主界面：Listening Room

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

#### 主界面只保留：

- 当前音乐；
- 封面；
- 歌词 / 氛围；
- 基础播放；
- 很轻的 DJ Presence；
- Queue 快速入口；
- 必要的音量/更多操作。

#### 不应该主界面常驻：

- Provider Diagnostics；
- Token；
- 大量来源状态；
- 全套 Settings；
- 技术名词；
- 一排 AI 功能按钮；
- 调试信息；
- 低频管理动作。

### 4.4 Lyrics Room

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

### 4.5 Queue

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

### 4.6 Settings

重新收束成四个顶层组：

```text
Listening
Sources
DJ & Memory
System
```

#### Listening
- Playback
- Lyrics
- Atmosphere
- Crossfade / Transition

#### Sources
- Local
- NetEase
- Bilibili
- QQ Music (Experimental / Interface Ready)

#### DJ & Memory
- DJ Voice
- Talk Frequency
- Memory
- Privacy
- Conversation

#### System
- Appearance
- Storage
- Diagnostics
- About

不要再让 Quick Start / Guide / Onboarding / Full Settings 重复表达同一件事。

---

## 第五部分：私人 DJ — 产品灵魂设计

### 5.1 DJ 的身份

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

### 5.2 语气

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

### 5.3 英伦气质的边界

目标是“英伦复古电台感”，不是模仿任何真实主持人。

语音可以体现：

- soft British / RP 倾向；
- 低而温暖；
- 语速偏慢；
- 句尾收得干净；
- 像深夜广播，而不是广告配音。

### 5.4 DJ 什么时候说话

默认只在四类时刻说话：

#### 1. Session 开场

用户第一次进入并开始播放时。

时长：

`5–12s`

内容：

- 现在的时间/氛围；
- 一句非常轻的欢迎；
- 为什么从这一首开始。

#### 2. 歌曲之间

核心场景。

建议：

`6–14s`

不要每一首都说。

默认频率可以动态调整，例如：

- 连续安静听歌：每 3–5 首说一次；
- 用户主动进入 DJ Mode：每 1–2 首；
- 用户关闭 DJ：完全不说。

#### 3. 用户主动问它

此时进入 Conversation。

#### 4. 特别时刻

例如：

- 用户连续循环一首歌；
- 很久没听过的一首旧歌重新出现；
- 一个长期偏好的艺术家出现；
- 用户明确标记的“有记忆的歌”。

### 5.5 DJ Transition Engine

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

### 5.6 DJ 输出必须结构化

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

## 第六部分：轻记忆系统

### 6.1 记什么

只保存能改变音乐体验的信息：

#### Taste Memory
- 常听 artist / genre；
- like / skip 的长期趋势；
- 常见音量、播放时间；
- 熟悉度偏好。

#### Context Memory
- 夜间偏好；
- 学习 / 放松 / 通勤等明确场景；
- 用户主动告诉 DJ 的偏好。

#### Emotional Association
只在用户明确表达或行为证据很强时记录：

- “这首歌让我想起高中”
- “失眠时会听”
- “这是我最喜欢的歌之一”

不要从一次播放就推断复杂人生状态。

### 6.2 不记什么

默认不建立：

- 详细心理画像；
- 私密聊天全文永久存储；
- 隐式敏感属性；
- 每一次点击的永久日志；
- 用户没有必要知道的神秘分数。

### 6.3 记忆必须可解释

DJ 使用记忆时，理由应能被理解。

例如：

> “You often come back to this one late at night.”

而不是：

> “Your emotional score is 0.82.”

---

## 第七部分：Ome Music 1.0 目标架构

### 7.1 架构原则

使用：

> **Modular Monolith + Domain Boundaries + Event-Driven Application Layer**

不要为了“现代化”直接拆微服务。

这是桌面播放器，微服务只会增加复杂度。

### 7.2 前端目标结构

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

#### 核心目的

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

### 7.3 状态管理

1.0 建议区分三类状态。

#### A. Playback Realtime State

使用专用 external store / state machine。

特点：

- 高频；
- 不应让整棵 React Tree 重渲染；
- position update 与 UI display 解耦。

#### B. Application State

例如：

- active overlay；
- UI mode；
- active source；
- settings；
- DJ mode。

可使用轻量集中 Store。

#### C. Async Resource State

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

### 7.4 Playback Engine

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

### 7.5 Event Bus

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

## 第八部分：Rust / Tauri 后端目标架构

### 8.1 Rust 模块结构

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

### 8.2 Source Adapter

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

### 8.3 QQ Music 在 1.0 当前阶段的定位

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

### 8.4 Auth 统一模型

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

## 第九部分：性能与“异常占用”专项重构

### 9.1 必须先测，再优化

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

### 9.2 性能预算

#### Idle
- 不应持续高 CPU；
- 没有不必要轮询；
- 隐藏窗口时动画暂停。

#### Playback
- Progress 不驱动整个 App Tree；
- UI tick 可降低到视觉需要的频率；
- audio timeupdate 与 animated progress 分离。

#### Lyrics
- window rendering；
- active line 附近少量 DOM；
- inactive animation 降级。

#### Queue
- 虚拟化 / windowing；
- 1000 项仍流畅。

#### Artwork
- bounded memory cache；
- request dedupe；
- decode 不阻塞主线程；
- 不持久化瞬态 proxy URL。

#### Atmosphere
- Video hidden 时 pause；
- blur/backdrop-filter 数量受限；
- Reduced Motion 支持；
- GPU heavy effect 有自动降级。

---

## 第十部分：设计系统

### 10.1 建立真正 Design Tokens

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

### 10.2 组件原则

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

## 第十一部分：AI DJ 技术架构

### 11.1 DJ 不直接依赖 UI

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

### 11.2 AI Failure 必须可降级

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

## 第十二部分：1.0 重构迁移策略

### 12.1 禁止真正的 Big Bang Rewrite

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

### 12.2 分支建议

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

## 第十三部分：Agent 执行路线

### Phase 0 — Freeze & Baseline

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

### Phase 1 — Foundation

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

### Phase 2 — Playback Core Migration

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

### Phase 3 — Source Architecture

把来源逻辑真正收束到 Adapter。

目标：

- App 不再 source-specific；
- QQ 保留 Experimental interface；
- Bilibili video/danmaku 通过 capability；
- NetEase auth 通过统一 Session Provider；
- Artwork 统一 pipeline。

### Phase 4 — UI 1.0 Rebuild

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

### Phase 5 — DJ Core

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

### Phase 6 — Memory & Conversation

实现：

- Taste Memory；
- explicit memory；
- session context；
- DJ conversation；
- privacy controls；
- delete/reset memory。

保持轻量。

### Phase 7 — Performance & Hardening

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

### Phase 8 — 1.0 Release

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

## 第十四部分：Agent 工作纪律

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

## 第十五部分：1.0 必须保留的历史成果

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

## 第十六部分：1.0 应删除或降级的东西

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

## 第十七部分：1.0 产品成功标准

正式版不是“能启动”。

必须达到：

### Product

- 第一次打开就知道这是一个音乐产品，而不是 AI 工具；
- 主界面安静且高级；
- DJ 有清晰人格；
- 音乐之间有自然衔接；
- AI 存在感来自“理解”，不是按钮；
- Memory 有温度但不冒犯。

### Engineering

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

### Performance

- Idle 不异常占用；
- 30 分钟播放无明显增长；
- 长 Queue 流畅；
- 歌词无明显掉帧；
- Video Atmosphere 可降级；
- Background/hidden 状态主动降载。

### Reliability

- A→B→A；
- restart restore；
- offline；
- source unavailable；
- login expired；
- media URL expired；
- artwork failure；

都必须有正确 fallback。

---

## 第十八部分：最后的产品宣言

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

## 附录 A：每阶段报告模板

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

## 附录 B：优先级规则

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

## 附录 C：QQ Music 1.0 暂行策略

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

## 附录 D：一句话检验所有设计决策

每当团队/Agent 不知道该不该加一个功能、按钮、动画、状态或抽象时，问：

> **它是否让 Ome Music 更像一个懂我、安静、有品位的私人 DJ？**

如果不是，就应该谨慎。

