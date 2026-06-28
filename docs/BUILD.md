# Build Guide

## Requirements

- Windows 10/11
- Node.js 20 or later
- Rust stable toolchain
- Microsoft Edge WebView2 Runtime

## Install Dependencies

```bash
npm install
```

## Frontend Build

```bash
npm run build
```

## Desktop Development

```bash
npm run desktop
```

This starts the Vite development server and launches the Tauri desktop app.

## Windows Release

```bash
npm run release:windows
```

Expected outputs:

- `src-tauri/target/release/ome-music-player.exe`
- `src-tauri/target/release/bundle/nsis/Ome Music_0.3.2_x64-setup.exe`

The release executable and installer should not require `npm`, `cargo`, Vite, or a development server on the user's machine.

## GitHub Release Build

The `Release Windows Build` workflow runs when a tag matching `v*` is pushed.

Example:

```bash
git tag v0.3.2
git push origin v0.3.2
```

The workflow should create a GitHub Release and upload the Windows NSIS installer.

## Do Not Commit

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `release/`
- installers or portable executables
- logs, caches, databases, screenshots with private data
- API keys, cookies, sessions, or tokens
