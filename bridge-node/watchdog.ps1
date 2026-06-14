# Bridge Watchdog — auto-restart bridge if it crashes
# Called by Windows Task Scheduler every 2 minutes
$bridgeDir = "C:\Program Files\Bambu Studio\bridge"
$serverJs = Join-Path $bridgeDir "server.js"
$vbsPath = "$env:APPDATA\BambuStudio-Bridge\start-hidden.vbs"

# Check if bridge is listening on port 13628
$port = 13628
$listening = $false
try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { $listening = $true }
} catch {
    # Fallback: try TCP connect
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $port)
        $tcp.Close()
        $listening = $true
    } catch {}
}

if (-not $listening) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "$timestamp [WATCHDOG] Bridge not listening on port $port, restarting..."
    Add-Content -Path "$env:APPDATA\BambuStudio-Bridge\bridge.log" -Value $logLine

    if (Test-Path $vbsPath) {
        Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""
    } elseif (Test-Path $serverJs) {
        $nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
        if ($nodePath) {
            Start-Process $nodePath -ArgumentList $serverJs -WindowStyle Hidden
        }
    }
}
