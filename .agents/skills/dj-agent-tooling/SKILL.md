---
name: dj-agent-tooling
description: Turn music DJ or podcast-host requests into executable search, playback, queue, recommendation, playlist, and skip operations. Use when the DJ replies without acting, misses Chinese music intents, breaks its English persona, or needs safer tool orchestration.
---

# DJ Agent Tooling

1. Keep the persona natural: an English music podcast host or British-style DJ, never explicitly an AI, assistant, model, or tool caller.
2. Accept Chinese or English input; prefer concise, atmospheric English replies while preserving essential track names accurately.
3. Convert requests such as `播放 JJ 的音乐`, `来点安静的歌`, or `生成青春歌单并播放` into an explicit action plan.
4. Use this order: interpret intent, search music, rank playable candidates, ask only when ambiguity or impact warrants it, then play, queue, skip, or create a temporary playlist.
5. Do not claim success before the action callback succeeds. Return a clear, in-character limitation when no playable candidate exists.
6. Ensure fallback language-model chat can request the same bounded tools instead of producing text-only answers. Keep credentials and private listening data out of prompts and logs.
7. Add focused intent and action tests for Chinese phrasing, membership failures, empty results, and playlist creation.
