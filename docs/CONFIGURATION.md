# Configuration

Ome Music is local-first. It does not ship with provider keys, cookies, account credentials, or private music data.

## Music Sources

### Local Music

Use the app to choose a local music folder. Ome Music stores file paths and metadata in SQLite. It does not copy your songs into the app directory.

### NetEase Cloud Music

Supported configuration:

- Enable or disable the source
- API Base URL
- QR login session
- Optional cookie import
- Playback quality preference

Some tracks may still be unavailable because of copyright, region, membership, account permission, or upstream API limitations.

#### Runtime Requirement

The Windows installer includes a bundled managed NetEase runtime (node.exe + `NeteaseCloudMusicApi`). Normal users do not need Node.js, npm, or command-line tools. Developers building from source need Node.js 20+.

**Source development mode** requires Node.js 20+ and `npm install`. Run `npm run desktop` to start the dev server, which uses the project dependency from `node_modules`.

NetEase runtime modes:

1. **Bundled mode, default**: the installer ships a managed NetEase runtime (node.exe + NeteaseCloudMusicApi) inside the app. Normal users do not need to install or configure anything. When running from source, Ome Music uses the project dependency from `node_modules`.
2. **External mode**: in Settings -> Music Sources, change NetEase Base URL to an already-deployed `NeteaseCloudMusicApi` instance, for example `http://your-server:3000`. No local Node.js package is needed in this mode.

Local music playback never requires Node.js.

Uninstall preserves user data by default. Upgrade/reinstall does not delete your library, login, or settings.

### Bilibili

Supported configuration:

- Enable or disable the source
- API Base URL
- Search scope
- QR login session
- Optional cookie import

Bilibili video atmosphere and danmaku are loaded only when Bilibili content is played.

## Curator/API

The Curator uses an OpenAI-compatible provider configuration:

- Provider name
- Base URL
- API key
- Model

The API key must be entered by the user and stored locally. Do not commit it.

## Voice

Speech-to-text and text-to-speech are optional. If no voice provider is configured, the Curator falls back to text.
