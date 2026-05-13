[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "Snapmaker U1 - BambuStudio Compatibility Pack Installer"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    Snapmaker U1 BambuStudio Compatibility Pack v2.1" -ForegroundColor Cyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$pkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "  [1/4] Detecting BambuStudio..." -ForegroundColor White
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
Write-Host ""

$confirm = Read-Host "  Install Snapmaker U1 profiles? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "  Cancelled." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""
Write-Host "  [2/4] Clearing BambuStudio cache..." -ForegroundColor White
$cacheDir = "$env:APPDATA\BambuStudioBeta\system\Snapmaker"
$cacheVendor = "$env:APPDATA\BambuStudioBeta\system\Snapmaker.json"
if (Test-Path $cacheDir) {
    Remove-Item $cacheDir -Recurse -Force
    Write-Host "  Cleared cache directory" -ForegroundColor Green
} else {
    Write-Host "  No cache found (OK)" -ForegroundColor DarkGray
}
if (Test-Path $cacheVendor) {
    Remove-Item $cacheVendor -Force
}

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
        Write-Host "  Cleaned Snapmaker references from BambuStudio.conf" -ForegroundColor Green
    }
}

Write-Host "  [3/4] Installing profiles..." -ForegroundColor White
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
    Copy-Item "$pkgDir\Snapmaker" "$bambuDir\resources\profiles\Snapmaker" -Recurse -Force
    $fileCount = (Get-ChildItem "$pkgDir\Snapmaker" -Recurse -Filter "*.json").Count
    Write-Host "  Snapmaker\ directory ($fileCount files)" -ForegroundColor Green
} catch {
    Write-Host "  [X] Failed to copy Snapmaker\ directory" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host "  Try running as Administrator." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  [4/4] Verifying..." -ForegroundColor White
$vendorOk = Test-Path "$bambuDir\resources\profiles\Snapmaker.json"
$u1Ok = Test-Path "$bambuDir\resources\profiles\Snapmaker\machine\Snapmaker U1.json"
$processOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\process\0.20 Standard @Snapmaker U1.json"
$filamentOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Snapmaker PLA @U1.json"
$genericFilamentOk = Test-Path "$bambuDir\resources\profiles\Snapmaker\filament\Generic PLA @U1.json"

if ($vendorOk -and $u1Ok -and $processOk -and $filamentOk -and $genericFilamentOk) {
    Write-Host "  Verification passed!" -ForegroundColor Green
} else {
    Write-Host "  [X] Verification failed!" -ForegroundColor Red
    if (-not $vendorOk) { Write-Host "  Missing: Snapmaker.json" -ForegroundColor Red }
    if (-not $u1Ok) { Write-Host "  Missing: Snapmaker U1.json" -ForegroundColor Red }
    if (-not $processOk) { Write-Host "  Missing: process file" -ForegroundColor Red }
    if (-not $filamentOk) { Write-Host "  Missing: Snapmaker filament file" -ForegroundColor Red }
    if (-not $genericFilamentOk) { Write-Host "  Missing: Generic filament file" -ForegroundColor Red }
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "    Installation Successful!" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Restart BambuStudio (close completely, then reopen)"
Write-Host "    2. Add Printer -> Select Snapmaker -> Snapmaker U1"
Write-Host "    3. Choose 0.4mm nozzle"
Write-Host "    4. Set up Physical Printer with OctoPrint host type"
Write-Host "       - Enter U1 IP address (e.g. 192.168.1.100)"
Write-Host "       - Enter Moonraker API Key (find in Fluidd web UI)"
Write-Host "       - Click Test to verify connection"
Write-Host "    5. Import model -> Select process & filament -> Slice"
Write-Host "    6. Click 'Upload to Printer' to send G-code to U1"
Write-Host ""
Write-Host "  Note: OctoPrint host type connects to U1 via Moonraker's"
Write-Host "  OctoPrint-compatible API. No additional software needed!"
Write-Host ""
Read-Host "Press Enter to exit"
