[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$AutoConfirm = $false
if ($args -contains "-y" -or $args -contains "--yes" -or $args -contains "-AutoConfirm") {
    $AutoConfirm = $true
}

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack v5.31.3 Reinstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack v5.31.3 - Reinstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$bambuProcess = Get-Process -Name "bambustudio" -ErrorAction SilentlyContinue
if ($bambuProcess) {
    Write-Host "  [!] BambuStudio is running. Please close it first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$pkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "  [1/10] Detecting BambuStudio..." -ForegroundColor White
$bambuDir = $null
$searchPaths = @(
    "C:\Program Files\Bambu Studio",
    "C:\Program Files (x86)\Bambu Studio",
    "D:\Program Files\Bambu Studio",
    "D:\Bambu Studio"
)

foreach ($p in $searchPaths) {
    if (Test-Path "$p\resources\profiles") {
        $bambuDir = $p
        break
    }
}

if (-not $bambuDir) {
    Write-Host "  [!] Cannot auto-detect BambuStudio installation." -ForegroundColor Yellow
    Write-Host "  Common paths checked:" -ForegroundColor DarkGray
    foreach ($p in $searchPaths) {
        Write-Host "    - $p" -ForegroundColor DarkGray
    }
    Write-Host ""
    $input = Read-Host "  Enter BambuStudio install path"
    $bambuDir = $input.Trim('"').Trim()
}

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
$stopped = $false
$portProc = Get-NetTCPConnection -LocalPort 13628 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" } | Select-Object -First 1
if ($portProc) {
    try {
        Stop-Process -Id $portProc.OwningProcess -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 500
        $stopped = $true
        Write-Host "  Stopped Bridge process (PID $($portProc.OwningProcess))" -ForegroundColor Green
    } catch {
        try {
            Start-Process powershell -Verb RunAs -ArgumentList "-Command Stop-Process -Id $($portProc.OwningProcess) -Force" -Wait
            Start-Sleep -Milliseconds 500
            $stopped = $true
            Write-Host "  Stopped Bridge process (elevated, PID $($portProc.OwningProcess))" -ForegroundColor Green
        } catch {
            Write-Host "  [!] Failed to stop Bridge process. Please stop it manually." -ForegroundColor Yellow
        }
    }
} else {
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
$cacheDir = "$env:APPDATA\BambuStudioBeta\system\Snapmaker"
$cacheVendor = "$env:APPDATA\BambuStudioBeta\system\Snapmaker.json"
if (Test-Path $cacheDir) {
    Remove-Item $cacheDir -Recurse -Force
    Write-Host "  Cleared system cache directory" -ForegroundColor Green
} else {
    Write-Host "  No system cache found (OK)" -ForegroundColor DarkGray
}
if (Test-Path $cacheVendor) {
    Remove-Item $cacheVendor -Force
}

Write-Host "  [4/10] Preserving user custom presets..." -ForegroundColor White
$userBaseDir = "$env:APPDATA\BambuStudioBeta\user"
if (Test-Path $userBaseDir) {
    Write-Host "  User presets directory found (preserved)" -ForegroundColor Green
} else {
    Write-Host "  No user presets directory (OK)" -ForegroundColor DarkGray
}

Write-Host "  [5/10] Refreshing BambuStudio.conf cache..." -ForegroundColor White
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
                $removedCount = $filamentList.Count - $cleanedList.Count
                Write-Host "  Removed $removedCount cached filament entries (will be re-discovered on startup)" -ForegroundColor DarkGray
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
            Write-Host "  Refreshed filament cache in BambuStudio.conf (backup: .bak)" -ForegroundColor Green
        } else {
            Write-Host "  No Snapmaker cache to refresh (OK)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  [!] Failed to parse BambuStudio.conf, skipping (user data preserved)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  BambuStudio.conf not found (OK for first install)" -ForegroundColor DarkGray
}

Write-Host "  [6/10] Patching user machine configs (print_host -> Bridge)..." -ForegroundColor White
$userDir = "$env:APPDATA\BambuStudioBeta\user"
$patchedCount = 0
if (Test-Path $userDir) {
    $machineFiles = Get-ChildItem $userDir -Filter "*.json" -Recurse | Where-Object {
        $_.DirectoryName -match '\\machine\\' -and $_.Name -match 'Snapmaker'
    }
    foreach ($mf in $machineFiles) {
        try {
            $raw = [System.IO.File]::ReadAllText($mf.FullName, [System.Text.UTF8Encoding]::new($false))
            if ($raw -match 'Snapmaker') {
                $json = $raw | ConvertFrom-Json
                $changed = $false
                if ($json.PSObject.Properties.Match('print_host')) {
                    if ($json.print_host -ne 'http://127.0.0.1:13628') {
                        $oldHost = $json.print_host
                        $json.print_host = 'http://127.0.0.1:13628'
                        Write-Host "    print_host: $oldHost -> http://127.0.0.1:13628" -ForegroundColor DarkGray
                        $changed = $true
                    }
                } else {
                    $json | Add-Member -NotePropertyName 'print_host' -NotePropertyValue 'http://127.0.0.1:13628' -Force
                    Write-Host "    print_host: (added) http://127.0.0.1:13628" -ForegroundColor DarkGray
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
                    if ($json.print_host_webui -ne 'http://127.0.0.1:13628') {
                        $json.print_host_webui = 'http://127.0.0.1:13628'
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
if ($patchedCount -eq 0) {
    Write-Host "  No user machine configs needed patching (OK)" -ForegroundColor DarkGray
} else {
    Write-Host "  Patched $patchedCount user machine config(s)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  [7/10] Installing profiles..." -ForegroundColor White
try {
    Copy-Item "$pkgDir\Snapmaker.json" "$bambuDir\resources\profiles\Snapmaker.json" -Force
    Write-Host "  Snapmaker.json" -ForegroundColor Green
} catch {
    Write-Host "  [X] Failed to copy Snapmaker.json" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host "  Try running as Administrator." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    $targetDir = "$bambuDir\resources\profiles\Snapmaker"
    if (Test-Path $targetDir) {
        Remove-Item $targetDir -Recurse -Force
    }
    Copy-Item "$pkgDir\Snapmaker" "$bambuDir\resources\profiles\Snapmaker" -Recurse -Force
    $fileCount = (Get-ChildItem "$targetDir" -Recurse -Filter "*.json").Count
    Write-Host "  Snapmaker\ directory ($fileCount files)" -ForegroundColor Green
} catch {
    Write-Host "  [X] Failed to copy Snapmaker\ directory" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host "  Try running as Administrator." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
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
                                exit 1
                            }
                        }
                    } else {
                        Write-Host "  [X] Could not determine latest Node.js version." -ForegroundColor Red
                        Write-Host "  Please install manually from https://nodejs.org and rerun." -ForegroundColor Red
                        Read-Host "Press Enter to exit"
                        exit 1
                    }
                } catch {
                    Write-Host "  [X] Download failed: $_" -ForegroundColor Red
                    Write-Host "  Please install Node.js manually from https://nodejs.org and rerun." -ForegroundColor Red
                    Read-Host "Press Enter to exit"
                    exit 1
                }
            } else {
                Read-Host "Press Enter to exit"
                exit 1
            }
        }

        $nodeVersion = & $nodePath --version 2>&1
        Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Green

        Write-Host "  Installing npm dependencies..." -ForegroundColor White
        try {
            Push-Location $bridgeDst
            $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue)
            if (-not $npmCmd) { $npmCmd = Join-Path (Split-Path $nodePath) 'npm.cmd' } else { $npmCmd = $npmCmd.Source }
            & $nodePath $npmCmd install --production 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            Pop-Location
            Write-Host "  npm dependencies installed" -ForegroundColor Green
        } catch {
            Pop-Location
            Write-Host "  [!] npm install failed: $_" -ForegroundColor Yellow
            Write-Host "  You may need to run 'npm install' manually in $bridgeDst" -ForegroundColor Yellow
        }

        $bridgeConfigDir = "$env:APPDATA\BambuStudio-Bridge"
        if (-not (Test-Path $bridgeConfigDir)) {
            New-Item -ItemType Directory -Path $bridgeConfigDir -Force | Out-Null
        }

        $vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
nodePath = "$nodePath"
scriptPath = "$bridgeDst\server.js"
WshShell.Run """" & nodePath & """ """ & scriptPath & """", 0, False
"@
        $vbsPath = "$bridgeConfigDir\start-hidden.vbs"
        [System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::Unicode)
        Write-Host "  Created hidden launcher: $vbsPath" -ForegroundColor Green
        Write-Host "  Node.exe path in launcher: $nodePath" -ForegroundColor DarkGray

        $startupFolder = [System.Environment]::GetFolderPath('Startup')
        $shortcutPath = "$startupFolder\BambuStudio Bridge.lnk"
        $WScriptShell = New-Object -ComObject WScript.Shell
        $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = "`"$vbsPath`""
        $shortcut.WorkingDirectory = $bridgeDst
        $shortcut.Description = "BambuStudio Bridge Server"
        $shortcut.Save()
        Write-Host "  Updated startup shortcut" -ForegroundColor Green
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
    try {
        Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""
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
            Write-Host "  Try running manually: node `"$bambuDir\bridge\server.js`"" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [!] Failed to start Bridge: $_" -ForegroundColor Yellow
    }
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
Write-Host "  Bridge Server runs automatically on login." -ForegroundColor DarkGray
Write-Host "  Config stored in: %APPDATA%\BambuStudio-Bridge\" -ForegroundColor DarkGray
Write-Host "  Log file: %APPDATA%\BambuStudio-Bridge\bridge.log" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to exit"
