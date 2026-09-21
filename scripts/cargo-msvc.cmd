@echo off
rem Run cargo with a proper MSVC x64 environment (Windows + Git Bash).
rem
rem Why this exists: from Git Bash, GNU /usr/bin/link (coreutils) shadows MSVC
rem link.exe and the Windows SDK lib dirs are not on LIB, so `cargo check`
rem dies inside build scripts with "LNK1181: cannot open kernel32.lib".
rem vcvarsall.bat sets PATH/INCLUDE/LIB correctly.
rem
rem Adjust VS_ROOT below if your Visual Studio / Build Tools major version or
rem edition differs.
rem
rem Usage: scripts\cargo-msvc.cmd check --workspace

setlocal
set "VS_ROOT=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"
set "REPO_ROOT=%~dp0.."

call "%VS_ROOT%\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
  echo [cargo-msvc] vcvarsall.bat not found. Edit VS_ROOT in %~f0.
  exit /b 1
)

cd /d "%REPO_ROOT%\src-tauri" || exit /b 1
cargo %*
set "CARGO_EXIT=%ERRORLEVEL%"
endlocal & exit /b %CARGO_EXIT%
