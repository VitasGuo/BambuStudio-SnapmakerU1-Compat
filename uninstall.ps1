[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 BambuStudio Compatibility Pack Uninstaller"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack Uninstall" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

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
    Write-Host "  [1/4] Removing vendor config..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker.json" -Force
        Write-Host "  [OK] Snapmaker.json removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED - Administrator privileges may be required" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [1/4] Snapmaker.json not found, skipping" -ForegroundColor DarkGray
}

if ($hasDir) {
    Write-Host "  [2/4] Removing profile directory..." -ForegroundColor White
    try {
        Remove-Item "$profilesDir\Snapmaker" -Recurse -Force
        Write-Host "  [OK] Snapmaker\ directory removed" -ForegroundColor Green
    } catch {
        Write-Host "  [X] FAILED" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [2/4] Snapmaker\ directory not found, skipping" -ForegroundColor DarkGray
}

Write-Host "  [3/4] Clearing BambuStudio cache..." -ForegroundColor White
$cacheDir = "$env:APPDATA\BambuStudioBeta\system\Snapmaker"
$cacheVendor = "$env:APPDATA\BambuStudioBeta\system\Snapmaker.json"
if (Test-Path $cacheDir) { Remove-Item $cacheDir -Recurse -Force }
if (Test-Path $cacheVendor) { Remove-Item $cacheVendor -Force }
Write-Host "  [OK] Cache cleared" -ForegroundColor Green

Write-Host "  [4/4] Cleaning BambuStudio.conf..." -ForegroundColor White
$confPath = "$env:APPDATA\BambuStudioBeta\BambuStudio.conf"
if (Test-Path $confPath) {
    $confContent = [System.IO.File]::ReadAllText($confPath, [System.Text.UTF8Encoding]::new($false))
    if ($confContent -match "Snapmaker") {
        $confContent = $confContent -replace '\s*\{\s*"model":\s*"Snapmaker U1",\s*"nozzle_diameter":\s*"[^"]*",\s*"vendor":\s*"Snapmaker"\s*\},?', ''
        $confContent = $confContent -replace '"Snapmaker U1 \([^)]+\)":\s*"[^"]*",?\s*', ''
        $confContent = $confContent -replace '"machine":\s*"Snapmaker U1 \([^)]+\)"', '"machine": "Bambu Lab A1 0.4 nozzle"'
        $confContent = $confContent -replace '"process":\s*"[^"]*@Snapmaker U1[^"]*"', '"process": "0.20 Standard @Bambu Lab A1 0.4 nozzle"'
        $confContent = $confContent -replace ',(\s*\})', '$1'
        $confContent = $confContent -replace ',(\s*\])', '$1'
        [System.IO.File]::WriteAllText($confPath, $confContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  [OK] Cleaned Snapmaker references" -ForegroundColor Green
    } else {
        Write-Host "  [--] No Snapmaker references found" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  [--] BambuStudio.conf not found" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  Uninstall complete! Please restart BambuStudio." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
