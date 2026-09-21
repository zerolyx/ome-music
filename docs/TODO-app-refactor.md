# App.tsx Refactor Plan

Status: **Planning only.** Do not start the large refactor in the same release
window as the post-open-source audit fixes. Track this as a follow-up issue and
land it as a dedicated PR so playback regressions stay easy to bisect.

## Background

`src/App.tsx` has grown to ~1600 lines and now mixes several independent
concerns: playback engine wiring, lyrics controller, Bilibili playback, danmaku
controller, music source status, Ome Radio, and startup restore. This makes the
file hard to scan and risky to edit.

This document records the intended split direction so future work has a clear
target. The split must preserve the light glass aesthetic, smooth playback, and
stable windows described in `AGENTS.md`.

## Target hook boundaries

Extract focused hooks under `src/features/<area>/` (or `src/hooks/`) with thin
return surfaces. `App.tsx` should become a composition root that wires the hooks
together and renders the shell components.

1. `usePlaybackEngine`
   - Owns the `<audio>` element ref, current track, queue, shuffle, repeat,
     play/pause, seek, volume, and the playback event recording calls.
   - Exposes `play`, `pause`, `next`, `previous`, `seek`, `setVolume`,
     `currentTrack`, `isPlaying`, `position`, `duration`.

2. `useLyricsController`
   - Owns lyric loading, parsing, current-line index, offset save/load, and the
     LRC import flow.
   - Exposes `lyrics`, `currentLineIndex`, `importLyricsFile`, `saveOffset`.

3. `useBilibiliPlayback`
   - Owns Bilibili playable URL resolution, danmaku prefetch, and the
     video-atmosphere URL hand-off.
   - Exposes `requestBilibiliPlayable`, `danmaku`, `videoAtmosphereUrl`.

4. `useDanmakuController`
   - Owns danmaku fetching, caching, weighting, and the render feed for the
     video atmosphere overlay.
   - Exposes `danmakuItems`, `refreshDanmaku`, `danmakuDebug`.

5. `useMusicSourceStatus`
   - Owns NetEase service status, Bilibili source status, source enable/disable,
     and the boot-time `ensure_netease_api_service` call.
   - Exposes `neteaseStatus`, `bilibiliStatus`, `refreshStatus`.

6. `useOmeRadio`
   - Owns the Ome Radio session lifecycle, segment scheduling, speech provider
     integration, and refill behavior.
   - Exposes `radioSession`, `radioSegments`, `advanceRadio`, `refillRadio`.

7. `useStartupRestore`
   - Owns the last-session snapshot load/save and the first-launch restore path.
   - Exposes `restoredTrack`, `restoredPosition`, `markRestored`.

## Rules for the refactor PR

- Land each hook extraction as a separate, reviewable commit. Do not mix
  behavior changes with the move.
- Keep the public surface of each hook small and typed. Avoid re-exposing
  internal refs.
- Preserve existing playback behavior: queue order, shuffle seeds, repeat
  modes, lyric offset persistence, and danmaku timing must not regress.
- Run `npm run build`, `npm run lint`, `npm run format:check`, and
  `npm run docs:check` after each extraction.
- Add a focused Playwright smoke check covering local play, NetEase play,
  Bilibili play, danmaku render, and lyric sync before opening the PR.
- Do not change the light glass aesthetic, generous spacing, or window
  stability rules in `AGENTS.md`.

## Out of scope for this refactor

- New features, new settings, new sources.
- Changes to the DJ voice, danmaku style, or radio copy.
- Changes to the bundled NetEase runtime or release workflow.

## Tracking

Create a GitHub issue titled:

> refactor: split App.tsx into playback, source, lyrics, danmaku, and radio hooks

Reference this document in the issue body.
