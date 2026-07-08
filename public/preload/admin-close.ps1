param($filePath, $targetPid)

if (-not (Test-Path $filePath)) { exit 1 }

# This script runs WITH admin privileges (UAC elevated)
# Uses NtQuerySystemInformation + NtDuplicateObject(DUPLICATE_CLOSE_SOURCE)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class AdminHandleCloser
{
    const uint SystemHandleInformation = 16;
    const uint STATUS_SUCCESS = 0;
    const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;
    const int DUPLICATE_CLOSE_SOURCE = 1;
    const int PROCESS_DUP_HANDLE = 0x0040;
    const int PROCESS_QUERY_INFORMATION = 0x0400;

    [StructLayout(LayoutKind.Sequential)]
    struct SH_ENTRY
    {
        public ushort UniqueProcessId;
        public ushort CreatorBackTraceIndex;
        public byte ObjectTypeIndex;
        public byte HandleAttributes;
        public ushort HandleValue;
        public IntPtr Object;
        public uint GrantedAccess;
    }

    [DllImport("ntdll.dll")]
    static extern uint NtQuerySystemInformation(uint cls, IntPtr info, uint len, out uint retLen);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern SafeWaitHandle OpenProcess(int access, bool inherit, int pid);

    [DllImport("ntdll.dll")]
    static extern uint NtDuplicateObject(IntPtr srcProc, IntPtr srcHandle, IntPtr tgtProc, out IntPtr tgtHandle, uint access, uint attrs, uint opts);

    [DllImport("ntdll.dll")]
    static extern uint NtQueryObject(IntPtr handle, int cls, IntPtr info, uint len, out uint retLen);

    [DllImport("ntdll.dll")]
    static extern uint NtClose(IntPtr handle);

    public static int Close(string filePath, int targetPid)
    {
        string resolved = Path.GetFullPath(filePath).ToLowerInvariant();

        SafeWaitHandle procHandle = OpenProcess(PROCESS_DUP_HANDLE | PROCESS_QUERY_INFORMATION, false, targetPid);
        if (procHandle == null || procHandle.IsInvalid)
        {
            return Marshal.GetLastWin32Error();
        }

        uint bufSize = 0x200000;
        IntPtr buf = IntPtr.Zero;
        uint result = 0;
        uint needed = 0;

        for (int retry = 0; retry < 3; retry++)
        {
            if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
            buf = Marshal.AllocHGlobal((int)bufSize);
            needed = 0;
            result = NtQuerySystemInformation(SystemHandleInformation, buf, bufSize, out needed);
            if (result == STATUS_INFO_LENGTH_MISMATCH) { bufSize = Math.Max(needed, bufSize * 2); continue; }
            break;
        }

        if (result != STATUS_SUCCESS)
        {
            if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
            procHandle.Close();
            return (int)result;
        }

        uint count = (uint)Marshal.ReadInt32(buf);
        int entrySize = Marshal.SizeOf(typeof(SH_ENTRY));
        IntPtr entryPtr = IntPtr.Add(buf, 4);
        List<ushort> toClose = new List<ushort>();

        for (uint i = 0; i < count; i++)
        {
            IntPtr addr = IntPtr.Add(entryPtr, (int)(i * entrySize));
            SH_ENTRY entry = (SH_ENTRY)Marshal.PtrToStructure(addr, typeof(SH_ENTRY));
            if (entry.UniqueProcessId != targetPid) continue;

            IntPtr dupHandle = IntPtr.Zero;
            uint dupResult = NtDuplicateObject(procHandle.DangerousGetHandle(), new IntPtr(entry.HandleValue),
                Process.GetCurrentProcess().Handle, out dupHandle, 0, 0, 0);
            if (dupResult != STATUS_SUCCESS || dupHandle == IntPtr.Zero) continue;

            string objName = GetObjectName(dupHandle);
            if (objName != null && objName.ToLowerInvariant().Contains(resolved))
                toClose.Add(entry.HandleValue);

            NtClose(dupHandle);
        }

        Marshal.FreeHGlobal(buf);

        int closed = 0;
        foreach (ushort hv in toClose)
        {
            IntPtr tgt = IntPtr.Zero;
            uint cr = NtDuplicateObject(procHandle.DangerousGetHandle(), new IntPtr(hv),
                IntPtr.Zero, out tgt, 0, 0, DUPLICATE_CLOSE_SOURCE);
            if (cr == STATUS_SUCCESS) closed++;
        }
        procHandle.Close();

        return closed;
    }

    static string GetObjectName(IntPtr handle)
    {
        uint size = 0x2000;
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try
        {
            uint len = 0;
            uint result = NtQueryObject(handle, 1, buf, size, out len);
            if (result == STATUS_SUCCESS)
            {
                ushort nameLen = (ushort)Marshal.ReadInt16(buf);
                if (nameLen > 0)
                {
                    IntPtr namePtr = Marshal.ReadIntPtr(buf, 8);
                    return Marshal.PtrToStringUni(namePtr, nameLen / 2);
                }
            }
            return null;
        }
        catch { return null; }
        finally { Marshal.FreeHGlobal(buf); }
    }
}
'@

Write-Host "[AdminHandleCloser] Closing handles for PID=$targetPid, File=$filePath"
$count = [AdminHandleCloser]::Close($filePath, [int]$targetPid)
Write-Host "[AdminHandleCloser] Closed $count handles"
exit 0
