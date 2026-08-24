Import-Module "$PSScriptRoot\install-common.psm1"
Set-ConsoleUtf8

$AutoConfirm = $false
if ($args -contains "-y" -or $args -contains "--yes" -or $args -contains "-AutoConfirm") {
    $AutoConfirm = $true
}

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack v5.46.0 Reinstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack v5.46.0 - Reinstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Assert-BambuStudioNotRunning
} catch {
    exit 1
}

$pkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "  [1/10] Detecting BambuStudio..." -ForegroundColor White
$bambuDir = Find-BambuStudioDir -DetectionMode Install

if (-not (Test-Path "$bambuDir\resources\profiles")) {
    Write-Host "  [X] Invalid path: $bambuDir" -ForegroundColor Red
    Write-Host "  The 'resources\profiles' directory was not found." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  Found: $bambuDir" -ForegroundColor Green
$profilesDir = "$bambuDir\resources\profiles"
Write-Host ""

if ($AutoConfirm) {
    Write-Host "  Auto-confirmed." -ForegroundColor DarkGray
} else {
    $confirm = Read-Host "  Reinstall Snapmaker U1 profiles + Bridge Server? (Y/N)"
    if ($confirm -ne "Y" -and $confirm -ne "y") {
        Write-Host "  Cancelled." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 0
    }
}

Write-Host ""

Write-Host "  [2/10] Stopping Bridge Server..." -ForegroundColor White
# Stop watchdog FIRST — otherwise it will respawn bridge mid-reinstall and cause file-lock conflicts
$watchdogTaskName = "BambuStudio Bridge Watchdog"
$watchdogTask = Get-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
if ($watchdogTask) {
    try {
        Stop-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "  Stopped and unregistered watchdog task (will re-register after reinstall)" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Failed to stop watchdog task: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No watchdog task found (OK)" -ForegroundColor DarkGray
}

$stopped = Stop-BridgeProcess
if (-not $stopped) {
    Write-Host "  No Bridge process on port 13628 (OK)" -ForegroundColor DarkGray
}

Write-Host "  [3/10] Removing old profiles..." -ForegroundColor White
if (Test-Path "$profilesDir\Snapmaker.json") {
    Remove-Item "$profilesDir\Snapmaker.json" -Force
    Write-Host "  Removed Snapmaker.json" -ForegroundColor Green
}
if (Test-Path "$profilesDir\Snapmaker") {
    Remove-Item "$profilesDir\Snapmaker" -Recurse -Force
    Write-Host "  Removed Snapmaker\ directory" -ForegroundColor Green
}
if (-not (Test-Path "$profilesDir\Snapmaker.json") -and -not (Test-Path "$profilesDir\Snapmaker")) {
    Write-Host "  No old profiles found (OK)" -ForegroundColor DarkGray
}

Write-Host "  [4/10] Clearing BambuStudio system cache..." -ForegroundColor White
$cacheExisted = Clear-BambuSystemCache
if ($cacheExisted) {
    Write-Host "  Cleared system cache directory" -ForegroundColor Green
} else {
    Write-Host "  No system cache found (OK)" -ForegroundColor DarkGray
}

Write-Host "  [4/10] Preserving user custom presets..." -ForegroundColor White
$userDirFound = $false
foreach ($cfgDir in (Get-BambuConfigDirs)) { if (Test-Path "$cfgDir\user") { $userDirFound = $true } }
if ($userDirFound) {
    Write-Host "  User presets directory found (preserved)" -ForegroundColor Green
} else {
    Write-Host "  No user presets directory (OK)" -ForegroundColor DarkGray
}

Write-Host "  [5/10] Refreshing BambuStudio.conf cache..." -ForegroundColor White
$result = Clean-SnapmakerEntriesFromConf -ShowRemovedCount
if ($result -eq "Cleaned") {
    Write-Host "  Refreshed filament cache in BambuStudio.conf (backup: .bak)" -ForegroundColor Green
} elseif ($result -eq "NoChange") {
    Write-Host "  No Snapmaker cache to refresh (OK)" -ForegroundColor DarkGray
} else {
    Write-Host "  BambuStudio.conf not found (OK for first install)" -ForegroundColor DarkGray
}

Write-Host "  [6/10] Patching user machine configs (print_host -> Bridge)..." -ForegroundColor White
$patchedCount = Patch-UserMachineConfigs
if ($patchedCount -eq 0) {
    Write-Host "  No user machine configs needed patching (OK)" -ForegroundColor DarkGray
} else {
    Write-Host "  Patched $patchedCount user machine config(s)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  [7/10] Installing profiles..." -ForegroundColor White
try {
    Copy-ProfilesToBambuDir -PkgDir $pkgDir -BambuDir $bambuDir
} catch {
    exit 1
}

Write-Host "  [8/10] Reinstalling Bridge Server (Node.js)..." -ForegroundColor White
$bridgeSrc = "$pkgDir\bridge-node"
$bridgeDst = "$bambuDir\bridge"
$webSrc = "$pkgDir\bridge\web"

if (-not (Test-Path $bridgeSrc)) {
    Write-Host "  Bridge source not found at $bridgeSrc, skipping" -ForegroundColor Yellow
} else {
    try {
        if (Test-Path $bridgeDst) {
            Remove-Item $bridgeDst -Recurse -Force
        }
        Copy-Item $bridgeSrc $bridgeDst -Recurse -Force
        Write-Host "  Bridge files copied to $bridgeDst" -ForegroundColor Green

        if (Test-Path $webSrc) {
            $webDst = "$bridgeDst\web"
            if (Test-Path $webDst) {
                Remove-Item $webDst -Recurse -Force
            }
            Copy-Item $webSrc $webDst -Recurse -Force
            Write-Host "  Web UI files copied to $webDst" -ForegroundColor Green
        } else {
            Write-Host "  [!] Web UI source not found at $webSrc" -ForegroundColor Yellow
        }

        try {
            $nodePath = Resolve-NodePath
        } catch {
            exit 1
        }
        $nodeVersion = & $nodePath --version 2>&1
        Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Green

        Install-NpmDependencies -BridgeDir $bridgeDst -NodePath $nodePath

        $vbsPath = New-BridgeVbsLauncher -NodePath $nodePath -BridgeDir $bridgeDst
        New-BridgeStartupShortcut -VbsPath $vbsPath -BridgeDir $bridgeDst -Updated
    } catch {
        Write-Host "  [!] Bridge reinstall failed: $_" -ForegroundColor Yellow
    }
}

Write-Host "  [9/10] Verifying..." -ForegroundColor White
$vendorOk = Test-Path "$bambuDir\resources\profiles\Snapmaker.json"
$u1Ok = Test-Path "$bambuDir\resources\profiles\Snapmaker\machine\Snapmaker U1.json"
$processOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\process\0.20 Standard @Snapmaker U1.json"
$filamentOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker PLA Basic @U1.json"
$bridgeOk = Test-Path "$bambuDir\bridge\server.js"

if ($vendorOk -and $u1Ok -and $processOk -and $filamentOk) {
    Write-Host "  Profile verification passed!" -ForegroundColor Green
} else {
    Write-Host "  [X] Profile verification failed!" -ForegroundColor Red
}
if ($bridgeOk) {
    Write-Host "  Bridge Server (Node.js): installed" -ForegroundColor Green
}

Write-Host "  [10/10] Starting Bridge Server..." -ForegroundColor White
$vbsPath = "$env:APPDATA\BambuStudio-Bridge\start-hidden.vbs"
if (Test-Path $vbsPath) {
    Start-BridgeAndWait -VbsPath $vbsPath -BambuDir $bambuDir | Out-Null
} else {
    Write-Host "  Bridge launcher not found, skipping auto-start" -ForegroundColor Yellow
}

# Re-register watchdog scheduled task (was unregistered in [2/10] to prevent file-lock conflicts)
try {
    Register-BridgeWatchdog -BridgeDir "$bambuDir\bridge" -ReRegister | Out-Null
} catch {
    Write-Host "  [!] Watchdog task re-registration failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "    Reinstall Successful!" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed:" -ForegroundColor White
Write-Host "    - Snapmaker U1 profiles -> BambuStudio" -ForegroundColor Green
Write-Host "    - Bridge Server (Node.js) -> $bambuDir\bridge\" -ForegroundColor Green
Write-Host "    - Auto-start -> Windows Startup" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Start BambuStudio" -ForegroundColor White
Write-Host "    2. Select Snapmaker U1 printer" -ForegroundColor DarkGray
Write-Host "    3. Slice and click Print -> native dialog will appear" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Bridge auto-detects your printer via mDNS (no manual IP needed)." -ForegroundColor DarkGray
Write-Host "  If auto-detection fails, open http://127.0.0.1:13628 in browser to configure." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Using BambuStudio AWAY from home? Open http://127.0.0.1:13628 ->" -ForegroundColor DarkGray
Write-Host "  gear icon -> Connection, and point it at your home Bridge (Tailscale)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Bridge Server runs automatically on login." -ForegroundColor DarkGray
Write-Host "  Config stored in: %APPDATA%\BambuStudio-Bridge\" -ForegroundColor DarkGray
Write-Host "  Log file: %APPDATA%\BambuStudio-Bridge\bridge.log" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to exit"
