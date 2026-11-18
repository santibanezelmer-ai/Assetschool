using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AssetSchool.Student.Service;

public static class PowerManager
{
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool InitiateSystemShutdownEx(
        string? lpMachineName,
        string? lpMessage,
        uint dwTimeout,
        bool bForceAppsClosed,
        bool bRebootAfterShutdown,
        uint dwReason);

    public static void ExecutePowerAction(string operation, int delaySeconds = 5, string reason = "Orden del profesor")
    {
        Console.WriteLine($"[PowerManager] Ejecutando acción de energía: {operation} con retardo de {delaySeconds}s");

        try
        {
            switch (operation.ToLowerInvariant())
            {
                case "reboot":
                    InitiateSystemShutdownEx(null, reason, (uint)delaySeconds, true, true, 0x80020000);
                    break;
                case "shutdown":
                    InitiateSystemShutdownEx(null, reason, (uint)delaySeconds, true, false, 0x80020000);
                    break;
                case "logout":
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "shutdown.exe",
                        Arguments = "/l",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    });
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PowerManager] Error ejecutando acción de energía: {ex.Message}");
        }
    }
}
