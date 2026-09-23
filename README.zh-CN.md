# Ome Music

[English](./README.md) | 中文

**AI 时代的私人电台。** 打开应用，DJ 用声音向你问好，接着上次的歌继续播，之后的每一首都由它推荐——每首歌前有电台式的介绍，想聊天随时打开对话抽屉。

## 功能

- **本地音乐** — 导入文件夹、封面、歌词。
- **网易云** — 扫码登录、搜索、完整时长播放（登录后含 VIP 歌曲）、逐字歌词。
- **Bilibili** — 视频搜索、内置 Referer 代理播放、可选的淡彩弹幕氛围。
- **AI DJ** — 温暖慵懒的深夜电台主播，带本地记忆（对话、口味、时段习惯）。兼容任何 OpenAI 接口的语言模型（如 DeepSeek）；语音使用 Edge 神经声线，也可接入自建/云端的克隆音色。
- **双主题跟随系统**、自动隐没的界面 chrome、可折叠设置。

## 开发运行

```bash
npm install
npm run tauri dev     # 桌面应用
npm run build         # 前端构建
cargo test            # Rust 测试（src-tauri 内）
```

环境要求：Node 20+、Rust stable、Windows 10/11（WebView2）。

## 隐私

所有个人数据都留在本地：曲库、播放记录、DJ 记忆与对话都在本地 SQLite。
只有你自己配置了语言模型 / TTS 服务时才会产生外呼。无账号、无遥测。详见 `SECURITY.md`。

## 许可

MIT — 见 `LICENSE`。
