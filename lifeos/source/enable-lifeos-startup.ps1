$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $root "src-tauri\target\release\lifeos.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Cannot find LifeOS release executable. Run: npm.cmd run build or cargo build --release"
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (-not (Test-Path -LiteralPath $runKey)) {
    New-Item -Path $runKey -Force | Out-Null
}
Set-ItemProperty -Path $runKey -Name "LifeOS" -Value "`"$exePath`""

Write-Host "LifeOS startup enabled for current user:"
Write-Host $exePath
