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
using AssetSchool.Agent.Capture;
using AssetSchool.Agent.Streaming;
using AssetSchool.Agent.UI;

namespace AssetSchool.Agent;

public class Program
{
    private static WindowsGraphicsCaptureService _captureService = new();
    private static WebRtcStreamingEngine _streamingEngine = new();
    private static CaptureIndicatorOverlay _indicator = new();
    private static string _deviceId = Guid.NewGuid().ToString();
    private static ClientWebSocket? _ws;
    private static string _serverHttpUrl = "http://localhost:3000";

    public static async Task Main(string[] args)
    {
        Console.WriteLine("==================================================");
        Console.WriteLine(" AssetSchool Native Agent — Windows (.NET 8)");
        Console.WriteLine(" Control de Aula, Pausa Pedagógica y WebRTC LAN");
        Console.WriteLine("==================================================");

        string hostname = Environment.MachineName;
        string osVersion = Environment.OSVersion.ToString();
        string macAddress = GetPrimaryMacAddress();
        string localIp = GetLocalIpAddress();

        Console.WriteLine($"[INFO] Hostname: {hostname}");
        Console.WriteLine($"[INFO] Sistema Operativo: Windows ({osVersion})");
        Console.WriteLine($"[INFO] IP LAN Local: {localIp}");
        Console.WriteLine($"[INFO] MAC Principal: {macAddress}");
        Console.WriteLine($"[INFO] Device ID: {_deviceId}");

        // 1. Resolve Server: via CLI argument (--server http://...) or UDP Discovery
        string? cliServer = null;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--server" && i + 1 < args.Length)
            {
                cliServer = args[i + 1];
            }
        }

        if (!string.IsNullOrEmpty(cliServer))
        {
            _serverHttpUrl = cliServer;
            Console.WriteLine($"[MODO DIRECTO] Conectando al servidor indicado: {_serverHttpUrl}");
        }
        else
        {
            Console.WriteLine("[DESCUBRIMIENTO LAN] Escuchando balizas UDP del profesor en puerto 48500...");
            _serverHttpUrl = await DiscoverServerUdpAsync(timeoutSeconds: 8);
            Console.WriteLine($"[DESCUBRIMIENTO ÉXITO] Servidor AssetSchool detectado: {_serverHttpUrl}");
        }

