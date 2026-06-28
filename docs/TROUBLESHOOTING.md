# Troubleshooting

## Windows Blocks the App

Ome Music builds are currently unsigned. Windows SmartScreen may warn before running the installer or app. Only continue if you built the app yourself or trust the GitHub release source.

## WebView2 Missing

Install Microsoft Edge WebView2 Runtime if the app cannot open its window. The NSIS installer attempts to download and install WebView2 silently when needed.

## NetEase Cloud Music Does Not Work

NetEase Cloud Music features require a reachable `NeteaseCloudMusicApi` service.

You can use either mode:

- Local mode: install Node.js 20 or later and let Ome Music start the local API service.
- External mode: set the NetEase Base URL in Settings to a deployed `NeteaseCloudMusicApi` endpoint.

If QR login appears successful but member tracks still behave like previews:

1. Reopen Settings.
2. Check NetEase login status.
3. Refresh or sign in again.
4. Try a track that your account can play in the official NetEase Cloud Music app.

Ome Music only uses your own session. It does not bypass membership, copyright, region, or platform restrictions.

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
- Frontend build: `npm run build`
- ESLint: `npm run lint`
- Prettier: `npm run format:check`
