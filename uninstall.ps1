Import-Module "$PSScriptRoot\install-common.psm1"
Set-ConsoleUtf8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack v5.39.0 Uninstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack v5.39.0 Uninstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Assert-BambuStudioNotRunning
} catch {
    exit 1
}

$bambuDir = Find-BambuStudioDir -DetectionMode Uninstall

$profilesDir = "$bambuDir\resources\profiles"
$hasVendor = Test-Path "$profilesDir\Snapmaker.json"
$hasDir = Test-Path "$profilesDir\Snapmaker"
$hasBridge = Test-Path "$bambuDir\bridge"

if (-not $hasVendor -and -not $hasDir -and -not $hasBridge) {
    Write-Host "  [!] Compatibility pack not found, nothing to uninstall." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host "  BambuStudio: $bambuDir" -ForegroundColor Green
Write-Host ""
Write-Host "  Will remove:" -ForegroundColor White
if ($hasVendor) { Write-Host "    - Snapmaker.json" }
if ($hasDir) { Write-Host "    - Snapmaker\ directory" }
if ($hasBridge) { Write-Host "    - Bridge Server (bridge\)" }
Write-Host "    - BambuStudio cache for Snapmaker"
Write-Host "    - Snapmaker references in BambuStudio.conf"
Write-Host "    - Bridge startup shortcut"
Write-Host ""
Write-Host "  This does NOT affect other BambuStudio features." -ForegroundColor DarkGray
Write-Host ""

$confirm = Read-Host "  Uninstall? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "  Cancelled." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""

if ($hasVendor) {
    Write-Host "  [1/7] Removing vendor config..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker.json" -Force
        Write-Host "  [OK] Snapmaker.json removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED - Administrator privileges may be required" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [1/7] Snapmaker.json not found, skipping" -ForegroundColor DarkGray
}

if ($hasDir) {
    Write-Host "  [2/7] Removing profile directory..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker" -Recurse -Force
        Write-Host "  [OK] Snapmaker\ directory removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [2/7] Snapmaker\ directory not found, skipping" -ForegroundColor DarkGray
}

Write-Host "  [3/7] Stopping and removing Bridge Server..." -ForegroundColor White
Stop-BridgeProcess -IncludeNodeProcess | Out-Null

Remove-BridgeStartupShortcut | Out-Null

# Remove watchdog scheduled task
$watchdogRemoved = Unregister-BridgeWatchdog
if ($watchdogRemoved) {
    Write-Host "  Removed watchdog scheduled task" -ForegroundColor Green
}

if ($hasBridge) {
    try {
        Remove-Item "$bambuDir\bridge" -Recurse -Force
        Write-Host "  [OK] Bridge directory removed" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Failed to remove bridge directory: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Bridge directory not found, skipping" -ForegroundColor DarkGray
}

# Cleanup old files in Program Files (from v3.x)
$oldVbsInBambu = "$bambuDir\bridge\start-hidden.vbs"
if (Test-Path $oldVbsInBambu) {
    try {
        Remove-Item $oldVbsInBambu -Force -ErrorAction SilentlyContinue
    } catch { }
}

Write-Host "  [4/7] Cleaning Bridge APPDATA..." -ForegroundColor White
$bridgeConfigDir = "$env:APPDATA\BambuStudio-Bridge"
if (Test-Path $bridgeConfigDir) {
    try {
        Remove-Item $bridgeConfigDir -Recurse -Force
        Write-Host "  [OK] Bridge APPDATA removed" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Failed to remove APPDATA: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Bridge APPDATA not found, skipping" -ForegroundColor DarkGray
}

Write-Host "  [5/7] Clearing BambuStudio system cache..." -ForegroundColor White
Clear-BambuSystemCache | Out-Null
Write-Host "  [OK] System cache cleared" -ForegroundColor Green
Write-Host "  Note: User custom presets are preserved" -ForegroundColor DarkGray

Write-Host "  [6/7] Cleaning BambuStudio.conf..." -ForegroundColor White
$confPath = "$env:APPDATA\BambuStudioBeta\BambuStudio.conf"
if (Test-Path $confPath) {
    $result = Clean-SnapmakerEntriesFromConf
    if ($result -eq "Cleaned") {
        Write-Host "  [OK] Cleaned Snapmaker cache entries (backup: .bak)" -ForegroundColor Green
    } elseif ($result -eq "NoChange") {
        Write-Host "  [--] No Snapmaker cache entries found" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  [--] BambuStudio.conf not found" -ForegroundColor DarkGray
}

Write-Host "  [7/7] Verifying..." -ForegroundColor White
$vendorGone = -not (Test-Path "$profilesDir\Snapmaker.json")
$dirGone = -not (Test-Path "$profilesDir\Snapmaker")
$bridgeGone = -not (Test-Path "$bambuDir\bridge")

if ($vendorGone -and $dirGone -and $bridgeGone) {
    Write-Host "  Verification passed!" -ForegroundColor Green
} else {
    Write-Host "  [!] Some files may remain (check manually)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Uninstall complete! Please restart BambuStudio." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
