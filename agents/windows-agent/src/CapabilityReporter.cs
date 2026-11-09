namespace AssetSchool.Agent;

/// <summary>
/// Declara formalmente las capacidades reales nativas soportadas en Windows 10/11.
/// Sin simulación de características no implementadas o no autorizadas.
/// </summary>
public static class CapabilityReporter
{
    public static object GetCapabilities(string deviceId)
    {
        return new
        {
            deviceId = deviceId,
            osType = "windows",
            // Capacidades nativas viables en Windows a través de Win32 API y Windows Graphics Capture
            canScreenBroadcast = true,
            canScreenReceive = true,
            canRemoteInput = true,
            canLockInput = true,           // Bloqueo de teclado/ratón vía User32 BlockInput / LowLevelHooks
            canBlackoutScreen = true,       // Ventana de cortina en pantalla completa AlwaysOnTop
            canFileTransfer = true,         // Transferencia hacia carpetas temporales / Desktop del usuario
            canProcessBlock = true,         // Detección y terminación de ejecutables restringidos
            canUrlBlock = true,             // Filtrado local vía WFP o Winsock SPI / Proxy PAC
            canChat = true,
            canExecuteCommand = true,       // Ejecución de scripts locales autorizados por el docente
            canCollectHardwareInventory = true, // WMI / CIM query de hardware y software instalado
            platformNotes = "Windows 10/11 x64 nativo. Soporta captura de pantalla WGC y control de procesos Win32."
        };
    }
}
