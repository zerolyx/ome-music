# Troubleshooting

## Windows Blocks the App

Development builds may be unsigned. Windows SmartScreen may warn before running the app. Only continue if you built the app yourself or trust the release source.

## WebView2 Missing

Install Microsoft Edge WebView2 Runtime if the app cannot open its window. The NSIS installer will attempt to download and install it silently on first run.

## Node.js Missing (NetEase Cloud Music)

Starting with v0.2, Ome Music automatically checks whether Node.js is installed when the NetEase Cloud Music source is enabled. If Node.js is not on the system PATH, a centered prompt appears:

- Title: 缺少运行环境 Node.js
- It explains that NetEase Cloud Music features (search, playback, cover, lyrics) cannot run without Node.js v20 or later
- It offers a "下载 Node.js" button that opens https://nodejs.org
- It offers a "重新检测" button to re-run the check after installation
- It offers a "稍后再说" button to dismiss the prompt

Local music playback is not affected — only NetEase Cloud Music features require Node.js.

After installing Node.js (remember to tick "Add to PATH" on Windows), restart Ome Music and click "重新检测". The NetEase Cloud Music API service will then start automatically.

If you prefer not to install Node.js locally, you can also point the NetEase Base URL to an externally deployed NeteaseCloudMusicApi instance in Settings → Music Sources.

## NetEase or Bilibili Track Cannot Play

Possible reasons:

- Not logged in
- Membership required
- Copyright or region restriction
- Track removed upstream
- Source API unavailable
- Network failure

The app should show an unavailable state rather than crashing.

## Lyrics Do Not Match

Use the lyrics controls to reload, import `.lrc`, or adjust timing. The Curator must not generate fake official lyrics.

## Build Fails

Run:

```bash
npm install
npm run build
cd src-tauri
cargo check
```

If release packaging fails, confirm that Rust, Visual Studio Build Tools, WebView2, and Tauri dependencies are installed.
