[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack Uninstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack Uninstall" -ForegroundColor Cyan
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
    if ((Test-Path "$p\resources\profiles\Snapmaker.json") -or (Test-Path "$p\resources\profiles\Snapmaker")) {
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

if (-not $hasVendor -and -not $hasDir) {
    Write-Host "  [!] Compatibility pack not found, nothing to uninstall." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host "  BambuStudio: $bambuDir" -ForegroundColor Green
Write-Host ""
Write-Host "  Will remove:" -ForegroundColor White
if ($hasVendor) { Write-Host "    - Snapmaker.json" }
if ($hasDir) { Write-Host "    - Snapmaker\ directory" }
Write-Host "    - BambuStudio cache for Snapmaker"
Write-Host "    - Snapmaker references in BambuStudio.conf"
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
    Write-Host "  [1/5] Removing vendor config..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker.json" -Force
        Write-Host "  [OK] Snapmaker.json removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED - Administrator privileges may be required" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [1/5] Snapmaker.json not found, skipping" -ForegroundColor DarkGray
}

if ($hasDir) {
    Write-Host "  [2/5] Removing profile directory..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker" -Recurse -Force
        Write-Host "  [OK] Snapmaker\ directory removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [2/5] Snapmaker\ directory not found, skipping" -ForegroundColor DarkGray
}

Write-Host "  [3/5] Clearing BambuStudio cache..." -ForegroundColor White
$cacheDir = "$env:APPDATA\BambuStudioBeta\system\Snapmaker"
$cacheVendor = "$env:APPDATA\BambuStudioBeta\system\Snapmaker.json"
if (Test-Path $cacheDir) { Remove-Item $cacheDir -Recurse -Force }
if (Test-Path $cacheVendor) { Remove-Item $cacheVendor -Force }

$userDefaultDir = "$env:APPDATA\BambuStudioBeta\user\default"
if (Test-Path $userDefaultDir) {
    $snapmakerUserFiles = Get-ChildItem $userDefaultDir -Filter "*.json" -Recurse | Where-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        $content -match "Snapmaker" -or $_.Name -match "Snapmaker" -or $_.Name -match "@U1"
    }
    if ($snapmakerUserFiles) {
        foreach ($f in $snapmakerUserFiles) {
            Remove-Item $f.FullName -Force
        }
    }
}
Write-Host "  [OK] Cache cleared" -ForegroundColor Green

Write-Host "  [4/5] Cleaning BambuStudio.conf..." -ForegroundColor White
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

        if ($conf.models) {
            $modelList = @($conf.models)
            $cleanedModels = @($modelList | Where-Object { $_.vendor -ne 'Snapmaker' })
            if ($cleanedModels.Count -ne $modelList.Count) {
                $conf.models = $cleanedModels
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

        if ($conf.presets) {
            if ($conf.presets.machine -match 'Snapmaker') {
                $conf.presets.machine = 'Bambu Lab A1 0.4 nozzle'
                $changed = $true
            }
            if ($conf.presets.process -match 'Snapmaker') {
                $conf.presets.process = '0.20 Standard @Bambu Lab A1 0.4 nozzle'
                $changed = $true
            }
            if ($conf.presets.filaments) {
                $presetFilaments = @($conf.presets.filaments)
                $cleanedPresetFilaments = @($presetFilaments | Where-Object {
                    $_ -notmatch '@U1' -and $_ -notmatch 'Snapmaker'
                })
                if ($cleanedPresetFilaments.Count -eq 0) {
                    $cleanedPresetFilaments = @("Bambu PLA Basic @BBL A1 0.4 nozzle")
                }
                if ($cleanedPresetFilaments.Count -ne $presetFilaments.Count -or $cleanedPresetFilaments[0] -ne $presetFilaments[0]) {
                    $conf.presets.filaments = $cleanedPresetFilaments
                    $changed = $true
                }
            }
        }

        if ($changed) {
            Copy-Item $confPath "$confPath.bak" -Force
            $jsonOutput = $conf | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($confPath, $jsonOutput, [System.Text.UTF8Encoding]::new($false))
            Write-Host "  [OK] Cleaned all Snapmaker references (backup: .bak)" -ForegroundColor Green
        } else {
            Write-Host "  [--] No Snapmaker references found" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  [!] JSON parse failed, using regex fallback..." -ForegroundColor Yellow
        try {
            $confContent = [System.IO.File]::ReadAllText($confPath, [System.Text.UTF8Encoding]::new($false))
            if ($confContent -match "Snapmaker") {
                $confContent = $confContent -replace '\s*\{\s*"model":\s*"Snapmaker U1",\s*"nozzle_diameter":\s*"[^"]*",\s*"vendor":\s*"Snapmaker"\s*\},?', ''
                $confContent = $confContent -replace '"Snapmaker U1 \([^)]+\)":\s*"[^"]*",?\s*', ''
                $confContent = $confContent -replace '"machine":\s*"Snapmaker U1 \([^)]+\)"', '"machine": "Bambu Lab A1 0.4 nozzle"'
                $confContent = $confContent -replace '"process":\s*"[^"]*@Snapmaker U1[^"]*"', '"process": "0.20 Standard @Bambu Lab A1 0.4 nozzle"'
            }
            $confContent = $confContent -replace '(?m)^\s*"[^"]*@U1"\s*,?\s*$', ''
            $confContent = $confContent -replace '(?m)^\s*"Snapmaker (PLA|PLA Basic|PLA Matte|PLA Silk|PLA SnapSpeed|PLA-CF|PETG|PETG HF|ABS|TPU|TPU 90A|TPU 95A HF)[^"]*"\s*,?\s*$', ''
            $confContent = $confContent -replace ',(\s*\])', '$1'
            $confContent = $confContent -replace ',(\s*\})', '$1'
            $confContent = $confContent -replace '(\r?\n){3,}', "`n`n"
            [System.IO.File]::WriteAllText($confPath, $confContent, [System.Text.UTF8Encoding]::new($false))
            Write-Host "  [OK] Cleaned via regex fallback" -ForegroundColor Yellow
        } catch {
            Write-Host "  [X] Both JSON and regex cleanup failed" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  [--] BambuStudio.conf not found" -ForegroundColor DarkGray
}

Write-Host "  [5/5] Verifying..." -ForegroundColor White
$vendorGone = -not (Test-Path "$profilesDir\Snapmaker.json")
$dirGone = -not (Test-Path "$profilesDir\Snapmaker")

if ($vendorGone -and $dirGone) {
    Write-Host "  Verification passed!" -ForegroundColor Green
} else {
    Write-Host "  [!] Some files may remain (check manually)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Uninstall complete! Please restart BambuStudio." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
