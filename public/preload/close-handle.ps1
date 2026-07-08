param($filePath, $targetPid)

if (-not (Test-Path $filePath)) { Write-Output "ERROR: file not found"; exit 0 }

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
        if (r != 0) return "ERROR: RmStartSession returned " + r;
        r = RmRegisterResources(h, 1, new[]{path}, 0, IntPtr.Zero, 0, null);
        if (r != 0) { RmEndSession(h); return "ERROR: RmRegisterResources returned " + r; }
        r = RmShutdown(h, 1, IntPtr.Zero);
        RmEndSession(h);
        if (r == 0) return "SUCCESS";
        if (r == 5) return "ACCESS_DENIED";
        return "ERROR: RmShutdown returned " + r;
    }
}
'@

try {
    Write-Output ([RmClose]::Close($filePath))
} catch {
    Write-Output "ERROR: " + $_.Exception.Message
}
