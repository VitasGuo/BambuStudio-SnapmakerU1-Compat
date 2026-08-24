# Build BambuStudio-SnapmakerU1-v5.46.0.zip from the repo root (clean, LF .sh, no legacy python)
$ErrorActionPreference = "Stop"
$repo = "c:\Users\nishu\Documents\SOLO\3D-printer\BambuStudio-SnapmakerU1-Compat"
$zipPath = "$repo\BambuStudio-SnapmakerU1-v5.46.0.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$topItems = @(
    "install.ps1", "install.bat", "install-common.psm1",
    "reinstall.ps1", "reinstall.bat",
    "uninstall.ps1", "uninstall.bat",
    "install.sh", "reinstall.sh", "uninstall.sh",
    "Snapmaker.json", "Snapmaker",
    "bridge", "bridge-node",
    "README.md", "process.md", "traps.md", "LICENSE"
)
# skip files never shipped inside bridge-node
$skipNames = @("node_modules", "dist", ".git")

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    function Add-FileToZip([string]$absPath, [string]$entryName) {
        $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $es = $entry.Open(); $fs = [System.IO.File]::OpenRead($absPath)
        try { $fs.CopyTo($es) } finally { $fs.Dispose(); $es.Dispose() }
    }
    foreach ($item in $topItems) {
        $abs = Join-Path $repo $item
        if (-not (Test-Path $abs)) { Write-Host "  [skip] missing: $item" -ForegroundColor Yellow; continue }
        if (Test-Path $abs -PathType Leaf) {
            Add-FileToZip $abs $item
        } else {
            $files = Get-ChildItem $abs -Recurse -File | Where-Object {
                $rel = $_.FullName.Substring($abs.Length + 1)
                -not ($skipNames | Where-Object { $rel -like "$_\*" -or $rel -like "*\$_\*" })
            }
            foreach ($f in $files) {
                $entryName = ($item + "\" + $f.FullName.Substring($abs.Length + 1))
                Add-FileToZip $f.FullName $entryName
            }
        }
    }
} finally {
    $zip.Dispose()
}

$size = (Get-Item $zipPath).Length
Write-Host ""
Write-Host "Zip created: $zipPath ($([math]::Round($size/1MB, 2)) MB)" -ForegroundColor Green
