# install-common.psm1 - Shared functions for install.ps1 / reinstall.ps1 / uninstall.ps1
# Snapmaker U1 BambuStudio Compatibility Pack v5.46.0
#
# Convention: functions that originally did `exit 1` now `throw` after printing the
# user-facing message + Read-Host pause. Callers wrap with `try { ... } catch { exit 1 }`
# to turn the throw into a clean exit, preserving original output exactly.

# ==============================================================================
# 1. Set-ConsoleUtf8 - UTF-8 console encoding (identical in all 3 scripts)
# ==============================================================================
function Set-ConsoleUtf8 {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
}

# ==============================================================================
# 2. Assert-BambuStudioNotRunning - refuse to run while BambuStudio is open
# ==============================================================================
function Assert-BambuStudioNotRunning {
    $bambuProcess = Get-Process -Name "bambustudio" -ErrorAction SilentlyContinue
    if ($bambuProcess) {
        Write-Host "  [!] BambuStudio is running. Please close it first." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        throw "BambuStudio is running"
    }
}

# ==============================================================================
# 3. Find-BambuStudioDir - detect install path (parameterized detection condition)
#    -DetectionMode Install   : match by existence of resources\profiles
#    -DetectionMode Uninstall : match by any compat-pack artifact (Snapmaker.json / Snapmaker / bridge)
#    Returns the detected or user-entered path. Install-mode path validity
#    (resources\profiles) is validated by the caller.
# ==============================================================================
function Find-BambuStudioDir {
    param([string]$DetectionMode = "Install")
    $bambuDir = $null
    $searchPaths = @(
        "C:\Program Files\Bambu Studio",
        "C:\Program Files (x86)\Bambu Studio",
        "D:\Program Files\Bambu Studio",
        "D:\Bambu Studio"
    )

    foreach ($p in $searchPaths) {
        if ($DetectionMode -eq "Uninstall") {
            if ((Test-Path "$p\resources\profiles\Snapmaker.json") -or (Test-Path "$p\resources\profiles\Snapmaker") -or (Test-Path "$p\bridge")) {
                $bambuDir = $p
                break
            }
        } else {
            if (Test-Path "$p\resources\profiles") {
                $bambuDir = $p
                break
            }
        }
    }

    if (-not $bambuDir) {
        Write-Host "  [!] Cannot auto-detect BambuStudio installation." -ForegroundColor Yellow
        if ($DetectionMode -ne "Uninstall") {
            Write-Host "  Common paths checked:" -ForegroundColor DarkGray
            foreach ($p in $searchPaths) {
                Write-Host "    - $p" -ForegroundColor DarkGray
            }
        }
        Write-Host ""
        $input = Read-Host "  Enter BambuStudio install path"
        $bambuDir = $input.Trim('"').Trim()
    }

    return $bambuDir
}

# ==============================================================================
# 3b. Get-BambuConfigDirs - BambuStudio per-user config directories.
#     Release channel uses %APPDATA%\BambuStudio, beta uses BambuStudioBeta
#     (v5.46.0: release channel was previously missed entirely). Returns the
#     EXISTING dirs (both when present); empty array on a clean first install.
# ==============================================================================
function Get-BambuConfigDirs {
    $dirs = @()
    foreach ($name in @("BambuStudio", "BambuStudioBeta")) {
        $d = "$env:APPDATA\$name"
        if (Test-Path $d) { $dirs += $d }
    }
    return $dirs
}

# ==============================================================================
# 4. Clear-BambuSystemCache - remove system Snapmaker cache dir + vendor json
#     Returns $true if the cache directory existed (and was removed).
# ==============================================================================
function Clear-BambuSystemCache {
    $existed = $false
    foreach ($dir in (Get-BambuConfigDirs)) {
        $cacheDir = "$dir\system\Snapmaker"
        $cacheVendor = "$dir\system\Snapmaker.json"
        if (Test-Path $cacheDir) {
            Remove-Item $cacheDir -Recurse -Force
            $existed = $true
        }
        if (Test-Path $cacheVendor) {
            Remove-Item $cacheVendor -Force
        }
    }
    return $existed
}

