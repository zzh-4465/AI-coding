param(
    [switch]$Startup
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $root "src-tauri\target\release\lifeos.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Cannot find LifeOS release executable. Run: npm.cmd run build or cargo build --release"
}

function New-LifeOSShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$ShortcutPath
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = Split-Path -Parent $exePath
    $shortcut.Description = "Open LifeOS desktop workspace."
    $shortcut.IconLocation = "$exePath,0"
    $shortcut.Save()
}

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "LifeOS.lnk"
New-LifeOSShortcut -ShortcutPath $desktopShortcut
Write-Host "Desktop shortcut created:"
Write-Host $desktopShortcut

if ($Startup) {
    $startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "LifeOS.lnk"
    New-LifeOSShortcut -ShortcutPath $startupShortcut
    Write-Host "Startup shortcut created:"
    Write-Host $startupShortcut
}
