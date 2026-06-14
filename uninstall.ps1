[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack v5.18.1 Uninstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack v5.16.1 Uninstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$bambuProcess = Get-Process -Name "bambustudio" -ErrorAction SilentlyContinue
if ($bambuProcess) {
    Write-Host "  [!] BambuStudio is running. Please close it first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$bambuDir = $null
$searchPaths = @(
    "C:\Program Files\Bambu Studio",
    "C:\Program Files (x86)\Bambu Studio",
    "D:\Program Files\Bambu Studio",
    "D:\Bambu Studio"
)

foreach ($p in $searchPaths) {
    if ((Test-Path "$p\resources\profiles\Snapmaker.json") -or (Test-Path "$p\resources\profiles\Snapmaker") -or (Test-Path "$p\bridge")) {
        $bambuDir = $p
        break
    }
}

if (-not $bambuDir) {
    Write-Host "  [!] Cannot auto-detect BambuStudio installation." -ForegroundColor Yellow
    Write-Host ""
    $input = Read-Host "  Enter BambuStudio install path"
    $bambuDir = $input.Trim('"').Trim()
}

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
$portProc = Get-NetTCPConnection -LocalPort 13628 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" } | Select-Object -First 1
if ($portProc) {
    try {
        Stop-Process -Id $portProc.OwningProcess -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 500
        Write-Host "  Stopped Bridge process (PID $($portProc.OwningProcess))" -ForegroundColor DarkGray
    } catch {
        try {
            Start-Process powershell -Verb RunAs -ArgumentList "-Command Stop-Process -Id $($portProc.OwningProcess) -Force" -Wait
            Start-Sleep -Milliseconds 500
            Write-Host "  Stopped Bridge process (elevated)" -ForegroundColor DarkGray
        } catch {
            Write-Host "  [!] Failed to stop Bridge process. Please stop it manually." -ForegroundColor Yellow
        }
    }
} else {
    $bridgeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($bridgeProc) {
        foreach ($bp in $bridgeProc) { try { Stop-Process -Id $bp.Id -Force -ErrorAction SilentlyContinue } catch {} }
        Write-Host "  Stopped node process(es)" -ForegroundColor DarkGray
    }
}

$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = "$startupFolder\BambuStudio Bridge.lnk"
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "  Removed startup shortcut" -ForegroundColor Green
}

# Remove watchdog scheduled task
$watchdogTask = Get-ScheduledTask -TaskName "BambuStudio Bridge Watchdog" -ErrorAction SilentlyContinue
if ($watchdogTask) {
    Unregister-ScheduledTask -TaskName "BambuStudio Bridge Watchdog" -Confirm:$false
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
$cacheDir = "$env:APPDATA\BambuStudioBeta\system\Snapmaker"
$cacheVendor = "$env:APPDATA\BambuStudioBeta\system\Snapmaker.json"
if (Test-Path $cacheDir) { Remove-Item $cacheDir -Recurse -Force }
if (Test-Path $cacheVendor) { Remove-Item $cacheVendor -Force }
Write-Host "  [OK] System cache cleared" -ForegroundColor Green
Write-Host "  Note: User custom presets are preserved" -ForegroundColor DarkGray

Write-Host "  [6/7] Cleaning BambuStudio.conf..." -ForegroundColor White
$confPath = "$env:APPDATA\BambuStudioBeta\BambuStudio.conf"
if (Test-Path $confPath) {
    try {
        $confRaw = [System.IO.File]::ReadAllText($confPath, [System.Text.UTF8Encoding]::new($false))
        $conf = $confRaw | ConvertFrom-Json
        $changed = $false

        if ($conf.filaments) {
            $filamentList = @($conf.filaments)
            $cleanedList = @($filamentList | Where-Object {
                $_ -notmatch '@U1' -and $_ -notmatch '^Snapmaker '
            })
            if ($cleanedList.Count -ne $filamentList.Count) {
                $conf.filaments = $cleanedList
                $changed = $true
            }
        }

        if ($conf.nozzle_volume_types) {
            $keysToRemove = @($conf.nozzle_volume_types.PSObject.Properties | Where-Object { $_.Name -match 'Snapmaker' })
            foreach ($key in $keysToRemove) {
                $conf.nozzle_volume_types.PSObject.Properties.Remove($key.Name)
                $changed = $true
            }
        }

        if ($changed) {
            Copy-Item $confPath "$confPath.bak" -Force
            $jsonOutput = $conf | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($confPath, $jsonOutput, [System.Text.UTF8Encoding]::new($false))
            Write-Host "  [OK] Cleaned Snapmaker cache entries (backup: .bak)" -ForegroundColor Green
        } else {
            Write-Host "  [--] No Snapmaker cache entries found" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  [!] Failed to parse BambuStudio.conf, skipping (user data preserved)" -ForegroundColor Yellow
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
