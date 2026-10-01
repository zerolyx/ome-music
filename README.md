# Ome Music

English | [中文](./README.zh-CN.md)

**AI-era personal radio.** Open the app, the DJ greets you by voice, resumes the song you were listening to, then keeps the music flowing — with radio-style introductions before every track and a chat drawer when you want to talk.

## What You Can Do

- **Local music** — import folders, covers and lyrics, and manage playlists and the library. Optional metadata and lyric-candidate tools run only when requested; searches send text queries, not audio or local paths.
- **NetEase Cloud Music** — QR-code login, search, full-length streaming (incl. VIP tracks with your account), synced lyrics.
- **Bilibili** — search videos, audio playback via the built-in referer proxy, optional pale danmaku overlay.
- **Personal remote libraries** — optionally connect Navidrome / OpenSubsonic, Jellyfin, Emby, WebDAV, or SMB (read-only). Search or browse directories according to each server's capabilities, then play through the existing queue. Remote tracks stay out of default radio, local history, and persistent queue snapshots; credentials live only for the current app session.
- **AI DJ** — warm late-night-radio host with local memory (conversation, taste facts, hour-of-day habits). Works with any OpenAI-compatible LLM (e.g. DeepSeek). Speaks with Edge neural voices, or your own cloned voice via any OpenAI-compatible TTS endpoint.
- **Local data backup** — back up the library, playlists, lyrics, listening history, and preferences to a folder you choose. Restore creates a local rollback point and does not transfer account credentials or file access grants.
- **Dual theme** following the system, auto-hiding chrome, word-level karaoke lyrics.

## Install / Run (development)

```bash
npm install
npm run tauri dev     # desktop app
npm run build         # frontend + tsc
cargo test            # rust tests (in src-tauri)
```

Requirements: Node 20+, Rust (stable), Windows 10/11 with WebView2.

## Privacy

The app keeps your library, play history, DJ memory and conversations in a local SQLite database. Manual backups are unencrypted and include music paths, listening history, lyrics, and DJ memory; if you choose a shared or synced folder, the backup is saved there. LLM/TTS calls only happen if you configure a provider yourself. No accounts, no telemetry. See `SECURITY.md`.
Remote libraries contact only the server you explicitly configure when you connect, search, or play; connection tokens stay in the current app process and are not written to preferences, the database, or backups.

## License

MIT — see `LICENSE`.
