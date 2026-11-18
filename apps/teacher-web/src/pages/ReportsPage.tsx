import React, { useState, useEffect } from 'react';
import { BarChart3, School, Monitor, Users, PieChart, Layers, Download, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

export const ReportsPage: React.FC = () => {
  const [summary, setSummary] = useState<any | null>(null);
  const [occupancy, setOccupancy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      try {
        setLoading(true);
        const [sum, occ] = await Promise.all([
          apiFetch('/api/v1/reports/summary'),
          apiFetch('/api/v1/reports/classrooms-occupancy'),
        ]);
        setSummary(sum);
        setOccupancy(occ);
      } catch (err) {
        console.error('Error cargando reportes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-sky-600" />
          Informes y Telemetría Administrativa
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Métricas ejecutivas de ocupación de aulas, distribución de hardware e inventario de software escolar.
        </p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="py-8 text-center text-slate-400 text-sm">Cargando métricas consolidadas...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-medium text-slate-400">Aulas Informáticas</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary?.totalClassrooms ?? 0}</p>
              <p className="text-xs text-sky-600 font-medium">Laboratorios activos</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-medium text-slate-400">Cursos Registrados</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary?.totalCourses ?? 0}</p>
              <p className="text-xs text-slate-500 font-medium">Periodo 2026-S1</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-medium text-slate-400">Equipos en Inventario</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Number(Object.values(summary?.devicesByOs || {}).reduce((a: any, b: any) => a + b, 0))}
              </p>
              <p className="text-xs text-emerald-600 font-medium">Estaciones supervisadas</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-medium text-slate-400">Docentes y Administradores</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Number(Object.values(summary?.usersByRole || {}).reduce((a: any, b: any) => a + b, 0))}
              </p>
              <p className="text-xs text-slate-500 font-medium">Cuentas activas en servidor</p>
            </div>
          </div>

          {/* OS Distribution Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-sky-600" />
              Distribución de Sistemas Operativos en el Parque Computacional
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {Object.entries(summary?.devicesByOs || {}).map(([os, count]) => (
                <div key={os} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-xs uppercase font-bold text-slate-500">{os}</span>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{count as number}</p>
                  <p className="text-[11px] text-slate-400">equipos nativos</p>
                </div>
              ))}
            </div>
          </div>

          {/* Classrooms Occupancy Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <School className="w-4 h-4 text-sky-600" />
                Informe de Ocupación y Capacidad de Aulas
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Aula / Laboratorio</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3">Capacidad Puestos</th>
                    <th className="px-4 py-3">Equipos Asignados</th>
                    <th className="px-4 py-3">Equipos En Línea</th>
                    <th className="px-4 py-3">% Ocupación</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {occupancy.map((occ) => (
                    <tr key={occ.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{occ.name}</div>
                        <div className="text-xs font-mono text-slate-400">{occ.code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {occ.physical_location || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {occ.capacity} puestos
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">
                        {occ.assigned_devices_count}
                      </td>
                      <td className="px-4 py-3 text-xs text-emerald-600 font-semibold">
                        {occ.online_devices_count}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-sky-600 h-full rounded-full"
                              style={{ width: `${Math.min(occ.occupancy_percentage || 0, 100)}%` }}
                            />
                          </div>
                          <span className="font-semibold">{occ.occupancy_percentage || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {occ.operational_status || 'operativa'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
