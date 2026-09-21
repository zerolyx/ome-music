# Ome Music — Project Intelligence 摘要

> 本文件是 L0 导航摘要；权威信息见文档地图。与代码冲突时以代码为准并标记 STALE。

## Goal

轻量 Windows 音乐播放器：本地音乐 + NetEase/QQ/Bilibili 源，"打开就听"（详见 README.md / PRODUCT.md）。

## Current Status

Development。package.json 与 src-tauri/tauri.conf.json 版本均为 0.3.8（lockstep 一致）。
STALE 冲突待确认：docs/FINAL_REPORT_v0.4.0.md 与 docs/QA_CHECKLIST_v0.4.0.md 存在，但版本号未到 0.4.0。

## Tech Stack

- 前端：React + TypeScript + Vite + Tailwind（src/）
- 桌面壳：Tauri（src-tauri/，Rust：lib.rs / main.rs / qqmusic.rs）
- 测试与门禁：Vitest + scripts/regression-check.mjs；eslint / tsc / clippy -D warnings / docs-check / size-audit

## 音乐源

本地文件 · NetEase（账号 session）· QQ 音乐（QR / Cookie / 官方 WebView2 登录，近期主线）· Bilibili 氛围/弹幕

## Important Paths

src/（features, components, musicUnderstanding）· src-tauri/src/ · scripts/ · docs/ · PersonalConfig/（凭据与 session，禁读禁印）

## Run / Build / Test（package.json scripts）

dev · build · build:tauri（含 prepare:netease-runtime）· test（regression+unit）· lint · format · size:audit · docs:check

## 文档地图

AGENTS.md=开发规则（复用，勿重复）· README(.zh-CN)=用户文档 · PRODUCT.md=产品定义 · BUILD/CONFIGURATION/MAINTENANCE/TROUBLESHOOTING · CHANGELOG · docs/TODO-app-refactor.md=TODO 源 · docs/size-budget.md · AUDIT_FINDINGS / PRODUCT_REMEDIATION_PLAN / REMEDIATION_EXECUTION_REPORT（质量线） · LICENSE_DECISION.md（许可 ADR）

## Current Focus

QQ 音乐登录链路：QR 连续性、Cookie 回填、官方 WebView2 主路径（近期提交集中于此）。

## NOT NEEDED

- 根级 TODO.md：docs/TODO-app-refactor.md 已是 TODO 源。
-额外交档：以 PROJECT.md 文档地图 + ARCHITECTURE.md 为唯一导航，不再增生。

## Deployment

GitHub Releases 安装包分发（x64 setup，见 README / BUILD.md）；NetEase API 运行时可容器化（仓库根 Dockerfile.api）。暂无自管服务器部署；未来服务器档案按 server-ops 技能的 servers/name.md 标准建立（敏感信息只留 ssh config/凭据层）。
