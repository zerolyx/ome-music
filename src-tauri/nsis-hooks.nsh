!macro NSIS_HOOK_PREINSTALL
  ; --- Stop the Ome Music main process (the app executable) ---
  ; Match only by process Name. NEVER use "taskkill /IM node.exe /F" because that
  ; would also kill the user's other Node.js processes.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $\'ome-music-player$\' -or $_.Name -eq $\'Ome Music$\' } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2"'

  ; --- Stop ONLY the bundled node.exe located at $INSTDIR\resources\node\node.exe ---
  ; Match by exact ExecutablePath OR by CommandLine containing the install dir's
  ; netease-runtime path. This avoids killing unrelated user Node.js processes.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -ieq $\'$INSTDIR\resources\node\node.exe$\' -or $_.CommandLine -like $\'*$INSTDIR\resources\netease-runtime*$\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1"'

  ; --- Verify the bundled node.exe is no longer locked ---
  ; If the file exists but cannot be opened for writing, the runtime is still running
  ; and the installer would fail with "Error opening file for writing". Abort cleanly
  ; with a friendly message so the user can close the app and retry.
  IfFileExists "$INSTDIR\resources\node\node.exe" .preinstall_node_exists .preinstall_node_done
.preinstall_node_exists:
  ClearErrors
  FileOpen $0 "$INSTDIR\resources\node\node.exe" w
  IfErrors .preinstall_node_locked .preinstall_node_opened
.preinstall_node_locked:
  MessageBox MB_OK|MB_ICONSTOP "Ome Music is still running in the background. Please close it and retry installation."
  Abort
.preinstall_node_opened:
  FileClose $0
.preinstall_node_done:
!macroend


!macro NSIS_HOOK_POSTUNINSTALL
  ; User data is PRESERVED by default so that upgrades and reinstalls do not wipe the
  ; user's library, settings, login sessions, or credentials. This hook intentionally
  ; does NOT delete:
  ;   - $APPDATA\com.ome.music        (SQLite databases, settings, login state)
  ;   - $LOCALAPPDATA\com.ome.music   (cached assets)
  ;   - Windows credential manager keys (cmdkey /delete:ome.music.*)
  ;   - Registry keys (HKCU\Software\com.ome.music, HKCU\Software\Classes\com.ome.music)
  ;
  ; Users who want a full clean removal can delete those directories manually or use
  ; the in-app "clear cache" feature, which removes only disposable caches while
  ; keeping login and library data intact.
!macroend
