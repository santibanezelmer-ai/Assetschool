import React, { useState } from 'react';
import { ShieldAlert, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onSuccess }) => {
  const { token, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Error al actualizar contraseña');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error de comunicación con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Cambio Obligatorio de Contraseña
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Por política de seguridad institucional, debes establecer una contraseña personal.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>¡Contraseña actualizada con éxito! Redirigiendo...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Contraseña Actual (Temporal)
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nueva Contraseña Segura
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres, mayúsculas, dígitos y símbolos"
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Confirmar Nueva Contraseña
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={logout}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cerrar Sesión
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {loading ? 'Guardando...' : 'Actualizar y Continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