# ==============================================================================
# 5. Clean-SnapmakerEntriesFromConf - clean Snapmaker/U1 entries from
#    BambuStudio.conf in EVERY existing config dir (v5.46.0: release channel
#    BambuStudio + beta BambuStudioBeta).
#    -ShowRemovedCount : print the "Removed N cached filament entries" diagnostic line.
#    Returns "Cleaned" | "NoChange" | "NoConf". Caller prints the outcome message.
# ==============================================================================
function Clean-SnapmakerEntriesFromConf {
    param([switch]$ShowRemovedCount)
    $anyCleaned = $false
    $anyConf = $false
    foreach ($dir in (Get-BambuConfigDirs)) {
        $confPath = "$dir\BambuStudio.conf"
        if (-not (Test-Path $confPath)) { continue }
        $anyConf = $true
        if ((Clean-SnapmakerConfFile -ConfPath $confPath -ShowRemovedCount:$ShowRemovedCount) -eq "Cleaned") {
            $anyCleaned = $true
        }
    }
    if ($anyCleaned) { return "Cleaned" }
    if ($anyConf) { return "NoChange" }
    return "NoConf"
}

# 5b. Clean-SnapmakerConfFile - single-file worker for Clean-SnapmakerEntriesFromConf.
#     Unified: always attempts regex fallback on JSON parse failure (install had it,
#     reinstall/uninstall did not - unified for robustness).
#     Returns "Cleaned" | "NoChange" | "Failed".
function Clean-SnapmakerConfFile {
    param(
        [Parameter(Mandatory)][string]$ConfPath,
        [switch]$ShowRemovedCount
    )
    $confPath = $ConfPath
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
                if ($ShowRemovedCount) {
                    $removedCount = $filamentList.Count - $cleanedList.Count
                    Write-Host "  Removed $removedCount cached filament entries (will be re-discovered on startup)" -ForegroundColor DarkGray
                }
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
            return "Cleaned"
        } else {
            return "NoChange"
        }
    } catch {
        Write-Host "  [!] Failed to parse BambuStudio.conf: $_" -ForegroundColor Yellow
        Write-Host "  Falling back to regex-based cleanup..." -ForegroundColor Yellow
        try {
            $confContent = [System.IO.File]::ReadAllText($confPath, [System.Text.UTF8Encoding]::new($false))
            $confContent = $confContent -replace '(?m)^\s*"[^"]*@U1"\s*,?\s*$', ''
            $confContent = $confContent -replace '(?m)^\s*"Snapmaker (PLA|PLA Basic|PLA Matte|PLA Silk|PLA SnapSpeed|PLA-CF|PETG|PETG HF|ABS|TPU|TPU 90A|TPU 95A HF)[^"]*"\s*,?\s*$', ''
            $confContent = $confContent -replace '"Snapmaker U1 \([^)]+\)":\s*"[^"]*",?\s*', ''
            $confContent = $confContent -replace ',(\s*\])', '$1'
            $confContent = $confContent -replace ',(\s*\})', '$1'
            $confContent = $confContent -replace '(\r?\n){3,}', "`n`n"
            [System.IO.File]::WriteAllText($confPath, $confContent, [System.Text.UTF8Encoding]::new($false))
            Write-Host "  Cleaned via regex fallback" -ForegroundColor Yellow
            return "Cleaned"
        } catch {
            Write-Host "  [!] Regex fallback also failed. Manual cleanup may be needed." -ForegroundColor Red
            return "Failed"
        }
    }
}

