# Changelog

This project follows small, traceable releases. Keep entries short and focused on what changed for users and maintainers.

## [Unreleased]

- No unreleased changes yet.

## [0.3.6] - 2026-06-30

This is the latest recommended public download. Older releases are deprecated and no longer recommended.

### Added

- Player Dock functional keys: unified `PlaybackMode` cycle (curator → loop → repeat-one → shuffle), like button on the cover with local persistence + Taste Signal, and a light glass "More" menu.
- Like / Less like this taste signals feed the local listening-memory pipeline.
- Playback speed controls: explicit 6-option selection grid (0.5 / 0.75 / 1 / 1.25 / 1.5 / 2x) in the More menu, persisted to `ome.playback.speed` and surviving restarts and track switches.
- Queue Drawer: right-side slide-over glass panel with click-to-play, current-track highlight + equalizer animation, row-level like/remove (hover) and list-level like-all / clear / recommend-similar toggle.
- Lyrics Room alpha: spatial stage with three depth tiers (current / nearby / far), radial drift, micro-rotation, breathing animation, click-a-line-to-seek, and a soft no-lyrics empty state.
- Hidden Lyric Tools: bottom-right hotspot cluster that appears only on hover; Translation reveals translated lyrics (data-permitting); Romanization / Word-by-word stay disabled until a data pipeline exists.
- Playlist Shelf: card grid replacing the old Listening Memory table, per-playlist progress state machine (reading / imported locally N · relative time / failed), persisted local import records, and heuristic identification of the NetEase "我喜欢的音乐" entry.

### Fixed

- Restored stable NetEase search, cover display, login-state detection, and playback pipeline (from PR #12).
- Restored Bilibili replay hydration for cover, video atmosphere, audio, and danmaku (from PR #12).
- Prevented playback progress and lyric position from resetting on metadata-only liked updates: `reloadLyrics` / `importLyrics` now read `currentTrackRef.current` (latest-ref stable pattern), and the track-switch reset effect is keyed to `currentTrackId` (a real track switch) instead of `currentTrack` object identity.
- Queue safety: Clear / Remove no longer touch the overloaded `tracks` array (local library + search results + imports), so clearing or removing from the queue never wipes the visible library or search results.
- Hidden half-finished More-menu stubs (Add to playlist, View source) so the immersive player no longer parades disabled entries.

### Notes

- This is an unsigned development build; Windows SmartScreen may warn.
- The Windows installer bundles the managed NetEase runtime; users do not need Node.js, npm, Rust, or command line tools.
- Playlist Shelf records a one-way local import from NetEase, NOT a two-way cloud sync.
- Bumped version to 0.3.6.

## [0.3.5] - 2026-06-29

### Fixed

- Fixed Windows installer failure (`Error opening file for writing ... node.exe`) when an old version of Ome Music or its bundled managed runtime was still running.
- Added NSIS pre-install hook to gracefully stop old Ome Music and bundled node.exe processes before writing files, without killing unrelated system Node.js processes.
- Stored the managed NetEase runtime child process handle in AppState so it is reused instead of spawning duplicates, and is killed on app exit to prevent orphaned node.exe.
- Added NetEase service startup status with staged progress (checking runtime → checking API → starting service → waiting for health → ready) so users see clear feedback instead of silent search failures.
- Added a search gate that ensures the NetEase service is ready before searching, with automatic retry and clear error messages.
- Removed dangerous post-uninstall data deletion; uninstall now preserves user data (library, login, settings, caches, keyring) by default. Upgrade/reinstall no longer loses data.

### Security

- Narrowed the Tauri asset protocol scope to remove default access to the Downloads directory.
- Added path authorization to `scan_music_directory` so arbitrary front-end paths cannot be scanned.

### Maintenance

- Clarified in BUILD and CONFIGURATION docs that the Windows installer is a complete ready-to-run environment and does not require npm, Node.js, or compilation for normal users.
- Hardened NetEase and Bilibili QR login polling with client-side max-life timeouts and consecutive-error thresholds to stop infinite retry loops.
- Added SHA256 verification for the bundled Node.js runtime in the release workflow and switched to `npm ci --omit=dev` for reproducible managed-runtime installs.
- Added a lightweight `docs:check` script and CI job for documentation consistency.
- Bumped version to 0.3.5.

## [0.3.4] - 2026-06-29

### Fixed

- Merged NetEase session cookies from both the response body and `Set-Cookie` header so QR login no longer loses session fragments.
- Disabled Node.js runtime probing in release builds; the installer uses the bundled managed runtime instead of searching for `npx` on the user's machine.
- Added retry logic to NetEase login status checks to tolerate transient upstream failures.
- Improved NetEase playback error classification with bilingual keyword detection.
- Restored the initial page splash-screen fix (inline body background colour) that was lost during the main squash.
- Hid misleading Bilibili password and SMS login buttons; Bilibili account sign-in is routed through Secure Web Login.
- Added a refactor TODO for splitting `App.tsx` into focused hooks.

## [0.3.3] - 2026-06-28

### Fixed

- Bundled a managed NetEase Cloud Music runtime into the Windows installer so normal users do not need to install Node.js or configure an API URL.
- Made the NetEase source start through the bundled runtime first, then fall back to the development package only when running from source.
- Enabled the NetEase source by default for new installs.
- Reduced the search popover flicker by opening results only after the user types a query.
- Rewrote NetEase setup and troubleshooting docs from a normal-user perspective.

## [0.3.2] - 2026-06-28

### Maintenance

- Cleaned up the GitHub CI workflow into two focused jobs: Rust checks and frontend checks.
- Cleaned up the Windows release workflow so installer publishing is no longer blocked by optional Docker image jobs.
- Rewrote the English and Chinese README files to remove mojibake, stale installer names, and outdated release notes.
- Added a maintenance guide for release hygiene, CI expectations, and repository cleanup rules.
- Updated version references to `0.3.2`.

### Fixed

- Normalized NetEase session cookies before saving and reading them, reducing cases where QR login appeared successful but playback requests behaved as signed out.
- Avoided classifying a valid member playback URL as preview-only when the signed-in account has an active membership.
- Prevented page-level vertical scrolling in the immersive player shell.
- Disabled window resizing to avoid stretched player layouts.
- Removed the startup onboarding pop-in from the normal launch path.
- Removed visible shuffle/repeat controls from the main player footer to keep the playback UI minimal.

## [0.3.1] - 2026-06-28

### Fixed

- Improved playback queue behavior around shuffle, previous track, repeat, and expired source URLs.
- Improved NetEase and Bilibili QR login states and timeout handling.
- Improved search result pagination and disabled-source messaging.
- Added lint, formatting, and CI checks.

## [0.3.0] - 2026-06-27

### Added

- Added first-run onboarding.
- Added Bilibili QR login improvements.
- Added NetEase QR login fixes around cookie retrieval.

## [0.2.0] - 2026-06-27

### Added

- Added Node.js environment detection for the local NetEaseCloudMusicApi service.
- Added clearer configuration and troubleshooting documentation for NetEase source setup.

## [0.1.0] - 2026-06-27

### Added

- Initial public Windows release.
- Local music library, NetEase Cloud Music source, Bilibili source, lyrics, danmaku, settings, and release packaging.
