using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace AssetSchool.Student.Service;

public class NamedPipeIpcServer
{
    private readonly string _pipeName;
    private CancellationTokenSource? _cts;
    private NamedPipeServerStream? _pipeServer;

    public event Action<string>? OnMessageReceived;

    public NamedPipeIpcServer(uint sessionId)
    {
        _pipeName = $"AssetSchool_IPC_S{sessionId}";
    }

    public void Start()
    {
        _cts = new CancellationTokenSource();
        _ = Task.Run(() => ServerLoop(_cts.Token), _cts.Token);
    }

    public void Stop()
    {
        _cts?.Cancel();
        _pipeServer?.Dispose();
    }

    private async Task ServerLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var pipeSecurity = new PipeSecurity();
                var sidSystem = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
                var sidUsers = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);

                pipeSecurity.AddAccessRule(new PipeAccessRule(sidSystem, PipeAccessRights.FullControl, AccessControlType.Allow));
                pipeSecurity.AddAccessRule(new PipeAccessRule(sidUsers, PipeAccessRights.ReadWrite, AccessControlType.Allow));

                _pipeServer = NamedPipeServerStreamAcl.Create(
                    _pipeName,
                    PipeDirection.InOut,
                    NamedPipeServerStream.MaxAllowedServerInstances,
                    PipeTransmissionMode.Message,
                    PipeOptions.Asynchronous,
                    16384,
                    16384,
                    pipeSecurity);

                Console.WriteLine($"[NamedPipeIpcServer] Esperando conexión del SessionAgent en \\\\.\\pipe\\{_pipeName}...");
                await _pipeServer.WaitForConnectionAsync(token);

                Console.WriteLine("[NamedPipeIpcServer] SessionAgent conectado al IPC de forma segura.");

                using var reader = new StreamReader(_pipeServer, Encoding.UTF8);
                while (!token.IsCancellationRequested && _pipeServer.IsConnected)
                {
                    string? line = await reader.ReadLineAsync(token);
                    if (line == null) break;

                    OnMessageReceived?.Invoke(line);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                Console.WriteLine($"[NamedPipeIpcServer] Excepción en IPC: {ex.Message}");
            }
            finally
            {
                _pipeServer?.Dispose();
                _pipeServer = null;
            }
        }
    }

    public async Task SendMessageAsync(string message)
    {
        if (_pipeServer != null && _pipeServer.IsConnected)
        {
            var bytes = Encoding.UTF8.GetBytes(message + "\n");
            await _pipeServer.WriteAsync(bytes, 0, bytes.Length);
            await _pipeServer.FlushAsync();
        }
    }
}
