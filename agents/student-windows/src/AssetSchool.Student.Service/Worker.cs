using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AssetSchool.Student.Service;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private MultiSessionIpcManager? _sessionIpcManager;
    private ClientWebSocket? _webSocket;
    private string _serverHost = "127.0.0.1";
    private int _serverPort = 3000;
    private string _serverUrl = "";
    private bool _isManualHostConfigured = false;
    private string _institutionId = "";
    private string _classroomId = "";
    private string _enrollmentToken = "";
    private bool _isConnected;
    private string _deviceId = $"win-{Environment.MachineName.ToLowerInvariant()}";

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
    }

    private void LoadConfiguration()
    {
        // 1. Check environment variables
        var envHost = Environment.GetEnvironmentVariable("ASSETSCHOOL_SERVER_HOST");
        var envPort = Environment.GetEnvironmentVariable("ASSETSCHOOL_SERVER_PORT");
        var envUrl = Environment.GetEnvironmentVariable("ASSETSCHOOL_SERVER_URL");

        if (!string.IsNullOrWhiteSpace(envUrl) && Uri.TryCreate(envUrl, UriKind.Absolute, out var parsedUri))
        {
            _serverUrl = envUrl.Trim();
            _serverHost = parsedUri.Host;
            _serverPort = parsedUri.Port;
            _isManualHostConfigured = true;
            _logger.LogInformation($"[Config] Servidor manual configurado vía ASSETSCHOOL_SERVER_URL: {_serverHost}:{_serverPort}");
        }
        else if (!string.IsNullOrWhiteSpace(envHost))
        {
            _serverHost = envHost.Trim();
            if (int.TryParse(envPort, out var p)) _serverPort = p;
            _isManualHostConfigured = true;
            _logger.LogInformation($"[Config] Servidor manual configurado vía variables de entorno: {_serverHost}:{_serverPort}");
        }

        // 2. Check configuration file in ProgramData or Application BaseDirectory
        string programDataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AssetSchool", "Student", "student-config.json");
        string localPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "student-config.json");
        string configPath = File.Exists(programDataPath) ? programDataPath : (File.Exists(localPath) ? localPath : "");

        if (!string.IsNullOrEmpty(configPath))
        {
            try
            {
                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("serverUrl", out var urlProp) && !string.IsNullOrWhiteSpace(urlProp.GetString()))
                {
                    string rawUrl = urlProp.GetString()!;
                    if (Uri.TryCreate(rawUrl, UriKind.Absolute, out var u))
                    {
                        _serverUrl = rawUrl;
                        _serverHost = u.Host;
                        _serverPort = u.Port;
                        _isManualHostConfigured = true;
                    }
                }
                else if (root.TryGetProperty("serverHost", out var hostProp) && !string.IsNullOrWhiteSpace(hostProp.GetString()))
                {
                    _serverHost = hostProp.GetString()!;
                    if (root.TryGetProperty("serverPort", out var portProp) && portProp.TryGetInt32(out var pt))
                    {
                        _serverPort = pt;
                    }
                    _isManualHostConfigured = true;
                }

                if (root.TryGetProperty("institutionId", out var instProp)) _institutionId = instProp.GetString() ?? "";
                if (root.TryGetProperty("classroomId", out var roomProp)) _classroomId = roomProp.GetString() ?? "";
                if (root.TryGetProperty("enrollmentToken", out var tokProp)) _enrollmentToken = tokProp.GetString() ?? "";

                _logger.LogInformation($"[Config] Archivo cargado desde {configPath} (Servidor: {_serverHost}:{_serverPort}, Manual: {_isManualHostConfigured})");
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[Config] No se pudo leer {configPath}: {ex.Message}");
            }
        }
        else
        {
            _logger.LogInformation($"[Config] No se encontró student-config.json. Modo descubrimiento UDP activo por defecto.");
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("=========================================================");
        _logger.LogInformation("  AssetSchool Student Service (Windows Service .NET 8)");
        _logger.LogInformation($"  Equipo: {Environment.MachineName} (Sesión 0)");
        _logger.LogInformation($"  MAC: {GetActiveMacAddress()} | IP: {GetLocalIpAddress()}");
        _logger.LogInformation("=========================================================");

        // Load configuration before starting connections
        LoadConfiguration();

        // Multi-Session IPC Manager: handles dynamic sessions, fast user switching, and Session 0 isolation
        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        string agentPath = Path.Combine(currentDir, "AssetSchool.Student.SessionAgent.exe");

        _sessionIpcManager = new MultiSessionIpcManager(_logger, agentPath);
        _sessionIpcManager.OnMessageReceived += async (sessionId, msg) =>
        {
            // Forward messages from SessionAgent up to central local-server
            try
            {
                if (_webSocket != null && _webSocket.State == WebSocketState.Open)
                {
                    await SendRawAsync($"42{msg}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Error enviando mensaje de SessionAgent #{sessionId} al servidor: {ex.Message}");
            }
        };
        _sessionIpcManager.Start(stoppingToken);

        // Start UDP Discovery Listener in background
        _ = Task.Run(() => ListenUdpDiscovery(stoppingToken), stoppingToken);

        // Main WebSocket Loop with local-server
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConnectAndRunGatewayAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning($"Fallo en enlace con servidor: {ex.Message}. Reintentando en 5s...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task ListenUdpDiscovery(CancellationToken token)
    {
        using var udp = new UdpClient(48500);
        udp.Client.ReceiveTimeout = 5000;
        _logger.LogInformation("Escuchando balizas UDP del profesor en el puerto 48500...");

        while (!token.IsCancellationRequested)
        {
            try
            {
                var result = await udp.ReceiveAsync(token);
                var json = Encoding.UTF8.GetString(result.Buffer);

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("payload", out var payload))
                {
                    if (payload.TryGetProperty("serverHost", out var hostProp))
                    {
                        string host = hostProp.GetString() ?? "127.0.0.1";
                        int port = payload.TryGetProperty("wsPort", out var p) ? p.GetInt32() : 3000;

                        if (_isManualHostConfigured)
                        {
                            // Manual host has priority; log discovery for telemetry but do not overwrite
                            _logger.LogDebug($"[UDP Discovery] Baliza recibida de {host}:{port}, omitida porque existe configuración manual fija ({_serverHost}:{_serverPort})");
                        }
                        else if (_serverHost != host || _serverPort != port)
                        {
                            _logger.LogInformation($"[UDP Discovery] Profesor detectado en {host}:{port}. Actualizando destino.");
                            _serverHost = host;
                            _serverPort = port;
                        }
                    }
                }
            }
            catch (Exception)
            {
                // Timeout or canceled
            }
        }
    }

    private async Task ConnectAndRunGatewayAsync(CancellationToken token)
    {
        _webSocket = new ClientWebSocket();
        string scheme = "ws";
        if (!string.IsNullOrEmpty(_serverUrl) && (_serverUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || _serverUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase)))
        {
            scheme = "wss";
        }
        else if (_serverPort == 443)
        {
            scheme = "wss";
        }

        var uri = new Uri($"{scheme}://{_serverHost}:{_serverPort}/socket.io/?EIO=4&transport=websocket");

        _logger.LogInformation($"Conectando al servidor central: {uri} (Cifrado: {(scheme == "wss" ? "TLS/WSS Activo" : "WS Plano (Solo LAN Privada)")})");
        await _webSocket.ConnectAsync(uri, token);

        _isConnected = true;
        _logger.LogInformation("Conexión WebSocket establecida con éxito.");

        _ = Task.Run(() => HeartbeatLoop(token), token);

        var buffer = new byte[65536];
        while (!token.IsCancellationRequested && _webSocket.State == WebSocketState.Open)
        {
            var res = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
            if (res.MessageType == WebSocketMessageType.Close) break;

            var message = Encoding.UTF8.GetString(buffer, 0, res.Count);
            await HandleGatewayMessage(message);
        }
    }

    private async Task HeartbeatLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
        {
            await Task.Delay(15000, token);
            try
            {
                var pingEnvelope = new
                {
                    protocolVersion = "1.0.0",
                    packetType = "HEARTBEAT_PING",
                    source = "AGENT",
                    sourceId = _deviceId,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    payload = new { timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                };
                var json = JsonSerializer.Serialize(new object[] { "HEARTBEAT_PING", pingEnvelope });
                await SendRawAsync($"42{json}");
            }
            catch { }
        }
    }

    private async Task HandleGatewayMessage(string message)
    {
        if (message == "2")
        {
            await SendRawAsync("3");
            return;
        }

        if (message.StartsWith("0"))
        {
            await SendRawAsync("40");

            // Send AGENT_HELLO with full R0 protocol envelope
            var helloPayload = new
            {
                hostname = Environment.MachineName,
                macAddress = GetActiveMacAddress(),
                localIp = GetLocalIpAddress(),
                osType = "windows",
                osVersion = Environment.OSVersion.ToString(),
                architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86",
                agentVersion = "1.0.0",
                publicKey = "ed25519_win_key",
                enrolledDeviceId = _deviceId,
                institutionId = _institutionId,
                classroomId = _classroomId,
                enrollmentToken = _enrollmentToken
            };

            var envelope = new
            {
                packetId = Guid.NewGuid().ToString(),
                packetType = "AGENT_HELLO",
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                senderId = _deviceId,
                target = "server",
                payload = helloPayload
            };

            var eventPacket = new object[] { "AGENT_HELLO", envelope };
            var json = JsonSerializer.Serialize(eventPacket);
            await SendRawAsync($"42{json}");
            return;
        }

        if (message.StartsWith("42"))
        {
            var json = message.Substring(2);
            await ProcessGatewayEvent(json);
        }
    }

    private async Task ProcessGatewayEvent(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() >= 2)
            {
                var eventName = root[0].GetString();
                var payload = root[1];

                _logger.LogInformation($"[Evento del Servidor]: {eventName}");

                if (eventName == "POWER_ACTION" || eventName == "TEACHER_POWER_ACTION")
                {
                    var p = payload.TryGetProperty("payload", out var pl) ? pl : payload;
                    string op = p.TryGetProperty("operation", out var opProp) ? opProp.GetString() ?? "reboot" : "reboot";
                    int delay = p.TryGetProperty("delaySeconds", out var dProp) ? dProp.GetInt32() : 5;
                    string reason = p.TryGetProperty("reason", out var rProp) ? rProp.GetString() ?? "Orden del profesor" : "Orden del profesor";

                    PowerManager.ExecutePowerAction(op, delay, reason);
                }
                else
                {
                    // Forward UI / interactive commands to all active SessionAgents via MultiSession IPC
                    if (_sessionIpcManager != null)
                    {
                        await _sessionIpcManager.BroadcastAsync(json);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error procesando evento: {ex.Message}");
        }
    }

    private async Task SendRawAsync(string message)
    {
        if (_webSocket?.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(message);
        await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static string GetActiveMacAddress()
    {
        try
        {
            var nic = NetworkInterface.GetAllNetworkInterfaces()
                .FirstOrDefault(nic => nic.OperationalStatus == OperationalStatus.Up &&
                                       nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                                       nic.GetPhysicalAddress().GetAddressBytes().Length == 6);
            if (nic != null)
            {
                var bytes = nic.GetPhysicalAddress().GetAddressBytes();
                return string.Join(":", bytes.Select(b => b.ToString("X2")));
            }
        }
        catch { }
        return "00:11:22:33:44:55";
    }

    private static string GetLocalIpAddress()
    {
        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                {
                    return ip.ToString();
                }
            }
        }
        catch { }
        return "127.0.0.1";
    }

    public override void Dispose()
    {
        _sessionIpcManager?.Dispose();
        _webSocket?.Dispose();
        base.Dispose();
    }
}
