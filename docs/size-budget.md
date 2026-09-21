# Ome Music Size Budget

Ome Music should stay small, local-first, and easy to clean.

## Budgets

| Area | Budget |
| --- | ---: |
| Final installer | <= 150 MB, ideally <= 80 MB |
| Installed app directory | <= 300 MB |
| User data directory | <= 500 MB by default |
| Music cache | 0 MB by default |
| Optional music cache | <= 1 GB, user-enabled only |
| Cover cache | <= 200 MB |
| Lyrics cache | <= 50 MB |
| Logs | <= 50 MB |
| SQLite database | <= 200 MB unless the user knowingly imports a large library |

## Rules

- Do not copy local music files into the app directory.
- Stream NetEase tracks by default; do not download whole songs unless a future explicit cache setting exists.
- Store local music paths and metadata, not audio blobs.
- Store cover URLs or bounded cache paths; do not store large cover blobs in SQLite.
- Store lyrics as text with stable keys and avoid duplicate title-only caches.
- Keep logs bounded and safe to clear.
- Do not commit or package `node_modules`, Rust `target`, `dist`, `artifacts`, logs, caches, demo music, videos, or model files.
- Keep production source maps disabled.
- Use Tauri release builds with strip, LTO, panic abort, and size-oriented optimization.

## Safe Cleanup

Safe to remove during development:

- `src-tauri/target/`
- `**/target/`
- `dist/`
- `artifacts/`
- app-owned cache directories
- app-owned logs

Never remove automatically:

- user music files
- `ome_music.sqlite3`
- provider/session credentials
- `package-lock.json`
- `src-tauri/Cargo.lock`
