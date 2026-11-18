using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AssetSchool.Student.Service;

public static class SessionManager
{
    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr hToken);

    [DllImport("wtsapi32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSEnumerateSessions(
        IntPtr hServer,
        int Reserved,
        int Version,
        out IntPtr ppSessionInfo,
        out int pCount);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr pMemory);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool CreateProcessAsUser(
        IntPtr hToken,
        string? lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string? lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WTS_SESSION_INFO
    {
        public int SessionId;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pWinStationName;
        public WTS_CONNECTSTATE_CLASS State;
    }

    public enum WTS_CONNECTSTATE_CLASS
    {
        WTSActive,
        WTSConnected,
        WTSConnectQuery,
        WTSShadow,
        WTSDisconnected,
        WTSIdle,
        WTSListen,
        WTSReset,
        WTSDown,
        WTSInit
    }

    public static uint GetActiveConsoleSessionId()
    {
        return WTSGetActiveConsoleSessionId();
    }

    public static List<uint> GetActiveSessionIds()
    {
        var list = new List<uint>();
        IntPtr pSessionInfo = IntPtr.Zero;
        int count = 0;

        try
        {
            if (WTSEnumerateSessions(IntPtr.Zero, 0, 1, out pSessionInfo, out count))
            {
                int dataSize = Marshal.SizeOf<WTS_SESSION_INFO>();
                long current = pSessionInfo.ToInt64();
                for (int i = 0; i < count; i++)
                {
                    var si = Marshal.PtrToStructure<WTS_SESSION_INFO>(new IntPtr(current));
                    current += dataSize;
                    if (si.SessionId > 0 && si.State == WTS_CONNECTSTATE_CLASS.WTSActive)
                    {
                        list.Add((uint)si.SessionId);
                    }
                }
            }
        }
        catch
        {
            // Fallback en caso de entorno sin soporte WTS completo
        }
        finally
        {
            if (pSessionInfo != IntPtr.Zero)
            {
                WTSFreeMemory(pSessionInfo);
            }
        }

        if (list.Count == 0)
        {
            uint activeId = WTSGetActiveConsoleSessionId();
            if (activeId != 0xFFFFFFFF && activeId != 0)
            {
                list.Add(activeId);
            }
        }

        return list;
    }

    public static bool LaunchSessionAgent(string agentExecutablePath)
    {
        uint activeSessionId = WTSGetActiveConsoleSessionId();
        return LaunchSessionAgentForSession(agentExecutablePath, activeSessionId);
    }

    public static bool LaunchSessionAgentForSession(string agentExecutablePath, uint sessionId)
    {
        if (sessionId == 0 || sessionId == 0xFFFFFFFF)
        {
            Console.WriteLine("[SessionManager] No hay sesión interactiva activa válida en este momento.");
            return false;
        }

        // Verificar si SessionAgent ya está ejecutándose en la sesión destino para evitar duplicados
        try
        {
            var running = Process.GetProcessesByName("AssetSchool.Student.SessionAgent");
            foreach (var p in running)
            {
                if (p.SessionId == (int)sessionId)
                {
                    return true;
                }
            }
        }
        catch
        {
            // Ignorar y proceder con el lanzamiento
        }

        Console.WriteLine($"[SessionManager] Lanzando SessionAgent en la sesión interactiva #{sessionId}...");

        if (!WTSQueryUserToken(sessionId, out IntPtr hToken))
        {
            int err = Marshal.GetLastWin32Error();
            Console.WriteLine($"[SessionManager] WTSQueryUserToken para sesión #{sessionId} falló con error {err}");
            return false;
        }

        try
        {
            var si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = @"winsta0\default"; // Desktop interactivo de la sesión del usuario

            bool success = CreateProcessAsUser(
                hToken,
                agentExecutablePath,
                $"\"{agentExecutablePath}\" --session {sessionId}",
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                0x00000020, // NORMAL_PRIORITY_CLASS
                IntPtr.Zero,
                null,
                ref si,
                out PROCESS_INFORMATION pi);

            if (success)
            {
                Console.WriteLine($"[SessionManager] SessionAgent lanzado con éxito en sesión #{sessionId}. PID={pi.dwProcessId}");
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                return true;
            }
            else
            {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine($"[SessionManager] CreateProcessAsUser falló en sesión #{sessionId} con error {err}");
                return false;
            }
        }
        finally
        {
            CloseHandle(hToken);
        }
    }
}

