using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AssetSchool.Student.Service;

public static class SessionManager
{
    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr hToken);

    [DllImport("wtsapi32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

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

    public static bool LaunchSessionAgent(string agentExecutablePath)
    {
        uint activeSessionId = WTSGetActiveConsoleSessionId();
        if (activeSessionId == 0xFFFFFFFF)
        {
            Console.WriteLine("[SessionManager] No hay sesión interactiva activa en este momento.");
            return false;
        }

        Console.WriteLine($"[SessionManager] Lanzando SessionAgent en la sesión interactiva #{activeSessionId}...");

        if (!WTSQueryUserToken(activeSessionId, out IntPtr hToken))
        {
            int err = Marshal.GetLastWin32Error();
            Console.WriteLine($"[SessionManager] WTSQueryUserToken falló con error {err}");
            return false;
        }

        try
        {
            var si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = @"winsta0\default"; // Desktop interactivo de la sesión

            bool success = CreateProcessAsUser(
                hToken,
                agentExecutablePath,
                $"\"{agentExecutablePath}\" --session {activeSessionId}",
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
                Console.WriteLine($"[SessionManager] SessionAgent lanzado con éxito. PID={pi.dwProcessId}");
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                return true;
            }
            else
            {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine($"[SessionManager] CreateProcessAsUser falló con error {err}");
                return false;
            }
        }
        finally
        {
            CloseHandle(hToken);
        }
    }
}
