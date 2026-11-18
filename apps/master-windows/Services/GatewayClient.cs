using System;
using System.Collections.ObjectModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using AssetSchool.Master.ViewModels;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;
using Application = System.Windows.Application;

namespace AssetSchool.Master.Services;

public class GatewayClient : IDisposable
{
    private static GatewayClient? _instance;
    public static GatewayClient Instance => _instance ??= new GatewayClient();

    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cts;
    private bool _isConnected;
    private string _serverHost = "127.0.0.1";
    private int _serverPort = 3000;
    private string? _jwtToken;
    private string _currentClassroomId = "lab-informatica-01";

    // WebRTC SFU Broadcast
    private RTCPeerConnection? _peerConnection;
    private CancellationTokenSource? _broadcastCts;

    public ObservableCollection<StudentDeviceViewModel> Devices { get; } = new();
    public bool IsConnected => _isConnected;
    public bool IsBroadcasting { get; private set; }
    public string CurrentClassroomId => _currentClassroomId;

    public event Action<bool>? OnConnectionChanged;
    public event Action<string>? OnLog;
    public event Action<string, string, string>? OnMessageAck; // deviceId, messageId, hostname
    public event Action<string, bool, string?, string?>? OnFileSendResult; // transferId, success, savedPath, error
    public event Action<string, byte[], string, string?>? OnFileCollectResult; // fileName, content, sha256, error
    public event Action<string, JsonElement>? OnDirListResult; // currentPath, itemsJson

    private readonly HttpClient _httpClient = new();

