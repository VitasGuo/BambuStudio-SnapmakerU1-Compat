[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack Reinstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compat Pack - Reinstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$bambuProcess = Get-Process -Name "bambustudio" -ErrorAction SilentlyContinue
if ($bambuProcess) {
    Write-Host "  [!] BambuStudio is running. Please close it first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$pkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "  [1/7] Detecting BambuStudio..." -ForegroundColor White
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

$confirm = Read-Host "  Reinstall Snapmaker U1 profiles? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "  Cancelled." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""

Write-Host "  [2/7] Removing old profiles..." -ForegroundColor White
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

Write-Host "  [3/7] Clearing BambuStudio system cache..." -ForegroundColor White
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

$userDefaultDir = "$env:APPDATA\BambuStudioBeta\user\default"
if (Test-Path $userDefaultDir) {
    $snapmakerUserFiles = Get-ChildItem $userDefaultDir -Filter "*.json" -Recurse | Where-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        $content -match "Snapmaker" -or $_.Name -match "Snapmaker" -or $_.Name -match "@U1"
    }
    if ($snapmakerUserFiles) {
        foreach ($f in $snapmakerUserFiles) {
            Remove-Item $f.FullName -Force
            Write-Host "  Removed user preset: $($f.Name)" -ForegroundColor DarkGray
        }
        Write-Host "  Cleared Snapmaker user presets" -ForegroundColor Green
    } else {
        Write-Host "  No Snapmaker user presets found (OK)" -ForegroundColor DarkGray
    }
}

Write-Host "  [4/7] Deep-cleaning BambuStudio.conf..." -ForegroundColor White
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
                Write-Host "  Removed $removedCount cached filament entries" -ForegroundColor DarkGray
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
            Write-Host "  Deep-cleaned all Snapmaker references (backup: .bak)" -ForegroundColor Green
        } else {
            Write-Host "  No Snapmaker references found (OK)" -ForegroundColor DarkGray
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
            Write-Host "  Deep-cleaned via regex fallback" -ForegroundColor Yellow
        } catch {
            Write-Host "  [X] Both JSON and regex cleanup failed" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  BambuStudio.conf not found (OK for first install)" -ForegroundColor DarkGray
}

Write-Host "  [5/7] Installing profiles..." -ForegroundColor White
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

Write-Host "  [6/7] Verifying..." -ForegroundColor White
$vendorOk = Test-Path "$bambuDir\resources\profiles\Snapmaker.json"
$u1Ok = Test-Path "$bambuDir\resources\profiles\Snapmaker\machine\Snapmaker U1.json"
$processOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\process\0.20 Standard @Snapmaker U1.json"
$filamentOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker PLA Basic @U1.json"
$petgHfOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker PETG HF @U1.json"
$tpu90aOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker TPU 90A @U1.json"
$tpu95aOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker TPU 95A HF @U1.json"

if ($vendorOk -and $u1Ok -and $processOk -and $filamentOk) {
    Write-Host "  Core verification passed!" -ForegroundColor Green
    if ($petgHfOk) { Write-Host "  PETG HF: OK" -ForegroundColor DarkGray }
    if ($tpu90aOk) { Write-Host "  TPU 90A: OK" -ForegroundColor DarkGray }
    if ($tpu95aOk) { Write-Host "  TPU 95A HF: OK" -ForegroundColor DarkGray }
} else {
    Write-Host "  [X] Verification failed!" -ForegroundColor Red
    if (-not $vendorOk) { Write-Host "  Missing: Snapmaker.json" -ForegroundColor Red }
    if (-not $u1Ok) { Write-Host "  Missing: Snapmaker U1.json" -ForegroundColor Red }
    if (-not $processOk) { Write-Host "  Missing: process file" -ForegroundColor Red }
    if (-not $filamentOk) { Write-Host "  Missing: Snapmaker filament file" -ForegroundColor Red }
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  [7/7] Listing installed Snapmaker filaments..." -ForegroundColor White
$filamentDir = "$bambuDir\resources\profiles\Snapmaker\filament"
$filamentFiles = Get-ChildItem $filamentDir -Filter "*@U1.json" | Sort-Object Name
foreach ($f in $filamentFiles) {
    $fContent = Get-Content $f.FullName -Raw | ConvertFrom-Json
    Write-Host "    $($fContent.name)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "    Reinstall Successful!" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Start BambuStudio" -ForegroundColor White
Write-Host "    2. All filaments will auto-appear" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
