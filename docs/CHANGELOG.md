# Changelog

This project follows small, traceable releases. Keep entries short and focused on what changed for users and maintainers.

## [Unreleased]

- No unreleased changes yet.

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
