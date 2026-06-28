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

#### Runtime Requirement: Node.js v20+

The NetEase Cloud Music source talks to a `NeteaseCloudMusicApi` compatible service. Ome Music keeps the app lightweight and does not bundle a full Node.js runtime.

Two modes are supported:

1. **Local mode, default**: install Node.js v20+ from https://nodejs.org and make sure npm/npx is available on the system PATH. In development, Ome Music uses the project dependency from `node_modules`. In an installed build, Ome Music can prepare the API service through `npx --yes NeteaseCloudMusicApi@4.32.0` on first use.
2. **External mode**: in Settings -> Music Sources, change NetEase Base URL to an already-deployed `NeteaseCloudMusicApi` instance, for example `http://your-server:3000`. No local Node.js package is needed in this mode.

When Node.js or npm/npx is missing, Ome Music shows a clear source status and keeps local music playback available.

Local music playback never requires Node.js.

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
