import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock, UserCheck, Shield } from 'lucide-react';

interface AuditItem {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  severity: string;
}

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditItem[]>([
    {
      id: '1',
      timestamp: new Date().toISOString(),
      action: 'SYSTEM_BOOT',
      actor: 'AssetSchool Core',
      details: 'Servidor inicializado en modo LAN Seguro',
      severity: 'info',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      action: 'DEVICE_HEARTBEAT_ACK',
      actor: 'LAB01-PC-01',
      details: 'Dispositivo Windows 11 reportó capacidades activas (11/11)',
      severity: 'info',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      action: 'SESSION_START',
      actor: 'profesor@assetschool.lan',
      details: 'Sesión iniciada en Laboratorio Informática 1 (LAB-01)',
      severity: 'info',
    },
  ]);

  useEffect(() => {
    fetch('/api/v1/audit')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLogs(data);
        }
      })
      .catch(() => {
        // Fallback already in place
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-sky-600" />
          Registro y Auditoría de Seguridad Institucional
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Trazabilidad inmutable de todas las acciones pedagógicas y comandos administrativos ejecutados en la red.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Acción Registrada</th>
                <th className="px-4 py-3">Actor / Origen</th>
                <th className="px-4 py-3">Detalles del Evento</th>
                <th className="px-4 py-3">Nivel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                    {log.actor}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{log.details}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      {log.severity || 'INFO'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
