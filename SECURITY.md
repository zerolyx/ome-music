# Security Policy

## Supported Versions

Ome Music is currently pre-release. Security fixes are handled on the main development line.

## Reporting a Vulnerability

Please do not publish API keys, cookies, tokens, passwords, private account data, or exploit details in a public issue.

Report privately to the maintainer first. Include:

- A short description of the issue
- Affected version or commit
- Steps to reproduce without exposing secrets
- Suggested mitigation, if known

## Secret Handling Rules

- Do not commit `.env` files.
- Do not commit SQLite databases.
- Do not commit cookies, tokens, or API keys.
- Do not commit `PersonalConfig/` (contains user credentials).
- Do not commit logs or diagnostics that include request headers.
- Do not commit screenshots showing account state or personal playlists.

## Data at Rest (v0.4.x)

以下敏感数据以明文存放在本机用户目录，属可接受的桌面应用形态：

- `app_data_dir()/netease-cookie.txt` — 网易云登录 Cookie（含 MUSIC_U）。登出即删除。
- SQLite `app_config` 表 — DJ 语言模型 API Key。界面只展示掩码。
- 音乐文件本身不入库，仅存路径。

## Media Proxy (ome-media)

`http://ome-media.localhost` 仅本机 WebView 可达：

- `/local?p=` — 读取本地文件（路径来自用户自己的曲库）。
- `/remote?p=&r=` — 远程流代理，仅允许 https 且主机在白名单内
  （bilivideo.com / bilivideo.cn / akamaized.net / hdslb.com），其余返回 403。

## Known Risks (accepted)

- LLM 对话上下文包含曲目名/艺人名（来自文件标签），理论上存在提示注入面；
  动作白名单双重过滤（Rust + 前端），无 shell/文件系统执行面，出站仅限用户配置的
  LLM 端点与搜索关键词。
- Bilibili 匿名播放受平台限制（部分内容需 B 站登录，v1 未接入 B 站登录）。
- 旧版 v0.3.x 的内嵌 Node 运行时及其依赖链风险（music-metadata/express/qs）
  随 v0.4.0 移除 sidecar 而整体消失。
