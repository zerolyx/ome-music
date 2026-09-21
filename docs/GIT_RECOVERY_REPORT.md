# GIT_RECOVERY_REPORT.md

> 生成时间：2026-09-19 · Phase 1R
> 关联文档：`RECOVERY_COMMIT_MAP.md`（提交级映射）、`docs/PHASE1A_REPORT.md` §0 K1（事故首发记录）
> **最终判定：Tier B（部分恢复）**

---

## 1. 事故定性

| 项 | 事实 |
|---|---|
| 触发动作 | `git checkout -b refactor/v1-foundation`（命令返回成功，但 ref 未落地），随后 `git checkout main` 被 SIGTERM 中断 |
| 直接后果 | `.git/refs/` 与 `.git/logs/` 目录内容被清空；`.git/objects/` 下 30 个松散目录只剩 8 个对象 |
| 幸存 | pack（855 对象，2026-07-11 克隆时生成）、`.git/index`（141 条，完好）、`.git/packed-refs`、`COMMIT_EDITMSG`、`ORIG_HEAD`、`FETCH_HEAD` |
| 工作区 | **完好**（已逐文件校验，见 §4） |
| 未执行 | 全程未执行 `checkout` / `reset` / `clean` / `gc` / `prune` / `repack` / `force-push` / `rebase` |

---

## 2. 取证过程（全部只读）

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

### 安全副本

`D:\Download\ome-recovery-snapshot-20260919-1245\`（516 MB）——完整工作树只读副本，排除 `src-tauri/target`（9.5 GB）与 `node-v22.17.1-win-x64.zip`（34 MB）。制作期间未对原仓库做任何写操作。

---

## 3. 关键证据摘录

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

## 4. 内容层完整性（本次取证最重要的正面结论）

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

## 5. 三档判定

| 档位 | 判定 | 依据 |
|---|---|---|
| **A — 完整恢复（原始 SHA 全在）** | ❌ **不成立** | 41 个提交对象已不存在；幸存的两个 commit 只是空壳。严禁伪造 SHA。 |
| **B — 部分恢复** | ✅ **成立** | ① `3805e72 → 0dfe8f85` 共 27 个提交可从 fork / PR #15 取回**真实对象与真实 SHA**；② 丢失的 41 个提交其**内容完整保留在工作区**，可诚实重建为一个新提交。 |
| **C — 不可恢复** | ❌ 不需要 | 内容未丢失，无需降级。 |

### **最终判定：Tier B**

---

## 6. Tier B 恢复方案（待你确认后执行）

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

## 7. 事故教训（建议写入 `AGENTS.md`）

1. **未推送的工作必须在事故前先打 tag 或推到远端分支**。41 个提交全部只存在于本地松散对象，是本次损失放大的唯一原因。
2. `git checkout -b` 返回成功 ≠ ref 已落地。后续应在命令后立刻 `git rev-parse --verify HEAD` 复核。
3. 备份必须在**损坏之前**才有价值 —— 本次 `git-backup-20260919-damaged/` 是损坏之后做的，等于零证据。
4. 建议把仓库移到有卷影副本保护的卷，或配置定时 `git bundle` 导出（`git bundle create` 可生成单文件完整备份，成本极低）。
