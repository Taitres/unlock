const os = require('node:os')

/**
 * Parse lsof output lines into process info objects.
 * @param {string} output - Raw lsof output (lines: "PID NAME")
 * @returns {Array<{pid: number, name: string}>}
 */
function parseLsofOutput(output) {
  const lines = output.trim().split('\n')
  const processes = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const spaceIdx = trimmed.indexOf(' ')
    if (spaceIdx === -1) continue
    const pid = parseInt(trimmed.substring(0, spaceIdx), 10)
    const name = trimmed.substring(spaceIdx + 1).trim()
    if (isNaN(pid) || !name) continue
    processes.push({ pid, name })
  }
  return processes
}

/**
 * Build the PowerShell script for Windows RestartManager API.
 * Outputs JSON array of {pid, name} to stdout.
 * @param {string} filePath
 * @returns {string} PowerShell script content
 */
function getFindProcessesScript(filePath) {
  const escapedPath = filePath.replace(/'/g, "''")
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
public enum RM_APP_TYPE { RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000 }
public struct RM_PROCESS_INFO { public RM_UNIQUE_PROCESS Process; public string strAppName; public string strServiceShortName; public RM_APP_TYPE ApplicationType; public uint AppStatus; public uint TSSessionId; [MarshalAs(UnmanagedType.Bool)] public bool bRestartable; }
public class RM {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmStartSession(out uint h, int f, string k);
    [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint h);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmRegisterResources(uint h, uint n, string[] r, uint na, IntPtr a, uint ns, string[] s);
    [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint h, out uint need, ref uint count, [In, Out] RM_PROCESS_INFO[] apps, ref uint reason);
}
"@
$handle = [uint32]0
$key = [Guid]::NewGuid().ToString()
$result = [RM]::RmStartSession([ref]$handle, 0, $key)
if ($result -ne 0) { Write-Error "RmStartSession failed: $result"; exit 1 }
$resources = @('${escapedPath}')
$result = [RM]::RmRegisterResources($handle, 1, $resources, 0, [IntPtr]::Zero, 0, @())
if ($result -ne 0) { Write-Error "RmRegisterResources failed: $result"; [RM]::RmEndSession($handle); exit 1 }
$count = [uint32]0
$need = [uint32]0
$reason = [uint32]0
$apps = @()
$result = [RM]::RmGetList($handle, [ref]$need, [ref]$count, $apps, [ref]$reason)
if ($result -eq 234) {
    $apps = New-Object 'RM_PROCESS_INFO[]' $need
    $count = $need
    $result = [RM]::RmGetList($handle, [ref]$need, [ref]$count, $apps, [ref]$reason)
}
[RM]::RmEndSession($handle)
if ($result -ne 0) { Write-Error "RmGetList failed: $result"; exit 1 }
$resultList = @()
for ($i = 0; $i -lt $count; $i++) {
    $resultList += @{ pid = $apps[$i].Process.dwProcessId; name = $apps[$i].strAppName }
}
$resultList | ConvertTo-Json -Compress
`.trim()
}

/**
 * Build the PowerShell script for closing handles on Windows.
 * Uses RmShutdown to close processes locking the file.
 * @param {string} filePath
 * @returns {string} PowerShell script content
 */
function getCloseHandlesScript(filePath) {
  const escapedPath = filePath.replace(/'/g, "''")
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RM2 {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmStartSession(out uint h, int f, string k);
    [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint h);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmRegisterResources(uint h, uint n, string[] r, uint na, IntPtr a, uint ns, string[] s);
    [DllImport("rstrtmgr.dll")] public static extern int RmShutdown(uint h, uint action, IntPtr status);
}
"@
$handle = [uint32]0
$key = [Guid]::NewGuid().ToString()
$result = [RM2]::RmStartSession([ref]$handle, 0, $key)
if ($result -ne 0) { Write-Error "RmStartSession failed: $result"; exit 1 }
$resources = @('${escapedPath}')
$result = [RM2]::RmRegisterResources($handle, 1, $resources, 0, [IntPtr]::Zero, 0, @())
if ($result -ne 0) { Write-Error "RmRegisterResources failed: $result"; [RM2]::RmEndSession($handle); exit 1 }
$result = [RM2]::RmShutdown($handle, 1, [IntPtr]::Zero)
[RM2]::RmEndSession($handle)
if ($result -ne 0) { Write-Error "RmShutdown failed: $result"; exit 1 }
"SUCCESS"
`.trim()
}

/**
 * Get the process kill command for current platform.
 * @param {number} pid
 * @returns {{cmd: string, args: string[]}}
 */
function getKillCommand(pid) {
  if (os.platform() === 'win32') {
    return { cmd: 'taskkill', args: ['/PID', String(pid), '/F'] }
  }
  return { cmd: 'kill', args: ['-9', String(pid)] }
}

module.exports = {
  parseLsofOutput,
  getFindProcessesScript,
  getCloseHandlesScript,
  getKillCommand
}
