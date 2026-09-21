$ErrorActionPreference = "SilentlyContinue"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Format-Bytes([double]$Bytes) {
  if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
  if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
  if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
  return "{0:N0} B" -f $Bytes
}

function Get-PathSize($Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0L }
  $Item = Get-Item -LiteralPath $Path -Force
  if (-not $Item.PSIsContainer) { return [int64]$Item.Length }
  return [int64]((Get-ChildItem -LiteralPath $Path -Recurse -Force -File | Measure-Object Length -Sum).Sum)
}

function New-SizeRow($Label, $Path) {
  $Bytes = Get-PathSize $Path
  [pscustomobject]@{
    Label = $Label
    Size  = Format-Bytes $Bytes
    Bytes = $Bytes
    Path  = $Path
  }
}

function Get-TopFiles($Root, $Limit = 20) {
  if (-not (Test-Path -LiteralPath $Root)) { return @() }
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File |
    Sort-Object Length -Descending |
    Select-Object -First $Limit |
    ForEach-Object {
      [pscustomobject]@{
        Size = Format-Bytes $_.Length
        Path = $_.FullName
      }
    }
}

function Get-TopDirs($Root, $Limit = 20) {
  if (-not (Test-Path -LiteralPath $Root)) { return @() }
  $Dirs = @(Get-Item -LiteralPath $Root -Force) + @(Get-ChildItem -LiteralPath $Root -Recurse -Force -Directory)
  $Dirs |
    ForEach-Object {
      $Bytes = Get-PathSize $_.FullName
      [pscustomobject]@{
        Size  = Format-Bytes $Bytes
        Bytes = $Bytes
        Path  = $_.FullName
      }
    } |
    Sort-Object Bytes -Descending |
    Select-Object -First $Limit |
    Select-Object Size, Path
}

$Rows = @(
  New-SizeRow "Project total" $ProjectRoot
  New-SizeRow "node_modules" (Join-Path $ProjectRoot "node_modules")
  New-SizeRow "src-tauri/target" (Join-Path $ProjectRoot "src-tauri\target")
  New-SizeRow "src-tauri/target/debug" (Join-Path $ProjectRoot "src-tauri\target\debug")
  New-SizeRow "src-tauri/target/release" (Join-Path $ProjectRoot "src-tauri\target\release")
  New-SizeRow "dist" (Join-Path $ProjectRoot "dist")
  New-SizeRow "artifacts" (Join-Path $ProjectRoot "artifacts")
  New-SizeRow "src" (Join-Path $ProjectRoot "src")
  New-SizeRow "src-tauri/src" (Join-Path $ProjectRoot "src-tauri\src")
)

"=== Ome Music Size Audit ==="
$Rows | Sort-Object Bytes -Descending | Format-Table Label, Size, Path -AutoSize

"=== User Data Hints ==="
@(
  Join-Path $env:APPDATA "com.ome.music"
  Join-Path $env:LOCALAPPDATA "com.ome.music"
  Join-Path $env:APPDATA "ome"
) | ForEach-Object {
  New-SizeRow "User data" $_
} | Sort-Object Bytes -Descending | Format-Table Label, Size, Path -AutoSize

"=== Top Directories ==="
Get-TopDirs $ProjectRoot 20 | Format-Table -AutoSize

"=== Top Files ==="
Get-TopFiles $ProjectRoot 20 | Format-Table -AutoSize
