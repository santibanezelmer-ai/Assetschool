using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace AssetSchool.Student.Service;

/// <summary>
/// Gestiona dinámicamente los servidores IPC Named Pipes para cada sesión interactiva activa
/// en Windows, soportando Fast User Switching y evitando conexiones en desuso o no autorizadas.
/// </summary>
public class MultiSessionIpcManager : IDisposable
{
    private readonly ILogger _logger;
    private readonly string _agentExecutablePath;
    private readonly ConcurrentDictionary<uint, NamedPipeIpcServer> _activeServers = new();
    private readonly ConcurrentDictionary<uint, DateTime> _sessionLastSeen = new();
    private CancellationTokenSource? _monitorCts;

    public event Action<uint, string>? OnMessageReceived;

    public MultiSessionIpcManager(ILogger logger, string agentExecutablePath)
    {
        _logger = logger;
        _agentExecutablePath = agentExecutablePath;
    }

    public void Start(CancellationToken stoppingToken)
    {
        _monitorCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        _ = Task.Run(() => MonitorSessionsLoop(_monitorCts.Token), _monitorCts.Token);
    }

    private async Task MonitorSessionsLoop(CancellationToken token)
    {
        _logger.LogInformation("[MultiSessionIPC] Monitor dinámico de sesiones interactivas de Windows iniciado.");

        while (!token.IsCancellationRequested)
        {
            try
            {
                var activeSessionIds = SessionManager.GetActiveSessionIds();

                // 1. Asegurar servidor IPC y SessionAgent para cada sesión interactiva activa
                foreach (var sessionId in activeSessionIds)
                {
                    if (sessionId == 0) continue; // Sesión 0 reservada para servicios del sistema

                    _sessionLastSeen[sessionId] = DateTime.UtcNow;

                    if (!_activeServers.TryGetValue(sessionId, out var server))
                    {
                        _logger.LogInformation($"[MultiSessionIPC] Nueva sesión activa detectada: #{sessionId}. Inicializando NamedPipeIpcServer...");
                        server = new NamedPipeIpcServer(sessionId);
                        server.OnMessageReceived += (msg) =>
                        {
                            OnMessageReceived?.Invoke(sessionId, msg);
                        };
                        server.Start();
                        _activeServers[sessionId] = server;

                        // Desplegar SessionAgent en la sesión interactiva correspondiente
                        if (File.Exists(_agentExecutablePath))
                        {
                            SessionManager.LaunchSessionAgentForSession(_agentExecutablePath, sessionId);
                        }
                    }
                }

                // 2. Liberar servidores IPC de sesiones cerradas o desconectadas (Fast User Switching)
                var currentTracked = _activeServers.Keys.ToList();
                foreach (var trackedSessionId in currentTracked)
                {
                    if (!activeSessionIds.Contains(trackedSessionId))
                    {
                        _logger.LogInformation($"[MultiSessionIPC] Sesión interactiva #{trackedSessionId} desconectada o cerrada. Liberando recursos IPC...");
                        if (_activeServers.TryRemove(trackedSessionId, out var removedServer))
                        {
                            removedServer.Stop();
                        }
                        _sessionLastSeen.TryRemove(trackedSessionId, out _);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning($"[MultiSessionIPC] Error en bucle de supervisión de sesiones: {ex.Message}");
            }

            try
            {
                await Task.Delay(3000, token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    /// <summary>
    /// Difunde un comando hacia todas las sesiones interactivas activas (ej. Curtain Lock, Broadcast).
    /// </summary>
    public async Task BroadcastAsync(string message)
    {
        foreach (var kvp in _activeServers)
        {
            try
            {
                await kvp.Value.SendMessageAsync(message);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[MultiSessionIPC] Error enviando mensaje a sesión #{kvp.Key}: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Envía un mensaje a una sesión específica por su ID.
    /// </summary>
    public async Task SendToSessionAsync(uint sessionId, string message)
    {
        if (_activeServers.TryGetValue(sessionId, out var server))
        {
            await server.SendMessageAsync(message);
        }
    }

    public void Dispose()
    {
        _monitorCts?.Cancel();
        _monitorCts?.Dispose();
        foreach (var server in _activeServers.Values)
        {
            server.Stop();
        }
        _activeServers.Clear();
    }
}
