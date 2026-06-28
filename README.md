# Ome Music

English | [中文](./README.zh-CN.md)

Ome Music is a lightweight, immersive desktop music player for Windows. It is built with Tauri, React, TypeScript, Tailwind CSS, Rust, and SQLite.

The product direction is simple: music first. Covers, lyrics, atmosphere, and playback should feel calm and cinematic, while source configuration and technical controls stay behind the experience.

## Highlights

- Local music import and playback
- NetEase Cloud Music source
- Bilibili music source, video atmosphere, and danmaku layer
- Lyrics display with timing offset controls
- Private DJ / Music Curator experience
- Local SQLite library and listening history
- Lightweight Tauri desktop packaging

## Screenshots

![Ome Music main screenshot](docs/assets/screenshot-main.png)

![Ome Music settings screenshot](docs/assets/screenshot-settings.png)

Only commit screenshots that are safe for public display. Do not include API keys, cookies, account names, private playlists, logs, local paths, or personal listening history.

## Installation

Download the latest Windows installer from the [GitHub Releases page](https://github.com/zerolyx/ome-music/releases).

Recommended file:

- `Ome Music_0.3.2_x64-setup.exe`

The current build is unsigned. Windows SmartScreen may show a warning on first launch.

## Build From Source

Requirements:

- Windows 10/11
- Node.js 20 or later
- Rust stable toolchain
- Microsoft Edge WebView2 Runtime

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run desktop
```

Build the frontend:

```bash
npm run build
```

Build the Windows release:

```bash
npm run release:windows
```

The release build bundles the frontend and does not require Vite or a development server.

## Configuration

Ome Music does not include built-in API keys, cookies, passwords, or tokens.

Configure sources inside the app:

- NetEase Cloud Music: API base URL, login session, optional cookie import
- Bilibili: public search and optional login session for account-only content
- Curator provider: OpenAI-compatible provider name, base URL, API key, and model
- Voice: optional speech-to-text and text-to-speech providers

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Security and Privacy

- Do not commit API keys, cookies, sessions, local databases, cache, logs, release binaries, or private screenshots.
- Local music files are referenced by path and are not uploaded by Ome Music.
- NetEase Cloud Music and Bilibili access uses the user's own session only. Ome Music does not bypass membership, copyright, region, or platform restrictions.

See [docs/PRIVACY.md](docs/PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Documentation

- [Build Guide](docs/BUILD.md)
- [Configuration](docs/CONFIGURATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Maintenance Guide](docs/MAINTENANCE.md)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party Notices](THIRD_PARTY_NOTICES.md)

## License

Ome Music is released under the MIT License. See [LICENSE](LICENSE).
