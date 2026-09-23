# Ome Music

English | [中文](./README.zh-CN.md)

**AI-era personal radio.** Open the app, the DJ greets you by voice, resumes the song you were listening to, then keeps the music flowing — with radio-style introductions before every track and a chat drawer when you want to talk.

## What You Can Do

- **Local music** — import a folder, covers, lyrics.
- **NetEase Cloud Music** — QR-code login, search, full-length streaming (incl. VIP tracks with your account), synced lyrics.
- **Bilibili** — search videos, audio playback via the built-in referer proxy, optional pale danmaku overlay.
- **AI DJ** — warm late-night-radio host with local memory (conversation, taste facts, hour-of-day habits). Works with any OpenAI-compatible LLM (e.g. DeepSeek). Speaks with Edge neural voices, or your own cloned voice via any OpenAI-compatible TTS endpoint.
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

Everything personal stays local: your library, play history, DJ memory and conversations live in a local SQLite database. LLM/TTS calls only happen if you configure a provider yourself. No accounts, no telemetry. See `SECURITY.md`.

## License

MIT — see `LICENSE`.
