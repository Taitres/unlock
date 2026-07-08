$action = $args[0]
$filePath = $args[1]

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;

namespace FileLockTools
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RM_UNIQUE_PROCESS
    {
        public int dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    public enum RM_APP_TYPE : uint
    {
        RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2,
        RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct RM_PROCESS_INFO
    {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.LPWStr)] public string strAppName;
        [MarshalAs(UnmanagedType.LPWStr)] public string strServiceShortName;
        public RM_APP_TYPE ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }

    public static class Native
    {
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        public static extern int RmStartSession(out uint sessionHandle, int dwSessionFlags, string strSessionKey);
        [DllImport("rstrtmgr.dll")]
        public static extern int RmEndSession(uint sessionHandle);
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        public static extern int RmRegisterResources(uint sessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, [In] RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
        [DllImport("rstrtmgr.dll")]
        public static extern int RmGetList(uint sessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
        [DllImport("rstrtmgr.dll")]
        public static extern int RmShutdown(uint sessionHandle, uint lActionFlags, string fnStatus);
    }

    public static class SimpleJson
    {
        public static string Serialize(System.Collections.IList list)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append("[");
            for (int i = 0; i < list.Count; i++)
            {
                if (i > 0) sb.Append(",");
                var item = list[i];
                var props = item.GetType().GetProperties();
                sb.Append("{");
                for (int j = 0; j < props.Length; j++)
                {
                    if (j > 0) sb.Append(",");
                    sb.Append("\"" + props[j].Name + "\":");
                    var val = props[j].GetValue(item);
                    if (val is int) sb.Append(val.ToString());
                    else if (val is uint) sb.Append(val.ToString());
                    else sb.Append("\"" + (val ?? "").ToString().Replace("\"", "\\\"") + "\"");
                }
                sb.Append("}");
            }
            sb.Append("]");
            return sb.ToString();
        }
    }

    public static class FileLockFinder
    {
        public static string Find(string filePath)
        {
            uint handle = 0;
            string key = Guid.NewGuid().ToString();
            int result = Native.RmStartSession(out handle, 0, key);
            if (result != 0) return "ERROR:RmStartSession:" + result;

            string[] resources = new string[] { filePath };
            result = Native.RmRegisterResources(handle, 1, resources, 0, null, 0, null);
            if (result != 0)
            {
                Native.RmEndSession(handle);
                return "ERROR:RmRegisterResources:" + result;
            }

            uint count = 0;
            uint need = 0;
            uint reason = 0;
            RM_PROCESS_INFO[] apps = null;

            try
            {
                result = Native.RmGetList(handle, out need, ref count, apps, ref reason);
            }
            catch
            {
                result = 234;
            }

            if (result == 234 && need > 0)
            {
                apps = new RM_PROCESS_INFO[need];
                count = need;
                result = Native.RmGetList(handle, out need, ref count, apps, ref reason);
            }

            Native.RmEndSession(handle);

            if (result != 0) return "ERROR:RmGetList:" + result;

            var list = new List<object>();
            for (uint i = 0; i < count; i++)
            {
                list.Add(new { pid = apps[i].Process.dwProcessId, name = apps[i].strAppName ?? "" });
            }

            return SimpleJson.Serialize(list);
        }

        public static string Close(string filePath)
        {
            uint handle = 0;
            string key = Guid.NewGuid().ToString();
            int result = Native.RmStartSession(out handle, 0, key);
            if (result != 0) return "ERROR:RmStartSession:" + result;

            string[] resources = new string[] { filePath };
            result = Native.RmRegisterResources(handle, 1, resources, 0, null, 0, null);
            if (result != 0)
            {
                Native.RmEndSession(handle);
                return "ERROR:RmRegisterResources:" + result;
            }

            result = Native.RmShutdown(handle, 1, null);
            Native.RmEndSession(handle);

            if (result != 0) return "ERROR:RmShutdown:" + result;
            return "SUCCESS";
        }
    }
}
'@

$action = $args[0]
$filePath = $args[1]

if ($action -eq "find") {
    [FileLockTools.FileLockFinder]::Find($filePath)
} elseif ($action -eq "close") {
    [FileLockTools.FileLockFinder]::Close($filePath)
}