# ==============================================================================
# 6. Stop-BridgeProcess - stop the Bridge process listening on port 13628
#    -IncludeNodeProcess : if no port listener is found, also kill stray node processes
#                          (uninstall fallback). Prints stop messages and returns $true
#                          if a process was stopped.
# ==============================================================================
function Stop-BridgeProcess {
    param([switch]$IncludeNodeProcess)
    $portProc = Get-NetTCPConnection -LocalPort 13628 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" } | Select-Object -First 1
    if ($portProc) {
        try {
            Stop-Process -Id $portProc.OwningProcess -Force -ErrorAction Stop
            Start-Sleep -Milliseconds 500
            Write-Host "  Stopped Bridge process (PID $($portProc.OwningProcess))" -ForegroundColor Green
            return $true
        } catch {
            try {
                Start-Process powershell -Verb RunAs -ArgumentList "-Command Stop-Process -Id $($portProc.OwningProcess) -Force" -Wait
                Start-Sleep -Milliseconds 500
                Write-Host "  Stopped Bridge process (elevated, PID $($portProc.OwningProcess))" -ForegroundColor Green
                return $true
            } catch {
                Write-Host "  [!] Failed to stop Bridge process. Please stop it manually." -ForegroundColor Yellow
                return $false
            }
        }
    } elseif ($IncludeNodeProcess) {
        $bridgeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue
        if ($bridgeProc) {
            foreach ($bp in $bridgeProc) { try { Stop-Process -Id $bp.Id -Force -ErrorAction SilentlyContinue } catch {} }
            Write-Host "  Stopped node process(es)" -ForegroundColor DarkGray
            return $true
        }
    }
    return $false
}

# ==============================================================================
# 7. Register-BridgeWatchdog / Unregister-BridgeWatchdog - watchdog scheduled task
# ==============================================================================
function Register-BridgeWatchdog {
    param(
        [Parameter(Mandatory)][string]$BridgeDir,
        [switch]$ReRegister
    )
    $watchdogSrc = Join-Path $BridgeDir "watchdog.ps1"
    if (-not (Test-Path $watchdogSrc)) { return $false }

    $taskName = "BambuStudio Bridge Watchdog"
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogSrc`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Auto-restart BambuStudio Bridge if it crashes" -Force | Out-Null
    if ($ReRegister) {
        Write-Host "  Re-registered watchdog task (checks every 2 min)" -ForegroundColor Green
    } else {
        Write-Host "  Registered watchdog task (checks every 2 min)" -ForegroundColor Green
    }
    return $true
}

function Unregister-BridgeWatchdog {
    $taskName = "BambuStudio Bridge Watchdog"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { return $false }
    try {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    } catch { }
    return $true
}

# ==============================================================================
# 8. Resolve-NodePath - locate Node.js, auto-download+install if missing
#    Returns the node.exe path. On fatal failure, prints message + Read-Host pause
#    then throws (caller does `try { ... } catch { exit 1 }`).
# ==============================================================================
function Resolve-NodePath {
    $nodeExe = Get-Command node -ErrorAction SilentlyContinue
    $nodePath = $null
    if ($nodeExe) {
        $nodePath = $nodeExe.Source
        Write-Host "  Node.js found: $nodePath" -ForegroundColor Green
    } else {
        Write-Host "  Node.js not in PATH, searching common locations..." -ForegroundColor Yellow
        $nodeSearchPaths = @(
            "C:\Program Files\nodejs\node.exe",
            "C:\Program Files (x86)\nodejs\node.exe",
            "${env:ProgramFiles}\nodejs\node.exe",
            "${env:LOCALAPPDATA}\Programs\nodejs\node.exe",
            "$env:USERPROFILE\AppData\Roaming\nvm\v*\node.exe"
        )
        foreach ($sp in $nodeSearchPaths) {
            $resolved = Resolve-Path $sp -ErrorAction SilentlyContinue
            if ($resolved) {
                $nodePath = $resolved[0].Path
                break
            }
            if (Test-Path $sp) {
                $nodePath = $sp
                break
            }
        }
        if ($nodePath) {
            Write-Host "  Node.js found: $nodePath" -ForegroundColor Green
        }
    }

    if (-not $nodePath) {
        Write-Host ""
        Write-Host "  [X] Node.js is required but not installed!" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Please install Node.js LTS from: https://nodejs.org" -ForegroundColor White
        Write-Host "  After installing Node.js, run this installer again." -ForegroundColor White
        Write-Host ""
        $dlChoice = Read-Host "  Auto-download Node.js LTS installer? (Y/N)"
        if ($dlChoice -eq "Y" -or $dlChoice -eq "y") {
            Write-Host "  Downloading Node.js LTS..." -ForegroundColor White
            $nodeMsi = "$env:TEMP\node-lts.msi"
            try {
                Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/" -UseBasicParsing -TimeoutSec 10 | Out-Null
                $latestUrl = "https://nodejs.org/dist/latest-v22.x/"
                $page = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing -TimeoutSec 15
                $msiMatch = [regex]::Match($page.Content, 'node-v22\.\d+\.\d+-x64\.msi')
                if ($msiMatch.Success) {
                    $msiUrl = "${latestUrl}$($msiMatch.Value)"
                    Write-Host "  Downloading $($msiMatch.Value)..." -ForegroundColor White
                    Invoke-WebRequest -Uri $msiUrl -OutFile $nodeMsi -UseBasicParsing -TimeoutSec 120
                    Write-Host "  Downloaded to $nodeMsi" -ForegroundColor Green
                    Write-Host "  Launching Node.js installer..." -ForegroundColor White
                    Start-Process msiexec.exe -ArgumentList "/i", "`"$nodeMsi`"", "/qn", "/norestart" -Verb RunAs -Wait
                    $nodeExe2 = Get-Command node -ErrorAction SilentlyContinue
                    if ($nodeExe2) {
                        $nodePath = $nodeExe2.Source
                        Write-Host "  Node.js installed: $nodePath" -ForegroundColor Green
                    } else {
                        $fallbackPath = "C:\Program Files\nodejs\node.exe"
                        if (Test-Path $fallbackPath) {
                            $nodePath = $fallbackPath
                            Write-Host "  Node.js installed: $nodePath" -ForegroundColor Green
                        } else {
                            Write-Host "  [X] Node.js installation may have failed." -ForegroundColor Red
                            Write-Host "  Please install manually from https://nodejs.org and rerun." -ForegroundColor Red
                            Read-Host "Press Enter to exit"
                            throw "NodeInstallFailed"
                        }
                    }
                } else {
                    Write-Host "  [X] Could not determine latest Node.js version." -ForegroundColor Red
                    Write-Host "  Please install manually from https://nodejs.org and rerun." -ForegroundColor Red
                    Read-Host "Press Enter to exit"
                    throw "NodeVersionUnknown"
                }
            } catch {
                Write-Host "  [X] Download failed: $_" -ForegroundColor Red
                Write-Host "  Please install Node.js manually from https://nodejs.org and rerun." -ForegroundColor Red
                Read-Host "Press Enter to exit"
                throw "NodeDownloadFailed"
            }
        } else {
            Read-Host "Press Enter to exit"
            throw "NodeDeclined"
        }
    }

    return $nodePath
}

