# Ome Music perf baseline sampler (Phase 0/1A measurement infrastructure).
# Samples the app process tree (main exe + WebView2 children + NetEase node sidecar)
# and appends one CSV row per interval. CPU% is computed from CPU-time deltas and is
# normalized against logical core count (100% == all cores busy).
#
# Usage:
#   powershell -NoProfile -File scripts/perf/perf-sampler.ps1 -Scenario idle -DurationSec 600 -OutCsv <csv>
#   powershell -NoProfile -File scripts/perf/perf-sampler.ps1 -Scenario netease-soak -DurationSec 0 -OutCsv <csv>
#     (DurationSec 0 keeps sampling until stopped with Ctrl+C)
param(
  [Parameter(Mandatory = $true)][string]$Scenario,
  [Parameter(Mandatory = $true)][string]$OutCsv,
  [int]$IntervalSec = 10,
  [int]$DurationSec = 0,
  [string]$MainProcPattern = '^ome',
  [string]$WebviewMarker = 'com\.ome\.music',
  [string]$SidecarMarker = 'netease-runtime'
)

$ErrorActionPreference = 'SilentlyContinue'
$logicalCores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum

Add-Type -Namespace Native -Name Win32 -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsIconic(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
"@
# SW_RESTORE: keep the window visible during soaks; WebView2 throttles timers when
# minimized, which would corrupt CPU/rAF measurements. Restores remain visible in the data
# because the win_minimized flag is sampled right after the restore attempt.
$AutoRestore = $true

if (-not (Test-Path $OutCsv)) {
  "timestamp,scenario,main_pid,win_minimized,main_ws_mb,main_priv_mb,main_cpu_pct,webview_ws_mb,webview_priv_mb,webview_cpu_pct,webview_procs,sidecar_ws_mb,sidecar_cpu_pct,sys_avail_mb" |
    Out-File -FilePath $OutCsv -Encoding utf8
}

function Get-Sample {
  $procs = Get-CimInstance Win32_Process
  $main = @($procs | Where-Object { $_.Name -match $MainProcPattern })
  $webview = @($procs | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match $WebviewMarker })
  $sidecar = @($procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match $SidecarMarker })

  $privMap = @{}
  Get-Process | ForEach-Object { $privMap[$_.Id] = $_.PrivateMemorySize64 }

  [pscustomobject]@{
    main    = $main
    webview = $webview
    sidecar = $sidecar
    privMap = $privMap
  }
}

function Sum-Mem($list, $privMap) {
  $ws = 0; $priv = 0
  foreach ($p in $list) {
    $ws += [int64]$p.WorkingSetSize
    if ($privMap.ContainsKey([int]$p.ProcessId)) { $priv += [int64]$privMap[[int]$p.ProcessId] }
  }
  [pscustomobject]@{ wsMb = [math]::Round($ws / 1MB, 1); privMb = [math]::Round($priv / 1MB, 1) }
}

function CpuSecOf($list) {
  $t = 0.0
  foreach ($p in $list) { $t += ([double]$p.UserModeTime + [double]$p.KernelModeTime) / 1e7 }
  return $t
}

$prevCpu = $null
$startTime = Get-Date
while ($true) {
  $elapsedTotal = ((Get-Date) - $startTime).TotalSeconds
  if ($DurationSec -gt 0 -and $elapsedTotal -ge $DurationSec) { break }

  $s = Get-Sample
  $winMin = ''
  if ($s.main.Count -gt 0) {
    $hwnd = (Get-Process -Id $s.main[0].ProcessId).MainWindowHandle
    $winMin = if ([Native.Win32]::IsIconic($hwnd)) { '1' } else { '0' }
    if ($AutoRestore -and $winMin -eq '1') {
      [Native.Win32]::ShowWindowAsync($hwnd, 9) | Out-Null
      Start-Sleep -Milliseconds 300
      $winMin = if ([Native.Win32]::IsIconic($hwnd)) { '1' } else { '0' }
    }
  }
  $mainMem = Sum-Mem $s.main $s.privMap
  $webMem = Sum-Mem $s.webview $s.privMap
  $sideMem = Sum-Mem $s.sidecar $s.privMap
  $sysAvailMb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)

  $cpuMain = CpuSecOf $s.main
  $cpuWeb = CpuSecOf $s.webview
  $cpuSide = CpuSecOf $s.sidecar

  $pctMain = ''; $pctWeb = ''; $pctSide = ''
  if ($null -ne $prevCpu) {
    $frac = $IntervalSec * $logicalCores
    $pctMain = [math]::Round((($cpuMain - $prevCpu[0]) / $frac) * 100, 2)
    $pctWeb = [math]::Round((($cpuWeb - $prevCpu[1]) / $frac) * 100, 2)
    $pctSide = [math]::Round((($cpuSide - $prevCpu[2]) / $frac) * 100, 2)
  }
  $prevCpu = @($cpuMain, $cpuWeb, $cpuSide)

  $mainPid = if ($s.main.Count -gt 0) { $s.main[0].ProcessId } else { '' }
  "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')),$Scenario,$mainPid,$winMin,$($mainMem.wsMb),$($mainMem.privMb),$pctMain,$($webMem.wsMb),$($webMem.privMb),$pctWeb,$($s.webview.Count),$($sideMem.wsMb),$pctSide,$sysAvailMb" |
    Add-Content -Path $OutCsv

  Start-Sleep -Seconds $IntervalSec
}
