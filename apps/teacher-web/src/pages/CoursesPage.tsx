import React from 'react';
import { BookOpen, Calendar, Users } from 'lucide-react';

export const CoursesPage: React.FC = () => {
  const courses = [
    { code: 'PROG-301', name: 'Programación y Algoritmos III', period: '2026-S1', studentsCount: 32, desc: 'Especialidad Informática - Desarrollo en TypeScript, Python y Rust' },
    { code: 'REDES-402', name: 'Redes y Telecomunicaciones', period: '2026-S1', studentsCount: 28, desc: 'Especialidad Telecomunicaciones - Arquitectura LAN, Subredes y Packet Tracer' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-sky-600" />
          Cursos Académicos
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Catálogo de asignaturas e integración con los periodos académicos institucionales.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((course) => (
          <div key={course.code} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 px-2 py-1 rounded border border-sky-200 dark:border-sky-800">
                {course.code}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {course.period}
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{course.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{course.desc}</p>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Users className="w-4 h-4 text-sky-500" />
              <span>{course.studentsCount} alumnos matriculados</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
