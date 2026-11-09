import React from 'react';
import { Cpu, HardDrive, MemoryStick as Memory, Monitor } from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const hardwareItems = [
    { host: 'LAB01-PC-01', cpu: 'Intel Core i5-12400 (6C/12T)', ram: '16 GB DDR4', storage: '512 GB NVMe SSD', gpu: 'Intel UHD Graphics 730', os: 'Windows 11 Pro' },
    { host: 'LAB01-MAC-02', cpu: 'Apple M2 (8C CPU / 10C GPU)', ram: '16 GB Unified', storage: '256 GB Apple SSD', gpu: 'Apple M2 10-Core', os: 'macOS Sonoma' },
    { host: 'LAB01-LNX-03', cpu: 'AMD Ryzen 5 5600G (6C/12T)', ram: '16 GB DDR4', storage: '500 GB Kingston SSD', gpu: 'Radeon Vega 7', os: 'Ubuntu 24.04 LTS' },
    { host: 'LAB01-CRB-04', cpu: 'Intel Celeron N4500 (2C/2T)', ram: '4 GB LPDDR4x', storage: '64 GB eMMC', gpu: 'Intel UHD Graphics', os: 'ChromeOS 124' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Cpu className="w-6 h-6 text-sky-600" />
          Inventario TIC de Hardware y Software
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Especificaciones físicas recolectadas de forma autorizada por los agentes nativos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hardwareItems.map((item) => (
          <div key={item.host} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-sky-500" />
                {item.host}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {item.os}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">CPU:</span>
                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.cpu}</p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">Memoria RAM:</span>
                <p className="font-medium text-slate-700 dark:text-slate-200">{item.ram}</p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">Almacenamiento:</span>
                <p className="font-medium text-slate-700 dark:text-slate-200">{item.storage}</p>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                <span className="text-slate-400">Gráficos:</span>
                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.gpu}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
