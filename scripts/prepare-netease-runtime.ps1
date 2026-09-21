param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$nodeVersion = "22.17.1"
$nodeSha256 = "b1fdb5635ba860f6bf71474f2ca882459a582de49b1d869451e3ad188e3943eb"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resourcesRoot = Join-Path $projectRoot "src-tauri\resources"
$nodeDir = Join-Path $resourcesRoot "node"
$runtimeDir = Join-Path $resourcesRoot "netease-runtime"
$nodeExe = Join-Path $nodeDir "node.exe"
$apiEntry = Join-Path $runtimeDir "node_modules\NeteaseCloudMusicApi\app.js"
$nodeZip = Join-Path $projectRoot "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
$extractDir = Join-Path $projectRoot ".node-runtime"

if (-not $Force -and (Test-Path $nodeExe) -and (Test-Path $apiEntry)) {
  Write-Host "Managed NetEase runtime is already prepared."
  exit 0
}

New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (-not (Test-Path (Join-Path $runtimeDir "package-lock.json"))) {
  throw "Managed runtime lockfile is missing: src-tauri/resources/netease-runtime/package-lock.json"
}

Write-Host "Preparing managed NetEase runtime for Windows release..."

if (-not (Test-Path $nodeZip) -or $Force) {
  Write-Host "Downloading Node.js $nodeVersion runtime..."
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
      return ([System.BitConverter]::ToString($hashBytes) -replace "-", "").ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$actualHash = Get-Sha256Hex -Path $nodeZip
if ($actualHash -ne $nodeSha256.ToLowerInvariant()) {
  throw "Node.js archive SHA256 mismatch. Expected $nodeSha256 but got $actualHash."
}

Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
Expand-Archive -Path $nodeZip -DestinationPath $extractDir -Force
Copy-Item (Join-Path $extractDir "node-v$nodeVersion-win-x64\node.exe") $nodeExe -Force

Write-Host "Installing pinned NetEase Cloud Music runtime..."
npm ci --omit=dev --prefix $runtimeDir

if (-not (Test-Path $nodeExe)) {
  throw "Bundled node.exe was not prepared."
}
if (-not (Test-Path $apiEntry)) {
  throw "NeteaseCloudMusicApi app.js was not prepared."
}

Write-Host "Managed NetEase runtime is ready."
