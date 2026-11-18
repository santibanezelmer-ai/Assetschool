using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using AssetSchool.Student.SessionAgent.Capture;
using AssetSchool.Student.SessionAgent.FileTransfer;
using AssetSchool.Student.SessionAgent.RemoteInput;
using AssetSchool.Student.SessionAgent.UI;

namespace AssetSchool.Student.SessionAgent;

public class NamedPipeIpcClient
{
    private readonly string _pipeName;
    private readonly SynchronizationContext? _uiContext;
    private NamedPipeClientStream? _pipeClient;
    private StreamWriter? _pipeWriter;
    private CancellationTokenSource? _cts;
    private readonly WindowsGraphicsCaptureService _captureService = new();
    private long _lastThumbnailSent = 0;

    public NamedPipeIpcClient(uint sessionId, SynchronizationContext? uiContext = null)
    {
        _pipeName = $"AssetSchool_IPC_S{sessionId}";
        _uiContext = uiContext ?? SynchronizationContext.Current;
    }

    public void Start()
    {
        _cts = new CancellationTokenSource();

        // Capture screen frames and throttle thumbnails to 1 frame every 3 seconds
        _captureService.OnFrameCaptured += async (jpegBytes, w, h, ts) =>
        {
            if (ts - _lastThumbnailSent >= 3000)
            {
                _lastThumbnailSent = ts;
                string base64 = Convert.ToBase64String(jpegBytes);
                var packet = new object[]
                {
                    "DEVICE_THUMBNAIL",
                    new
                    {
                        thumbnailBase64 = base64,
                        timestamp = ts
                    }
                };
                string json = JsonSerializer.Serialize(packet);
                await SendMessageAsync(json);
            }
        };

        _captureService.StartCapture(fps: 1, width: 480, height: 270);
        _ = Task.Run(() => ClientLoop(_cts.Token), _cts.Token);
    }

    public void Stop()
    {
        _captureService.StopCapture();
        _cts?.Cancel();
        _pipeWriter?.Dispose();
        _pipeClient?.Dispose();
    }

    public async Task SendMessageAsync(string message)
    {
        try
        {
            if (_pipeClient != null && _pipeClient.IsConnected && _pipeWriter != null)
            {
                await _pipeWriter.WriteLineAsync(message);
                await _pipeWriter.FlushAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IPC Send Error]: {ex.Message}");
        }
    }

    private void RunOnUIThread(Action action)
    {
        if (_uiContext != null)
        {
            _uiContext.Post(_ => action(), null);
        }
        else
        {
            action();
        }
    }

    private async Task ClientLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                _pipeClient = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                Console.WriteLine($"[NamedPipeIpcClient] Conectando a \\\\.\\pipe\\{_pipeName}...");
                await _pipeClient.ConnectAsync(5000, token);

                _pipeWriter = new StreamWriter(_pipeClient, Encoding.UTF8) { AutoFlush = true };
                Console.WriteLine("[NamedPipeIpcClient] Conectado exitosamente con el Servicio Windows.");

