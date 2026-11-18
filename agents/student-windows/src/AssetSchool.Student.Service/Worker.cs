using System;
using System.IO;
using System.Net;
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
    private NamedPipeIpcServer? _ipcServer;
    private ClientWebSocket? _webSocket;
    private string _serverHost = "127.0.0.1";
    private int _serverPort = 3000;
    private bool _isConnected;
    private string _deviceId = $"win-{Environment.MachineName.ToLowerInvariant()}";

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("=========================================================");
        _logger.LogInformation("  AssetSchool Student Service (Windows Service .NET 8)");
        _logger.LogInformation($"  Equipo: {Environment.MachineName} (Sesión 0)");
        _logger.LogInformation("=========================================================");

        // Start Named Pipe IPC Server for active console session (Session 1)
        _ipcServer = new NamedPipeIpcServer(1);
        _ipcServer.OnMessageReceived += (msg) =>
        {
            _logger.LogInformation($"[IPC del SessionAgent]: {msg}");
        };
        _ipcServer.Start();

        // Spawn SessionAgent in Session 1 if interactive session is available
        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        string agentPath = Path.Combine(currentDir, "AssetSchool.Student.SessionAgent.exe");
        if (File.Exists(agentPath))
        {
            SessionManager.LaunchSessionAgent(agentPath);
        }

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

                        if (_serverHost != host || _serverPort != port)
                        {
                            _logger.LogInformation($"[UDP Discovery] Profesor detectado en {host}:{port}");
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
        var uri = new Uri($"ws://{_serverHost}:{_serverPort}/socket.io/?EIO=4&transport=websocket");

        _logger.LogInformation($"Conectando al servidor central: {uri}");
        await _webSocket.ConnectAsync(uri, token);

        _isConnected = true;
        _logger.LogInformation("Conexión WebSocket establecida con éxito.");

        var buffer = new byte[65536];
        while (!token.IsCancellationRequested && _webSocket.State == WebSocketState.Open)
        {
            var res = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
            if (res.MessageType == WebSocketMessageType.Close) break;

            var message = Encoding.UTF8.GetString(buffer, 0, res.Count);
            await HandleGatewayMessage(message);
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

            // Send AGENT_HELLO
            var helloPayload = new
            {
                hostname = Environment.MachineName,
                macAddress = "00:00:00:00:00:00",
                localIp = "127.0.0.1",
                osType = "windows",
                osVersion = Environment.OSVersion.ToString(),
                architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86",
                agentVersion = "1.0.0",
                publicKey = "ed25519_local_key"
            };

            var eventPacket = new object[] { "AGENT_HELLO", helloPayload };
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

                if (eventName == "POWER_ACTION")
                {
                    string op = payload.TryGetProperty("operation", out var opProp) ? opProp.GetString() ?? "reboot" : "reboot";
                    int delay = payload.TryGetProperty("delaySeconds", out var dProp) ? dProp.GetInt32() : 5;
                    string reason = payload.TryGetProperty("reason", out var rProp) ? rProp.GetString() ?? "Orden del profesor" : "Orden del profesor";

                    PowerManager.ExecutePowerAction(op, delay, reason);
                }
                else
                {
                    // Forward UI / interactive commands to SessionAgent via Named Pipe
                    if (_ipcServer != null)
                    {
                        await _ipcServer.SendMessageAsync(json);
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

    public override void Dispose()
    {
        _ipcServer?.Stop();
        _webSocket?.Dispose();
        base.Dispose();
    }
}
