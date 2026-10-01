# Third-Party Notices

Ome Music is licensed under the MIT License in `LICENSE`. Direct dependencies are recorded in `package.json` / `package-lock.json` and `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`.

## Direct application dependencies

- Frontend runtime: Preact, `@preact/signals`, and `@tauri-apps/api`.
- Desktop shell and native integration: Tauri 2 and `tauri-plugin-dialog`.
- Rust application libraries: `serde`, `serde_json`, `rusqlite` (bundled SQLite), `walkdir`, `lofty`, `reqwest`, `tokio`, `base64`, `md5`, `flate2`, `urlencoding`, `aes`, `cbc`, `ecb`, `rsa`, `rand`, `qrcode`, `quick-xml`, and `smb`.

The optional SMB2/3 read-only library provider uses [`smb` 0.12.1](https://docs.rs/crate/smb/0.12.1), licensed MIT by [afiffon/smb-rs](https://github.com/afiffon/smb-rs). The dependency is version-pinned in `src-tauri/Cargo.toml`; only its multi-threaded synchronous client model and signing/encryption support are enabled.
- Build and development tools are listed separately in the package manifests and are not frontend runtime dependencies.

The application does not use React, Tailwind CSS, `lucide-react`, or the `NeteaseCloudMusicApi` npm package. The interface uses hand-written CSS and icons in the project source; NetEase requests are implemented by the Rust application.

## Open-source product references

- [Folia](https://github.com/chthollyphile/folia-major), AGPL-3.0; local reference snapshot `9cf8220`.
- [ECHO Community](https://github.com/Moekotori/ECHO), LGPL-3.0-only; local reference snapshot `d25d5c9`.

These repositories inform feature and interaction design only. Their source code, screenshots, logos, fonts, music, and other assets are not copied into or distributed with Ome Music. Local reference clones are stored outside this repository in `D:\Download\ome-reference\`. See [the feature and asset inventory](docs/REFERENCE-FEATURE-INVENTORY.md) for the current mapping and migration status and [the file-level asset register](docs/REFERENCE-ASSET-REGISTER.md) for the reference snapshot media hashes and disposition.

## Media and visual assets

The repository should not include third-party songs, videos, album artwork, fonts, or other copyrighted media. At the inventory date, the tracked image resources are the Ome application icons under `src-tauri/icons/`. If third-party code or assets are added later, record their source, license, and required notices here before distribution.
