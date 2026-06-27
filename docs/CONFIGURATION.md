# Configuration

Ome Music is local-first. It does not ship with provider keys, cookies, or account credentials.

## Music Sources

### Local Music

Use the app to choose a local music folder. Ome Music stores file paths and metadata in SQLite. It does not copy your songs into the app directory.

### NetEase Cloud Music

Supported configuration:

- Enable/disable source
- API base URL
- QR/login session
- Optional cookie import
- Playback quality preference

Some tracks may still be unavailable because of copyright, region, membership, account permission, or upstream API limitations.

#### Runtime requirement: Node.js v20+

The built-in NetEase Cloud Music API service is a Node.js application. Ome Music does not bundle Node.js, so the default local API at `http://127.0.0.1:3000` only works when Node.js v20 or later is installed and reachable on the system PATH.

When Node.js is missing, Ome Music v0.2+ shows an environment prompt at startup:

- Detects `node --version` on the backend
- Detects whether the bundled `NeteaseCloudMusicApi` package is present
- Surfaces a precise error message in the service status (`nodeAvailable`, `apiPackageFound`)

Two ways to use NetEase Cloud Music:

1. **Local mode (default)**: install Node.js v20+ from https://nodejs.org (tick "Add to PATH"), then restart Ome Music and click "重新检测" in the prompt. The API service starts automatically.
2. **External mode**: in Settings → Music Sources, change NetEase Base URL to an already-deployed `NeteaseCloudMusicApi` instance (for example `http://your-server:3000`). No Node.js is needed on the local machine in this mode.

Local music playback never requires Node.js.

### Bilibili

Supported configuration:

- Enable/disable source
- API base URL
- Search scope
- QR/login session
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
