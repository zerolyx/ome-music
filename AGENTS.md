# Ome Music Development Rules

Ome Music is a Tauri desktop music player for local music and NetEase Cloud Music, with Bilibili atmosphere and a natural DJ/podcast experience.

## Product principles

- Keep it small, lightweight, immersive, and calm. Less is more.
- Prefer polishing the listening experience over adding controls or features.
- Avoid large dependencies, duplicate settings, and architecture that exceeds the problem.

## Workflow

- Read the React, Tauri, and Rust call path before editing. Analyze, plan, change in small steps, then verify.
- Prefer fixing existing logic over adding libraries. Ask before any dependency change.
- Run the smallest relevant typecheck, build, Rust check, or focused UI verification after changes.
- For UI changes, use Playwright screenshots and check Console errors, scrolling, overflow, responsiveness, and window stability.

## UI and DJ

- Preserve the light glass aesthetic, generous spacing, consistent radii, smooth scrolling, and stable windows without jitter.
- Keep the player bar, search, settings, and side panels visually coherent and uncluttered.
- Never present the DJ as an AI. Treat it as an English music podcast host or British-style DJ.
- Accept Chinese requests, but keep DJ replies naturally English. Music actions should execute through tools, not end as chat-only text.
- Keep Bilibili danmaku light, pale, emotional, and secondary to the music.

## Safety and privacy

- Do not delete music, caches, user data, login sessions, databases, or credentials without explicit approval.
- Do not read, print, or modify `.env`, tokens, cookies, phone numbers, API keys, or `PersonalConfig` credential/session files without explicit approval.
- Do not run destructive Git, release, deployment, migration, or bulk cleanup commands without approval.
