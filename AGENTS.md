# Ome Music — Workspace Conventions

## 文档地图

- `PROJECT.md` — L0 摘要（目标/状态/栈/路径）
- `DECISIONS.md` — 架构决策记录（ADR）
- `docs/superpowers/specs/` — 设计 spec（权威）
- `docs/superpowers/plans/` — 实施计划
- `SECURITY.md` — 安全策略与已知风险
- `README.md` / `README.zh-CN.md` — 用户文档

## 开发规则

- 前端运行时依赖仅 `preact` / `@preact/signals` / `@tauri-apps/api`，禁止新增。
- UI 文案简体中文；代码标识符英文。
- 版本号 `package.json` 与 `src-tauri/tauri.conf.json` lockstep。
- 提交信息 Conventional Commits；每个任务收尾测试必须绿。
- `PersonalConfig/` 禁读禁印禁提交。
- 动效统一使用 `--ease-signature`；尊重 prefers-reduced-motion。

## 调试技能

`.agents/skills/` 内有项目专用技能（netease-music-debug / tauri-app-debug /
music-player-ui-polish / product-requirements-keeper / dj-agent-tooling）。
