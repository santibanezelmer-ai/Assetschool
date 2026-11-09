import React from 'react';
import { School, Network, MonitorCheck } from 'lucide-react';

export const ClassroomsPage: React.FC = () => {
  const classrooms = [
    { code: 'LAB-01', name: 'Laboratorio Informática 1', capacity: 32, subnet: '192.168.1.0/24', broadcast: '192.168.1.255', isOnline: true },
    { code: 'LAB-02', name: 'Laboratorio Informática 2', capacity: 28, subnet: '192.168.2.0/24', broadcast: '192.168.2.255', isOnline: false },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <School className="w-6 h-6 text-sky-600" />
          Salas y Laboratorios TIC
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Infraestructura física y segmentación de subredes LAN por aula.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {classrooms.map((room) => (
          <div key={room.code} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                {room.code}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${room.isOnline ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {room.isOnline ? 'Aula en Sesión' : 'Disponible'}
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{room.name}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">Capacidad:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{room.capacity} puestos</p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">Subred LAN:</span>
                <p className="font-mono text-slate-800 dark:text-slate-200">{room.subnet}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
