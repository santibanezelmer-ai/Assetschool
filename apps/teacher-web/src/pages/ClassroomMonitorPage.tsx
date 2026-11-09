import React, { useState } from 'react';
import {
  Eye,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  Monitor,
  Activity,
  Wifi,
  ShieldCheck,
} from 'lucide-react';
import { useWebRtcMonitor, MonitorDevice } from '../hooks/useWebRtcMonitor';
import { WebRtcVideoTile } from '../components/WebRtcVideoTile';
import { DeviceInspectionModal } from '../components/DeviceInspectionModal';

export const ClassroomMonitorPage: React.FC = () => {
  const {
    devices,
    streams,
    isConnectedToGateway,
    gatewayError,
    startStream,
    stopStream,
    startAllStreams,
    stopAllStreams,
    refreshDevices,
  } = useWebRtcMonitor();

  const [inspectedDevice, setInspectedDevice] = useState<MonitorDevice | null>(null);

  const activeStreamsCount = Object.values(streams).filter((s) => s.status === 'streaming').length;
  const onlineDevicesCount = devices.filter((d) => d.status === 'online' && !d.isRevoked).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-sky-600" />
            Monitor de Aula en Tiempo Real
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supervisión simultánea de pantallas mediante captura nativa y WebRTC LAN (Zero-Cloud).
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={refreshDevices}
            title="Refrescar lista de dispositivos de la sala"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={startAllStreams}
            disabled={onlineDevicesCount === 0}
            className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Iniciar Supervisión del Aula ({onlineDevicesCount})
          </button>

          <button
            onClick={stopAllStreams}
            disabled={activeStreamsCount === 0}
            className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Detener Todo ({activeStreamsCount})
          </button>
        </div>
      </div>

      {/* Gateway & Network Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isConnectedToGateway ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Gateway LAN (Puerto 3000 / 48501)
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isConnectedToGateway ? 'Conectado y Enlazado' : 'Reconectando...'}
              </span>
            </div>
          </div>
          <span className={`w-2 h-2 rounded-full ${isConnectedToGateway ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Transmisiones WebRTC Activas
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {activeStreamsCount} de {devices.length} monitoreados
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
            {activeStreamsCount > 0 ? 'P2P LAN' : 'Inactivo'}
          </span>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Cumplimiento y Privacidad
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Banner visual obligatorio activo
              </span>
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Auditado
          </span>
        </div>
      </div>

      {gatewayError && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{gatewayError}</span>
        </div>
      )}

      {/* Grid of Video Tiles (16:9 thumbnails) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {devices.map((device) => (
          <WebRtcVideoTile
            key={device.id}
            device={device}
            streamState={streams[device.id]}
            onStartStream={(id) => startStream(id, 'thumbnail')}
            onStopStream={stopStream}
            onInspect={(dev) => setInspectedDevice(dev)}
          />
        ))}
      </div>

      {devices.length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Monitor className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No hay computadores en este laboratorio</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Los agentes de los estudiantes aparecerán automáticamente aquí al conectarse a la red LAN.
          </p>
        </div>
      )}

      {/* Fullscreen Modal View for Individual Inspection */}
      <DeviceInspectionModal
        device={inspectedDevice}
        streamState={inspectedDevice ? streams[inspectedDevice.id] : undefined}
        onClose={() => setInspectedDevice(null)}
        onStartStream={(id, tier) => startStream(id, tier)}
        onStopStream={stopStream}
      />
    </div>
  );
};
