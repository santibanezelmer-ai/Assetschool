import React, { useState } from 'react';
import { Eye, LayoutGrid, Maximize2, AlertTriangle, Monitor, Sparkles } from 'lucide-react';
import { DevicePlatform } from '@assetschool/shared-types';

export const ClassroomMonitorPage: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const mockScreens = [
    { id: '1', hostname: 'LAB01-PC-01', student: 'Lucas Pérez', os: DevicePlatform.WINDOWS, app: 'Visual Studio Code - main.py' },
    { id: '2', hostname: 'LAB01-MAC-02', student: 'Sofía Navarro', os: DevicePlatform.MACOS, app: 'Xcode - AssetApp.swift' },
    { id: '3', hostname: 'LAB01-LNX-03', student: 'Mateo Rojas', os: DevicePlatform.LINUX, app: 'Terminal - htop' },
    { id: '4', hostname: 'LAB01-CRB-04', student: 'Valentina Castillo', os: DevicePlatform.CHROMEOS, app: 'Google Classroom (Desconectado)' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-sky-600" />
            Monitor de Aula en Tiempo Real
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supervisión simultánea de pantallas de los estudiantes vía WebRTC LAN de baja latencia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Transmisión de Pantalla Nativa programada para Fase 02
          </span>
        </div>
      </div>

      {/* Grid of screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockScreens.map((screen) => (
          <div
            key={screen.id}
            onClick={() => setSelectedDevice(screen.hostname)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-sky-500 transition-all cursor-pointer"
          >
            {/* Header bar */}
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-sky-500" />
                {screen.hostname} — {screen.student}
              </span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {screen.os}
              </span>
            </div>

            {/* Simulated Desktop Preview Canvas */}
            <div className="h-48 bg-slate-950 text-slate-300 flex flex-col items-center justify-center p-6 text-center relative">
              <div className="p-3 rounded-full bg-slate-800/80 mb-2">
                <LayoutGrid className="w-6 h-6 text-sky-400" />
              </div>
              <p className="text-xs font-semibold text-white">{screen.app}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Señal de demostración de arquitectura. El streaming WebRTC P2P se enlaza con el agente nativo.
              </p>
              <div className="absolute top-2 right-2">
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">
                  MODO PRUEBA
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
