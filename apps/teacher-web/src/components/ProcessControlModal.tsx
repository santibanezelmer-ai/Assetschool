import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  XCircle,
  RefreshCw,
  Globe,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Monitor,
} from 'lucide-react';
import { MonitorDevice } from '../hooks/useWebRtcMonitor';

interface ProcessControlModalProps {
  devices: MonitorDevice[];
  selectedDeviceId?: string;
  remoteProcesses: Record<string, any[]>;
  onClose: () => void;
  onRequestProcesses: (deviceId: string) => void;
  onKillProcess: (deviceId: string, pid?: number, processName?: string, bundleId?: string) => void;
}

export const ProcessControlModal: React.FC<ProcessControlModalProps> = ({
  devices,
  selectedDeviceId,
  remoteProcesses,
  onClose,
  onRequestProcesses,
  onKillProcess,
}) => {
  const onlineDevices = devices.filter((d) => d.status === 'online' || d.status === 'locked');
  const [currentDeviceId, setCurrentDeviceId] = useState<string>(
    selectedDeviceId || (onlineDevices[0]?.id ?? '')
  );

  const [filterSearch, setFilterSearch] = useState('');
  const [webFilterActive, setWebFilterActive] = useState(false);

  const processList = remoteProcesses[currentDeviceId] || [];

  useEffect(() => {
    if (currentDeviceId) {
      onRequestProcesses(currentDeviceId);
    }
  }, [currentDeviceId, onRequestProcesses]);

  const filteredProcesses = processList.filter((p: any) =>
    p.name.toLowerCase().includes(filterSearch.toLowerCase()) ||
    (p.bundleId && p.bundleId.toLowerCase().includes(filterSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Control de Aplicaciones y Restricción de Uso
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Supervisión de procesos en ejecución, cierre forzado y restricción web pedagógica.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Equipo:</span>
              <select
                value={currentDeviceId}
                onChange={(e) => setCurrentDeviceId(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {onlineDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} ({d.studentName})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Search */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar aplicación o proceso..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-64 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              onClick={() => onRequestProcesses(currentDeviceId)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Refrescar lista de procesos"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Restriction Preset (NetSupport Web Access) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWebFilterActive(!webFilterActive)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                webFilterActive
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {webFilterActive ? 'Bloqueo Web ACTIVO (Solo Intranet)' : 'Restringir Acceso Web'}
            </button>
          </div>
        </div>

        {/* Running Applications List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Aplicación / Proceso</th>
                  <th className="py-2.5 px-4">PID</th>
                  <th className="py-2.5 px-4">Identificador de Paquete</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4 text-right">Acción Docente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {filteredProcesses.map((proc: any) => (
                  <tr key={proc.pid} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      {proc.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{proc.pid}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px] truncate max-w-[200px]">
                      {proc.bundleId || 'N/A'}
                    </td>
                    <td className="py-2.5 px-4">
                      {proc.isFrontmost ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          En Primer Plano
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Segundo Plano</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => onKillProcess(currentDeviceId, proc.pid, proc.name, proc.bundleId)}
                        className="px-2.5 py-1 rounded bg-red-600/90 hover:bg-red-600 text-white font-semibold text-[11px] inline-flex items-center gap-1 shadow-sm transition-all"
                        title="Finalizar tarea inmediatamente en el computador del alumno"
                      >
                        <XCircle className="w-3 h-3" />
                        Finalizar Tarea
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredProcesses.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                No se encontraron aplicaciones activas o esperando respuesta del agente.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
