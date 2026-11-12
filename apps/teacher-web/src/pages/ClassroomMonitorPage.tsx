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
  Lock,
  Unlock,
  MessageSquare,
  X,
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
    lockDevice,
    unlockDevice,
    lockAll,
    unlockAll,
    refreshDevices,
  } = useWebRtcMonitor();

  const [inspectedDevice, setInspectedDevice] = useState<MonitorDevice | null>(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [lockMessage, setLockMessage] = useState('Atención al frente. La clase está en pausa pedagógica.');
  const [targetDeviceForLock, setTargetDeviceForLock] = useState<string | null>(null); // null = all, or deviceId

  const activeStreamsCount = Object.values(streams).filter((s) => s.status === 'streaming').length;
  const onlineDevicesCount = devices.filter((d) => d.status === 'online' && !d.isRevoked).length;
  const lockedDevicesCount = devices.filter((d) => d.status === 'locked').length;

  const handleOpenLockModal = (deviceId?: string) => {
    setTargetDeviceForLock(deviceId || null);
    setIsLockModalOpen(true);
  };

  const handleConfirmLock = () => {
    if (targetDeviceForLock) {
      lockDevice(targetDeviceForLock, lockMessage);
    } else {
      lockAll(lockMessage);
    }
    setIsLockModalOpen(false);
    setTargetDeviceForLock(null);
  };

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
            Supervisión simultánea de pantallas, Pausa Pedagógica (Bloqueo) y WebRTC LAN (Zero-Cloud).
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={refreshDevices}
            title="Refrescar lista de dispositivos de la sala"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Bloquear Pantallas (NetSupport Blank All / Lock) */}
          <button
            onClick={() => handleOpenLockModal()}
            disabled={onlineDevicesCount === 0}
            className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            title="Bloquear todas las pantallas y periféricos con mensaje pedagógico"
          >
            <Lock className="w-3.5 h-3.5" />
            Bloquear Aula ({onlineDevicesCount})
          </button>

          {/* Desbloquear Pantallas */}
          {lockedDevicesCount > 0 && (
            <button
              onClick={() => unlockAll()}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all animate-pulse"
              title="Desbloquear todas las pantallas bloqueadas"
            >
              <Unlock className="w-3.5 h-3.5" />
              Desbloquear Aula ({lockedDevicesCount})
            </button>
          )}

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

          <button
            onClick={startAllStreams}
            disabled={onlineDevicesCount === 0}
            className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Supervisar Aula ({onlineDevicesCount})
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                Transmisiones WebRTC
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {activeStreamsCount} de {devices.length} activas
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
            {activeStreamsCount > 0 ? 'P2P LAN' : 'En Espera'}
          </span>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${lockedDevicesCount > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Pausa Pedagógica
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {lockedDevicesCount > 0 ? `${lockedDevicesCount} bloqueados` : 'Aula libre'}
              </span>
            </div>
          </div>
          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${lockedDevicesCount > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
            {lockedDevicesCount > 0 ? 'Bloqueo' : 'Libre'}
          </span>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Cumplimiento Ético
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                PostgreSQL Auditado
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
            onLockDevice={(id) => handleOpenLockModal(id)}
            onUnlockDevice={(id) => unlockDevice(id)}
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

      {/* Modal for Pedagogical Lock Screen Configuration */}
      {isLockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-500/10">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {targetDeviceForLock ? 'Bloquear Pantalla de Estudiante' : 'Pausa Pedagógica — Bloquear Aula'}
                </h3>
              </div>
              <button
                onClick={() => setIsLockModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Al activar el bloqueo, las pantallas de los estudiantes mostrarán un telón pedagógico que cubre todo el escritorio y suprime el uso de ratón y teclado para captar la atención hacia la pizarra o explicación.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                  Mensaje del Docente en Pantalla:
                </label>
                <textarea
                  value={lockMessage}
                  onChange={(e) => setLockMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  placeholder="Escriba el mensaje para los estudiantes..."
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 block">Mensajes rápidos sugeridos:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Atención al frente. Miren a la pizarra.',
                    'Pausa para explicación del docente.',
                    'Evaluación en curso. Suelten teclados y ratones.',
                    'Fin de la actividad. Esperen instrucciones.',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLockMessage(preset)}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsLockModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLock}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-md transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                {targetDeviceForLock ? 'Bloquear Estudiante' : 'Activar Bloqueo de Aula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Modal View for Individual Inspection */}
      <DeviceInspectionModal
        device={inspectedDevice}
        streamState={inspectedDevice ? streams[inspectedDevice.id] : undefined}
        onClose={() => setInspectedDevice(null)}
        onStartStream={(id, tier) => startStream(id, tier)}
        onStopStream={stopStream}
        onLockDevice={(id) => handleOpenLockModal(id)}
        onUnlockDevice={(id) => unlockDevice(id)}
      />
    </div>
  );
};
