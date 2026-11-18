import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Search, Shield, Mail, Phone, Lock, CheckCircle2, XCircle, School, BookOpen } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role_name: string;
  role_description?: string;
  institution_name: string;
  is_active: boolean;
  assigned_classrooms_count?: number;
  assigned_courses_count?: number;
}

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const [createModal, setCreateModal] = useState(false);
  const [classroomModal, setClassroomModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [availableClassrooms, setAvailableClassrooms] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    roleName: 'TEACHER',
    phone: '',
    password: '',
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<User[]>('/api/v1/users');
      setUsers(data);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setCreateModal(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        roleName: 'TEACHER',
        phone: '',
        password: '',
      });
      loadUsers();
    } catch (err: any) {
      alert(`Error creando usuario: ${err.message}`);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await apiFetch(`/api/v1/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.is_active }),
      });
      loadUsers();
    } catch (err: any) {
      alert(`Error cambiando estado: ${err.message}`);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (confirm(`¿Restablecer la contraseña del usuario ${user.first_name} ${user.last_name}?`)) {
      try {
        const res = await apiFetch(`/api/v1/users/${user.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ newPassword: 'AssetSchool2026!' }),
        });
        alert(res.message || 'Contraseña restablecida exitosamente');
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const openClassroomAssignment = async (user: User) => {
    setSelectedUser(user);
    try {
      const [rooms, userDetails] = await Promise.all([
        apiFetch<any[]>('/api/v1/classrooms'),
        apiFetch<any>(`/api/v1/users/${user.id}`),
      ]);
      setAvailableClassrooms(rooms);
      setSelectedClassroomIds(userDetails.assignedClassrooms?.map((c: any) => c.id) || []);
      setClassroomModal(true);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleSaveClassrooms = async () => {
    if (!selectedUser) return;
    try {
      await apiFetch(`/api/v1/users/${selectedUser.id}/assign-classrooms`, {
        method: 'POST',
        body: JSON.stringify({ classroomIds: selectedClassroomIds }),
      });
      setClassroomModal(false);
      loadUsers();
    } catch (err: any) {
      alert(`Error asignando salas: ${err.message}`);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.first_name.toLowerCase().includes(search.toLowerCase()) ||
      u.last_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role_name === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-sky-600" />
            Usuarios y Personal Docente
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administración de profesores, directivos y técnicos con roles granulares y asignación de salas.
          </p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o identificador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300"
        >
          <option value="ALL">Todos los Roles</option>
          <option value="SUPERADMIN">Superadministrador</option>
          <option value="INSTITUTION_ADMIN">Administrador Institucional</option>
          <option value="DIRECTOR">Director / Encargado</option>
          <option value="TEACHER">Profesor</option>
          <option value="TECH_SUPPORT">Soporte Técnico</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Usuario / Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Institución</th>
                <th className="px-4 py-3">Salas Asignadas</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {u.first_name} {u.last_name}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <Mail className="w-3 h-3" /> {u.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <Shield className="w-3 h-3 text-sky-500" />
                        {u.role_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {u.institution_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      <button
                        onClick={() => openClassroomAssignment(u)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-sky-50 hover:text-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
                      >
                        <School className="w-3.5 h-3.5 text-sky-500" />
                        <span>{u.assigned_classrooms_count ?? 0} asignadas</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="flex items-center gap-1 text-xs font-medium"
                      >
                        {u.is_active ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> Inactivo
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Restablecer Contraseña"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create User */}
      {createModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-sky-600" />
              Crear Nuevo Usuario Institucional
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombres</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Juan"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Apellidos</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Pérez"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="profesor@colegio.cl"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Rol en la Plataforma</label>
                  <select
                    value={formData.roleName}
                    onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="TEACHER">Profesor de Aula</option>
                    <option value="INSTITUTION_ADMIN">Administrador Institucional</option>
                    <option value="DIRECTOR">Director / Encargado</option>
                    <option value="TECH_SUPPORT">Operador / Soporte Técnico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono (Opcional)</label>
                  <input
                    type="text"
                    placeholder="+56 9 8765 4321"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contraseña Inicial (Opcional - por defecto: TempPass2026!)
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Classroom Assignment */}
      {classroomModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <School className="w-5 h-5 text-sky-600" />
              Asignar Aulas a {selectedUser.first_name} {selectedUser.last_name}
            </h3>
            <p className="text-xs text-slate-500">
              Seleccione las salas a las que este docente tendrá acceso desde AssetSchool Master y Teacher Web.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-100 dark:border-slate-800 p-2 rounded-xl">
              {availableClassrooms.map((room) => {
                const isSelected = selectedClassroomIds.includes(room.id);
                return (
                  <label
                    key={room.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClassroomIds([...selectedClassroomIds, room.id]);
                        } else {
                          setSelectedClassroomIds(selectedClassroomIds.filter((id) => id !== room.id));
                        }
                      }}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{room.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{room.code}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setClassroomModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveClassrooms}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
              >
                Guardar Asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
