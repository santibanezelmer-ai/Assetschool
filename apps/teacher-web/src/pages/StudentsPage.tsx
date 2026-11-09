import React from 'react';
import { Users, Search, GraduationCap } from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const students = [
    { code: 'EST-2026-001', name: 'Lucas Pérez', email: 'lucas.perez@alumnos.cpc.edu', course: '3° Medio A - Programación', pc: 'LAB01-PC-01' },
    { code: 'EST-2026-002', name: 'Sofía Navarro', email: 'sofia.navarro@alumnos.cpc.edu', course: '3° Medio A - Programación', pc: 'LAB01-MAC-02' },
    { code: 'EST-2026-003', name: 'Mateo Rojas', email: 'mateo.rojas@alumnos.cpc.edu', course: '3° Medio A - Programación', pc: 'LAB01-LNX-03' },
    { code: 'EST-2026-004', name: 'Valentina Castillo', email: 'valentina.castillo@alumnos.cpc.edu', course: '3° Medio A - Programación', pc: 'LAB01-CRB-04' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600" />
            Gestión de Estudiantes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro y asociación de alumnos a puestos de trabajo y cursos académicos.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar estudiante..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <span className="text-xs text-slate-400">Total: {students.length} estudiantes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3">Correo Institucional</th>
                <th className="px-4 py-3">Curso Asignado</th>
                <th className="px-4 py-3">Equipo en Uso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {students.map((st) => (
                <tr key={st.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono font-medium">{st.code}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-sky-500" />
                    {st.name}
                  </td>
                  <td className="px-4 py-3">{st.email}</td>
                  <td className="px-4 py-3">{st.course}</td>
                  <td className="px-4 py-3 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block my-2">
                    {st.pc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
