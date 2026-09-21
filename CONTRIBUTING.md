# Contributing

Thanks for helping improve Ome Music.

## Development

```bash
npm install
npm run build
npm run desktop
```

For release packaging:

```bash
npm run release:windows
```

## Before Opening a Pull Request

- Keep changes focused.
- Do not commit build output, release binaries, logs, caches, databases, or personal config.
- Do not include real API keys, cookies, tokens, passwords, local paths, or private account data.
- Run `npm run lint` and `npm run format:check`.
- Run `npx tsc --noEmit`.
- Run `npm run build`.
- Run `cargo check` in `src-tauri` when Rust code changes.
- Run `cargo fmt --all -- --check` and `cargo clippy --workspace -- -D warnings` in `src-tauri` when Rust code changes.

## Contributors

Thanks to everyone who has helped shape Ome Music.

- **[@zerolyx](https://github.com/zerolyx)** — creator and maintainer of Ome Music.
- **[@chinokoyuki](https://github.com/chinokoyuki)** — CI/CD pipeline (GitHub Actions: Rust + TypeScript checks, ESLint/Prettier enforcement, Docker image builds for the NetEase API service and the Tauri Linux build environment). See [PR #2](https://github.com/zerolyx/ome-music/pull/2).

## Design Direction

Ome Music should stay small, immersive, calm, and music-first. Avoid turning the interface into a dashboard or technical control panel.
