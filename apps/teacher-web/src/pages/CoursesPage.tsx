import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, Users, Plus, Search, Trash2, Edit2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  education_level?: string;
  grade?: string;
  section?: string;
  academic_year: number;
  academic_period: string;
  lead_teacher_first_name?: string;
  lead_teacher_last_name?: string;
  enrolled_students_count?: number;
}

export const CoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    educationLevel: 'Educación Básica',
    grade: '1°',
    section: 'A',
    academicYear: 2026,
    description: '',
  });

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Course[]>('/api/v1/courses');
      setCourses(data);
    } catch (err) {
      console.error('Error cargando cursos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleOpenModal = (course?: Course) => {
    if (course) {
      setEditingCourse(course);
      setFormData({
        code: course.code,
        name: course.name,
        educationLevel: course.education_level || 'Educación Básica',
        grade: course.grade || '1°',
        section: course.section || 'A',
        academicYear: course.academic_year || 2026,
        description: course.description || '',
      });
    } else {
      setEditingCourse(null);
      setFormData({
        code: '',
        name: '',
        educationLevel: 'Educación Básica',
        grade: '1°',
        section: 'A',
        academicYear: 2026,
        description: '',
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCourse) {
        await apiFetch(`/api/v1/courses/${editingCourse.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch('/api/v1/courses', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setModalOpen(false);
      loadCourses();
    } catch (err: any) {
      alert(`Error guardando curso: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Eliminar el curso '${name}'?`)) {
      try {
        await apiFetch(`/api/v1/courses/${id}`, { method: 'DELETE' });
        loadCourses();
      } catch (err: any) {
        alert(`Error eliminando curso: ${err.message}`);
      }
    }
  };

  const filtered = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.education_level && c.education_level.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-sky-600" />
            Cursos Académicos y Niveles
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administración de cursos (básica, media, técnica), profesor jefe y estudiantes matriculados.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Curso
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Buscar curso por nombre, código o nivel (ej. 1° Básico, PROG-301)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
        />
      </div>

      {/* Courses Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando catálogo de cursos...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">No se encontraron cursos académicos registrados.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((course) => (
            <div
              key={course.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 px-2 py-1 rounded border border-sky-200 dark:border-sky-800">
                    {course.code}
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {course.academic_period}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">{course.name}</h3>
                  <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
                    {course.education_level} — {course.grade} {course.section}
                  </p>
                </div>

                {course.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{course.description}</p>
                )}

                {course.lead_teacher_first_name && (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-slate-400">Profesor Jefe:</span>{' '}
                    <strong>{course.lead_teacher_first_name} {course.lead_teacher_last_name}</strong>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <Users className="w-4 h-4 text-sky-500" />
                  <span><strong>{course.enrolled_students_count ?? 0}</strong> matriculados</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenModal(course)}
                    className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Editar Curso"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(course.id, course.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Eliminar Curso"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-sky-600" />
              {editingCourse ? 'Editar Curso' : 'Crear Nuevo Curso'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Código del Curso</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. 1BAS-A"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. 1° Básico A"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nivel Educativo</label>
                <select
                  value={formData.educationLevel}
                  onChange={(e) => setFormData({ ...formData, educationLevel: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="Educación Parvularia">Educación Parvularia / Prebásica</option>
                  <option value="Educación Básica">Educación Básica</option>
                  <option value="Educación Media Científico-Humanista">Educación Media Científico-Humanista</option>
                  <option value="Educación Media Técnico-Profesional">Educación Media Técnico-Profesional</option>
                  <option value="Educación Superior / Técnico">Educación Superior / Técnico</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Grado</label>
                  <input
                    type="text"
                    placeholder="ej. 1°"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Paralelo / Letra</label>
                  <input
                    type="text"
                    placeholder="ej. A"
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Año Académico</label>
                  <input
                    type="number"
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: parseInt(e.target.value, 10) || 2026 })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Detalles del curso o especialidad..."
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
                  {editingCourse ? 'Guardar Cambios' : 'Crear Curso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