# ==============================================================================
# 9. Install-NpmDependencies - run `npm install --production` in the bridge dir
# ==============================================================================
function Install-NpmDependencies {
    param(
        [Parameter(Mandatory)][string]$BridgeDir,
        [Parameter(Mandatory)][string]$NodePath
    )
    Write-Host "  Installing npm dependencies..." -ForegroundColor White
    try {
        Push-Location $BridgeDir
        $npmCmd = Join-Path (Split-Path $NodePath) 'npm.cmd'
        & $npmCmd install --production 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        Pop-Location
        Write-Host "  npm dependencies installed" -ForegroundColor Green
    } catch {
        Pop-Location
        Write-Host "  [!] npm install failed: $_" -ForegroundColor Yellow
        Write-Host "  You may need to run 'npm install' manually in $BridgeDir" -ForegroundColor Yellow
    }
}

# ==============================================================================
# 10. New-BridgeVbsLauncher - create the hidden VBS launcher, returns its path
# ==============================================================================
function New-BridgeVbsLauncher {
    param(
        [Parameter(Mandatory)][string]$NodePath,
        [Parameter(Mandatory)][string]$BridgeDir
    )
    $bridgeConfigDir = "$env:APPDATA\BambuStudio-Bridge"
    if (-not (Test-Path $bridgeConfigDir)) {
        New-Item -ItemType Directory -Path $bridgeConfigDir -Force | Out-Null
    }

    $vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
nodePath = "$NodePath"
scriptPath = "$BridgeDir\server.js"
WshShell.Run """" & nodePath & """ """ & scriptPath & """", 0, False
"@
    $vbsPath = "$bridgeConfigDir\start-hidden.vbs"
    [System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::Unicode)
    Write-Host "  Created hidden launcher: $vbsPath" -ForegroundColor Green
    Write-Host "  Node.exe path in launcher: $NodePath" -ForegroundColor DarkGray
    return $vbsPath
}

