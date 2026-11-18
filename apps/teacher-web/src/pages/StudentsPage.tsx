import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Upload, Download, Monitor, CheckCircle2, XCircle, Trash2, Edit2, FileText } from 'lucide-react';
import { apiFetch, getAuthHeaders } from '../utils/api';

interface Student {
  id: string;
  student_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  national_id?: string;
  assigned_course_id?: string;
  course_name?: string;
  course_code?: string;
  assigned_device_id?: string;
  device_hostname?: string;
  device_status?: string;
  status: string;
}

export const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [devices, setDevices] = useState<{ id: string; hostname: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');

  const [createModal, setCreateModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [formData, setFormData] = useState({
    studentCode: '',
    firstName: '',
    lastName: '',
    email: '',
    nationalId: '',
    assignedCourseId: '',
    assignedDeviceId: '',
  });

  const [csvContent, setCsvContent] = useState('');
  const [importResult, setImportResult] = useState<any | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sList, cList, dList] = await Promise.all([
        apiFetch<Student[]>('/api/v1/students'),
        apiFetch<any[]>('/api/v1/courses'),
        apiFetch<any[]>('/api/v1/devices'),
      ]);
      setStudents(sList);
      setCourses(cList);
      setDevices(dList);
    } catch (err) {
      console.error('Error cargando estudiantes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/v1/students', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setCreateModal(false);
      setFormData({
        studentCode: '',
        firstName: '',
        lastName: '',
        email: '',
        nationalId: '',
        assignedCourseId: '',
        assignedDeviceId: '',
      });
      loadData();
    } catch (err: any) {
      alert(`Error creando estudiante: ${err.message}`);
    }
  };

  const handleImportCsv = async () => {
    if (!csvContent.trim()) {
      alert('Por favor ingrese el contenido CSV o arrastre un archivo.');
      return;
    }
    try {
      const res = await apiFetch('/api/v1/students/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });
      setImportResult(res);
      loadData();
    } catch (err: any) {
      alert(`Error en importación: ${err.message}`);
    }
  };

  const handleExportCsv = () => {
    const filterParam = courseFilter !== 'ALL' ? `?courseId=${courseFilter}` : '';
    window.open(`/api/v1/students/export/csv${filterParam}`, '_blank');
  };

  const handleAssignDevice = async (deviceId: string) => {
    if (!selectedStudent) return;
    try {
      if (deviceId) {
        await apiFetch(`/api/v1/students/${selectedStudent.id}/assign-device`, {
          method: 'POST',
          body: JSON.stringify({ deviceId, notes: 'Asignación manual en Teacher Web' }),
        });
      } else {
        await apiFetch(`/api/v1/students/${selectedStudent.id}/unassign-device`, {
          method: 'POST',
        });
      }
      setAssignModal(false);
      loadData();
    } catch (err: any) {
      alert(`Error asignando equipo: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Eliminar la ficha del estudiante '${name}'?`)) {
      try {
        await apiFetch(`/api/v1/students/${id}`, { method: 'DELETE' });
        loadData();
      } catch (err: any) {
        alert(`Error eliminando estudiante: ${err.message}`);
      }
    }
  };

  const filtered = students.filter((s) => {
    const matchSearch =
      s.first_name.toLowerCase().includes(search.toLowerCase()) ||
      s.last_name.toLowerCase().includes(search.toLowerCase()) ||
      s.student_code.toLowerCase().includes(search.toLowerCase()) ||
      (s.national_id && s.national_id.toLowerCase().includes(search.toLowerCase()));
    const matchCourse = courseFilter === 'ALL' || s.assigned_course_id === courseFilter;
    return matchSearch && matchCourse;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600" />
            Matrícula y Gestión de Estudiantes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro escolar, asignación fija a estaciones de trabajo e importación masiva por archivo CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Exportar CSV
          </button>
          <button
            onClick={() => {
              setImportResult(null);
              setImportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importación Masiva
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Matricular Alumno
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nombre, código de matrícula o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300"
        >
          <option value="ALL">Todos los Cursos</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Código / Matrícula</th>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3">RUT / Identificador</th>
                <th className="px-4 py-3">Curso</th>
                <th className="px-4 py-3">Computador Asignado</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Cargando nómina de alumnos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    No se encontraron estudiantes registrados.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                      {s.student_code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {s.first_name} {s.last_name}
                      </div>
                      {s.email && <div className="text-xs text-slate-400">{s.email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {s.national_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {s.course_name ? `${s.course_name} (${s.course_code})` : <span className="text-slate-400">Sin curso</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.device_hostname ? (
                        <button
                          onClick={() => {
                            setSelectedStudent(s);
                            setAssignModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 font-mono text-xs"
                        >
                          <Monitor className="w-3 h-3" />
                          <span>{s.device_hostname}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedStudent(s);
                            setAssignModal(true);
                          }}
                          className="text-xs text-slate-400 hover:text-sky-600 font-medium"
                        >
                          + Asignar equipo
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" /> {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(s.id, `${s.first_name} ${s.last_name}`)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Eliminar Alumno"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create Student */}
      {createModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              Matricular Nuevo Estudiante
            </h3>

            <form onSubmit={handleCreateStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Código de Matrícula</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. EST-2026-005"
                    value={formData.studentCode}
                    onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">RUT / Identificador</label>
                  <input
                    type="text"
                    placeholder="ej. 21.234.567-8"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombres</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Matías"
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
                    placeholder="ej. Herrera"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Correo Institucional (Opcional)</label>
                <input
                  type="email"
                  placeholder="matias.herrera@alumnos.cpc.edu"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Curso Asignado</label>
                  <select
                    value={formData.assignedCourseId}
                    onChange={(e) => setFormData({ ...formData, assignedCourseId: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="">Sin curso</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Puesto / Computador</label>
                  <select
                    value={formData.assignedDeviceId}
                    onChange={(e) => setFormData({ ...formData, assignedDeviceId: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs"
                  >
                    <option value="">Sin asignar</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.hostname}
                      </option>
                    ))}
                  </select>
                </div>
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
                  Guardar Matrícula
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal CSV Import */}
      {importModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-600" />
              Importación Masiva de Estudiantes desde CSV
            </h3>
            <p className="text-xs text-slate-500">
              Formato esperado (primera fila de encabezados): <br />
              <code className="text-sky-600 font-mono">studentCode,firstName,lastName,email,courseCode,nationalId</code>
            </p>

            <textarea
              rows={8}
              placeholder={`studentCode,firstName,lastName,email,courseCode,nationalId\nEST-2026-010,Ignacio,Morales,ignacio@alumnos.cl,PROG-301,21.987.654-3\nEST-2026-011,Camila,Torres,camila@alumnos.cl,PROG-301,22.123.456-7`}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white"
            />

            {importResult && (
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs space-y-1">
                <div className="font-semibold text-emerald-600">
                  ✓ Procesados: {importResult.totalProcessed} (Nuevos: {importResult.createdCount}, Actualizados: {importResult.updatedCount})
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="text-rose-600">
                    Advertencias ({importResult.errors.length}): {importResult.errors.slice(0, 3).join('; ')}
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setImportModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
              >
                Importar Registros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Assign Computer */}
      {assignModal && selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-sky-600" />
              Asignar Equipo a {selectedStudent.first_name} {selectedStudent.last_name}
            </h3>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Seleccione el computador del aula:
              </label>
              <select
                defaultValue={selectedStudent.assigned_device_id || ''}
                id="select-device-assign"
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono"
              >
                <option value="">(Desasignar equipo)</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAssignModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('select-device-assign') as HTMLSelectElement;
                  handleAssignDevice(el?.value || '');
                }}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium shadow-sm transition-colors"
              >
                Confirmar Asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