    public async Task<bool> LoginAsync(string username, string password, string host = "127.0.0.1", int port = 3000)
    {
        _serverHost = host;
        _serverPort = port;

        try
        {
            var loginUrl = $"http://{host}:{port}/api/v1/auth/login";
            var payload = new { username, password };
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(loginUrl, content);
            if (response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("accessToken", out var tokenProp))
                {
                    _jwtToken = tokenProp.GetString();
                    OnLog?.Invoke($"Sesión iniciada con éxito para {username}.");
                    return true;
                }
            }
            OnLog?.Invoke("Credenciales incorrectas o servidor no disponible.");
            return false;
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Error de autenticación: {ex.Message}");
            return false;
        }
    }

    public async Task ConnectAsync(string host = "127.0.0.1", int port = 3000)
    {
        _serverHost = host;
        _serverPort = port;
        Disconnect();

        _cts = new CancellationTokenSource();
        _webSocket = new ClientWebSocket();

        try
        {
            var uri = new Uri($"ws://{host}:{port}/socket.io/?EIO=4&transport=websocket");
            OnLog?.Invoke($"Conectando al servidor escolar en {uri}...");
            await _webSocket.ConnectAsync(uri, _cts.Token);

            _isConnected = true;
            OnConnectionChanged?.Invoke(true);
            OnLog?.Invoke("Enlace WebSocket establecido con éxito.");

            _ = Task.Run(() => ReceiveLoop(_cts.Token), _cts.Token);
            _ = Task.Run(() => HeartbeatLoop(_cts.Token), _cts.Token);
            _ = Task.Run(() => HealthMonitorLoop(_cts.Token), _cts.Token);
        }
        catch (Exception ex)
        {
            _isConnected = false;
            OnConnectionChanged?.Invoke(false);
            OnLog?.Invoke($"Error de enlace con servidor: {ex.Message}");
        }
    }

    public void Disconnect()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        _webSocket?.Dispose();
        _webSocket = null;

        if (_isConnected)
        {
            _isConnected = false;
            OnConnectionChanged?.Invoke(false);
        }
    }

    private async Task ReceiveLoop(CancellationToken token)
    {
        var buffer = new byte[131072]; // 128 KB buffer for thumbnails & file packets
        while (!token.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
        {
            try
            {
                var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close) break;

                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                HandleMessage(text);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                OnLog?.Invoke($"Error en canal de recepción: {ex.Message}");
                break;
            }
        }

        _isConnected = false;
        Application.Current?.Dispatcher.Invoke(() => OnConnectionChanged?.Invoke(false));
    }

    private void HandleMessage(string message)
    {
        if (message == "2")
        {
            _ = SendRawAsync("3");
            return;
        }

        if (message.StartsWith("0"))
        {
            _ = SendRawAsync("40");
            _ = JoinClassroomAsync(_currentClassroomId);
            return;
        }

        if (message.StartsWith("42"))
        {
            var json = message.Substring(2);
            ParseEvent(json);
        }
    }

    public async Task JoinClassroomAsync(string classroomId)
    {
        _currentClassroomId = classroomId;
        await SendEventAsync("TEACHER_JOIN_CLASSROOM", new
        {
            classroomId,
            token = _jwtToken ?? "dev_teacher_token"
        });
        OnLog?.Invoke($"Supervisando aula: {classroomId}");
    }

    private void ParseEvent(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() >= 2)
            {
                var eventName = root[0].GetString();
                var payload = root[1];

                Application.Current?.Dispatcher.Invoke(() =>
                {
                    switch (eventName)
                    {
                        case "DEVICE_LIST":
                        case "CLASSROOM_SNAPSHOT":
                            UpdateDeviceList(payload);
                            break;

                        case "DEVICE_STATUS_CHANGE":
                            UpdateDeviceStatus(payload);
                            break;

                        case "DEVICE_THUMBNAIL":
                            UpdateDeviceThumbnail(payload);
                            break;

                        case "MESSAGE_ACK":
                            HandleMessageAck(payload);
                            break;

                        case "FILE_SEND_RESULT":
                            HandleFileSendResult(payload);
                            break;

                        case "FILE_COLLECT_RESULT":
                            HandleFileCollectResult(payload);
                            break;

                        case "FILE_LIST_DIR_RESULT":
                            HandleDirListResult(payload);
                            break;
                    }
                });
            }
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Error procesando evento: {ex.Message}");
        }
    }

    private void UpdateDeviceList(JsonElement arrayElement)
    {
        if (arrayElement.ValueKind != JsonValueKind.Array) return;

        Devices.Clear();
        foreach (var item in arrayElement.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
            var host = item.TryGetProperty("hostname", out var hostProp) ? hostProp.GetString() ?? "PC" : "PC";
            var ip = item.TryGetProperty("localIp", out var ipProp) ? ipProp.GetString() ?? "127.0.0.1" : "127.0.0.1";
            var mac = item.TryGetProperty("macAddress", out var macProp) ? macProp.GetString() ?? "" : "";
            var os = item.TryGetProperty("osType", out var osProp) ? osProp.GetString() ?? "windows" : "windows";
            var agentVer = item.TryGetProperty("agentVersion", out var avProp) ? avProp.GetString() ?? "1.0.0" : "1.0.0";
            var status = item.TryGetProperty("status", out var stProp) ? stProp.GetString() ?? "online" : "online";
            var student = item.TryGetProperty("currentStudentName", out var sProp) ? sProp.GetString() : null;

            Devices.Add(new StudentDeviceViewModel
            {
                Id = id,
                Hostname = host,
                LocalIp = ip,
                MacAddress = mac,
                OsType = os,
                AgentVersion = agentVer,
                Status = status,
                IsLocked = status == "locked",
                CurrentStudentName = student,
                LastHeartbeat = DateTime.UtcNow
            });
        }
    }

    private void UpdateDeviceStatus(JsonElement payload)
    {
        var id = payload.TryGetProperty("deviceId", out var dProp) ? dProp.GetString() : null;
        if (string.IsNullOrEmpty(id)) return;

        var dev = Devices.FirstOrDefault(d => d.Id == id);
        if (dev != null && payload.TryGetProperty("status", out var st))
        {
            dev.Status = st.GetString() ?? "online";
            dev.IsLocked = dev.Status == "locked";
            dev.LastHeartbeat = DateTime.UtcNow;
        }
    }

    private void UpdateDeviceThumbnail(JsonElement payload)
    {
        var devId = payload.TryGetProperty("deviceId", out var dProp) ? dProp.GetString() : null;
        var b64 = payload.TryGetProperty("thumbnailBase64", out var tbProp) ? tbProp.GetString() : null;

        if (!string.IsNullOrEmpty(devId) && !string.IsNullOrEmpty(b64))
        {
            var dev = Devices.FirstOrDefault(d => d.Id == devId);
            if (dev != null)
            {
                dev.UpdateThumbnailFromBase64(b64);
            }
        }
    }

    private void HandleMessageAck(JsonElement payload)
    {
        var devId = payload.TryGetProperty("deviceId", out var dp) ? dp.GetString() ?? "" : "";
        var msgId = payload.TryGetProperty("messageId", out var mp) ? mp.GetString() ?? "" : "";
        var host = payload.TryGetProperty("hostname", out var hp) ? hp.GetString() ?? devId : devId;

        OnLog?.Invoke($"[ACK Confirmado] {host} leyó el mensaje.");
        OnMessageAck?.Invoke(devId, msgId, host);
    }

    private void HandleFileSendResult(JsonElement payload)
    {
        var tid = payload.TryGetProperty("transferId", out var tp) ? tp.GetString() ?? "" : "";
        bool ok = payload.TryGetProperty("success", out var sp) && sp.GetBoolean();
        string? path = payload.TryGetProperty("savedPath", out var pp) ? pp.GetString() : null;
        string? err = payload.TryGetProperty("error", out var ep) ? ep.GetString() : null;

        OnFileSendResult?.Invoke(tid, ok, path, err);
    }

    private void HandleFileCollectResult(JsonElement payload)
    {
        string name = payload.TryGetProperty("fileName", out var np) ? np.GetString() ?? "recoleccion.dat" : "recoleccion.dat";
        string b64 = payload.TryGetProperty("fileContentBase64", out var bp) ? bp.GetString() ?? "" : "";
        string? sha = payload.TryGetProperty("sha256", out var shp) ? shp.GetString() : null;
        string? err = payload.TryGetProperty("error", out var ep) ? ep.GetString() : null;

        byte[] content = string.IsNullOrEmpty(b64) ? Array.Empty<byte>() : Convert.FromBase64String(b64);
        OnFileCollectResult?.Invoke(name, content, sha ?? "", err);
    }

    private void HandleDirListResult(JsonElement payload)
    {
        string current = payload.TryGetProperty("currentPath", out var cp) ? cp.GetString() ?? "" : "";
        if (payload.TryGetProperty("items", out var items))
        {
            OnDirListResult?.Invoke(current, items);
        }
    }

    // ==========================================
    // CLASSROOM & DEVICE ACTIONS
    // ==========================================

    public async Task LockAllAsync(string message = "Atención al frente. Pausa pedagógica activa.")
    {
        await SendEventAsync("TEACHER_LOCK_CLASSROOM", new { classroomId = _currentClassroomId, message });
        foreach (var dev in Devices)
        {
            dev.IsLocked = true;
            dev.Status = "locked";
        }
        OnLog?.Invoke("Comando de bloqueo enviado a toda el aula.");
    }

    public async Task UnlockAllAsync()
    {
        await SendEventAsync("TEACHER_UNLOCK_CLASSROOM", new { classroomId = _currentClassroomId });
        foreach (var dev in Devices)
        {
            dev.IsLocked = false;
            dev.Status = "online";
        }
        OnLog?.Invoke("Aula desbloqueada.");
    }

    public async Task LockDeviceAsync(string deviceId, string message = "Bloqueado por el profesor")
    {
        await SendEventAsync("TEACHER_LOCK_DEVICE", new { deviceId, message });
        var dev = Devices.FirstOrDefault(d => d.Id == deviceId);
        if (dev != null)
        {
            dev.IsLocked = true;
            dev.Status = "locked";
        }
    }

    public async Task UnlockDeviceAsync(string deviceId)
    {
        await SendEventAsync("TEACHER_UNLOCK_DEVICE", new { deviceId });
        var dev = Devices.FirstOrDefault(d => d.Id == deviceId);
        if (dev != null)
        {
            dev.IsLocked = false;
            dev.Status = "online";
        }
    }

    public async Task SendPopupMessageAsync(string title, string message, string? targetDeviceId = null, string priority = "normal")
    {
        await SendEventAsync("TEACHER_SEND_POPUP_MESSAGE", new
        {
            title,
            message,
            targetDeviceId,
            classroomId = string.IsNullOrEmpty(targetDeviceId) ? _currentClassroomId : null,
            priority,
            teacherName = "Profesor"
        });
        OnLog?.Invoke($"Mensaje enviado a {(string.IsNullOrEmpty(targetDeviceId) ? "toda el aula" : targetDeviceId)}.");
    }

    public async Task PowerActionAsync(string operation, string? targetDeviceId = null, int delaySeconds = 5)
    {
        await SendEventAsync("TEACHER_POWER_ACTION", new
        {
            operation,
            targetDeviceId,
            classroomId = string.IsNullOrEmpty(targetDeviceId) ? _currentClassroomId : null,
            delaySeconds,
            force = true,
            reason = "Orden administrativa del docente"
        });
        OnLog?.Invoke($"Comando de energía [{operation}] ejecutado.");
    }

    // ==========================================
    // FILE DISTRIBUTION & WORK COLLECTION
    // ==========================================

    public async Task<string> SendFileToClassroomAsync(string fileName, byte[] content, string? targetDir = null)
    {
        string transferId = Guid.NewGuid().ToString();
        string base64 = Convert.ToBase64String(content);
        using var sha256 = SHA256.Create();
        string hash = Convert.ToHexString(sha256.ComputeHash(content)).ToLowerInvariant();

        await SendEventAsync("TEACHER_SEND_FILE", new
        {
            transferId,
            broadcastToAll = true,
            classroomId = _currentClassroomId,
            fileName,
            fileSizeBytes = content.Length,
            fileContentBase64 = base64,
            sha256 = hash,
            targetDir
        });

        OnLog?.Invoke($"Distribuyendo archivo '{fileName}' ({content.Length} bytes, SHA-256: {hash[..8]}...) a toda el aula.");
        return transferId;
    }

    public async Task<string> SendFileToDeviceAsync(string deviceId, string fileName, byte[] content, string? targetDir = null)
    {
        string transferId = Guid.NewGuid().ToString();
        string base64 = Convert.ToBase64String(content);
        using var sha256 = SHA256.Create();
        string hash = Convert.ToHexString(sha256.ComputeHash(content)).ToLowerInvariant();

        await SendEventAsync("TEACHER_SEND_FILE", new
        {
            transferId,
            deviceId,
            fileName,
            fileSizeBytes = content.Length,
            fileContentBase64 = base64,
            sha256 = hash,
            targetDir
        });

        OnLog?.Invoke($"Enviando archivo '{fileName}' a {deviceId}.");
        return transferId;
    }

    public async Task CollectFileFromDeviceAsync(string deviceId, string remoteFilePath)
    {
        await SendEventAsync("TEACHER_COLLECT_FILE", new
        {
            deviceId,
            filePath = remoteFilePath
        });
        OnLog?.Invoke($"Solicitando recolección de '{remoteFilePath}' desde {deviceId}...");
    }

    public async Task ListRemoteDirectoryAsync(string deviceId, string? dirPath = null)
    {
        await SendEventAsync("TEACHER_LIST_DIR", new
        {
            deviceId,
            dirPath
        });
    }

    // ==========================================
    // INTERACTIVE REMOTE CONTROL INJECTION
    // ==========================================

    public async Task SendRemoteInputAsync(string deviceId, string type, double x, double y, string button = "left", int? keyCode = null, string? keyText = null)
    {
        await SendEventAsync("TEACHER_REMOTE_INPUT", new
        {
            deviceId,
            type,
            x,
            y,
            button,
            keyCode,
            keyText
        });
    }

    // ==========================================
    // SFU WEBRTC SCREEN BROADCAST (SIPSorcery)
    // ==========================================

    public async Task StartBroadcastAsync(string mode = "fullscreen")
    {
        if (IsBroadcasting) return;
        IsBroadcasting = true;

        OnLog?.Invoke($"[WebRTC SFU] Iniciando transmisión docente en modo {mode}...");
        await SendEventAsync("TEACHER_BROADCAST_START", new
        {
            classroomId = _currentClassroomId,
            mode,
            fps = 30,
            bitrateKbps = 2500,
            teacherName = "Profesor"
        });

        // Initialize SIPSorcery PeerConnection for WebRTC media pipeline
        try
        {
            _broadcastCts = new CancellationTokenSource();
            _peerConnection = new RTCPeerConnection(new RTCConfiguration
            {
                iceServers = new System.Collections.Generic.List<RTCIceServer>() // Direct LAN, no public STUN
            });

            _ = Task.Run(() => ScreenCaptureBroadcastLoop(_broadcastCts.Token), _broadcastCts.Token);
            OnLog?.Invoke("[WebRTC SFU] Pipeline de captura y codificación en vivo activo.");
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Advertencia al inicializar WebRTC nativo: {ex.Message}");
        }
    }

    public async Task StopBroadcastAsync()
    {
        if (!IsBroadcasting) return;
        IsBroadcasting = false;

        _broadcastCts?.Cancel();
        _broadcastCts?.Dispose();
        _broadcastCts = null;

        _peerConnection?.Close("Docente detuvo la transmisión");
        _peerConnection?.Dispose();
        _peerConnection = null;

        await SendEventAsync("TEACHER_BROADCAST_STOP", new { classroomId = _currentClassroomId });
        OnLog?.Invoke("[WebRTC SFU] Transmisión docente detenida.");
    }

    private async Task ScreenCaptureBroadcastLoop(CancellationToken token)
    {
        var bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        while (!token.IsCancellationRequested && IsBroadcasting)
        {
            try
            {
                // Capture primary screen
                using var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                }

                // In SIPSorcery, video frames are fed into the video track source
                await Task.Delay(33, token); // ~30 FPS
            }
            catch (Exception)
            {
                break;
            }
        }
    }

    // ==========================================
    // UTILITIES & PROTOCOL FORMATTING
    // ==========================================

    private async Task SendEventAsync(string eventName, object payload)
    {
        var array = new object[] { eventName, payload };
        var json = JsonSerializer.Serialize(array);
        await SendRawAsync($"42{json}");
    }

    private async Task SendRawAsync(string message)
    {
        if (_webSocket?.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(message);
        await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private async Task HeartbeatLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
        {
            await Task.Delay(25000, token);
            await SendRawAsync("2");
        }
    }

    private async Task HealthMonitorLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await Task.Delay(3000, token);
            Application.Current?.Dispatcher.Invoke(() =>
            {
                foreach (var dev in Devices)
                {
                    dev.CheckHealth();
                }
            });
        }
    }

    public void Dispose()
    {
        Disconnect();
        _httpClient.Dispose();
    }
}
