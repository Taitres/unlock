# 安装插件到 ZTools 插件目录
param(
    [string]$ZpxPath
)

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path -Parent }
$rootDir = Resolve-Path (Join-Path $scriptDir "..")
$pluginName = "unlock-file"

# 查找 ZTools 插件目录
$pluginDirs = @(
    "$env:LOCALAPPDATA\ZTools\plugins\$pluginName",
    "$env:APPDATA\ZTools\plugins\$pluginName",
    "$env:USERPROFILE\.ztools\plugins\$pluginName"
)

$targetDir = $null
foreach ($dir in $pluginDirs) {
    $parent = Split-Path $dir -Parent
    if (Test-Path $parent) {
        $targetDir = $dir
        Write-Host "> Found ZTools at: $parent" -ForegroundColor Cyan
        break
    }
}

if (-not $targetDir) {
    $targetDir = "$env:LOCALAPPDATA\ZTools\plugins\$pluginName"
    Write-Host "> Using default path: $(Split-Path $targetDir -Parent)" -ForegroundColor Cyan
}

if ($ZpxPath -and (Test-Path $ZpxPath)) {
    Write-Host "> Installing from $ZpxPath ..." -ForegroundColor Cyan
    Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZpxPath, $targetDir)
}
else {
    $distDir = Join-Path $rootDir "dist"
    if (-not (Test-Path $distDir)) {
        Write-Host "> dist/ not found. Run npm run build first." -ForegroundColor Red
        exit 1
    }
    Write-Host "> Installing from dist/ ..." -ForegroundColor Cyan
    Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    robocopy "$distDir" "$targetDir" /E /NFL /NDL /NJH /NJS 2>$null
    if ($LASTEXITCODE -ge 8) {
        Get-ChildItem $distDir -Recurse | ForEach-Object {
            $dest = $_.FullName -replace [regex]::Escape($distDir), $targetDir
            if ($_.PSIsContainer) {
                New-Item -ItemType Directory -Path $dest -Force | Out-Null
            } else {
                Copy-Item $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Host "> Installed to: $targetDir" -ForegroundColor Green
Write-Host "> Restart ZTools to reload the plugin." -ForegroundColor Yellow
