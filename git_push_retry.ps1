$ErrorActionPreference = "Continue"
$taskName = "GitPushRetry_BambuStudio_U1"
$repoDir = "C:\Users\VitasGuo\Documents\SOLO\3D-printer\BambuStudio-SnapmakerU1-Compat"
$maxAttempts = 12
$attemptFile = Join-Path $repoDir "git_push_attempts.txt"
$successFile = Join-Path $repoDir "git_push_success.txt"

Set-Location $repoDir
Write-Output "当前目录: $(Get-Location)"

if (Test-Path $successFile) {
    Write-Output "Git push 已成功完成，跳过执行"
    exit 0
}

$attemptCount = 1
if (Test-Path $attemptFile) {
    $attemptCount = [int](Get-Content $attemptFile)
    $attemptCount++
}

if ($attemptCount -gt $maxAttempts) {
    Write-Output "12次尝试均失败，网络问题持续"
    Remove-Item -Path $attemptFile -Force -ErrorAction SilentlyContinue
    exit 1
}

Set-Content -Path $attemptFile -Value $attemptCount
Write-Output "开始第 $attemptCount 次尝试"

try {
    $output = & git push 2>&1
    $exitCode = $LASTEXITCODE
} catch {
    $output = $_
    $exitCode = 1
}

Write-Output "Git push 输出: $output"

if ($exitCode -eq 0) {
    Write-Output "Git push 成功，共尝试 $attemptCount 次"
    Set-Content -Path $successFile -Value $attemptCount
    Remove-Item -Path $attemptFile -Force -ErrorAction SilentlyContinue
    
    try {
        schtasks /Delete /TN $taskName /F
        Write-Output "定时任务已删除"
    } catch {
        Write-Output "删除定时任务时出错: $_"
    }
    exit 0
}

$errorMessage = $output | Out-String
if ($errorMessage -match "Connection reset|Could not connect|timeout|timed out|网络错误|连接重置|连接失败|超时") {
    Write-Output "第 $attemptCount 次尝试失败，网络错误，继续等待下次执行"
    exit 0
}

Write-Output "第 $attemptCount 次尝试失败，错误: $errorMessage"
exit 1
