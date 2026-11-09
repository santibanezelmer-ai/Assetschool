import React from 'react';
import { BarChart3, Clock, CheckCircle2, Award } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-sky-600" />
          Informes de Asistencia y Rendimiento
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Métricas consolidadas de asistencia a clases de cómputo y uso de laboratorio.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-xs font-medium text-slate-400">Asistencia Media en Aula</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">96.8%</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Asistencia completa en LAB-01</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-xs font-medium text-slate-400">Horas de Laboratorio Realizadas</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">124 hrs</p>
          <p className="text-xs text-slate-500 font-medium">Periodo 2026-S1</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
          <span className="text-xs font-medium text-slate-400">Promedio Evaluaciones</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">6.2 / 7.0</p>
          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">2 evaluaciones completadas</p>
        </div>
      </div>
    </div>
  );
};
