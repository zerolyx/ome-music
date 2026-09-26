# Ome Music — Project Intelligence

> L0 导航摘要。深入背景见 docs/superpowers/specs/（设计）与 docs/superpowers/plans/（实施计划）。

## Goal

AI 时代的私人电台：本地音乐 + 网易云 + Bilibili，DJ 有记忆、有情绪、有声音。
轻量（安装包 ~10MB 级）、双主题、开机即播。

## Current Status

v0.7.0 已发布（UI 逐页对照重做 + 迷你播放器 + 歌词候选弹窗）。全量交接见
docs/PROJECT-HANDOVER.md（背景/架构/机制/踩坑/路线图）。待办：桌面歌词独立
窗口（远期，见 handover 第七节）。


## Product Boundary

Ome Music is a small AI-powered personal radio: “press play without choosing a song.” Its four product domains are local music and lyrics, NetEase, subordinate Bilibili atmosphere, and the memory/personality/voice of the AI DJ. The core path is open the app, listen, and talk to the DJ.

Folia and ECHO are references for selected interactions and narrowly scoped capabilities, not feature-parity targets. Preserve local-first behavior, music-first navigation, the approximately 10 MB package-size target, and the three frontend runtime dependencies. Do not expand the product into a DSP workstation, remote-library platform, plugin host, cloud-sync service, or bulk media-management suite. Existing optional utilities remain documented and maintained; their presence does not authorize continued scope expansion. Reopen an excluded area only through a product decision that explains direct user value, size, privacy, permissions, complexity, and rollback.

## Tech Stack

- 前端：Preact + @preact/signals + @tauri-apps/api + 手写 CSS（双主题 tokens）
- 后端：Tauri 2 模块化 Rust（db/library/media/netease/bilibili/dj）
- 数据：SQLite（rusqlite bundled），迁移 001-004
- 语音：WebView2 speechSynthesis 兜底 + Edge 神经语音 + OpenAI 兼容 TTS 端点

## Important Paths

src/（前端）· src-tauri/src/（Rust 模块）· src-tauri/migrations/ ·
docs/superpowers/specs/（设计 spec）· docs/superpowers/plans/（实施计划）·
PersonalConfig/（凭据，禁读禁印）

## Run / Test

dev：`npm run tauri dev` · 测试：`npm run test` + `cargo test`（src-tauri）·
门禁：tsc / eslint / clippy -D warnings

## Rules

- 保持轻量：前端运行时依赖仅 preact/@preact/signals/@tauri-apps/api
- DJ 人格：港台腔男播客、慵懒松弛、中文为主偶夹英文（见 dj.rs PERSONA_PROMPT）
- Bilibili subordinate：默认关、淡而弱
- PersonalConfig/ 禁读禁印
