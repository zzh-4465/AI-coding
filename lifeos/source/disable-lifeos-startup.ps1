$ErrorActionPreference = "Stop"

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Remove-ItemProperty -Path $runKey -Name "LifeOS" -ErrorAction SilentlyContinue

Write-Host "LifeOS startup disabled."
