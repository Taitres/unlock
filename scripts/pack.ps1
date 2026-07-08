# 打包插件为 .zpx 文件
param(
    [switch]$Install
)

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path -Parent }
$rootDir = Resolve-Path (Join-Path $scriptDir "..")
$pluginName = "unlock-file"
$version = "1.0.0"

Write-Host "> Building..." -ForegroundColor Cyan
Set-Location $rootDir
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "> Packaging $pluginName v$version..." -ForegroundColor Cyan

$distDir = Join-Path $rootDir "dist"
$outputDir = Join-Path $rootDir "release"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

$zpxFile = Join-Path $outputDir "$pluginName-v$version.zpx"

Remove-Item $zpxFile -Force -ErrorAction SilentlyContinue

# Create .zpx (zip of dist/ contents)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($distDir, $zpxFile)

$size = [math]::Round((Get-Item $zpxFile).Length / 1KB, 1)
Write-Host "> Created: $zpxFile ($size KB)" -ForegroundColor Green

if ($Install) {
    & (Join-Path $scriptDir "install.ps1") -ZpxPath $zpxFile
}
