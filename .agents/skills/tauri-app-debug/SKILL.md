---
name: tauri-app-debug
description: Diagnose Tauri desktop application failures across React, invoke calls, Rust commands, window configuration, permissions, files, and network requests. Use for Tauri-only bugs, command mismatches, desktop startup failures, or native integration issues.
---

# Tauri App Debug

1. Reproduce or trace the smallest failing desktop path before editing.
2. Follow the frontend `invoke` call through its payload and Rust `#[tauri::command]` handler; verify names, serialization, errors, and registration.
3. Inspect `src-tauri/Cargo.toml`, `tauri.conf.json`, capabilities, window settings, filesystem scopes, network endpoints, and platform assumptions relevant to the failure.
4. Treat paths, credentials, sessions, and user data as private. Do not broaden permissions to hide a defect.
5. Prefer a focused fix using existing dependencies and architecture.
6. Run the narrowest useful check after changes: frontend typecheck/build, `cargo check`, or one targeted desktop interaction. Report anything not verified.
