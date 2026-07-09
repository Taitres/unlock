param($filePath)

# 文件不存在 → 空数组
if (-not (Test-Path -LiteralPath $filePath)) {
    Write-Output '[]'
    exit 0
}

# PS5.1 默认输出编码是 GBK,中文路径会乱码。强制 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 加载 Restart Manager P/Invoke
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

[StructLayout(LayoutKind.Sequential)]
public struct RM_UNIQUE_PROCESS {
    public uint dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.LPTStr)] public string strAppName;
    [MarshalAs(UnmanagedType.LPTStr)] public string strServiceShortName;
    [MarshalAs(UnmanagedType.LPTStr)] public string strApplicationName;
    public uint ApplicationType;
    public uint AppStatus;
    public uint fBackground;
    public uint fVetoing;
    public uint fPaused;
    public uint fPausedByUser;
}

public static class RestartManager {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmRegisterResources(uint hSession, uint nFiles, string[] rgsFilenames, uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmGetList(uint hSession, out uint pnProcInfoNeeded, uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, out uint lpdwRebootReasons);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint hSession);
}
'@

function Convert-AppType($t) {
    switch ($t) {
        1 { 'MainWindow' }
        2 { 'OtherWindow' }
        3 { 'Service' }
        4 { 'Explorer' }
        5 { 'Console' }
        6 { 'Critical' }
        default { 'Unknown' }
    }
}

$hSession = 0
$startRc = [RestartManager]::RmStartSession([ref]$hSession, 0, [Guid]::NewGuid().ToString())
if ($startRc -ne 0) {
    @(@{ pid = -1; name = '__LOCKED__'; locked = $false }) | ConvertTo-Json -Compress
    exit 0
}

try {
    $regRc = [RestartManager]::RmRegisterResources($hSession, 1, @($filePath), 0, [IntPtr]::Zero, 0, $null)
    if ($regRc -ne 0) {
        @(@{ pid = -1; name = '__LOCKED__'; locked = $false }) | ConvertTo-Json -Compress
        return
    }

    $needed = 0
    $reboot = 0
    $null = [RestartManager]::RmGetList($hSession, [ref]$needed, 0, $null, [ref]$reboot)

    if ($needed -eq 0) {
        Write-Output '[]'
        return
    }

    $infos = New-Object 'RM_PROCESS_INFO[]' $needed
    $listRc = [RestartManager]::RmGetList($hSession, [ref]$needed, $needed, $infos, [ref]$reboot)
    if ($listRc -ne 0) {
        @(@{ pid = -1; name = '__LOCKED__'; locked = $false }) | ConvertTo-Json -Compress
        return
    }

    $results = @()
    foreach ($info in $infos) {
        $p = $info.Process.dwProcessId
        $proc = $null
        try { $proc = Get-Process -Id $p -ErrorAction Stop } catch {}

        $exePath = ''
        if ($proc) {
            try { $exePath = $proc.MainModule.FileName } catch {}
        }
        if (-not $exePath) {
            try {
                $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction Stop
                if ($cim) { $exePath = $cim.ExecutablePath }
            } catch {}
        }

        $appName = $info.strApplicationName
        if (-not $appName) { $appName = $info.strAppName }
        if (-not $appName -and $proc) { $appName = $proc.ProcessName }

        $results += @{
            pid     = $p
            name    = if ($proc) { $proc.ProcessName } else { $info.strAppName }
            appName = $appName
            exePath = if ($exePath) { $exePath } else { '' }
            appType = Convert-AppType $info.ApplicationType
        }
    }

    if ($results.Count -gt 0) {
        $results | ConvertTo-Json -Compress
    } else {
        @(@{ pid = -1; name = '__LOCKED__'; locked = $true }) | ConvertTo-Json -Compress
    }
} finally {
    $null = [RestartManager]::RmEndSession($hSession)
}
