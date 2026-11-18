import React, { useState, useEffect } from 'react';
import { School, Plus, Search, Monitor, Users, MapPin, CheckCircle2, AlertCircle, Edit2, Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Classroom {
  id: string;
  code: string;
  name: string;
  capacity: number;
  subnet_lan: string;
  broadcast_ip: string;
  physical_location?: string;
  description?: string;
  operational_status?: string;
  device_count?: number;
  online_device_count?: number;
  assigned_teachers_count?: number;
  is_online: boolean;
}

export const ClassroomsPage: React.FC = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [editingRoom, setEditingRoom] = useState<Classroom | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    capacity: 32,
    subnetLan: '192.168.1.0/24',
    broadcastIp: '192.168.1.255',
    physicalLocation: '',
    description: '',
    operationalStatus: 'operational',
  });

  const loadClassrooms = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Classroom[]>('/api/v1/classrooms');
      setClassrooms(data);
    } catch (err) {
      console.error('Error cargando aulas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  const handleOpenModal = (room?: Classroom) => {
    if (room) {
      setEditingRoom(room);
      setFormData({
        code: room.code,
        name: room.name,
        capacity: room.capacity,
        subnetLan: room.subnet_lan,
        broadcastIp: room.broadcast_ip,
        physicalLocation: room.physical_location || '',
        description: room.description || '',
        operationalStatus: room.operational_status || 'operational',
      });
    } else {
      setEditingRoom(null);
      setFormData({
        code: '',
        name: '',
        capacity: 32,
        subnetLan: '192.168.1.0/24',
        broadcastIp: '192.168.1.255',
        physicalLocation: '',
        description: '',
        operationalStatus: 'operational',
      });
    }
    setModalOpen(true);
  };

  const handleOpenDetail = async (roomId: string) => {
    try {
      const room = await apiFetch<any>(`/api/v1/classrooms/${roomId}`);
      setSelectedRoom(room);
      setDetailModalOpen(true);
    } catch (err: any) {
      alert(`Error consultando detalles del aula: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await apiFetch(`/api/v1/classrooms/${editingRoom.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch('/api/v1/classrooms', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setModalOpen(false);
      loadClassrooms();
    } catch (err: any) {
      alert(`Error guardando aula: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Eliminar la sala '${name}'? Los equipos asignados quedarán sin sala pero no se eliminarán.`)) {
      try {
        await apiFetch(`/api/v1/classrooms/${id}`, { method: 'DELETE' });
        loadClassrooms();
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const filtered = classrooms.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.physical_location && c.physical_location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <School className="w-6 h-6 text-sky-600" />
            Aulas y Laboratorios Informáticos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administración de espacios físicos, capacidad, subredes LAN y computadores mixtos (Windows + macOS).
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Aula Informática
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Buscar aula por nombre, código o ubicación física..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando salas y laboratorios...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">No se encontraron aulas configuradas.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((room) => (
            <div
              key={room.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 px-2 py-1 rounded border border-sky-200 dark:border-sky-800">
                    {room.code}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                      room.operational_status === 'maintenance'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : room.is_online
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {room.operational_status === 'maintenance' ? (
                      <AlertCircle className="w-3 h-3" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {room.operational_status === 'maintenance'
                      ? 'En Mantenimiento'
                      : room.is_online
                      ? 'Clase en Curso'
                      : 'Disponible'}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">{room.name}</h3>
                  {room.physical_location && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {room.physical_location}
                    </p>
                  )}
                </div>

                {room.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{room.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                    <span className="text-slate-400">Capacidad:</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{room.capacity} puestos</p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
                    <span className="text-slate-400">Subred LAN:</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200 truncate">{room.subnet_lan}</p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleOpenDetail(room.id)}
                  className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 font-medium"
                >
                  <Monitor className="w-4 h-4" />
                  <span>
                    <strong>{room.online_device_count ?? 0}</strong> / {room.device_count ?? 0} equipos
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenModal(room)}
                    className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Editar Aula"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(room.id, room.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Eliminar Aula"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <School className="w-5 h-5 text-sky-600" />
              {editingRoom ? 'Editar Aula Informática' : 'Nueva Aula Informática'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Código del Aula</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. LAB-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Laboratorio Informática 1"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Capacidad Máxima</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 30 })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Estado Operativo</label>
                  <select
                    value={formData.operationalStatus}
                    onChange={(e) => setFormData({ ...formData, operationalStatus: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="operational">Operativa / En Servicio</option>
                    <option value="maintenance">Mantenimiento Técnico</option>
                    <option value="offline">Fuera de Servicio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Ubicación Física</label>
                <input
                  type="text"
                  placeholder="ej. Pabellón Norte - Piso 2"
                  value={formData.physicalLocation}
                  onChange={(e) => setFormData({ ...formData, physicalLocation: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Subred LAN</label>
                  <input
                    type="text"
                    placeholder="192.168.1.0/24"
                    value={formData.subnetLan}
                    onChange={(e) => setFormData({ ...formData, subnetLan: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">IP Broadcast</label>
                  <input
                    type="text"
                    placeholder="192.168.1.255"
                    value={formData.broadcastIp}
                    onChange={(e) => setFormData({ ...formData, broadcastIp: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Equipamiento especial, sistema de proyección, etc."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
                >
                  {editingRoom ? 'Guardar Cambios' : 'Crear Aula'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal: Mixed Computers in Classroom */}
      {detailModalOpen && selectedRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-sky-600" />
                  Equipos en {selectedRoom.name} ({selectedRoom.code})
                </h3>
                <p className="text-xs text-slate-400">
                  Total asignados: {selectedRoom.devices?.length || 0} computadores (Windows y macOS combinados).
                </p>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {selectedRoom.devices?.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  No hay computadores asignados a esta sala. Puede asignarlos desde el Inventario TIC o Enrolamiento.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Hostname</th>
                      <th className="px-3 py-2">SO / Procesador</th>
                      <th className="px-3 py-2">IP / MAC</th>
                      <th className="px-3 py-2">Alumno Asignado</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedRoom.devices.map((d: any) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                          {d.hostname}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold uppercase">{d.os_type}</span>
                          <div className="text-[11px] text-slate-400">{d.processor || d.os_version}</div>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                          <div>{d.local_ip}</div>
                          <div className="text-[10px] text-slate-400">{d.mac_address}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                          {d.student_first_name ? `${d.student_first_name} ${d.student_last_name}` : 'Sin alumno'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              d.status === 'online'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
