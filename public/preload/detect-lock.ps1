$action = $args[0]
$filePath = $args[1]
$targetPid = if ($args[2]) { [int]$args[2] } else { 0 }

function Test-FileLocked($path) {
    try { $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'None'); $fs.Close(); return $false }
    catch { return $true }
}

if ($action -eq "detect") {
    if (-not (Test-Path $filePath)) { Write-Output '[]'; exit 0 }
    if (-not (Test-FileLocked $filePath)) { Write-Output '[]'; exit 0 }

    $results = @()
    $fileName = [System.IO.Path]::GetFileName($filePath)

    # WMI command line search
    try {
        $procs = Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -like "*$fileName*" -and $_.ProcessId -ne $PID
        }
        foreach ($p in $procs) {
            $results += @{ pid = $p.ProcessId; name = $p.Name -replace '\.exe$','' }
        }
    } catch {}

    # File type association fallback
    if ($results.Count -eq 0) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        if ($ext) {
            try {
                $assoc = (cmd /c assoc $ext 2>$null) -replace '.*=', ''
                $ftype = (cmd /c ftype $assoc 2>$null)
                if ($ftype -match '"([^"]+\.exe)"') {
                    $procName = [System.IO.Path]::GetFileNameWithoutExtension($matches[1])
                    Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {
                        $results += @{ pid = $_.Id; name = $_.ProcessName }
                    }
                }
            } catch {}
        }
    }

    if ($results.Count -gt 0) {
        $results | ConvertTo-Json -Compress
    } else {
        @(@{ pid = -1; name = "__LOCKED__" }) | ConvertTo-Json -Compress
    }
}
