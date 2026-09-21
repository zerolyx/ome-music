# PHASE1R_RECOVERY_REPORT.md

> 日期：2026-09-19
> **范围**：仓库恢复（Phase 1R）· 不重跑 Phase 0 / 1A · **不进入 Phase 2**
> **第一原则**：先保存证据，不重建。全程未执行 `checkout` / `reset` / `clean` / `gc` / `prune` / `repack` / `force-push` / `rebase`
> **最终判定：Tier B（部分恢复）**

---

## 0. 结论先行

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

## 1. Phase 2 — Git 取证结果

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

## 2. Phase 3 — 提交映射

已产出 **`RECOVERY_COMMIT_MAP.md`**，逐条标注 27 + 41 个提交的存在状态与来源。

| 区段 | 范围 | 数量 | 状态 |
|---|---|---|---|
| 已推送 | → `3805e72` | 59（pack 内） | ✅ 完好 |
| **Segment A** | `3805e72 → 0dfe8f85` | **27** | ✅ 可从 fork 无损取回（真实 SHA） |
| **Segment B** | `069a7fd → fd89575` | **41** | ❌ 对象丢失；内容保留在工作区 |

---

## 3. Phase 4 — 档位判定

### **Tier B**

- **A 不成立**：41 个提交对象不存在，伪造 SHA 被明确禁止。
- **B 成立**：Segment A 可取回真实对象；Segment B 内容完整（141 条索引中 80 条逐字节一致、53 条仅 CRLF、**仅 8 条真实改动且恰好等于 Phase 1A 的改动清单**）。
- **C 不需要**：内容未丢失。

**Tier B 执行方案已写在 `docs/GIT_RECOVERY_REPORT.md` §6，只增不删；但会写入 `.git`，因此等你确认后再动手。**

---

## 4. Phase 5 — Master Guide 恢复 ✅

| 项 | 内容 |
|---|---|
| 原件位置 | `D:\Download\OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`（30,886 字节，2026-09-10） |
| 仓库内 | **原本不存在** → K2 属实 |
| 动作 | 已复制到仓库根目录 `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md` |
| gitignore 影响 | 无（`.gitignore` 只忽略 `/*usage*.md` `/*config*.md` 等模式，不匹配） |

**K2 解除。**

---

## 5. Phase 6 — Phase 1A 代码复验（只记录，不改代码）

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

## 6. Phase 7 — K4 Prettier 诊断（单独处理）

### 现象

`npm run format:check` 报 4 个文件违规：`NowPlayingHero.tsx`、`ProviderSettingsPanel.tsx`、`qqMusicAuthPresentation.ts`、`qqMusicAuthPresentation.test.ts`

### 逐项排除（**含一次自我证伪**）

| 假设 | 验证方式 | 结果 |
|---|---|---|
| ① CRLF 换行符导致 | 把文件转 LF 后再跑 `--check` | ❌ **证伪**：转 LF 后仍然失败；且 `qqMusicAuthPresentation.ts/.test.ts` 本来就是纯 LF（0 个 CRLF）也失败 |
| ② Prettier 版本漂移 | 声明 `^3.4.2`、实际装 3.9.0；用 `npx prettier@3.4.2 --check` 复验 | ❌ **证伪**：3.4.2 同样报这 4 个文件 |
| ③ 配置漂移 | `.prettierrc`（`endOfLine: lf` 等 8 项） | ❌ 无变更记录，且 ① 已排除换行因素 |
| ④ **从未被格式化过** | 上述三项排除后剩下的唯一解释 | ✅ **成立** |

### 真实根因

**这 4 个文件从来没有被 Prettier 格式化过。** 它们所属的那 41 个提交从未推送、从未进 CI，`format:check` 这一步在它们身上从未运行过。差异内容是实打实的排版问题（三元表达式断行、函数签名换行、`import type` 折叠等），不是环境问题。

### 建议

- **单独开一个「格式归一化」提交**，不要混进 Git 恢复提交（否则恢复提交的 diff 会被几千行格式噪声淹没，失去可审查性）。
- 该提交只做 `npm run format`，不改任何逻辑；提交后再跑一遍全量门禁确认零行为变化。
- 顺带建议：把 `format:check` 加进本地 pre-commit，避免同类问题再次只在 CI 才暴露。

---

## 7. Phase 8 — Phase 1A 退出标准复核（11 条）

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

## 8. 本轮做了什么 / 没做什么

### 做了（只增不删）

| 动作 | 位置 |
|---|---|
| 只读安全副本 | `D:\Download\ome-recovery-snapshot-20260919-1245\`（516 MB） |
| 提交映射文档 | `RECOVERY_COMMIT_MAP.md`（新增） |
| Git 取证报告 | `docs/GIT_RECOVERY_REPORT.md`（新增） |
| 本报告 | `PHASE1R_RECOVERY_REPORT.md`（新增） |
| Master Guide 恢复 | `OME_MUSIC_V1_AGENT_MASTER_GUIDE.md`（新增，K2 解除） |
| 索引一致性校验产物 | `D:\Download\ome-index-verify.txt`、`ome-index-verify-lf.txt` |
| K4 验证产物 | `D:\Download\k4_test.py`、`k4_diff.py`、`k4-lftest\`、`k4-diff\` |

### 没做

- ❌ 未执行任何 git 写操作（fetch / commit / checkout / reset / gc 全都没跑）
- ❌ 未改动 Phase 1A 的任何代码
- ❌ 未修 K4（刻意留作单独提交）
- ❌ 未进入 Phase 2

---

## 9. 建议的下一步顺序

| 序 | 动作 | 阻塞关系 |
|---|---|---|
| ① | **你确认 Tier B 执行方案**（fetch fork + 重建一个新提交） | 需要你点头，因为会写 `.git` |
| ② | 单独提交「格式归一化」（K4） | 必须在 ① 之后，否则 diff 不可审 |
| ③ | 你人工验证 P1-7 / P1-8（真实 Tauri 环境） | 独立于 ①②，可并行 |
| ④ | 确认 11 条退出标准中的 ⚠️ 项清零 | 依赖 ①②③ |
| ⑤ | 才开 Phase 2（Playback Core Migration） | 依赖 ④ |

---

## 10. 诚实标注的遗留

1. **41 个提交的历史永久丢失**，无法恢复为原 SHA。能做的只有把内容诚实重建为一个新提交，并在文档中留痕。
2. **"41"这个数字在 `PHASE1A_REPORT.md` 里口径不一致**（一处以 `origin/main` 为基准、一处以 `0dfe8f8` 为基准）。本报告采用"以 `0dfe8f85` 为基准 = 41 个"；若以 `3805e72` 为基准则总数为 68 个。
3. `796894d`（ORIG_HEAD）的身份未确定 —— 不知道它是哪个提交的旧值。
4. **Rust 门禁本轮未重跑**（为保持"只读取证"的纯粹性）。Phase 1A 时已验证通过，本轮无代码改动，风险极低，但严格说属于"未复验"。
5. `.git/index` 的 141 条中，53 条是 CRLF 差异 —— 这本身不是问题（`core.autocrlf=true` 的正常表现），但它意味着**恢复后如果不加 `.gitattributes`，其他人克隆仍会踩到 K4 这类换行相关坑**。建议后续补一个 `.gitattributes`。
