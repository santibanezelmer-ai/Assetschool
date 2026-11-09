import React, { useState } from 'react';
import { Sliders, Lock, Unlock, Moon, Tv, VolumeX, MessageSquare, Power, AlertCircle, CheckCircle2 } from 'lucide-react';

export const ClassroomControlPage: React.FC = () => {
  const [activeAlert, setActiveAlert] = useState<string | null>(null);

  const triggerAction = (label: string) => {
    setActiveAlert(`Comando emitido al protocolo de red: ${label}`);
    setTimeout(() => setActiveAlert(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Sliders className="w-6 h-6 text-sky-600" />
          Control y Gestión Remota de Aula
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Distribución de directivas y comandos de control sobre las estaciones de trabajo de los alumnos.
        </p>
      </div>

      {activeAlert && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{activeAlert}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Visual & Attention */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
            Control de Atención
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => triggerAction('Bloqueo de pantalla y teclado')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Bloquear Estaciones</span>
              <span className="text-[10px] font-mono bg-red-200 dark:bg-red-900 px-1.5 py-0.5 rounded">LOCK</span>
            </button>
            <button
              onClick={() => triggerAction('Desbloqueo general de pantalla')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><Unlock className="w-4 h-4" /> Desbloquear Estaciones</span>
              <span className="text-[10px] font-mono bg-emerald-200 dark:bg-emerald-900 px-1.5 py-0.5 rounded">UNLOCK</span>
            </button>
            <button
              onClick={() => triggerAction('Cortina de atención (Blackout)')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><Moon className="w-4 h-4" /> Pantalla en Negro</span>
              <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">BLANK</span>
            </button>
          </div>
        </div>

        {/* Media & Audio */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
            Difusión y Audio
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => triggerAction('Transmisión de pantalla de profesor')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <Tv className="w-4 h-4" /> Transmitir a Todos
              </span>
              <span className="text-[10px] font-mono bg-sky-200 dark:bg-sky-900 px-1.5 py-0.5 rounded">
                FASE 02 PENDIENTE
              </span>
            </button>
            <button
              onClick={() => triggerAction('Silenciado global de sonido')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><VolumeX className="w-4 h-4" /> Silenciar Parlantes</span>
              <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">MUTE</span>
            </button>
            <button
              onClick={() => triggerAction('Envío de mensaje institucional a pantallas')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Enviar Mensaje</span>
              <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">MSG</span>
            </button>
          </div>
        </div>

        {/* Power Management */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
            Energía y Mantenimiento
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => triggerAction('Orden de reinicio de estaciones de trabajo')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><Power className="w-4 h-4" /> Reiniciar Equipos</span>
              <span className="text-[10px] font-mono bg-amber-200 dark:bg-amber-900 px-1.5 py-0.5 rounded">REBOOT</span>
            </button>
            <button
              onClick={() => triggerAction('Orden de apagado general de laboratorio')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold transition-colors"
            >
              <span className="flex items-center gap-2"><Power className="w-4 h-4" /> Apagar Aula</span>
              <span className="text-[10px] font-mono bg-red-200 dark:bg-red-900 px-1.5 py-0.5 rounded">SHUTDOWN</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
