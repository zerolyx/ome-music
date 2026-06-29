# Troubleshooting

## Windows Blocks the App

Ome Music builds are currently unsigned. Windows SmartScreen may warn before running the installer or app. Only continue if you built the app yourself or trust the GitHub release source.

## WebView2 Missing

Install Microsoft Edge WebView2 Runtime if the app cannot open its window. The NSIS installer attempts to download and install WebView2 silently when needed.

## NetEase Cloud Music Does Not Work

The Windows installer bundles a managed NetEase runtime. Normal users do not need to install Node.js or use any command line.

If the NetEase source is unavailable:

- Bundled mode, default: the Windows installer ships a managed NetEase runtime (`node.exe` + `NeteaseCloudMusicApi`) inside the app. Normal users do not need to install Node.js or configure an API URL. When running from source, Ome Music uses the project dependency from `node_modules`.
- External mode: set the NetEase Base URL in Settings to a deployed `NeteaseCloudMusicApi` endpoint.
- If the managed runtime failed to start, restart Ome Music and try again. The Settings -> Music Sources panel shows the staged startup status (checking runtime → checking API → starting service → waiting for health → ready).

Source development requires Node.js 20+ and `npm install`. See [Build Guide](BUILD.md).

If the first start takes a moment, wait for the source status to become available and try the search again.

### Installer Cannot Overwrite `node.exe`

If the installer reports "Error opening file for writing ... node.exe", close any running Ome Music and retry. The installer automatically stops old processes before upgrading, but if a process is stuck, use Task Manager to end `ome-music-player` and `node.exe` under the Ome Music install folder, then retry.

If QR login appears successful but member tracks still behave like previews:

1. Reopen Settings.
2. Check NetEase login status.
3. Refresh or sign in again.
4. Try a track that your account can play in the official NetEase Cloud Music app.

Ome Music only uses your own session. It does not bypass membership, copyright, region, or platform restrictions.

## Uninstall and Data Preservation

Uninstalling does not delete your data. Your library, login, and settings survive uninstall and upgrade.

## NetEase or Bilibili Track Cannot Play

Possible reasons:

- Not signed in
- Session expired
- Membership required
- Copyright or region restriction
- Track removed upstream
- Source API unavailable
- Network failure

The app should show an unavailable state instead of crashing.

## Lyrics Do Not Match

Use the lyrics controls to reload lyrics, import an `.lrc` file, or adjust timing. The Curator must not generate fake official lyrics.

## Release Build Fails

Run the local checks first:

```bash
npm install
npm run build
cd src-tauri
cargo check
```

If packaging still fails, check:

- Rust stable toolchain is installed.
- Visual Studio Build Tools are installed on Windows.
- WebView2 Runtime is available.
- `src-tauri/target/` is not corrupted by an interrupted build.

## CI Fails After a Maintenance Patch

Check these first:

- Rust formatting: `cargo fmt --all -- --check`
- Rust warnings: `cargo clippy --workspace -- -D warnings`
- Frontend formatting: `npm run format:check`
- Frontend build: `npm run build`
