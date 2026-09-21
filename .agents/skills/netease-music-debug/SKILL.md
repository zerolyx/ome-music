---
name: netease-music-debug
description: Debug NetEase Cloud Music search, playback, login, QR or SMS authentication, membership availability, and lyrics. Use for missing results, failed URLs, expired sessions, VIP tracks, copyright restrictions, lyric mismatch, or timing issues.
---

# NetEase Music Debug

1. Trace the affected path across the React component, music-source provider, Tauri command, and NetEase API endpoint.
2. Locate search, playback URL resolution, QR/password/SMS login, session refresh, membership checks, lyrics, caching, and offset handling as relevant.
3. Distinguish ordinary playable tracks, member-only tracks, trial responses, unavailable/copyright-restricted tracks, expired sessions, and API failures.
4. Inspect playback attempts by song ID, requested/returned quality, response code, and classified reason. Never log raw tokens, cookies, phone numbers, passwords, or full personal responses.
5. For lyrics, verify stable source IDs, cache bypass behavior, version matching, timestamps, duration, and saved offsets.
6. Prefer an observable, minimal fix and verify the smallest safe case without changing account data.
