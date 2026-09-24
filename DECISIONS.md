# Ome Music — 决策索引（轻量 ADR）

既有专门决策文档：LICENSE_DECISION.md（许可选择）。

近期重大决策（以 git 提交为准）：

## DEC-001 — QQ 音乐登录以官方 WebView2 为主路径
Date: 2026-09（提交 871e967 / 0dfe8f8） · Status: Accepted
Context: QR/Cookie 登录连续性问题频出。
Decision: 官方 WebView 登录为主、自动收尾；QR/Cookie 保留为备选。
Consequences: 依赖 WebView2 运行时；登录稳定性优先。

## DEC-002 — NetEase 明文 session 镜像记为 P1 安全事项
Date: 2026-09（提交 8d88408） · Status: Documented
Context: 安全审计发现明文 session 镜像。
Decision: 按 P1 记录并跟踪（详见 SECURITY 相关 docs）。
Consequences: 后续版本需给出收敛方案。

## DEC-003 — v0.4.0 起用新数据库文件名 ome-music.db，旧库刻意不迁移
Date: 2026-09（final review 修复波） · Status: Accepted
Context: Plan 1 重建采用全新 schema，与旧版元数据库 ome_music.sqlite3 不兼容。
Decision: v0.4.0 统一使用新文件名 ome-music.db；旧 ome_music.sqlite3 刻意不做迁移（fresh start），文件保持原样不动，迁移运行器按“仅全新库”设计。
Consequences: 磁盘上的音乐文件不受影响；旧元数据库留在原处但不再读取。

## DEC-004 — Cargo 中保留 reqwest / tokio / urlencoding 依赖
Date: 2026-09（final review 修复波） · Status: Accepted
Context: 依赖审计可能将这三个 crate 误判为未使用的死重。
Decision: 保留在 Cargo 依赖中，供 Plan 2（NetEase 计划）与媒体协议使用。
Consequences: 当前编译体积略增；避免 Plan 2 重复引入与版本摇摆。

## DEC-005 — 桌面歌词用同 bundle 第二窗口 + 事件快照同步
Date: 2026-09（v0.7.0 后，T5c 立项） · Status: Accepted
Context: 路线图 #1 桌面歌词需要跨窗歌词同步；preact signals 各窗 JS 上下文独立，无法直接共享。
Decision: 第二窗口 `label=desklyrics` 复用同一前端 bundle，main.tsx 按 label 分流渲染；主窗 250ms `emitTo` 一帧歌词快照（行/字级/翻译/position+sentAt），歌词窗本地 rAF 插值出连续进度；窗口 focus:false 不抢焦点，开关/位置/字号持久化。备选方案：独立小 bundle（构建与双份维护成本高）、共享 WebView（Tauri 2 无此能力）、逐帧 IPC（流量大）。详见 handover 4.7。
Consequences: capabilities 需始终包含 desklyrics；新增窗口必须处理 index.html 的 `.booting` 遮蔽；歌词窗 UI 叠加系统桌面，固定深色玻璃样式不随主题。

新决策一律使用 ADR 格式（Context / Decision / Why / Alternatives / Consequences）追加到本文件。