# ==============================================================================
# 11. New-BridgeStartupShortcut / Remove-BridgeStartupShortcut
# ==============================================================================
function New-BridgeStartupShortcut {
    param(
        [Parameter(Mandatory)][string]$VbsPath,
        [Parameter(Mandatory)][string]$BridgeDir,
        [switch]$Updated
    )
    $startupFolder = [System.Environment]::GetFolderPath('Startup')
    $shortcutPath = "$startupFolder\BambuStudio Bridge.lnk"
    $WScriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$VbsPath`""
    $shortcut.WorkingDirectory = $BridgeDir
    $shortcut.Description = "BambuStudio Bridge Server"
    $shortcut.Save()
    if ($Updated) {
        Write-Host "  Updated startup shortcut" -ForegroundColor Green
    } else {
        Write-Host "  Created startup shortcut: $shortcutPath" -ForegroundColor Green
    }
}

function Remove-BridgeStartupShortcut {
    $startupFolder = [System.Environment]::GetFolderPath('Startup')
    $shortcutPath = "$startupFolder\BambuStudio Bridge.lnk"
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force
        Write-Host "  Removed startup shortcut" -ForegroundColor Green
        return $true
    }
    return $false
}

# ==============================================================================
# 12. Start-BridgeAndWait - launch Bridge via VBS + verify port 13628 listening
#     -StopExistingFirst : stop an existing Bridge process before starting (install)
#     Assumes VbsPath exists (caller pre-checks). Prints all messages.
# ==============================================================================
function Start-BridgeAndWait {
    param(
        [Parameter(Mandatory)][string]$VbsPath,
        [Parameter(Mandatory)][string]$BambuDir,
        [switch]$StopExistingFirst
    )
    if ($StopExistingFirst) {
        Stop-BridgeProcess | Out-Null
    }
    try {
        Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`""
        Write-Host "  Bridge Server starting..." -ForegroundColor Green

        Write-Host "  Verifying Bridge is listening on port 13628..." -ForegroundColor White
        $bridgeReady = $false
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            $check = Get-NetTCPConnection -LocalPort 13628 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
            if ($check) {
                $bridgeReady = $true
                break
            }
        }
        if ($bridgeReady) {
            Write-Host "  Bridge Server is running on http://127.0.0.1:13628" -ForegroundColor Green
        } else {
            Write-Host "  [!] Bridge may not have started correctly." -ForegroundColor Yellow
            Write-Host "  Try running manually: node `"$BambuDir\bridge\server.js`"" -ForegroundColor Yellow
        }
        return $bridgeReady
    } catch {
        Write-Host "  [!] Failed to start Bridge: $_" -ForegroundColor Yellow
        return $false
    }
}

# ==============================================================================
# 13. Copy-ProfilesToBambuDir - copy Snapmaker.json + Snapmaker\ into BambuStudio
#     On failure prints message + Read-Host pause then throws (caller exits).
# ==============================================================================
function Copy-ProfilesToBambuDir {
    param(
        [Parameter(Mandatory)][string]$PkgDir,
        [Parameter(Mandatory)][string]$BambuDir
    )
    try {
        Copy-Item "$PkgDir\Snapmaker.json" "$BambuDir\resources\profiles\Snapmaker.json" -Force
        Write-Host "  Snapmaker.json" -ForegroundColor Green
    } catch {
        Write-Host "  [X] Failed to copy Snapmaker.json" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        Write-Host "  Try running as Administrator." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        throw "CopySnapmakerJsonFailed"
    }

    try {
        $targetDir = "$BambuDir\resources\profiles\Snapmaker"
        if (Test-Path $targetDir) {
            Remove-Item $targetDir -Recurse -Force
        }
        Copy-Item "$PkgDir\Snapmaker" "$BambuDir\resources\profiles\Snapmaker" -Recurse -Force
        $fileCount = (Get-ChildItem "$targetDir" -Recurse -Filter "*.json").Count
        Write-Host "  Snapmaker\ directory ($fileCount files)" -ForegroundColor Green
    } catch {
        Write-Host "  [X] Failed to copy Snapmaker\ directory" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        Write-Host "  Try running as Administrator." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        throw "CopySnapmakerDirFailed"
    }
}

# ==============================================================================
# 14. Patch-UserMachineConfigs - patch print_host/host_type/print_host_webui in
#     user machine configs to point at the Bridge. Returns patched file count.
#     -PrintHost/-PrintHostWebUi: local mode defaults (127.0.0.1); remote mode
#     callers pass the tailnet serve URL (v5.46.0).
# ==============================================================================
function Patch-UserMachineConfigs {
    param(
        [string]$PrintHost = 'http://127.0.0.1:13628',
        [string]$PrintHostWebUi = 'http://127.0.0.1:13628'
    )
    $patchedCount = 0
    foreach ($cfgDir in (Get-BambuConfigDirs)) {
        $userDir = "$cfgDir\user"
        if (-not (Test-Path $userDir)) { continue }
        # Files sit DIRECTLY in ...\user\<profile>\machine\ — the old pattern
        # '\\machine\\' demanded a trailing separator and never matched (v5.46.0 fix).
        $machineFiles = Get-ChildItem $userDir -Filter "*.json" -Recurse | Where-Object {
            $_.DirectoryName -match '\\machine\\?$' -and $_.Name -match 'Snapmaker'
        }
        foreach ($mf in $machineFiles) {
            try {
                $raw = [System.IO.File]::ReadAllText($mf.FullName, [System.Text.UTF8Encoding]::new($false))
                if ($raw -match 'Snapmaker') {
                    $json = $raw | ConvertFrom-Json
                    $changed = $false
                    if ($json.PSObject.Properties.Match('print_host')) {
                        if ($json.print_host -ne $PrintHost) {
                            $oldHost = $json.print_host
                            $json.print_host = $PrintHost
                            Write-Host "    print_host: $oldHost -> $PrintHost" -ForegroundColor DarkGray
                            $changed = $true
                        }
                    } else {
                        $json | Add-Member -NotePropertyName 'print_host' -NotePropertyValue $PrintHost -Force
                        Write-Host "    print_host: (added) $PrintHost" -ForegroundColor DarkGray
                        $changed = $true
                    }
                    if ($json.PSObject.Properties.Match('host_type')) {
                        if ($json.host_type -ne 'octoprint') {
                            $json.host_type = 'octoprint'
                            Write-Host "    host_type: -> octoprint" -ForegroundColor DarkGray
                            $changed = $true
                        }
                    } else {
                        $json | Add-Member -NotePropertyName 'host_type' -NotePropertyValue 'octoprint' -Force
                        Write-Host "    host_type: (added) octoprint" -ForegroundColor DarkGray
                        $changed = $true
                    }
                    if ($json.PSObject.Properties.Match('print_host_webui')) {
                        if ($json.print_host_webui -ne $PrintHostWebUi) {
                            $json.print_host_webui = $PrintHostWebUi
                            $changed = $true
                        }
                    }
                    if ($changed) {
                        $output = $json | ConvertTo-Json -Depth 10
                        [System.IO.File]::WriteAllText($mf.FullName, $output, [System.Text.UTF8Encoding]::new($false))
                        Write-Host "  Patched: $($mf.Name)" -ForegroundColor Green
                        $patchedCount++
                    }
                }
            } catch {
                Write-Host "  [!] Failed to patch $($mf.Name): $_" -ForegroundColor Yellow
            }
        }
    }
    return $patchedCount
}

Export-ModuleMember -Function *
