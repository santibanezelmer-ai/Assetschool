import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  File,
  Upload,
  Download,
  Send,
  Users,
  HardDrive,
  RefreshCw,
  ArrowUp,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { MonitorDevice } from '../hooks/useWebRtcMonitor';

interface FileTransferModalProps {
  devices: MonitorDevice[];
  selectedDeviceId?: string;
  remoteFiles: Record<string, { currentPath: string; parentPath?: string; items: any[] }>;
  fileTransferStatus: string | null;
  onClose: () => void;
  onListRemoteDir: (deviceId: string, path?: string) => void;
  onSendFile: (
    deviceId: string | undefined,
    broadcastToAll: boolean,
    fileName: string,
    fileContentBase64: string,
    targetDir?: string,
  ) => void;
  onCollectFile: (deviceId: string, filePath: string) => void;
}

export const FileTransferModal: React.FC<FileTransferModalProps> = ({
  devices,
  selectedDeviceId,
  remoteFiles,
  fileTransferStatus,
  onClose,
  onListRemoteDir,
  onSendFile,
  onCollectFile,
}) => {
  const onlineDevices = devices.filter((d) => d.status === 'online' || d.status === 'locked');
  const [currentDeviceId, setCurrentDeviceId] = useState<string>(
    selectedDeviceId || (onlineDevices[0]?.id ?? '')
  );

  const [localFile, setLocalFile] = useState<{ name: string; size: number; base64: string } | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<string | null>(null);

  const activeDeviceData = remoteFiles[currentDeviceId];

  // Request directory listing whenever selected device changes
  useEffect(() => {
    if (currentDeviceId) {
      onListRemoteDir(currentDeviceId);
    }
  }, [currentDeviceId, onListRemoteDir]);

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      setLocalFile({
        name: file.name,
        size: file.size,
        base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendToSelected = () => {
    if (!localFile || !currentDeviceId) return;
    onSendFile(currentDeviceId, false, localFile.name, localFile.base64);
  };

  const handleBroadcastToAll = () => {
    if (!localFile) return;
    onSendFile(undefined, true, localFile.name, localFile.base64);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[88vh]">
        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                Transferencia de Archivos — Enviar y Recoger Trabajos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distribución instantánea de material y recolección de tareas por red LAN (Zero-Cloud).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Device Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Equipo Alumno:</span>
              <select
                value={currentDeviceId}
                onChange={(e) => setCurrentDeviceId(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {onlineDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} ({d.studentName})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Toast Banner */}
        {fileTransferStatus && (
          <div className="px-6 py-2 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{fileTransferStatus}</span>
          </div>
        )}

        {/* Dual-Pane Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {/* Pane 1: Equipo Local (Docente / Material a Enviar) */}
          <div className="flex flex-col p-4 bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-sky-500" />
                Panel Local — Material del Docente
              </span>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
              <input
                type="file"
                id="teacher-file-input"
                className="hidden"
                onChange={handleLocalFileChange}
              />
              <label
                htmlFor="teacher-file-input"
                className="w-full max-w-md border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white dark:bg-slate-800/40"
              >
                <Upload className="w-10 h-10 text-sky-500 mb-2 opacity-80" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {localFile ? localFile.name : 'Seleccionar archivo o tarea a distribuir'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  {localFile ? `${formatBytes(localFile.size)} preparado para enviar` : 'Haz clic para explorar archivos (PDF, DOCX, ZIP, imágenes...)'}
                </span>
              </label>

              {localFile && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={handleSendToSelected}
                    disabled={!currentDeviceId}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar a Este Alumno
                  </button>

                  <button
                    onClick={handleBroadcastToAll}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Enviar a Todos los Equipos ({onlineDevices.length})
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400">
              💡 <strong>Destino en la máquina del alumno:</strong> Los archivos se guardan automáticamente en la carpeta <code>Descargas/AssetSchool</code> del estudiante con notificación inmediata.
            </div>
          </div>

          {/* Pane 2: Equipo Remoto (Explorador del Estudiante / Recoger Trabajo) */}
          <div className="flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-amber-500" />
                Equipo Remoto — Carpetas del Alumno
              </span>

              <div className="flex items-center gap-1">
                {activeDeviceData?.parentPath && (
                  <button
                    onClick={() => onListRemoteDir(currentDeviceId, activeDeviceData.parentPath)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                    title="Subir un nivel"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onListRemoteDir(currentDeviceId, activeDeviceData?.currentPath)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  title="Refrescar carpeta"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Current Path Bar */}
            <div className="py-2 text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
              📂 {activeDeviceData?.currentPath || 'Conectando con el agente...'}
            </div>

            {/* File List Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              {activeDeviceData?.items && activeDeviceData.items.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-900 text-xs">
                  {activeDeviceData.items.map((item: any) => {
                    const isSelected = selectedRemoteFile === item.path;
                    return (
                      <div
                        key={item.path}
                        onClick={() => setSelectedRemoteFile(item.path)}
                        onDoubleClick={() => {
                          if (item.isDirectory) {
                            onListRemoteDir(currentDeviceId, item.path);
                          }
                        }}
                        className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {item.isDirectory ? (
                            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          ) : (
                            <File className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          )}
                          <span className="font-medium truncate">{item.name}</span>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 text-slate-400">
                          <span>{item.isDirectory ? 'Carpeta' : formatBytes(item.size)}</span>
                          {!item.isDirectory && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCollectFile(currentDeviceId, item.path);
                              }}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                              title="Recolectar y descargar este trabajo a tu computador"
                            >
                              <Download className="w-3 h-3" />
                              Recoger
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Esta carpeta está vacía o el agente aún no ha enviado el contenido.
                </div>
              )}
            </div>

            {/* Quick Presets */}
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-slate-400">Acceso rápido:</span>
              <button
                onClick={() => onListRemoteDir(currentDeviceId, '~/Downloads/AssetSchool')}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[11px]"
              >
                Trabajos AssetSchool
              </button>
              <button
                onClick={() => onListRemoteDir(currentDeviceId, '~/Desktop')}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[11px]"
              >
                Escritorio
              </button>
              <button
                onClick={() => onListRemoteDir(currentDeviceId, '~/Documents')}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[11px]"
              >
                Documentos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
