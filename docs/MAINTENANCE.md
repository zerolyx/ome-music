# Maintenance Guide

Ome Music should stay small, readable, and easy to release. This document is the checklist for repository maintenance.

## Release Checklist

1. Make sure `main` is green in CI.
2. Update versions together:
   - `package.json`
   - `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - README installer references
   - `docs/BUILD.md`
   - `docs/CHANGELOG.md`
3. Run local checks:
   - `npm run build`
   - `cargo check` from `src-tauri`
   - `npm run lint`
4. Open a pull request for the release maintenance patch.
5. Merge only after CI passes.
6. Create a version tag, for example `v0.3.2`.
7. Confirm the `Release Windows Build` workflow generates the NSIS installer.
8. Download the installer from GitHub Releases and launch it on Windows before announcing the release.

## Repository Hygiene

- Do not commit release installers, portable executables, local databases, logs, cache folders, screenshots with private data, cookies, or API keys.
- Keep README files short and current.
- Keep CHANGELOG entries concise. Avoid dumping raw internal notes into release history.
- Keep workflows focused. CI should validate the project; release should publish the Windows installer.
- Optional infrastructure such as Docker images should live in a separate workflow if it returns later.

## CI Expectations

The default CI workflow should answer:

- Does Rust compile?
- Does Clippy pass?
- Is Rust formatting correct?
- Does TypeScript compile?
- Does ESLint pass?
- Does the frontend production build pass?

The release workflow should answer:

- Can the Windows NSIS installer be produced from a tag?

## Version Policy

- Patch versions are for fixes, maintenance, and packaging stability.
- Minor versions are for user-visible feature groups.
- Do not create a release tag until the maintenance PR is merged and `main` is green.
