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

新决策一律使用 ADR 格式（Context / Decision / Why / Alternatives / Consequences）追加到本文件。
