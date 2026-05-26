$ErrorActionPreference = "Continue"
$taskName = "GitPushRetry_BambuStudio_U1"
$repoDir = "C:\Users\VitasGuo\Documents\SOLO\3D-printer\BambuStudio-SnapmakerU1-Compat"
$maxAttempts = 12
$attemptFile = Join-Path $repoDir "git_push_attempts.txt"
$successFile = Join-Path $repoDir "git_push_success.txt"

Set-Location $repoDir
Write-Output "Current directory: $(Get-Location)"

if (Test-Path $successFile) {
    Write-Output "Git push already completed successfully, skipping"
    exit 0
}

$attemptCount = 1
if (Test-Path $attemptFile) {
    $attemptCount = [int](Get-Content $attemptFile)
    $attemptCount++
}

if ($attemptCount -gt $maxAttempts) {
    Write-Output "12 attempts failed, network issue persists"
    Remove-Item -Path $attemptFile -Force -ErrorAction SilentlyContinue
    exit 1
}

Set-Content -Path $attemptFile -Value $attemptCount
Write-Output "Starting attempt $attemptCount"

try {
    $output = & git push 2>&1
    $exitCode = $LASTEXITCODE
} catch {
    $output = $_
    $exitCode = 1
}

Write-Output "Git push output: $output"

if ($exitCode -eq 0) {
    Write-Output "Git push succeeded after $attemptCount attempts"
    Set-Content -Path $successFile -Value $attemptCount
    Remove-Item -Path $attemptFile -Force -ErrorAction SilentlyContinue
    
    try {
        schtasks /Delete /TN $taskName /F
        Write-Output "Scheduled task deleted"
    } catch {
        Write-Output "Error deleting scheduled task: $_"
    }
    exit 0
}

$errorMessage = $output | Out-String
if ($errorMessage -match "Connection reset|Could not connect|timeout|timed out|网络错误|连接重置|连接失败|超时") {
    Write-Output "Attempt $attemptCount failed, network error, will retry next time"
    exit 0
}

Write-Output "Attempt $attemptCount failed, error: $errorMessage"
exit 1
