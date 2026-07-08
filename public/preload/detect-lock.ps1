$action = $args[0]
$filePath = $args[1]

if ($action -eq "detect") {
    if (-not (Test-Path $filePath)) { Write-Output '[]'; exit 0 }

    $isLocked = $false
    try { $fs = [System.IO.File]::Open($filePath, 'Open', 'Read', 'None'); $fs.Close() }
    catch { $isLocked = $true }

    if (-not $isLocked) { Write-Output '[]'; exit 0 }

    # Method 1: WMI - search command lines (most reliable without admin)
    $results = @()
    $fileName = [System.IO.Path]::GetFileName($filePath)
    $currentPid = $PID
    try {
        $procs = Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -like "*$fileName*" -and $_.ProcessId -ne $currentPid
        }
        foreach ($p in $procs) {
            $results += @{ pid = $p.ProcessId; name = $p.Name -replace '\.exe$','' }
        }
    } catch {}

    # Method 2: File type association fallback
    if ($results.Count -eq 0) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        if ($ext) {
            try {
                $assoc = (cmd /c assoc $ext 2>$null) -replace '.*=',''
                $ftype = (cmd /c ftype $assoc 2>$null)
                if ($ftype -match '"([^"]+\.exe)"') {
                    $procName = [System.IO.Path]::GetFileNameWithoutExtension($matches[1])
                    $matching = Get-Process -Name $procName -ErrorAction SilentlyContinue
                    if ($matching) {
                        foreach ($p in $matching) {
                            $results += @{ pid = $p.Id; name = $p.ProcessName }
                        }
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
elseif ($action -eq "close") {
    # RM shutdown for registered applications
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
        uint h = 0; string k = Guid.NewGuid().ToString();
        int r = RmStartSession(out h, 0, k);
        if (r != 0) return "ERROR:RmStartSession:"+r;
        r = RmRegisterResources(h, 1, new[]{path}, 0, IntPtr.Zero, 0, null);
        if (r != 0) { RmEndSession(h); return "ERROR:RmRegisterResources:"+r; }
        r = RmShutdown(h, 1, IntPtr.Zero);
        RmEndSession(h);
        return r != 0 ? "ERROR:RmShutdown:"+r : "SUCCESS";
    }
}
'@
    Write-Output ([RmClose]::Close($filePath))
}
