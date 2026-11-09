import React, { useState } from 'react';
import { Monitor, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { DevicePlatform, DeviceStatus } from '@assetschool/shared-types';

export const DevicesPage: React.FC = () => {
  const [revokedDevices, setRevokedDevices] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const devices = [
    { id: '01', name: 'LAB01-PC-01', ip: '192.168.1.101', mac: '02:42:AC:11:00:02', os: DevicePlatform.WINDOWS, ver: 'Windows 11 Pro 23H2', status: DeviceStatus.ONLINE, isDemo: true },
    { id: '02', name: 'LAB01-MAC-02', ip: '192.168.1.102', mac: '02:42:AC:11:00:03', os: DevicePlatform.MACOS, ver: 'macOS Sonoma 14.5', status: DeviceStatus.ONLINE, isDemo: true },
    { id: '03', name: 'LAB01-LNX-03', ip: '192.168.1.103', mac: '02:42:AC:11:00:04', os: DevicePlatform.LINUX, ver: 'Ubuntu 24.04 LTS', status: DeviceStatus.BUSY, isDemo: true },
    { id: '04', name: 'LAB01-CRB-04', ip: '192.168.1.104', mac: '02:42:AC:11:00:05', os: DevicePlatform.CHROMEOS, ver: 'ChromeOS 124.0', status: DeviceStatus.OFFLINE, isDemo: true },
  ];

  const handleRevoke = (id: string, name: string) => {
    if (revokedDevices.includes(id)) {
      setRevokedDevices((prev) => prev.filter((d) => d !== id));
      setFeedback(`Dispositivo ${name} re-autorizado.`);
    } else {
      setRevokedDevices((prev) => [...prev, id]);
      setFeedback(`Dispositivo ${name} revocado por seguridad.`);
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-sky-600" />
            Inventario de Computadores y Agentes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro criptográfico, identidades locales y revocación de dispositivos autorizados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Todos los equipos listados abajo son datos de prueba (DEMO)
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-xs font-medium text-sky-800 dark:text-sky-200">
          {feedback}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold">
            <tr>
              <th className="px-4 py-3">Nombre Host</th>
              <th className="px-4 py-3">S.O. / Versión</th>
              <th className="px-4 py-3">IP LAN</th>
              <th className="px-4 py-3">MAC Address</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción de Seguridad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {devices.map((dev) => {
              const isRevoked = revokedDevices.includes(dev.id);
              return (
                <tr key={dev.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-sky-500" />
                    {dev.name}
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 px-1 py-0.2 rounded">
                      DEMO
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{dev.ver}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{dev.ip}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{dev.mac}</td>
                  <td className="px-4 py-3">
                    {isRevoked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded">
                        <XCircle className="w-3 h-3" /> Revocado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Autorizado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(dev.id, dev.name)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                        isRevoked
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          : 'bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      }`}
                    >
                      {isRevoked ? 'Re-habilitar' : 'Revocar Acceso'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
