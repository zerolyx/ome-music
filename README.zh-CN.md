# Ome Music

[English](./README.md) | 中文

Ome Music 是一个轻量、沉浸式的 Windows 桌面音乐播放器。项目基于 Tauri、React、TypeScript、Tailwind CSS、Rust 和 SQLite 构建。

它的产品方向很明确：音乐优先。封面、歌词、氛围和播放控制应该成为视觉中心；音乐源、登录、缓存和技术配置都尽量隐藏在体验之后。

## 亮点

- 本地音乐导入与播放
- 网易云音乐源
- Bilibili 音乐源、视频氛围与弹幕层
- 歌词展示与时间偏移调节
- Private DJ / Music Curator 体验
- SQLite 本地曲库与播放历史
- 基于 Tauri 的轻量桌面打包

## 截图

![Ome Music 主界面截图](docs/assets/screenshot-main.png)

![Ome Music 设置截图](docs/assets/screenshot-settings.png)

请只提交适合公开展示的截图。不要提交包含 API Key、Cookie、账号名、私人歌单、日志、本地路径或个人听歌记录的图片。

## 安装

从 [GitHub Releases 页面](https://github.com/zerolyx/ome-music/releases) 下载最新 Windows 安装包。

推荐文件：

- `Ome Music_0.3.2_x64-setup.exe`

当前版本是未签名开发构建，Windows 首次运行时可能会出现 SmartScreen 安全提示。

## 从源码运行

环境要求：

- Windows 10/11
- Node.js 20 或更高版本
- Rust stable toolchain
- Microsoft Edge WebView2 Runtime

安装依赖：

```bash
npm install
```

开发模式运行桌面端：

```bash
npm run desktop
```

构建前端：

```bash
npm run build
```

构建 Windows 发布版：

```bash
npm run release:windows
```

发布版会内置前端产物，不需要 Vite 或开发服务器。

## 配置

Ome Music 不内置 API Key、Cookie、密码或 Token。

请在应用设置中配置：

- 网易云音乐：API Base URL、登录状态、可选 Cookie 导入
- Bilibili：公开搜索，以及用于账号可见内容的可选登录状态
- Curator Provider：兼容 OpenAI 格式的 Provider Name、Base URL、API Key 和 Model
- 语音：可选的语音转文字和文字转语音 Provider

详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。

## 安全与隐私

- 不要提交 API Key、Cookie、登录状态、本地数据库、缓存、日志、发布二进制或私人截图。
- 本地音乐文件只保存路径引用，Ome Music 不会上传本地音乐文件。
- 网易云音乐和 Bilibili 访问只使用用户自己的登录状态。Ome Music 不绕过会员、版权、地区或平台访问限制。

详见 [docs/PRIVACY.md](docs/PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 文档

- [构建说明](docs/BUILD.md)
- [配置说明](docs/CONFIGURATION.md)
- [排障指南](docs/TROUBLESHOOTING.md)
- [维护指南](docs/MAINTENANCE.md)
- [更新日志](docs/CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## 开源许可

Ome Music 使用 MIT License 开源。详见 [LICENSE](LICENSE)。
