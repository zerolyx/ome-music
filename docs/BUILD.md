# Build Guide

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

This starts the Vite dev server and launches Tauri.

## Windows Release

```bash
npm run release:windows
```

Expected outputs:

- `src-tauri/target/release/ome-music-player.exe`
- `src-tauri/target/release/bundle/nsis/Ome Music_0.2.0_x64-setup.exe`

The release executable should not require `npm`, `cargo`, Vite, or a development server.

## Do Not Commit

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `release/`
- installers or portable executables
- logs, caches, databases, screenshots with private data
