import React from 'react';
import { Settings, Shield, Key, Network, Server, Lock } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-sky-600" />
          Configuración del Servidor y Red Local
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Parámetros de despliegue institucional, certificados TLS de red local y claves criptográficas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
            <Network className="w-4 h-4 text-sky-500" />
            Configuración LAN de Descubrimiento
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 font-medium">Puerto de Anuncio UDP (Zero-Config):</label>
              <input
                type="text"
                readOnly
                value="48500"
                className="mt-1 w-full p-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium">Puerto de Enlace WebSocket de Agentes:</label>
              <input
                type="text"
                readOnly
                value="48501"
                className="mt-1 w-full p-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium">Intervalo de Latido (Heartbeat):</label>
              <input
                type="text"
                readOnly
                value="15000 ms (15 segundos)"
                className="mt-1 w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-500" />
            Certificados TLS y Seguridad Criptográfica
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">Certificado Raíz Local Activo</span>
              <p className="text-emerald-700 dark:text-emerald-400 mt-1 text-[11px]">
                Emitido por: AssetSchool Local Root CA (Válido para subred 192.168.1.0/24)
              </p>
            </div>
            <div>
              <label className="text-slate-400 font-medium">Algoritmo de Identidad de Agente:</label>
              <input
                type="text"
                readOnly
                value="Ed25519 (Asymmetric Keypair)"
                className="mt-1 w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium">Políticas de Privacidad:</label>
              <input
                type="text"
                readOnly
                value="Supervisión Visible Consentida (Sin Modo Encubierto)"
                className="mt-1 w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
