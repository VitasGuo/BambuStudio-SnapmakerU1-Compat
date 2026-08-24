# deploy-home.ps1 - Deploy the current build to the home PC Bridge (LOCALAPPDATA)
# Usage: powershell -ExecutionPolicy Bypass -File deploy-home.ps1
# Copies bridge-node + web/webui.html + release zip into
# %LOCALAPPDATA%\BambuStudio-Bridge\app, swaps the old zip out, restarts
# the Bridge via the VBS launcher, then verifies port + /fluidd download.
$ErrorActionPreference = "Stop"

$proj   = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcBn  = Join-Path $proj "bridge-node"
$srcWeb = Join-Path $proj "bridge\web"
$dst    = Join-Path $env:LOCALAPPDATA "BambuStudio-Bridge\app"

Write-Host "== Deploy home Bridge ==" -ForegroundColor Cyan
Write-Host "Target: $dst"

# 0. Sanity checks
foreach ($f in @("server.js","netUtils.js","dialog.js","aiClient.js","slice_agent.js","package.json","watchdog.ps1")) {
    if (-not (Test-Path (Join-Path $srcBn $f))) { throw "Missing source: $srcBn\$f" }
}
if (-not (Test-Path (Join-Path $srcWeb "webui.html"))) { throw "Missing source: $srcWeb\webui.html" }
if (-not (Test-Path $dst)) { throw "Deploy dir not found: $dst" }
$zip = Get-ChildItem (Join-Path $proj "BambuStudio-SnapmakerU1-v*.zip") | Sort-Object Name -Descending | Select-Object -First 1
if (-not $zip) { throw "Release zip not found in project root" }
Write-Host "Release: $($zip.Name)"

# 1. Copy bridge-node files
Copy-Item (Join-Path $srcBn "server.js"),(Join-Path $srcBn "netUtils.js"),(Join-Path $srcBn "dialog.js"),(Join-Path $srcBn "aiClient.js"),(Join-Path $srcBn "slice_agent.js"),(Join-Path $srcBn "package.json"),(Join-Path $srcBn "watchdog.ps1") $dst -Force
Write-Host "[OK] bridge-node files copied" -ForegroundColor Green

# 2. Copy webui.html
Copy-Item (Join-Path $srcWeb "webui.html") (Join-Path $dst "web\webui.html") -Force
Write-Host "[OK] webui.html copied" -ForegroundColor Green

# 3. Deploy new zip, remove all older zips
Copy-Item $zip.FullName (Join-Path $dst "web\dist\") -Force
Get-ChildItem (Join-Path $dst "web\dist") -Filter "BambuStudio-SnapmakerU1-v*.zip" | Where-Object { $_.Name -ne $zip.Name } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "[OK] removed old zip: $($_.Name)" -ForegroundColor Green
}
Write-Host "[OK] $($zip.Name) deployed" -ForegroundColor Green

# 4. Restart Bridge (find the process listening on 13628)
$conn = Get-NetTCPConnection -LocalPort 13628 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "[OK] Bridge (PID $($conn.OwningProcess)) stopped" -ForegroundColor Green
}
$vbs = Join-Path $env:APPDATA "BambuStudio-Bridge\start-hidden.vbs"
if (-not (Test-Path $vbs)) { throw "VBS launcher not found: $vbs" }
Start-Process wscript.exe -ArgumentList "`"$vbs`""
Write-Host "[OK] Bridge restarting via VBS" -ForegroundColor Green

# 5. Wait for port
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort 13628 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
}
if (-not $ready) { throw "Bridge did not come back on port 13628 within 30s" }
Write-Host "[OK] Bridge is listening on 13628" -ForegroundColor Green

# 6. Verify
$ver = (Select-String -Path (Join-Path $dst "server.js") -Pattern 'BRIDGE_VERSION = "([^"]+)"').Matches[0].Groups[1].Value
Write-Host "[OK] Deployed BRIDGE_VERSION = $ver" -ForegroundColor Green
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:13628/fluidd/$($zip.Name)" -Method Head -UseBasicParsing -TimeoutSec 10
    Write-Host "[OK] zip reachable via /fluidd (HTTP $($resp.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "[!] zip HEAD check failed: $_" -ForegroundColor Yellow
}
try {
    $resp2 = Invoke-WebRequest -Uri "http://127.0.0.1:13628/webui.html" -Method Head -UseBasicParsing -TimeoutSec 10
    Write-Host "[OK] webui.html HTTP $($resp2.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "[!] webui check failed: $_" -ForegroundColor Yellow
}
Write-Host "== Deploy complete ==" -ForegroundColor Cyan
