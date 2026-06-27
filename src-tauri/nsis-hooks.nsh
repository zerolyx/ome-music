!macro NSIS_HOOK_POSTUNINSTALL
  ; 清理应用数据目录（含 SQLite 数据库、缓存、配置）
  RMDir /r "$APPDATA\com.ome.music"
  RMDir /r "$LOCALAPPDATA\com.ome.music"

  ; 清理 Windows 凭据管理器中存储的网易云/Bilibili/LLM 密钥
  nsExec::ExecToLog 'powershell.exe -NoProfile -Command "cmdkey /delete:ome.music.source.netease:local 2>$null; cmdkey /delete:ome.music.source.bilibili:local 2>$null; cmdkey /delete:ome.music.provider:local 2>$null; exit 0"'

  ; 清理注册表残留
  DeleteRegKey HKCU "Software\com.ome.music"
  DeleteRegKey HKCU "Software\Classes\com.ome.music"
!macroend
