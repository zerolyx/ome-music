# RECOVERY_COMMIT_MAP.md

> 生成时间：2026-09-19（Phase 1R）
> 用途：记录 `.git` 受损事故的**提交级取证结果**，逐条标注每个已知 SHA 的存在状态与恢复来源。
> 原则：**只记录证据，不伪造 SHA**。凡标注 `LOST` 的提交，均不得以任何方式"重建"为原 SHA。

---

## 0. 事故范围一句话

`refs/heads/main` = `fd89575` 的**最近 41 个提交**（`069a7fd` → `fd89575`）从未推送到 `origin`，其对象在本次事故中全部丢失；
更早的 **27 个提交**（`3805e72` → `0dfe8f85`）虽也未推送到 `origin/main`，但**完好存在于 fork `chinokoyuki/ome-music` 与 PR #15**，可无损取回。

---

## 1. 状态图例

| 标记 | 含义 |
|---|---|
| ✅ `PACK` | 对象在本地 pack 中（可立即读取） |
| ✅ `REMOTE` | 对象不在本地，但可从远端 fork / PR 取回（真实对象、真实 SHA） |
| ⚠️ `SHELL` | 仅 commit 对象幸存，**tree / blob 全部丢失**，无法 checkout，只有元数据价值 |
| ❌ `LOST` | 对象完全不存在，任何来源均不可得 |

---

## 2. 已推送历史（本地 pack，完好）

| SHA | 日期 | 说明 | 状态 |
|---|---|---|---|
| `3805e72c3380c03a52bccc5a0fb7bba48ce1f75b` | 2026-07-02 | `fix: make NetEase runtime hash check portable` · `origin/main` · tag `v0.3.8` | ✅ `PACK` |
| （更早 58 个 commit） | 2026-06-27 → 07-02 | 完整 v0.1.0 → v0.3.8 历史 | ✅ `PACK`（pack 内共 59 commit / 342 tree / 450 blob / 4 tag，`verify-pack` exit 0） |

**pack 校验**：`pack-d10c36e03ba95ac490dc672bd80455950e4dcbca`（2.5 MB，2026-07-11 克隆时生成），`git verify-pack -v` 无错误、无损坏对象。

---

## 3. Segment A — 可从远端无损取回（27 个提交）

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

## 4. Segment B — 完全丢失（41 个提交，不可恢复为原 SHA）

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

## 5. 内容层（非历史层）完整性 —— 关键结论

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

## 6. 取证覆盖情况（逐项）

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

## 7. 恢复判定

**→ Tier B（部分恢复）**

- ❌ **非 Tier A**：41 个提交对象已不存在，且严禁伪造 SHA，无法恢复完整原始历史。
- ✅ **Tier B 成立**：
  - Segment A（27 提交）→ 可从 fork 取回**真实对象、真实 SHA**。
  - Segment B（41 提交）→ 历史不可恢复，但**内容完整存在于工作区**（已逐文件校验），可重建为**一个新提交**，并在提交信息与 `GIT_RECOVERY_REPORT.md` 中如实记载。
- ❌ **非 Tier C**：内容未丢失，无需降级到"仅保留当前快照、放弃历史"的最坏方案。
