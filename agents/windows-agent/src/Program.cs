using System.Net.NetworkInformation;
using System.Text.Json;

namespace AssetSchool.Agent;

public class Program
{
    public static async Task Main(string[] args)
    {
        Console.WriteLine("==================================================");
        Console.WriteLine(" AssetSchool Native Agent — Windows (.NET 8)");
        Console.WriteLine(" Fase 01: Fundación de Arquitectura y Protocolo");
        Console.WriteLine("==================================================");

        string hostname = Environment.MachineName;
        string osVersion = Environment.OSVersion.ToString();
        string macAddress = GetPrimaryMacAddress();

        Console.WriteLine($"[INFO] Hostname: {hostname}");
        Console.WriteLine($"[INFO] Sistema Operativo: {osVersion}");
        Console.WriteLine($"[INFO] MAC Principal: {macAddress}");

        var capabilities = CapabilityReporter.GetCapabilities("pending-enrollment");
        Console.WriteLine($"[INFO] Capacidades Nativas Registradas:");
        Console.WriteLine(JsonSerializer.Serialize(capabilities, new JsonSerializerOptions { WriteIndented = true }));

        Console.WriteLine("[INFO] Agente Windows inicializado en modo de espera de descubrimiento LAN.");
        Console.WriteLine("[INFO] Para la Fase 01, la estructura de protocolo y reporte de capacidades está lista.");
        
        await Task.CompletedTask;
    }

    private static string GetPrimaryMacAddress()
    {
        var nic = NetworkInterface.GetAllNetworkInterfaces()
            .FirstOrDefault(n => n.OperationalStatus == OperationalStatus.Up && 
                                 n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        return nic != null ? string.Join(":", nic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2"))) : "00:00:00:00:00:00";
    }
}
