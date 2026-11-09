import React, { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  Monitor,
  Wifi,
  WifiOff,
  School,
  Activity,
  Lock,
  Unlock,
  VolumeX,
  Volume2,
  Tv,
  AlertTriangle,
  Server,
  Network,
  Clock,
  Sparkles,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { DashboardStats, DevicePlatform, DeviceStatus } from '@assetschool/shared-types';

interface ContextType {
  stats: DashboardStats | null;
}

interface DemoDevice {
  id: string;
  hostname: string;
  mac: string;
  ip: string;
  os: DevicePlatform;
  osVersion: string;
  status: DeviceStatus;
  studentName: string;
  isDemo: boolean;
}

const INITIAL_DEMO_DEVICES: DemoDevice[] = [
  {
    id: '01010101-0101-0101-0101-010101010101',
    hostname: 'LAB01-PC-01',
    mac: '02:42:AC:11:00:02',
    ip: '192.168.1.101',
    os: DevicePlatform.WINDOWS,
    osVersion: 'Windows 11 Pro',
    status: DeviceStatus.ONLINE,
    studentName: 'Lucas Pérez',
    isDemo: true,
  },
  {
    id: '02020202-0202-0202-0202-020202020202',
    hostname: 'LAB01-MAC-02',
    mac: '02:42:AC:11:00:03',
    ip: '192.168.1.102',
    os: DevicePlatform.MACOS,
    osVersion: 'macOS Sonoma',
    status: DeviceStatus.ONLINE,
    studentName: 'Sofía Navarro',
    isDemo: true,
  },
  {
    id: '03030303-0303-0303-0303-030303030303',
    hostname: 'LAB01-LNX-03',
    mac: '02:42:AC:11:00:04',
    ip: '192.168.1.103',
    os: DevicePlatform.LINUX,
    osVersion: 'Ubuntu 24.04',
    status: DeviceStatus.BUSY,
    studentName: 'Mateo Rojas',
    isDemo: true,
  },
  {
    id: '04040404-0404-0404-0404-040404040404',
    hostname: 'LAB01-CRB-04',
    mac: '02:42:AC:11:00:05',
    ip: '192.168.1.104',
    os: DevicePlatform.CHROMEOS,
    osVersion: 'ChromeOS 124',
    status: DeviceStatus.OFFLINE,
    studentName: 'Valentina Castillo',
    isDemo: true,
  },
];

export const DashboardPage: React.FC = () => {
  const { stats } = useOutletContext<ContextType>();
  const [devices, setDevices] = useState<DemoDevice[]>(INITIAL_DEMO_DEVICES);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleQuickCommand = async (type: string) => {
    let message = '';
    if (type === 'LOCK') {
      setDevices((prev) =>
        prev.map((d) => (d.status === DeviceStatus.ONLINE ? { ...d, status: DeviceStatus.LOCKED } : d)),
      );
      message = 'Comando: Pantallas bloqueadas en estaciones de prueba';
    } else if (type === 'UNLOCK') {
      setDevices((prev) =>
        prev.map((d) => (d.status === DeviceStatus.LOCKED ? { ...d, status: DeviceStatus.ONLINE } : d)),
      );
      message = 'Comando: Pantallas desbloqueadas';
    } else if (type === 'MUTE') {
      message = 'Comando: Audio silenciado en todos los equipos del aula';
    } else if (type === 'BROADCAST') {
      message = 'Transmisión de pantalla docente iniciada (WebRTC LAN)';
    }

    setActionFeedback(message);
    setTimeout(() => setActionFeedback(null), 3500);

    // Call backend API if running
    try {
      await fetch('/api/v1/commands/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: devices.map((d) => d.id),
          commandType: type === 'LOCK' ? 'LOCK_SCREEN' : type === 'UNLOCK' ? 'UNLOCK_SCREEN' : 'MUTE_AUDIO',
        }),
      });
    } catch {
      // Ignored if offline
    }
  };

  const getOsBadge = (os: DevicePlatform) => {
    switch (os) {
      case DevicePlatform.WINDOWS:
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200';
      case DevicePlatform.MACOS:
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200';
      case DevicePlatform.LINUX:
        return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200';
      case DevicePlatform.CHROMEOS:
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200';
    }
  };

  const getStatusBadge = (status: DeviceStatus) => {
    switch (status) {
      case DeviceStatus.ONLINE:
        return { label: 'En Línea', bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' };
      case DeviceStatus.BUSY:
        return { label: 'Ocupado', bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' };
      case DeviceStatus.LOCKED:
        return { label: 'Bloqueado', bg: 'bg-red-500', text: 'text-red-700 dark:text-red-400' };
      case DeviceStatus.OFFLINE:
        return { label: 'Desconectado', bg: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400' };
      default:
        return { label: status, bg: 'bg-slate-400', text: 'text-slate-500' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Classroom Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dashboard de Control de Aula
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Laboratorio de Informática 1 (LAB-01) — Subred 192.168.1.0/24
          </p>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleQuickCommand('LOCK')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            Bloquear Aula
          </button>
          <button
            onClick={() => handleQuickCommand('UNLOCK')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            <Unlock className="w-3.5 h-3.5" />
            Desbloquear
          </button>
          <button
            onClick={() => handleQuickCommand('MUTE')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-800 text-white shadow-sm transition-colors"
          >
            <VolumeX className="w-3.5 h-3.5" />
            Silenciar Audio
          </button>
          <button
            onClick={() => handleQuickCommand('BROADCAST')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600/90 hover:bg-sky-700 text-white shadow-sm transition-colors"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Transmitir Pantalla</span>
            <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.2 rounded">FASE 02</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionFeedback && (
        <div className="p-3.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-sm flex items-center gap-2.5 animate-fadeIn">
          <Sparkles className="w-4 h-4 shrink-0 text-sky-500" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Devices */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Computadores</span>
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.totalRegisteredDevices ?? 4}
            </span>
            <span className="text-xs text-slate-400">enrolados</span>
          </div>
        </div>

        {/* Connected Devices */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Computadores Conectados</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Wifi className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats?.connectedDevices ?? 2}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400">en línea ahora</span>
          </div>
        </div>

        {/* Disconnected Devices */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Computadores Desconectados</span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
              <WifiOff className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-700 dark:text-slate-300">
              {stats?.disconnectedDevices ?? 1}
            </span>
            <span className="text-xs text-slate-400">inactivos</span>
          </div>
        </div>

        {/* Classrooms & Sessions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Salas / Sesión Activa</span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <School className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.availableClassrooms ?? 2}
            </span>
            <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
              1 sesión activa
            </span>
          </div>
        </div>
      </div>

      {/* Network LAN and Server Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LAN Infrastructure Health */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Network className="w-4 h-4 text-sky-500" />
              Estado de la Red LAN
            </h3>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              Zero-Cloud (100% Local)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">IP Servidor Local:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {stats?.lanStatus.localIp || '192.168.1.100'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Máscara / Broadcast:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {stats?.lanStatus.broadcastIp || '192.168.1.255'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Descubrimiento UDP:</span>
              <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Puerto 48500 (Activo)
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Canal WebSocket Agentes:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                Puerto 48501 (WSS)
              </p>
            </div>
          </div>
        </div>

        {/* Server Daemon Health */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-purple-500" />
              Estado del Servidor AssetSchool
            </h3>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              Operativo
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Versión Core:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {stats?.serverStatus.version || '1.0.0-phase1'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Tiempo de Actividad:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {stats?.serverStatus.uptimeSeconds ? `${stats.serverStatus.uptimeSeconds}s` : '120s'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Consumo de Memoria:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {stats?.serverStatus.memoryUsageMb || 85} MB
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400">Runtime:</span>
              <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                Node.js {stats?.serverStatus.nodeVersion || 'v24.22.0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Devices - Explicitly Flagged as Demo Test Data */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-sky-600" />
              Estaciones del Aula (Demostración de Compatibilidad Multiplataforma)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cuadrícula de prueba que simula los 4 sistemas operativos objetivo (Windows, macOS, Linux, ChromeOS).
            </p>
          </div>

          {/* Prominent Demo Notice */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>DATOS DE DEMOSTRACIÓN / TEST DATA</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {devices.map((device) => {
            const statusInfo = getStatusBadge(device.status);
            return (
              <div
                key={device.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-sky-400 dark:hover:border-sky-600 transition-all"
              >
                <div>
                  {/* Top tags */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${getOsBadge(
                        device.os,
                      )}`}
                    >
                      {device.os}
                    </span>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                      DEMO
                    </span>
                  </div>

                  {/* Device Screen Preview Simulation */}
                  <div className="w-full h-28 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 flex flex-col items-center justify-center p-3 text-center relative overflow-hidden group">
                    {device.status === DeviceStatus.LOCKED ? (
                      <div className="flex flex-col items-center text-red-500">
                        <Lock className="w-7 h-7 mb-1" />
                        <span className="text-[11px] font-semibold">Pantalla Bloqueada</span>
                      </div>
                    ) : device.status === DeviceStatus.OFFLINE ? (
                      <div className="flex flex-col items-center text-slate-400">
                        <WifiOff className="w-7 h-7 mb-1" />
                        <span className="text-[11px] font-semibold">Desconectado</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-600 dark:text-slate-300">
                        <Monitor className="w-7 h-7 mb-1 text-sky-500" />
                        <span className="text-[11px] font-semibold">{device.studentName}</span>
                        <span className="text-[10px] text-slate-400">{device.osVersion}</span>
                      </div>
                    )}

                    {/* Status Pill Indicator */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded text-[10px] font-medium shadow-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.bg}`} />
                      <span className={statusInfo.text}>{statusInfo.label}</span>
                    </div>
                  </div>

                  {/* Machine Specs */}
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>{device.hostname}</span>
                      <span className="font-mono text-slate-500 text-[11px]">{device.ip}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>MAC:</span>
                      <span className="font-mono">{device.mac}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <Link
                    to="/monitor"
                    className="text-sky-600 dark:text-sky-400 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    Ver detalles
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                  <span className="text-[10px] text-slate-400">Capacidades: 10/11</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent System Events & Audit */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Registro de Últimos Eventos de Auditoría LAN
          </h3>
          <Link
            to="/audit"
            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
          >
            Ver registro completo &rarr;
          </Link>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  SYSTEM_INITIALIZATION
                </span>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Servidor AssetSchool Core iniciado correctamente en puerto 3000 con soporte LAN WebSocket.
                </p>
              </div>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">Hace 5 min</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  DISCOVERY_BROADCAST_ENABLED
                </span>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Frecuencia de anuncio UDP configurada a 15000ms en el puerto 48500.
                </p>
              </div>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">Hace 4 min</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  CLASSROOM_SESSION_ACTIVE
                </span>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Sesión 'Algoritmos y Estructuras de Datos' iniciada por Docente Mariana Fuentes.
                </p>
              </div>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">Hace 2 min</span>
          </div>
        </div>
      </div>
    </div>
  );
};
