import React, { useState } from 'react';
import { FileCheck, Plus, Play, CheckCircle2, AlertCircle } from 'lucide-react';

export const AssessmentsPage: React.FC = () => {
  const [activeAlert, setActiveAlert] = useState<string | null>(null);

  const assessments = [
    { id: '1', title: 'Quiz 01: Conceptos de Algoritmos y Notación Big-O', questions: 10, duration: '20 min', status: 'Listo para lanzar' },
    { id: '2', title: 'Control 02: Estructuras de Datos Lineales (Pilas y Colas)', questions: 15, duration: '30 min', status: 'Borrador' },
  ];

  const handleLaunch = (title: string) => {
    setActiveAlert(`Evaluación '${title}' enviada a los puestos de trabajo.`);
    setTimeout(() => setActiveAlert(null), 3500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-sky-600" />
            Evaluaciones y Cuestionarios en Vivo
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Diseño, distribución y corrección instantánea de pruebas en el aula local.
          </p>
        </div>

        <button
          onClick={() => setActiveAlert('Función: Creador de Cuestionarios interactivo')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Evaluación
        </button>
      </div>

      {activeAlert && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>{activeAlert}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assessments.map((quiz) => (
          <div key={quiz.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                {quiz.status}
              </span>
              <span className="text-xs text-slate-400">{quiz.duration}</span>
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{quiz.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contiene {quiz.questions} preguntas con opciones múltiples y puntaje ponderado automático.
            </p>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">{quiz.questions} preguntas</span>
              <button
                onClick={() => handleLaunch(quiz.title)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Lanzar a Estudiantes
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