                using var reader = new StreamReader(_pipeClient, Encoding.UTF8);
                while (!token.IsCancellationRequested && _pipeClient.IsConnected)
                {
                    string? line = await reader.ReadLineAsync(token);
                    if (line == null) break;

                    await HandleCommandAsync(line);
                }
            }
            catch (Exception)
            {
                // Retry connection in 3 seconds
                await Task.Delay(3000, token);
            }
            finally
            {
                _pipeWriter?.Dispose();
                _pipeWriter = null;
                _pipeClient?.Dispose();
                _pipeClient = null;
            }
        }
    }

    private async Task HandleCommandAsync(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() >= 2)
            {
                var eventName = root[0].GetString();
                var payload = root[1];

                switch (eventName)
                {
                    case "COMMAND_DISPATCH":
                        var cmdEnv = payload.TryGetProperty("payload", out var cEnv) ? cEnv : payload;
                        string cmdType = cmdEnv.TryGetProperty("commandType", out var ct) ? ct.GetString() ?? "" : "";
                        var cmdParams = cmdEnv.TryGetProperty("params", out var cp) ? cp : cmdEnv;

                        if (cmdType == "LOCK_SCREEN")
                        {
                            string msg = cmdParams.TryGetProperty("message", out var m) ? m.GetString() ?? "Pausa pedagógica" : "Pausa pedagógica";
                            RunOnUIThread(() => LockCurtainForm.Instance.Show(msg));
                        }
                        else if (cmdType == "UNLOCK_SCREEN")
                        {
                            RunOnUIThread(() => LockCurtainForm.Instance.Hide());
                        }
                        break;

                    case "LOCK_SCREEN":
                    case "TEACHER_LOCK_CLASSROOM":
                    case "TEACHER_LOCK_DEVICE":
                        string msg = payload.TryGetProperty("message", out var m) ? m.GetString() ?? "Pausa pedagógica" : "Pausa pedagógica";
                        RunOnUIThread(() => LockCurtainForm.Instance.Show(msg));
                        break;

                    case "UNLOCK_SCREEN":
                    case "TEACHER_UNLOCK_CLASSROOM":
                    case "TEACHER_UNLOCK_DEVICE":
                        RunOnUIThread(() => LockCurtainForm.Instance.Hide());
                        break;

                    case "POPUP_MESSAGE":
                        string title = payload.TryGetProperty("title", out var t) ? t.GetString() ?? "Aviso" : "Aviso";
                        string body = payload.TryGetProperty("message", out var b) ? b.GetString() ?? "" : "";
                        string sender = payload.TryGetProperty("teacherName", out var s) ? s.GetString() ?? "Profesor" : "Profesor";
                        string msgId = payload.TryGetProperty("messageId", out var idProp) ? idProp.GetString() ?? "msg-1" : "msg-1";

                        RunOnUIThread(() =>
                        {
                            MessagePopupForm.ShowMessage(title, body, sender);
                            // Student confirmed reading
                            _ = SendMessageAsync(JsonSerializer.Serialize(new object[]
                            {
                                "MESSAGE_ACK",
                                new
                                {
                                    messageId = msgId,
                                    hostname = Environment.MachineName,
                                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                }
                            }));
                        });
                        break;

                    case "TEACHER_BROADCAST_START":
                        string teacher = payload.TryGetProperty("teacherName", out var tn) ? tn.GetString() ?? "Profesor" : "Profesor";
                        string mode = payload.TryGetProperty("mode", out var md) ? md.GetString() ?? "fullscreen" : "fullscreen";
                        RunOnUIThread(() => TeacherBroadcastForm.Instance.StartBroadcast(teacher, mode));
                        break;

                    case "TEACHER_BROADCAST_STOP":
                        RunOnUIThread(() => TeacherBroadcastForm.Instance.StopBroadcast());
                        break;

                    case "REMOTE_INPUT_EVENT":
                        string type = payload.TryGetProperty("type", out var typ) ? typ.GetString() ?? "" : "";
                        double x = payload.TryGetProperty("x", out var xProp) ? xProp.GetDouble() : 0.5;
                        double y = payload.TryGetProperty("y", out var yProp) ? yProp.GetDouble() : 0.5;

                        switch (type.ToLowerInvariant())
                        {
                            case "mousemove":
                                InputInjector.InjectMouseMove(x, y);
                                break;
                            case "click":
                            case "mousedown":
                                string btn = payload.TryGetProperty("button", out var btnProp) ? btnProp.GetString() ?? "left" : "left";
                                InputInjector.InjectMouseClick(x, y, btn);
                                break;
                            case "doubleclick":
                                InputInjector.InjectMouseDoubleClick(x, y);
                                break;
                            case "scroll":
                            case "wheel":
                                int delta = payload.TryGetProperty("delta", out var dProp) ? dProp.GetInt32() : (int)((y - 0.5) * 240);
                                InputInjector.InjectMouseScroll(delta != 0 ? delta : 120);
                                break;
                            case "keydown":
                            case "keyup":
                                ushort vk = (ushort)(payload.TryGetProperty("keyCode", out var kc) ? kc.GetInt32() : 0);
                                if (vk > 0)
                                {
                                    InputInjector.InjectKey(vk, type.ToLowerInvariant() == "keydown");
                                }
                                break;
                        }
                        break;

                    case "FILE_SEND":
                        string fName = payload.TryGetProperty("fileName", out var fn) ? fn.GetString() ?? "archivo.dat" : "archivo.dat";
                        string fContent = payload.TryGetProperty("fileContentBase64", out var fc) ? fc.GetString() ?? "" : "";
                        string? fSha = payload.TryGetProperty("sha256", out var fsh) ? fsh.GetString() : null;
                        string? targetDir = payload.TryGetProperty("targetDir", out var td) ? td.GetString() : null;
                        string transferId = payload.TryGetProperty("transferId", out var tid) ? tid.GetString() ?? "" : "";

                        var saveRes = FileManagerService.Instance.SaveIncomingFile(fName, fContent, targetDir, fSha);
                        var sendResultPacket = new object[]
                        {
                            "FILE_SEND_RESULT",
                            new
                            {
                                transferId,
                                success = saveRes.Success,
                                savedPath = saveRes.SavedPath,
                                sha256 = saveRes.Sha256,
                                error = saveRes.Error
                            }
                        };
                        await SendMessageAsync(JsonSerializer.Serialize(sendResultPacket));
                        break;

                    case "TEACHER_COLLECT_FILE":
                        string filePath = payload.TryGetProperty("filePath", out var fp) ? fp.GetString() ?? "" : "";
                        var collectRes = FileManagerService.Instance.ReadFileToCollect(filePath);
                        var collectResultPacket = new object[]
                        {
                            "FILE_COLLECT_RESULT",
                            new
                            {
                                success = collectRes.Success,
                                fileName = collectRes.FileName,
                                fileSizeBytes = collectRes.Size,
                                fileContentBase64 = collectRes.Base64Content,
                                sha256 = collectRes.Sha256,
                                error = collectRes.Error
                            }
                        };
                        await SendMessageAsync(JsonSerializer.Serialize(collectResultPacket));
                        break;

                    case "TEACHER_LIST_DIR":
                        string? dirPath = payload.TryGetProperty("dirPath", out var dp) ? dp.GetString() : null;
                        var listRes = FileManagerService.Instance.ListDirectory(dirPath);
                        var listResultPacket = new object[]
                        {
                            "FILE_LIST_DIR_RESULT",
                            new
                            {
                                currentPath = listRes.CurrentPath,
                                items = listRes.Items,
                                error = listRes.Error
                            }
                        };
                        await SendMessageAsync(JsonSerializer.Serialize(listResultPacket));
                        break;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[NamedPipeIpcClient] Error ejecutando comando: {ex.Message}");
        }
    }
}
