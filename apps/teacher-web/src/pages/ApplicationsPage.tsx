import React, { useState } from 'react';
import { Layers, ShieldCheck, Ban, Plus, CheckCircle2 } from 'lucide-react';

export const ApplicationsPage: React.FC = () => {
  const [feedback, setFeedback] = useState<string | null>(null);

  const apps = [
    { name: 'Visual Studio Code', binary: 'code.exe / code', status: 'Permitida', category: 'Desarrollo' },
    { name: 'Cisco Packet Tracer', binary: 'PacketTracer.exe', status: 'Permitida', category: 'Simulación' },
    { name: 'Discord', binary: 'Discord.exe / discord', status: 'Bloqueada', category: 'Comunicación no autorizada' },
    { name: 'Steam / Juegos', binary: 'steam.exe', status: 'Bloqueada', category: 'Entretenimiento' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-sky-600" />
            Control de Aplicaciones y Procesos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Listas blancas pedagógicas y restricción de ejecutables en tiempo real.
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback('Regla de aplicación guardada en política de aula');
            setTimeout(() => setFeedback(null), 3000);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Añadir Regla de Proceso
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
          {feedback}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold">
            <tr>
              <th className="px-4 py-3">Aplicación</th>
              <th className="px-4 py-3">Nombre Binario / Proceso</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Directiva de Aula</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {apps.map((app) => (
              <tr key={app.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{app.name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{app.binary}</td>
                <td className="px-4 py-3">{app.category}</td>
                <td className="px-4 py-3">
                  {app.status === 'Permitida' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3.5 h-3.5" /> Permitida
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded">
                      <Ban className="w-3.5 h-3.5" /> Bloqueada
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
