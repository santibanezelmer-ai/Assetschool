using System;
using System.Collections.ObjectModel;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using AssetSchool.Master.ViewModels;

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

    public ObservableCollection<StudentDeviceViewModel> Devices { get; } = new();
    public bool IsConnected => _isConnected;
    public bool IsBroadcasting { get; private set; }

    public event Action<bool>? OnConnectionChanged;
    public event Action<string>? OnLog;

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
            OnLog?.Invoke($"Conectando a {uri}...");
            await _webSocket.ConnectAsync(uri, _cts.Token);

            _isConnected = true;
            OnConnectionChanged?.Invoke(true);
            OnLog?.Invoke("Conexión WebSocket establecida con éxito.");

            _ = Task.Run(() => ReceiveLoop(_cts.Token), _cts.Token);
            _ = Task.Run(() => HeartbeatLoop(_cts.Token), _cts.Token);
        }
        catch (Exception ex)
        {
            _isConnected = false;
            OnConnectionChanged?.Invoke(false);
            OnLog?.Invoke($"Error conectando al servidor: {ex.Message}");
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
        var buffer = new byte[65536];
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
                OnLog?.Invoke($"Error de recepción: {ex.Message}");
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
            _ = SendEventAsync("TEACHER_JOIN_CLASSROOM", new { classroomId = "lab-informatica-01" });
            return;
        }

        if (message.StartsWith("42"))
        {
            var json = message.Substring(2);
            ParseEvent(json);
        }
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
                    if (eventName == "DEVICE_LIST" || eventName == "CLASSROOM_SNAPSHOT")
                    {
                        UpdateDeviceList(payload);
                    }
                    else if (eventName == "DEVICE_STATUS_CHANGE")
                    {
                        UpdateDeviceStatus(payload);
                    }
                });
            }
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Error parseando evento: {ex.Message}");
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
            var os = item.TryGetProperty("osType", out var osProp) ? osProp.GetString() ?? "windows" : "windows";
            var status = item.TryGetProperty("status", out var stProp) ? stProp.GetString() ?? "online" : "online";

            Devices.Add(new StudentDeviceViewModel
            {
                Id = id,
                Hostname = host,
                LocalIp = ip,
                OsType = os,
                Status = status,
                IsLocked = status == "locked"
            });
        }
    }

    private void UpdateDeviceStatus(JsonElement payload)
    {
        var id = payload.TryGetProperty("deviceId", out var dProp) ? dProp.GetString() : null;
        if (string.IsNullOrEmpty(id)) return;

        foreach (var dev in Devices)
        {
            if (dev.Id == id)
            {
                if (payload.TryGetProperty("status", out var st))
                {
                    dev.Status = st.GetString() ?? "online";
                    dev.IsLocked = dev.Status == "locked";
                }
                break;
            }
        }
    }

    public async Task LockAllAsync(string message = "Atención al frente. Pausa pedagógica activa.")
    {
        await SendEventAsync("TEACHER_LOCK_CLASSROOM", new { message });
        foreach (var dev in Devices)
        {
            dev.IsLocked = true;
            dev.Status = "locked";
        }
    }

    public async Task UnlockAllAsync()
    {
        await SendEventAsync("TEACHER_UNLOCK_CLASSROOM", new { });
        foreach (var dev in Devices)
        {
            dev.IsLocked = false;
            dev.Status = "online";
        }
    }

    public async Task LockDeviceAsync(string deviceId, string message = "Bloqueado por el profesor")
    {
        await SendEventAsync("TEACHER_LOCK_DEVICE", new { deviceId, message });
        foreach (var dev in Devices)
        {
            if (dev.Id == deviceId)
            {
                dev.IsLocked = true;
                dev.Status = "locked";
            }
        }
    }

    public async Task UnlockDeviceAsync(string deviceId)
    {
        await SendEventAsync("TEACHER_UNLOCK_DEVICE", new { deviceId });
        foreach (var dev in Devices)
        {
            if (dev.Id == deviceId)
            {
                dev.IsLocked = false;
                dev.Status = "online";
            }
        }
    }

    public async Task SendPopupMessageAsync(string title, string message, string? targetDeviceId = null, string priority = "normal")
    {
        await SendEventAsync("TEACHER_SEND_POPUP_MESSAGE", new
        {
            title,
            message,
            targetDeviceId,
            priority
        });
    }

    public async Task PowerActionAsync(string operation, string? targetDeviceId = null, int delaySeconds = 5)
    {
        await SendEventAsync("TEACHER_POWER_ACTION", new
        {
            operation,
            targetDeviceId,
            delaySeconds,
            force = true
        });
    }

    public async Task StartBroadcastAsync(string mode = "fullscreen")
    {
        IsBroadcasting = true;
        await SendEventAsync("TEACHER_BROADCAST_START", new
        {
            mode,
            fps = 30,
            bitrateKbps = 2500
        });
    }

    public async Task StopBroadcastAsync()
    {
        IsBroadcasting = false;
        await SendEventAsync("TEACHER_BROADCAST_STOP", new { });
    }

    public async Task SendRemoteInputAsync(string deviceId, string type, double? x = null, double? y = null, string? button = null, int? keyCode = null, string? keyText = null)
    {
        await SendEventAsync("TEACHER_REMOTE_INPUT", new
        {
            deviceId,
            input = new
            {
                type,
                x,
                y,
                button,
                keyCode,
                keyText
            }
        });
    }

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

    public void Dispose()
    {
        Disconnect();
    }
}
