---
name: music-player-ui-polish
description: Polish a lightweight immersive music player UI. Use for the title bar, player footer, search, settings, lyrics/right panel, scrolling, overflow, responsive layout, visual consistency, or window jitter.
---

# Music Player UI Polish

1. Preserve Ome Music's small, light, spacious glass aesthetic; remove friction before adding decoration.
2. Inspect the top strip/title bar, player footer, search field, settings, right panel, overlays, and their shared spacing and radii.
3. Trace scroll ownership, `overflow`, viewport units, fixed layers, container heights, transforms, and expensive blur or layout animations.
4. Prefer CSS and component simplification over a new UI dependency. Do not add a large framework.
5. Make one focused visual change at a time.
6. Verify with Playwright screenshots at representative window sizes; check Console errors, scrolling, keyboard focus, dialogs, and jitter. Include screenshot evidence or explain why it was unavailable.
