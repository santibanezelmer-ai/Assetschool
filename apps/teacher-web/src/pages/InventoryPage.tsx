import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, MemoryStick as Memory, Monitor, Search, Edit2, RotateCw, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface DeviceItem {
  id: string;
  hostname: string;
  device_name?: string;
  os_type: string;
  os_version: string;
  architecture: string;
  processor?: string;
  ram_mb?: number;
  storage_gb?: number;
  status: string;
  local_ip: string;
  mac_address: string;
  current_classroom_id?: string;
  current_student_id?: string;
  enrolled_at: string;
}

export const InventoryPage: React.FC = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [osFilter, setOsFilter] = useState('ALL');

  const [reassignModal, setReassignModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [targetClassroom, setTargetClassroom] = useState<string>('');
  const [targetStudent, setTargetStudent] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [dList, cList, sList] = await Promise.all([
        apiFetch<DeviceItem[]>('/api/v1/devices'),
        apiFetch<{ id: string; name: string }[]>('/api/v1/classrooms'),
        apiFetch<{ id: string; first_name: string; last_name: string }[]>('/api/v1/students'),
      ]);
      setDevices(dList);
      setClassrooms(cList);
      setStudents(sList);
    } catch (err) {
      console.error('Error cargando inventario:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openReassignModal = (dev: DeviceItem) => {
    setSelectedDevice(dev);
    setTargetClassroom(dev.current_classroom_id || '');
    setTargetStudent(dev.current_student_id || '');
    setReassignModal(true);
  };

  const handleSaveReassign = async () => {
    if (!selectedDevice) return;
    try {
      await apiFetch(`/api/v1/devices/${selectedDevice.id}/reassign`, {
        method: 'PUT',
        body: JSON.stringify({
          classroomId: targetClassroom || null,
          studentId: targetStudent || null,
        }),
      });
      setReassignModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error reasignando equipo: ${err.message}`);
    }
  };

  const filtered = devices.filter((d) => {
    const matchSearch =
      d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.local_ip.includes(search) ||
      d.mac_address.toLowerCase().includes(search.toLowerCase()) ||
      (d.processor && d.processor.toLowerCase().includes(search.toLowerCase()));
    const matchOs = osFilter === 'ALL' || d.os_type.toLowerCase() === osFilter.toLowerCase();
    return matchSearch && matchOs;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="w-6 h-6 text-sky-600" />
            Inventario Centralizado de Hardware y Computadores
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Especificaciones físicas (CPU, RAM, Almacenamiento) y asignación a aulas y alumnos.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RotateCw className="w-4 h-4 text-slate-400" />
          Actualizar Datos
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar por hostname, procesador, dirección IP o MAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
        <select
          value={osFilter}
          onChange={(e) => setOsFilter(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300"
        >
          <option value="ALL">Todos los Sistemas Operativos</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="linux">Linux</option>
          <option value="chromeos">ChromeOS</option>
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando inventario de hardware...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">No se encontraron dispositivos en el inventario.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const classroomName = classrooms.find((c) => c.id === item.current_classroom_id)?.name || 'Sin aula';
            const student = students.find((s) => s.id === item.current_student_id);

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-sky-500" />
                      {item.hostname}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {item.os_type}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                      <span className="text-slate-400 block text-[11px]">Procesador:</span>
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.processor || 'CPU Estándar x86_64'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                        <span className="text-slate-400 block text-[11px]">Memoria RAM:</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.ram_mb ? `${Math.round(item.ram_mb / 1024)} GB` : '16 GB'}
                        </p>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                        <span className="text-slate-400 block text-[11px]">Disco:</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.storage_gb ? `${item.storage_gb} GB SSD` : '512 GB SSD'}
                        </p>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded flex items-center justify-between font-mono text-[11px]">
                      <span className="text-slate-500">{item.local_ip}</span>
                      <span className="text-slate-400">{item.mac_address}</span>
                    </div>

                    <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      <div>
                        <span className="text-slate-400">Aula:</span> <strong>{classroomName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Alumno:</span>{' '}
                        <strong>{student ? `${student.first_name} ${student.last_name}` : 'Sin alumno asignado'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      item.status === 'online' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {item.status === 'online' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {item.status}
                  </span>
                  <button
                    onClick={() => openReassignModal(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-sky-50 hover:text-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700 font-medium transition-colors"
                  >
                    <Edit2 className="w-3 h-3" /> Reasignar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Reassign */}
      {reassignModal && selectedDevice && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-sky-600" />
              Reasignar Estación {selectedDevice.hostname}
            </h3>
            <p className="text-xs text-slate-500">
              Cambie el aula o estudiante asignado sin perder el historial ni la identidad criptográfica del equipo.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Aula Informática Asignada
                </label>
                <select
                  value={targetClassroom}
                  onChange={(e) => setTargetClassroom(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="">(Sin aula asignada)</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estudiante Asignado
                </label>
                <select
                  value={targetStudent}
                  onChange={(e) => setTargetStudent(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="">(Sin estudiante asignado)</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReassignModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveReassign}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
              >
                Guardar Reasignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
