# Ome Music

[English](./README.md) | 中文

一个小而美、沉浸式、支持网易云音乐、Bilibili 音乐源、视频氛围、全局弹幕、歌词和私人音乐鉴赏家的桌面音乐播放器。

Ome Music 以本地优先为核心：启动轻快，个人数据默认保存在本机，复杂配置尽量隐藏在安静、专注音乐的体验之后。

## 功能亮点

- 沉浸式桌面音乐播放器
- 本地音乐导入与播放
- 网易云音乐源
- Bilibili 音乐源
- Bilibili 视频氛围层
- 全局情绪弹幕氛围层
- 歌词显示与时间偏移调整
- 轻量设置系统
- Private DJ / Music Curator 体验
- SQLite 本地曲库与聆听历史
- 基于 Tauri 的轻量桌面应用

## 截图

![Ome Music 主界面截图](docs/assets/screenshot-main.png)

![Ome Music 设置截图](docs/assets/screenshot-settings.png)

请只提交适合公开展示的截图。不要提交包含 API Key、Cookie、账号名、私人歌单、日志、本地路径或个人听歌记录的图片。

## 安装方式

可以从 [GitHub Releases 页面](https://github.com/zerolyx/ome-music/releases) 下载最新 Windows 版本。

推荐文件：

- `Ome Music_0.1.0_x64-setup.exe`：Windows NSIS 安装包

当前版本是未签名的开发发布版，Windows 首次运行时可能会出现安全提示。

## 从源码运行

### 环境要求

- Windows 10/11
- Node.js
- Rust stable toolchain
- 通过 `@tauri-apps/cli` 使用 Tauri CLI
- Microsoft Edge WebView2 Runtime

### 安装依赖

```bash
npm install
```

### 开发模式运行桌面应用

```bash
npm run desktop
```

等价的 Tauri 命令：

```bash
npm run tauri dev
```

### 构建前端

```bash
npm run build
```

### 构建 Windows 发布版

```bash
npm run release:windows
```

等价的 Tauri 命令：

```bash
npm run tauri build
```

Tauri 会使用 `dist` 中的前端产物打包应用，发布版本不需要开发服务器。

## 配置说明

Ome Music 不内置任何 API Key、Cookie、密码或 Token。

请在应用设置中自行配置：

- 网易云音乐：API Base URL、登录状态、可选 Cookie 导入
- Bilibili：公开搜索、可选登录状态 / Cookie，用于访问账号可见内容
- Curator / API Provider：兼容 OpenAI 格式的 Provider Name、Base URL、API Key 和 Model
- 语音：可选的语音转文字和文字转语音 Provider

详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。

## 安全与隐私

- 不要提交 API Key。
- 不要提交 Cookie 或登录状态。
- 不要提交本地数据库。
- 不要提交缓存、日志、截图或发布二进制文件。
- 本地音乐文件只保存路径引用，不会上传。
- 登录状态和凭据应只保存在用户本机。

详见 [docs/PRIVACY.md](docs/PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 免责声明

本项目仅用于个人学习和本地音乐体验。

Ome Music 不提供、托管、存储、分发或绕过访问任何受版权保护的音乐内容。网易云音乐、Bilibili 以及其他第三方内容的版权归对应平台和权利人所有。用户应自行遵守相关法律法规和平台服务条款。

## 文档

- [配置说明](docs/CONFIGURATION.md)
- [构建说明](docs/BUILD.md)
- [隐私说明](docs/PRIVACY.md)
- [排障指南](docs/TROUBLESHOOTING.md)
- [贡献指南](CONTRIBUTING.md)
- [安全政策](SECURITY.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## 开源许可

Ome Music 使用 MIT License 开源。详见 [LICENSE](LICENSE)。
