import React, { useState } from 'react';
import { Globe, Lock, ShieldCheck, Plus, CheckCircle2 } from 'lucide-react';

export const InternetPage: React.FC = () => {
  const [feedback, setFeedback] = useState<string | null>(null);

  const webRules = [
    { domain: '*.wikipedia.org', policy: 'Permitido', note: 'Enciclopedia de consulta' },
    { domain: 'github.com', policy: 'Permitido', note: 'Repositorios de código del curso' },
    { domain: '*.youtube.com', policy: 'Restringido', note: 'Bloqueado salvo enlaces docentes' },
    { domain: '*.tiktok.com', policy: 'Bloqueado', note: 'Red social no autorizada' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-sky-600" />
            Control de Navegación e Internet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Filtrado local de dominios web y políticas pedagógicas de navegación.
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback('Dominio añadido a la política activa del aula');
            setTimeout(() => setFeedback(null), 3000);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Añadir Dominio
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
              <th className="px-4 py-3">Dominio Web / Máscara</th>
              <th className="px-4 py-3">Política</th>
              <th className="px-4 py-3">Observación Pedagógica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {webRules.map((rule) => (
              <tr key={rule.domain} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">{rule.domain}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                      rule.policy === 'Permitido'
                        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {rule.policy}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{rule.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
