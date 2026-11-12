import React, { useRef, useEffect } from 'react';
import { X, Play, Square, RefreshCw, Activity, ShieldAlert, Cpu, Network, Lock, Unlock } from 'lucide-react';
import { MonitorDevice, ActiveStreamState } from '../hooks/useWebRtcMonitor';

interface DeviceInspectionModalProps {
  device: MonitorDevice | null;
  streamState?: ActiveStreamState;
  onClose: () => void;
  onStartStream: (deviceId: string, tier: 'thumbnail' | 'individual') => void;
  onStopStream: (deviceId: string) => void;
  onLockDevice?: (deviceId: string) => void;
  onUnlockDevice?: (deviceId: string) => void;
}

export const DeviceInspectionModal: React.FC<DeviceInspectionModalProps> = ({
  device,
  streamState,
  onClose,
  onStartStream,
  onStopStream,
  onLockDevice,
  onUnlockDevice,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isStreaming = streamState?.status === 'streaming';
  const isConnecting = streamState?.status === 'connecting' || streamState?.status === 'requesting';
  const isLocked = device?.status === 'locked';

  useEffect(() => {
    if (videoRef.current && streamState?.mediaStream) {
      videoRef.current.srcObject = streamState.mediaStream;
      videoRef.current.play().catch(() => {});
    }
  }, [streamState?.mediaStream]);

  if (!device) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{device.hostname}</span>
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                — {device.studentName}
              </span>
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                {device.osType}
              </span>
              {isLocked && (
                <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1 animate-pulse">
                  <Lock className="w-3 h-3" /> PANTALLA BLOQUEADA
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              IP LAN: <span className="font-mono">{device.localIp}</span> | Ventana Activa: <span className="font-medium">{device.activeApp}</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Lock / Unlock Screen button */}
            {!device.isRevoked && device.status !== 'offline' && (
              isLocked ? (
                <button
                  onClick={() => onUnlockDevice?.(device.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Desbloquear Pantalla
                </button>
              ) : (
                <button
                  onClick={() => onLockDevice?.(device.id)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Bloquear Pantalla
                </button>
              )
            )}

            {isStreaming ? (
              <button
                onClick={() => onStopStream(device.id)}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Detener Transmisión
              </button>
            ) : (
              <button
                onClick={() => onStartStream(device.id, 'individual')}
                disabled={isConnecting || device.isRevoked || device.status !== 'online'}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Iniciar HD (1080p)
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative flex-1 bg-slate-950 min-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain max-h-[65vh] ${isStreaming ? 'block' : 'hidden'}`}
          />

          {!isStreaming && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
              {isConnecting ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" />
                  <p className="text-sm font-semibold text-sky-300">Negociando flujo WebRTC P2P con el agente...</p>
                  <p className="text-xs text-slate-500">Generando SDP Answer y candidatos ICE locales host</p>
                </div>
              ) : device.isRevoked ? (
                <div className="flex flex-col items-center gap-2 text-red-400">
                  <ShieldAlert className="w-12 h-12 text-red-500" />
                  <p className="text-sm font-bold">Dispositivo revocado por el administrador de red TIC</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    No se permite la supervisión ni captura de pantalla en dispositivos que han sido deshabilitados.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-sky-400">
                    <Activity className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-white">Supervisión en Espera</p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Haga clic en <span className="text-sky-400 font-medium">"Iniciar HD (1080p)"</span> para solicitar la captura de pantalla en alta resolución mediante WebRTC LAN.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Privacy Banner Reminder on Student Side */}
          {isStreaming && (
            <div className="absolute bottom-3 left-4 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 flex items-center gap-2 shadow-lg backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Banner de supervisión visible activo en la pantalla del estudiante</span>
            </div>
          )}
        </div>

        {/* Telemetry and Metrics Footer */}
        <div className="px-6 py-3.5 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Tasa de Cuadros</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {isStreaming ? `${streamState?.telemetry.fps || 30} FPS` : '0 FPS'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Ancho de Banda</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {isStreaming ? `${streamState?.telemetry.bitrateKbps || 2000} kbps` : '0 kbps'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Resolución</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {isStreaming ? (streamState?.telemetry.resolution || '1920x1080') : 'N/A'}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Latencia (RTT LAN)</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {isStreaming ? `${streamState?.telemetry.roundTripTimeMs || 2} ms` : 'N/A'}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Pérdida de Paquetes</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {isStreaming ? `${streamState?.telemetry.packetLossPercent || 0}%` : '0%'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
