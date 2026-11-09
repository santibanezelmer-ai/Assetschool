import React, { useRef, useEffect } from 'react';
import { Monitor, Play, Square, Maximize2, AlertCircle, Wifi, RefreshCw } from 'lucide-react';
import { DevicePlatform } from '@assetschool/shared-types';
import { MonitorDevice, ActiveStreamState } from '../hooks/useWebRtcMonitor';

interface WebRtcVideoTileProps {
  device: MonitorDevice;
  streamState?: ActiveStreamState;
  onStartStream: (deviceId: string) => void;
  onStopStream: (deviceId: string) => void;
  onInspect: (device: MonitorDevice) => void;
}

export const WebRtcVideoTile: React.FC<WebRtcVideoTileProps> = ({
  device,
  streamState,
  onStartStream,
  onStopStream,
  onInspect,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isStreaming = streamState?.status === 'streaming';
  const isConnecting = streamState?.status === 'connecting' || streamState?.status === 'requesting';
  const isError = streamState?.status === 'error';

  useEffect(() => {
    if (videoRef.current && streamState?.mediaStream) {
      videoRef.current.srcObject = streamState.mediaStream;
      videoRef.current.play().catch(() => {});
    }
  }, [streamState?.mediaStream]);

  const getOsColor = (os: DevicePlatform) => {
    switch (os) {
      case DevicePlatform.WINDOWS:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case DevicePlatform.MACOS:
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      case DevicePlatform.LINUX:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
      case DevicePlatform.CHROMEOS:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-sky-500/80 transition-all flex flex-col group">
      {/* Header bar */}
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 truncate">
          <Monitor className="w-4 h-4 text-sky-600 flex-shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {device.hostname}
            </span>
            <span className="text-slate-500 dark:text-slate-400 ml-1.5 truncate">
              ({device.studentName})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${getOsColor(device.osType)}`}>
            {device.osType}
          </span>
          {device.isRevoked && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              REVOCADO
            </span>
          )}
        </div>
      </div>

      {/* 16:9 Video Canvas / Frame Container */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Real WebRTC HTML5 Video playback */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${isStreaming ? 'block' : 'hidden'}`}
        />

        {/* Fallback View when not actively rendering WebRTC track */}
        {!isStreaming && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
            {isConnecting ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                <span className="text-xs text-sky-300 font-medium">Negociando WebRTC P2P (LAN)...</span>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-1.5 max-w-xs">
                <AlertCircle className="w-7 h-7 text-red-400" />
                <span className="text-xs font-semibold text-red-300">Fallo de Transmisión</span>
                <span className="text-[11px] text-red-400/90 line-clamp-2">{streamState?.error}</span>
              </div>
            ) : device.isRevoked ? (
              <div className="flex flex-col items-center gap-1">
                <AlertCircle className="w-7 h-7 text-red-500" />
                <span className="text-xs font-semibold text-red-400">Equipo Revocado por TIC</span>
                <span className="text-[11px] text-slate-500">Transmisión bloqueada por seguridad</span>
              </div>
            ) : device.status === 'offline' ? (
              <div className="flex flex-col items-center gap-1 text-slate-500">
                <Monitor className="w-8 h-8 opacity-40" />
                <span className="text-xs">Equipo Desconectado de la Red</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="p-2.5 rounded-full bg-slate-800 text-slate-400">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <span className="text-xs font-medium text-slate-300 block">{device.activeApp}</span>
                  <span className="text-[11px] text-slate-500">IP LAN: {device.localIp}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Telemetry Overlay Badge (when streaming) */}
        {isStreaming && (
          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded px-2 py-0.5 text-[10px] text-slate-200 font-mono flex items-center gap-2 shadow-sm">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {streamState?.telemetry.fps || 10} FPS
            </span>
            <span className="text-slate-400">|</span>
            <span>{streamState?.telemetry.bitrateKbps || 240} kbps</span>
            <span className="text-slate-400">|</span>
            <span className="text-sky-300">{streamState?.telemetry.resolution || '640x360'}</span>
          </div>
        )}

        {/* Action Button Controls Overlay (Top Right & Bottom Right) */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {isStreaming ? (
            <button
              onClick={() => onStopStream(device.id)}
              title="Detener Transmisión"
              className="p-1.5 rounded bg-red-600/90 hover:bg-red-600 text-white shadow-md transition-all flex items-center gap-1 text-[11px] font-semibold"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="hidden group-hover:inline">Detener</span>
            </button>
          ) : (
            device.status === 'online' && !device.isRevoked && (
              <button
                onClick={() => onStartStream(device.id)}
                disabled={isConnecting}
                title="Iniciar Supervisión de Pantalla"
                className="p-1.5 rounded bg-sky-600/90 hover:bg-sky-600 text-white shadow-md transition-all flex items-center gap-1 text-[11px] font-semibold disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span className="hidden group-hover:inline">Monitorear</span>
              </button>
            )
          )}

          <button
            onClick={() => onInspect(device)}
            title="Vista Detallada e Individual"
            className="p-1.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-md transition-all"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        {/* Bottom Banner Status Info */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-slate-300 bg-slate-950/70 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-800/60">
          <span className="truncate flex items-center gap-1">
            <Wifi className={`w-3 h-3 ${device.status === 'online' ? 'text-emerald-400' : 'text-slate-500'}`} />
            {device.localIp}
          </span>
          <span className="font-mono text-slate-400 truncate max-w-[150px]">
            {device.activeApp}
          </span>
        </div>
      </div>
    </div>
  );
};
