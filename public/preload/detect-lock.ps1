# Combined script for detecting and closing file locks
# Usage: detect-lock.ps1 <detect|close> <filePath>

$action = $args[0]
$filePath = $args[1]

function Test-FileLocked($path) {
    try {
        $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'None')
        $fs.Close()
        return $false
    } catch {
        return $true
    }
}

function Get-RunningProcesses {
    Get-Process | Select-Object Id, ProcessName, MainWindowTitle | ForEach-Object {
        @{ pid = $_.Id; name = $_.ProcessName }
    }
}

function Find-WithHandleExe($path) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $handleExe = Join-Path $scriptDir "handle64.exe"
    if (-not (Test-Path $handleExe)) {
        $handleExe = Join-Path $scriptDir "handle.exe"
    }
    if (-not (Test-Path $handleExe)) {
        return $null
    }

    try {
        $output = & $handleExe -accepteula -nobanner -v $path 2>$null
        if (-not $output) { return @() }

        $results = @()
        $lines = $output -split "`n"
        $currentProc = $null

        foreach ($line in $lines) {
            $trimmed = $line.Trim()
            if ($trimmed -eq '') { continue }

            if ($trimmed -match '^([\w.]+)\s+pid:\s*(\d+)\s') {
                $currentProc = @{ name = $matches[1]; pid = [int]$matches[2] }
            }
            elseif ($trimmed -match '^\s*[\dA-F]+:\s*File\s+') {
                if ($currentProc -and $trimmed -match [regex]::Escape($path)) {
                    $results += $currentProc
                    $currentProc = $null
                }
            }
        }
        return $results
    } catch {
        return $null
    }
}

if ($action -eq "detect") {
    # Step 1: Check if file is locked
    $isLocked = Test-FileLocked $filePath

    if (-not $isLocked) {
        Write-Output '[]'
        exit 0
    }

    # Step 2: Try handle.exe for precise detection
    $handleResults = Find-WithHandleExe $filePath

    if ($handleResults -ne $null) {
        $json = $handleResults | ForEach-Object { $_ } | ConvertTo-Json -Compress
        if ($null -eq $handleResults -or $handleResults.Count -eq 0) {
            Write-Output '[]'
        } else {
            $list = @()
            foreach ($r in $handleResults) {
                $list += @{ pid = $r.pid; name = $r.name }
            }
            $list | ConvertTo-Json -Compress
        }
        exit 0
    }

    # Step 3: Fallback - file is locked but we can't identify specifically
    # Try to find the associated program by extension
    $ext = [System.IO.Path]::GetExtension($filePath)
    $candidates = @()

    if ($ext) {
        try {
            $assoc = (cmd /c assoc $ext 2>$null) -replace '.*=',''
            $ftype = (cmd /c ftype $assoc 2>$null) -replace '.*="?([^"]+)"?.*','$1'
            if ($ftype) {
                $procName = [System.IO.Path]::GetFileNameWithoutExtension($ftype)
                $matching = Get-Process -Name $procName -ErrorAction SilentlyContinue
                if ($matching) {
                    foreach ($p in $matching) {
                        $candidates += @{ pid = $p.Id; name = $p.ProcessName; method = "FTYPE" }
                    }
                }
            }
        } catch {}
    }

    if ($candidates.Count -eq 0) {
        $candidates += @{ pid = -1; name = "__LOCKED__"; method = "HINT" }
    }
    $candidates | ConvertTo-Json -Compress
}
elseif ($action -eq "close") {
    # Try RM shutdown as primary close method
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RmClose {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmStartSession(out uint h, int f, string k);
    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint h);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmRegisterResources(uint h, uint n, string[] r, uint na, IntPtr a, uint ns, string[] s);
    [DllImport("rstrtmgr.dll")]
    public static extern int RmShutdown(uint h, uint action, IntPtr status);
    public static string Close(string path) {
        uint handle = 0;
        string key = Guid.NewGuid().ToString();
        int result = RmStartSession(out handle, 0, key);
        if (result != 0) return "ERROR:RmStartSession:" + result;
        string[] resources = new string[] { path };
        result = RmRegisterResources(handle, 1, resources, 0, IntPtr.Zero, 0, null);
        if (result != 0) { RmEndSession(handle); return "ERROR:RmRegisterResources:" + result; }
        result = RmShutdown(handle, 1, IntPtr.Zero);
        RmEndSession(handle);
        if (result != 0) return "ERROR:RmShutdown:" + result;
        return "SUCCESS";
    }
}
'@
        $result = [RmClose]::Close($filePath)
        Write-Output $result
    } catch {
        Write-Output "ERROR:RM:" + $_.Exception.Message
    }
}
