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

#### Runtime: Bundled Managed Runtime

The Windows installer bundles a managed NetEase Cloud Music runtime (Node.js + `NeteaseCloudMusicApi`). Normal users do **not** need to install Node.js, npm, npx, or use any command line. Download the installer, install, and the NetEase source is ready.

**Source development mode** requires Node.js 20+ and `npm install`. Run `npm run desktop` to start the dev server, which uses the project dependency from `node_modules`.

**External service mode** is for advanced users who already run a `NeteaseCloudMusicApi` instance elsewhere. In Settings -> Music Sources, change the NetEase Base URL to point to that instance, for example `http://your-server:3000`. This is optional and not required for normal use.

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
