import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Eye,
  Sliders,
  Users,
  BookOpen,
  School,
  Monitor,
  FileCheck,
  Layers,
  Globe,
  Cpu,
  BarChart3,
  ShieldCheck,
  Settings,
  ShieldAlert,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/monitor', label: 'Monitor de aula', icon: Eye },
  { to: '/control', label: 'Control de aula', icon: Sliders },
  { to: '/students', label: 'Estudiantes', icon: Users },
  { to: '/courses', label: 'Cursos', icon: BookOpen },
  { to: '/classrooms', label: 'Salas', icon: School },
  { to: '/devices', label: 'Computadores', icon: Monitor },
  { to: '/assessments', label: 'Evaluaciones', icon: FileCheck },
  { to: '/applications', label: 'Aplicaciones', icon: Layers },
  { to: '/internet', label: 'Internet', icon: Globe },
  { to: '/inventory', label: 'Inventario TIC', icon: Cpu },
  { to: '/reports', label: 'Informes', icon: BarChart3 },
  { to: '/audit', label: 'Auditoría', icon: ShieldCheck },
  { to: '/settings', label: 'Configuración', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 z-30 transition-colors">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
          A
        </div>
        <div>
          <h1 className="font-bold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            AssetSchool
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
              LAN
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Gestión y Control de Aula
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
          Módulos del Sistema
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 font-semibold border-l-4 border-sky-600'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Privacy Notice Banner */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-tight text-amber-800 dark:text-amber-300">
            <strong>Supervisión Ética:</strong> Toda acción pedagógica es visible y registrada en auditoría. Sin espionaje encubierto.
          </p>
        </div>
      </div>
    </aside>
  );
};
