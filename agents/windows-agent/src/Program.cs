using System;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Threading.Tasks;
using AssetSchool.Agent.Capture;
using AssetSchool.Agent.Streaming;
using AssetSchool.Agent.UI;

namespace AssetSchool.Agent;

public class Program
{
    private static WindowsGraphicsCaptureService _captureService = new();
    private static WebRtcStreamingEngine _streamingEngine = new();
    private static CaptureIndicatorOverlay _indicator = new();

    public static async Task Main(string[] args)
    {
        Console.WriteLine("==================================================");
        Console.WriteLine(" AssetSchool Native Agent — Windows (.NET 8)");
        Console.WriteLine(" Fase 02: Captura Nativa Windows.Graphics.Capture & WebRTC LAN");
        Console.WriteLine("==================================================");

        string hostname = Environment.MachineName;
        string osVersion = Environment.OSVersion.ToString();
        string macAddress = GetPrimaryMacAddress();
        string localIp = "192.168.1.101";

        Console.WriteLine($"[INFO] Hostname: {hostname}");
        Console.WriteLine($"[INFO] Sistema Operativo: {osVersion}");
        Console.WriteLine($"[INFO] MAC Principal: {macAddress}");

        var capabilities = CapabilityReporter.GetCapabilities("pending-enrollment");
        Console.WriteLine("[INFO] Capacidades Nativas Registradas:");
        Console.WriteLine(JsonSerializer.Serialize(capabilities, new JsonSerializerOptions { WriteIndented = true }));

        // Wire up signaling and capture events
        _captureService.OnFrameAvailable += (frame, width, height, ts) =>
        {
            // Frame passed to Direct3D / MediaStreamTrack encoder
        };

        _captureService.OnCaptureError += (err) =>
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"[ERROR CAPTURA] {err}");
            Console.ResetColor();
        };

        _streamingEngine.OnSdpOfferGenerated += (sessionId, sdp) =>
        {
            Console.WriteLine($"[SIGNALING] WEBRTC_OFFER generado para emitir al Gateway LAN (Sesión {sessionId})");
        };

        _streamingEngine.OnIceCandidateGenerated += (candidate) =>
        {
            Console.WriteLine($"[SIGNALING] WEBRTC_ICE_CANDIDATE generado: {candidate.Candidate}");
        };

        _streamingEngine.OnStatsAvailable += (stats) =>
        {
            // Emitted via socket to teacher for live telemetry
        };

        Console.WriteLine("\n[LAN ENGINE] Agente Windows listo para recibir comandos SCREEN_CAPTURE_START desde el servidor local.");
        Console.WriteLine("[LAN ENGINE] Simulación de ciclo de vida de captura supervisada para verificación...");

        // Demonstrate start capture
        var config = new StreamConfiguration
        {
            QualityTier = QualityTier.Thumbnail,
            TargetWidth = 640,
            TargetHeight = 360,
            TargetFps = 10,
            TargetBitrateKbps = 250
        };

        _indicator.Show("Profesor Carlos Valenzuela");
        _captureService.StartCapture(config);
        _streamingEngine.InitializeSession("stream_demo_win_01", "dev_win_01", localIp, config);
        string sdp = _streamingEngine.CreateOffer(QualityTier.Thumbnail);

        await Task.Delay(500);

        // Immediate stop
        _captureService.StopCapture();
        _streamingEngine.Close();
        _indicator.Hide();

        Console.WriteLine("[INFO] Prueba de verificación completada satisfactoriamente.");
    }

    private static string GetPrimaryMacAddress()
    {
        var nic = NetworkInterface.GetAllNetworkInterfaces()
            .FirstOrDefault(n => n.OperationalStatus == OperationalStatus.Up && 
                                 n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        return nic != null ? string.Join(":", nic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2"))) : "00:00:00:00:00:00";
    }
}
