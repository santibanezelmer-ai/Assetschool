using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using AssetSchool.Student.SessionAgent.Capture;
using AssetSchool.Student.SessionAgent.RemoteInput;
using AssetSchool.Student.SessionAgent.UI;

namespace AssetSchool.Student.SessionAgent;

public class NamedPipeIpcClient
{
    private readonly string _pipeName;
    private readonly SynchronizationContext? _uiContext;
    private NamedPipeClientStream? _pipeClient;
    private CancellationTokenSource? _cts;
    private readonly WindowsGraphicsCaptureService _captureService = new();

    public NamedPipeIpcClient(uint sessionId, SynchronizationContext? uiContext = null)
    {
        _pipeName = $"AssetSchool_IPC_S{sessionId}";
        _uiContext = uiContext ?? SynchronizationContext.Current;
    }

    public void Start()
    {
        _cts = new CancellationTokenSource();
        _captureService.StartCapture(fps: 10, width: 640, height: 360);
        _ = Task.Run(() => ClientLoop(_cts.Token), _cts.Token);
    }

    public void Stop()
    {
        _captureService.StopCapture();
        _cts?.Cancel();
        _pipeClient?.Dispose();
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

                Console.WriteLine("[NamedPipeIpcClient] Conectado exitosamente con el Servicio Windows.");

                using var reader = new StreamReader(_pipeClient, Encoding.UTF8);
                while (!token.IsCancellationRequested && _pipeClient.IsConnected)
                {
                    string? line = await reader.ReadLineAsync(token);
                    if (line == null) break;

                    HandleCommand(line);
                }
            }
            catch (Exception)
            {
                // Retry connection in 3 seconds
                await Task.Delay(3000, token);
            }
            finally
            {
                _pipeClient?.Dispose();
                _pipeClient = null;
            }
        }
    }

    private void HandleCommand(string json)
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
                        RunOnUIThread(() => MessagePopupForm.ShowMessage(title, body, sender));
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

                        if (type == "mouseMove")
                        {
                            InputInjector.InjectMouseMove(x, y);
                        }
                        else if (type == "click" || type == "mouseDown")
                        {
                            string btn = payload.TryGetProperty("button", out var btnProp) ? btnProp.GetString() ?? "left" : "left";
                            InputInjector.InjectMouseClick(x, y, btn);
                        }
                        else if (type == "keyDown" || type == "keyUp")
                        {
                            ushort vk = (ushort)(payload.TryGetProperty("keyCode", out var kc) ? kc.GetInt32() : 0);
                            if (vk > 0)
                            {
                                InputInjector.InjectKey(vk, type == "keyDown");
                            }
                        }
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