        // 2. Connect to Agent Gateway via WebSocket
        await RunAgentLoopAsync(hostname, osVersion, macAddress, localIp);
    }

    private static async Task<string> DiscoverServerUdpAsync(int timeoutSeconds)
    {
        using var udpClient = new UdpClient();
        udpClient.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        udpClient.ExclusiveAddressUse = false;
        udpClient.Client.Bind(new IPEndPoint(IPAddress.Any, 48500));

        var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            while (!cts.IsCancellationRequested)
            {
                var result = await udpClient.ReceiveAsync(cts.Token);
                string json = Encoding.UTF8.GetString(result.Buffer);

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("payload", out var payload))
                {
                    if (payload.TryGetProperty("httpUrl", out var httpUrlProp))
                    {
                        return httpUrlProp.GetString() ?? "http://localhost:3000";
                    }
                    if (payload.TryGetProperty("serverHost", out var hostProp))
                    {
                        return $"http://{hostProp.GetString()}";
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("[DESCUBRIMIENTO AVISO] Timeout de búsqueda UDP. Usando servidor por defecto.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DESCUBRIMIENTO ERROR] {ex.Message}");
        }

        return "http://localhost:3000";
    }

    private static async Task RunAgentLoopAsync(string hostname, string osVersion, string macAddress, string localIp)
    {
        while (true)
        {
            try
            {
                Uri baseUri = new Uri(_serverHttpUrl);
                string wsUrl = $"ws://{baseUri.Host}:{baseUri.Port}/socket.io/?EIO=4&transport=websocket";

                Console.WriteLine($"[GATEWAY CLIENT] Conectando a AssetSchool en {wsUrl}...");
                _ws = new ClientWebSocket();
                await _ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None);

                Console.WriteLine("[GATEWAY CLIENT] Conexión establecida. Iniciando protocolo Socket.IO...");

                // Start message receive loop
                var cts = new CancellationTokenSource();
                var receiveTask = ReceiveLoopAsync(_ws, cts.Token, hostname, osVersion, macAddress, localIp);

                // Start periodic ping loop
                var pingTask = PingLoopAsync(_ws, cts.Token);

                await Task.WhenAny(receiveTask, pingTask);
                cts.Cancel();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GATEWAY CLIENT ERROR] {ex.Message}. Reconectando en 4 segundos...");
            }

            await Task.Delay(4000);
        }
    }

    private static async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken ct, string hostname, string osVersion, string macAddress, string localIp)
    {
        var buffer = new byte[65536];

        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
            if (result.MessageType == WebSocketMessageType.Close) break;

            string text = Encoding.UTF8.GetString(buffer, 0, result.Count);

            if (text.StartsWith("0"))
            {
                // Engine.IO Open -> Send Socket.IO Connect
                await SendRawAsync(ws, "40");
            }
            else if (text.StartsWith("40"))
            {
                // Socket.IO Connected -> Send AGENT_HELLO
                Console.WriteLine("[GATEWAY CLIENT] Conectado a Socket.IO. Enviando AGENT_HELLO...");
                await SendAgentHelloAsync(ws, hostname, osVersion, macAddress, localIp);
            }
            else if (text.StartsWith("2"))
            {
                // Engine.IO Ping -> Pong
                await SendRawAsync(ws, "3");
            }
            else if (text.StartsWith("42"))
            {
                // Socket.IO Event
                string eventJson = text.Substring(2);
                await HandleSocketIoEventAsync(ws, eventJson);
            }
        }
    }

    private static async Task HandleSocketIoEventAsync(ClientWebSocket ws, string eventJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(eventJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() < 2) return;

            string eventName = root[0].GetString() ?? "";
            var envelope = root[1];

            JsonElement payload = envelope;
            if (envelope.TryGetProperty("payload", out var innerPayload))
            {
                payload = innerPayload;
            }

            switch (eventName)
            {
                case "COMMAND_DISPATCH":
                    await HandleCommandDispatchAsync(ws, payload);
                    break;

                case "FILE_LIST_DIR":
                    await HandleFileListDirAsync(ws, payload);
                    break;

                case "FILE_SEND":
                    await HandleFileSendAsync(ws, payload);
                    break;

                case "FILE_COLLECT":
                    await HandleFileCollectAsync(ws, payload);
                    break;

                case "KILL_PROCESS":
                    await HandleKillProcessAsync(ws, payload);
                    break;

                case "PROCESS_LIST_REQUEST":
                    await HandleProcessListRequestAsync(ws);
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EVENT DISPATCH ERROR] {ex.Message}");
        }
    }

    private static async Task HandleCommandDispatchAsync(ClientWebSocket ws, JsonElement payload)
    {
        string commandId = payload.TryGetProperty("commandId", out var cId) ? cId.GetString() ?? "" : Guid.NewGuid().ToString();
        string commandType = payload.TryGetProperty("commandType", out var cType) ? cType.GetString() ?? "" : "";
        var paramsElem = payload.TryGetProperty("params", out var p) ? p : default;

        Console.WriteLine($"[GATEWAY CLIENT] Comando recibido: {commandType} (ID: {commandId})");

        switch (commandType)
        {
            case "LOCK_SCREEN":
                string message = paramsElem.TryGetProperty("message", out var m) ? m.GetString() ?? "Atención al frente." : "Atención al frente.";
                string teacher = paramsElem.TryGetProperty("teacherName", out var t) ? t.GetString() ?? "Docente" : "Docente";
                string inst = paramsElem.TryGetProperty("institutionName", out var ins) ? ins.GetString() ?? "Instituto" : "AssetSchool LAN";

                LockCurtainOverlay.Instance.Show(message, teacher, inst);
                await SendCommandResultAsync(ws, commandId, true);
                break;

            case "UNLOCK_SCREEN":
                LockCurtainOverlay.Instance.Hide();
                await SendCommandResultAsync(ws, commandId, true);
                break;

            default:
                await SendCommandResultAsync(ws, commandId, false, "Comando no implementado");
                break;
        }
    }

    private static async Task HandleFileListDirAsync(ClientWebSocket ws, JsonElement payload)
    {
        string requestId = payload.TryGetProperty("requestId", out var r) ? r.GetString() ?? "" : Guid.NewGuid().ToString();
        string schoolPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "AssetSchool");
        Directory.CreateDirectory(schoolPath);

        var dirInfo = new DirectoryInfo(schoolPath);
        var items = dirInfo.GetFileSystemInfos().Select(f => new
        {
            name = f.Name,
            path = f.FullName,
            size = (f is FileInfo fi) ? fi.Length : 0,
            isDirectory = (f is DirectoryInfo),
            modifiedAt = new DateTimeOffset(f.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
            extension = f.Extension.TrimStart('.').ToLowerInvariant()
        }).ToArray();

        var resEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "FILE_LIST_DIR_RESULT",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                requestId,
                deviceId = _deviceId,
                currentPath = schoolPath,
                items
            }
        };

        await SendEventAsync(ws, "FILE_LIST_DIR_RESULT", resEnvelope);
    }

    private static async Task HandleFileSendAsync(ClientWebSocket ws, JsonElement payload)
    {
        string transferId = payload.TryGetProperty("transferId", out var t) ? t.GetString() ?? "" : Guid.NewGuid().ToString();
        string fileName = payload.TryGetProperty("fileName", out var fn) ? fn.GetString() ?? "archivo.dat" : "archivo.dat";
        string b64 = payload.TryGetProperty("fileContentBase64", out var c) ? c.GetString() ?? "" : "";

        string schoolPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "AssetSchool");
        Directory.CreateDirectory(schoolPath);
        string destPath = Path.Combine(schoolPath, fileName);

        byte[] bytes = Convert.FromBase64String(b64);
        await File.WriteAllBytesAsync(destPath, bytes);
        Console.WriteLine($"[FILE MANAGER] Archivo recibido y guardado en: {destPath} ({bytes.Length} bytes)");

        var resEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "FILE_SEND_RESULT",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                transferId,
                deviceId = _deviceId,
                success = true,
                savedPath = destPath
            }
        };

        await SendEventAsync(ws, "FILE_SEND_RESULT", resEnvelope);
    }

    private static async Task HandleFileCollectAsync(ClientWebSocket ws, JsonElement payload)
    {
        string collectId = payload.TryGetProperty("collectId", out var c) ? c.GetString() ?? "" : Guid.NewGuid().ToString();
        string filePath = payload.TryGetProperty("filePath", out var p) ? p.GetString() ?? "" : "";

        if (File.Exists(filePath))
        {
            byte[] bytes = await File.ReadAllBytesAsync(filePath);
            string b64 = Convert.ToBase64String(bytes);

            var resEnvelope = new
            {
                packetId = Guid.NewGuid().ToString(),
                packetType = "FILE_COLLECT_RESULT",
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                senderId = _deviceId,
                target = "server",
                payload = new
                {
                    collectId,
                    deviceId = _deviceId,
                    fileName = Path.GetFileName(filePath),
                    fileSizeBytes = bytes.Length,
                    fileContentBase64 = b64,
                    success = true
                }
            };
            await SendEventAsync(ws, "FILE_COLLECT_RESULT", resEnvelope);
        }
    }

    private static async Task HandleKillProcessAsync(ClientWebSocket ws, JsonElement payload)
    {
        int pid = payload.TryGetProperty("pid", out var p) ? p.GetInt32() : 0;
        string pName = payload.TryGetProperty("processName", out var n) ? n.GetString() ?? "" : "";

        bool killed = false;
        try
        {
            if (pid > 0)
            {
                var proc = System.Diagnostics.Process.GetProcessById(pid);
                proc.Kill();
                killed = true;
            }
            else if (!string.IsNullOrEmpty(pName))
            {
                foreach (var proc in System.Diagnostics.Process.GetProcessesByName(pName))
                {
                    proc.Kill();
                    killed = true;
                }
            }
        }
        catch { }

        var resEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "KILL_PROCESS_RESULT",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                deviceId = _deviceId,
                success = killed,
                pid,
                processName = pName
            }
        };
        await SendEventAsync(ws, "KILL_PROCESS_RESULT", resEnvelope);
    }

    private static async Task HandleProcessListRequestAsync(ClientWebSocket ws)
    {
        var procs = System.Diagnostics.Process.GetProcesses()
            .Where(p => !string.IsNullOrEmpty(p.MainWindowTitle))
            .Select(p => new
            {
                pid = p.Id,
                name = p.ProcessName,
                bundleId = p.ProcessName,
                isFrontmost = false
            }).ToArray();

        var resEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "PROCESS_LIST_RESULT",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                deviceId = _deviceId,
                processes = procs
            }
        };
        await SendEventAsync(ws, "PROCESS_LIST_RESULT", resEnvelope);
    }

    private static async Task SendAgentHelloAsync(ClientWebSocket ws, string hostname, string osVersion, string macAddress, string localIp)
    {
        var helloEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "AGENT_HELLO",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                hostname = hostname,
                macAddress = macAddress,
                localIp = localIp,
                osType = "windows",
                osVersion = osVersion,
                architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86",
                agentVersion = "1.0.0",
                publicKey = "ed25519_win_agent_key",
                enrolledDeviceId = _deviceId
            }
        };

        await SendEventAsync(ws, "AGENT_HELLO", helloEnvelope);
    }

    private static async Task SendCommandResultAsync(ClientWebSocket ws, string commandId, bool success, string? error = null)
    {
        var resultEnvelope = new
        {
            packetId = Guid.NewGuid().ToString(),
            packetType = "COMMAND_RESULT",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            senderId = _deviceId,
            target = "server",
            payload = new
            {
                commandId,
                completedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                success,
                error
            }
        };

        await SendEventAsync(ws, "COMMAND_RESULT", resultEnvelope);
    }

    private static async Task PingLoopAsync(ClientWebSocket ws, CancellationToken ct)
    {
        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            await Task.Delay(15000, ct);
            if (ws.State == WebSocketState.Open)
            {
                var pingEnvelope = new
                {
                    packetId = Guid.NewGuid().ToString(),
                    packetType = "HEARTBEAT_PING",
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    senderId = _deviceId,
                    target = "server",
                    payload = new { deviceId = _deviceId, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                };
                await SendEventAsync(ws, "HEARTBEAT_PING", pingEnvelope);
            }
        }
    }

    private static async Task SendEventAsync(ClientWebSocket ws, string eventName, object payload)
    {
        string json = JsonSerializer.Serialize(new object[] { eventName, payload });
        await SendRawAsync(ws, $"42{json}");
    }

    private static async Task SendRawAsync(ClientWebSocket ws, string rawText)
    {
        if (ws.State != WebSocketState.Open) return;
        byte[] bytes = Encoding.UTF8.GetBytes(rawText);
        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static string GetLocalIpAddress()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
            socket.Connect("8.8.8.8", 65530);
            var endPoint = socket.LocalEndPoint as IPEndPoint;
            return endPoint?.Address.ToString() ?? "127.0.0.1";
        }
        catch
        {
            return "127.0.0.1";
        }
    }

    private static string GetPrimaryMacAddress()
    {
        var nic = NetworkInterface.GetAllNetworkInterfaces()
            .FirstOrDefault(n => n.OperationalStatus == OperationalStatus.Up &&
                                 n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        return nic != null ? string.Join(":", nic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2"))) : "00:00:00:00:00:00";
    }
}
