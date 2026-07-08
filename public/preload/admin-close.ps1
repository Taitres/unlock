param($filePath, $targetPid, $resultFile)

if (-not (Test-Path $filePath)) {
    if ($resultFile) { [System.IO.File]::WriteAllText($resultFile, '{"success":false,"closed":0,"error":"file not found"}', (New-Object System.Text.UTF8Encoding $false)) }
    exit 1
}

# This script runs WITH admin privileges (UAC elevated).
# Uses NtQuerySystemInformation + NtDuplicateObject(DUPLICATE_CLOSE_SOURCE)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
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

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern uint QueryDosDevice(string lpDeviceName, [Out] StringBuilder lpTargetPath, int ucchMax);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern SafeProcessHandle OpenProcess(int access, bool inherit, int pid);

    [DllImport("ntdll.dll")]
    static extern uint NtQuerySystemInformation(uint cls, IntPtr info, uint len, out uint retLen);

    [DllImport("ntdll.dll")]
    static extern uint NtDuplicateObject(IntPtr srcProc, IntPtr srcHandle, IntPtr tgtProc, out IntPtr tgtHandle, uint access, uint attrs, uint opts);

    [DllImport("ntdll.dll")]
    static extern uint NtQueryObject(IntPtr handle, int cls, IntPtr info, uint len, out uint retLen);

    [DllImport("ntdll.dll")]
    static extern uint NtClose(IntPtr handle);

    static string DosToNt(string path)
    {
        string full = Path.GetFullPath(path);
        if (full.Length < 2 || full[1] != ':') return null;
        string drive = full.Substring(0, 2);
        string remainder = full.Substring(2);
        StringBuilder device = new StringBuilder(512);
        uint len = QueryDosDevice(drive, device, device.Capacity);
        if (len == 0) return null;
        return (device.ToString() + remainder).ToLowerInvariant();
    }

    static string ReadUnicodeString(IntPtr uniBuf)
    {
        ushort length = (ushort)Marshal.ReadInt16(uniBuf);
        if (length == 0) return null;
        IntPtr buffer = Marshal.ReadIntPtr(IntPtr.Add(uniBuf, IntPtr.Size));
        return Marshal.PtrToStringUni(buffer, length / 2);
    }

    static string QueryObjectName(IntPtr handle)
    {
        uint size = 0x2000;
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try
        {
            uint len = 0;
            uint result = NtQueryObject(handle, 1, buf, size, out len);
            if (result != STATUS_SUCCESS) return null;
            return ReadUnicodeString(buf);
        }
        catch { return null; }
        finally { Marshal.FreeHGlobal(buf); }
    }

    static string QueryObjectTypeName(IntPtr handle)
    {
        uint size = 0x1000;
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try
        {
            uint len = 0;
            uint result = NtQueryObject(handle, 2, buf, size, out len);
            if (result != STATUS_SUCCESS) return null;
            return ReadUnicodeString(buf);
        }
        catch { return null; }
        finally { Marshal.FreeHGlobal(buf); }
    }

    public static int Close(string filePath, int targetPid, out string error)
    {
        error = null;
        string targetNt = DosToNt(filePath);
        if (targetNt == null)
        {
            error = "Cannot convert path to NT path";
            return 0;
        }

        SafeProcessHandle procHandle = OpenProcess(PROCESS_DUP_HANDLE | PROCESS_QUERY_INFORMATION, false, targetPid);
        if (procHandle == null || procHandle.IsInvalid)
        {
            error = "Cannot open target process: " + new Win32Exception(Marshal.GetLastWin32Error()).Message;
            return 0;
        }

        uint bufSize = 0x200000;
        IntPtr buf = IntPtr.Zero;
        uint result = 0;
        uint needed = 0;

        for (int retry = 0; retry < 5; retry++)
        {
            if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
            buf = Marshal.AllocHGlobal((int)bufSize);
            needed = 0;
            result = NtQuerySystemInformation(SystemHandleInformation, buf, bufSize, out needed);
            if (result == STATUS_INFO_LENGTH_MISMATCH)
            {
                bufSize = Math.Max(needed, bufSize * 2);
                continue;
            }
            break;
        }

        if (result != STATUS_SUCCESS)
        {
            Marshal.FreeHGlobal(buf);
            procHandle.Close();
            error = "NtQuerySystemInformation failed: 0x" + result.ToString("X");
            return 0;
        }

        uint count = (uint)Marshal.ReadInt32(buf);
        int entrySize = Marshal.SizeOf(typeof(SH_ENTRY));
        IntPtr entryPtr = IntPtr.Add(buf, 4);
        List<ushort> toClose = new List<ushort>();
        byte? fileTypeIndex = null;

        for (uint i = 0; i < count; i++)
        {
            IntPtr addr = IntPtr.Add(entryPtr, (int)(i * entrySize));
            SH_ENTRY entry = (SH_ENTRY)Marshal.PtrToStructure(addr, typeof(SH_ENTRY));
            if (entry.UniqueProcessId != targetPid) continue;

            IntPtr dupHandle = IntPtr.Zero;
            uint dupResult = NtDuplicateObject(procHandle.DangerousGetHandle(), new IntPtr(entry.HandleValue),
                Process.GetCurrentProcess().Handle, out dupHandle, 0, 0, 0);
            if (dupResult != STATUS_SUCCESS || dupHandle == IntPtr.Zero) continue;

            try
            {
                if (fileTypeIndex.HasValue && entry.ObjectTypeIndex != fileTypeIndex.Value)
                    continue;

                string name = QueryObjectName(dupHandle);
                if (string.IsNullOrEmpty(name))
                {
                    if (!fileTypeIndex.HasValue)
                    {
                        string typeName = QueryObjectTypeName(dupHandle);
                        if (typeName == "File")
                            fileTypeIndex = entry.ObjectTypeIndex;
                    }
                    continue;
                }

                string lowerName = name.ToLowerInvariant();
                if (!fileTypeIndex.HasValue)
                {
                    string typeName = QueryObjectTypeName(dupHandle);
                    if (typeName == "File")
                        fileTypeIndex = entry.ObjectTypeIndex;
                    else
                        continue;
                }

                if (lowerName == targetNt || lowerName.StartsWith(targetNt + "\\"))
                    toClose.Add(entry.HandleValue);
            }
            finally
            {
                NtClose(dupHandle);
            }
        }

        Marshal.FreeHGlobal(buf);

        int closed = 0;
        foreach (ushort hv in toClose)
        {
            IntPtr tgt = IntPtr.Zero;
            uint cr = NtDuplicateObject(procHandle.DangerousGetHandle(), new IntPtr(hv),
                IntPtr.Zero, out tgt, 0, 0, (uint)DUPLICATE_CLOSE_SOURCE);
            if (cr == STATUS_SUCCESS) closed++;
        }
        procHandle.Close();

        if (closed == 0 && string.IsNullOrEmpty(error))
            error = "No matching file handle found";

        return closed;
    }
}
'@

$errorMsg = $null
try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $closed = [AdminHandleCloser]::Close($filePath, [int]$targetPid, [ref]$errorMsg)
    $sw.Stop()
    $result = @{ success = ($closed -gt 0); closed = $closed; elapsedMs = $sw.ElapsedMilliseconds; error = $errorMsg }
} catch {
    $result = @{ success = $false; closed = 0; error = $_.Exception.Message }
}

$json = $result | ConvertTo-Json -Compress
if ($resultFile) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($resultFile, $json, $utf8NoBom)
}
Write-Host $json
if ($result.success) { exit 0 } else { exit 1 }
