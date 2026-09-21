#!/usr/bin/env bash
# Run cargo with a proper MSVC environment from Git Bash.
#
# Why this exists: Git Bash puts GNU /usr/bin/link (coreutils) ahead of MSVC
# link.exe, and the Windows SDK lib dirs are not on LIB, so `cargo check` dies
# inside the build scripts with "LNK1181: cannot open kernel32.lib".
# vcvarsall.bat sets PATH/INCLUDE/LIB correctly, so we let it prepare the
# environment and then hand over to cargo in the same cmd.exe session.
#
# Usage: bash scripts/cargo-msvc.sh check --workspace
set -euo pipefail

VS="C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools"
REPO="D:\\Download\\ome\\src-tauri"
ARGS="$*"

cmd.exe /c "call \"${VS}\\VC\\Auxiliary\\Build\\vcvarsall.bat\" x64 >nul && cd /d ${REPO} && cargo ${ARGS}"
