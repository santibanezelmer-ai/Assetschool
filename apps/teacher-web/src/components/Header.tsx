import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun, Activity, LogOut, Shield, Wifi } from 'lucide-react';

interface HeaderProps {
  serverStatus?: {
    status: 'online' | 'degraded' | 'offline';
    localIp?: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ serverStatus }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isOnline = serverStatus?.status === 'online';

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between sticky top-0 z-20 transition-colors">
      <div className="flex items-center gap-4">
        {/* LAN Status Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-slate-500" />
            LAN Server: {serverStatus?.localIp || '127.0.0.1:3000'}
          </span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            {isOnline ? 'Conectado' : 'Sin Conexión'}
          </span>
        </div>

        {/* Institution Badge */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Colegio Politécnico Central</span>
          <span>•</span>
          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            CPC-01
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Cambiar tema"
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Role & Profile */}
        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <Shield className="w-3 h-3 text-sky-500" />
                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 tracking-wider">
                  {user.role}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
