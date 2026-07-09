# Download the latest Handle.zip from Sysinternals and extract handle.exe + EULA
# to the plugin's preload directory.
#
# Sysinternals license: https://learn.microsoft.com/sysinternals/license-terms
# handle.exe may be redistributed with proper attribution. EULA must accompany.

$ErrorActionPreference = 'Stop'
$preloadDir = Join-Path $PSScriptRoot '..\public\preload'
$handleExe = Join-Path $preloadDir 'handle.exe'
$eulaFile = Join-Path $preloadDir 'handle-EULA.txt'

$zipUrl = 'https://download.sysinternals.com/files/Handle.zip'
$zipPath = Join-Path $env:TEMP 'Handle.zip'
$extractDir = Join-Path $env:TEMP 'Handle-extract'

if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
New-Item -ItemType Directory -Path $extractDir | Out-Null

Write-Host "Downloading $zipUrl ..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting ..."
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$extractedExe = Join-Path $extractDir 'Handle.exe'
$extractedEula = Join-Path $extractDir 'Eula.txt'

if (-not (Test-Path $extractedExe)) { throw "Handle.exe not found in zip" }
if (-not (Test-Path $extractedEula)) { throw "Eula.txt not found in zip" }

Copy-Item -Path $extractedExe -Destination $handleExe -Force
Copy-Item -Path $extractedEula -Destination $eulaFile -Force

Write-Host "Installed: $handleExe"
Write-Host "Installed: $eulaFile"

Remove-Item $zipPath, $extractDir -Recurse -Force -ErrorAction SilentlyContinue
