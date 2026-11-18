import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, Copy, Check, ShieldAlert, Monitor, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface EnrollmentToken {
  id: string;
  token: string;
  label?: string;
  max_uses: number;
  uses_count: number;
  is_revoked: boolean;
  expires_at: string;
  created_at: string;
  created_by?: string;
}

interface Device {
  id: string;
  hostname: string;
  mac_address: string;
  local_ip: string;
  os_type: string;
  os_version: string;
  status: string;
  is_revoked: boolean;
  is_pending_approval: boolean;
  enrolled_at: string;
}

export const EnrollmentPage: React.FC = () => {
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    label: 'Token de Enrolamiento de Aula',
    classroomId: '',
    maxUses: 40,
    expiresInHours: 24,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [tList, dList, cList] = await Promise.all([
        apiFetch<EnrollmentToken[]>('/api/v1/devices/enrollment/tokens'),
        apiFetch<Device[]>('/api/v1/devices'),
        apiFetch<{ id: string; name: string }[]>('/api/v1/classrooms'),
      ]);
      setTokens(tList);
      setDevices(dList);
      setClassrooms(cList);
    } catch (err) {
      console.error('Error cargando enrolamiento:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/v1/devices/enrollment/tokens', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(`Error creando token: ${err.message}`);
    }
  };

  const handleRevokeToken = async (id: string) => {
    if (confirm('¿Revocar este token de enrolamiento? Ningún equipo podrá utilizarlo.')) {
      try {
        await apiFetch(`/api/v1/devices/enrollment/tokens/${id}/revoke`, { method: 'POST' });
        loadData();
      } catch (err: any) {
        alert(`Error revocando token: ${err.message}`);
      }
    }
  };

  const handleApproveDevice = async (id: string) => {
    try {
      await apiFetch(`/api/v1/devices/${id}/approve`, { method: 'POST' });
      loadData();
    } catch (err: any) {
      alert(`Error aprobando equipo: ${err.message}`);
    }
  };

  const handleReEnrollDevice = async (id: string) => {
    try {
      await apiFetch(`/api/v1/devices/${id}/re-enroll`, { method: 'POST' });
      loadData();
    } catch (err: any) {
      alert(`Error reenrolando equipo: ${err.message}`);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    const reason = prompt('Motivo de revocación del equipo:', 'Retiro temporal de inventario');
    if (reason) {
      try {
        await apiFetch(`/api/v1/devices/${id}/revoke`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        loadData();
      } catch (err: any) {
        alert(`Error revocando equipo: ${err.message}`);
      }
    }
  };

  const copyToClipboard = (tokenStr: string, id: string) => {
    navigator.clipboard.writeText(tokenStr);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-sky-600" />
            Enrolamiento de Dispositivos de Aula
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control de incorporación, generación de tokens criptográficos y aprobación de nuevos agentes Student.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generar Token de Enrolamiento
        </button>
      </div>

      {/* Tokens List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-600" />
            Tokens de Enrolamiento Activos
          </h3>
          <span className="text-xs text-slate-400">Total: {tokens.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Etiqueta</th>
                <th className="px-4 py-3">Código de Token</th>
                <th className="px-4 py-3">Usos / Límite</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Cargando tokens...
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No existen tokens generados. Haga clic en 'Generar Token de Enrolamiento' para habilitar nuevas estaciones.
                  </td>
                </tr>
              ) : (
                tokens.map((t) => {
                  const isExpired = new Date(t.expires_at).getTime() < Date.now();
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {t.label || 'Enrolamiento Institucional'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-sky-700 dark:text-sky-300">
                            {t.token}
                          </code>
                          <button
                            onClick={() => copyToClipboard(t.token, t.id)}
                            className="p-1 text-slate-400 hover:text-sky-600 rounded"
                            title="Copiar token"
                          >
                            {copiedId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {t.uses_count} de {t.max_uses} equipos
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(t.expires_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {t.is_revoked ? (
                          <span className="text-xs text-rose-600 font-medium flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> Revocado
                          </span>
                        ) : isExpired ? (
                          <span className="text-xs text-amber-600 font-medium">Expirado</span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!t.is_revoked && !isExpired && (
                          <button
                            onClick={() => handleRevokeToken(t.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enrolled / Pending Approval Devices */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-sky-600" />
            Estado de Enrolamiento y Autorización de Equipos
          </h3>
          <span className="text-xs text-slate-400">Total: {devices.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Equipo / Hostname</th>
                <th className="px-4 py-3">Dirección MAC / IP</th>
                <th className="px-4 py-3">Sistema Operativo</th>
                <th className="px-4 py-3">Estado de Autorización</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{d.hostname}</div>
                    <div className="text-xs text-slate-400 font-mono">{d.id.substring(0, 8)}...</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{d.mac_address}</div>
                    <div className="text-xs text-slate-400">{d.local_ip}</div>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase font-semibold text-slate-600 dark:text-slate-400">
                    {d.os_type} ({d.os_version})
                  </td>
                  <td className="px-4 py-3">
                    {d.is_revoked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        <XCircle className="w-3 h-3" /> Revocado
                      </span>
                    ) : d.is_pending_approval ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <ShieldAlert className="w-3 h-3" /> Pendiente de Aprobación
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" /> Autorizado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {d.is_pending_approval && (
                      <button
                        onClick={() => handleApproveDevice(d.id)}
                        className="px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                      >
                        Aprobar
                      </button>
                    )}
                    {d.is_revoked ? (
                      <button
                        onClick={() => handleReEnrollDevice(d.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reenrolar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevokeDevice(d.id)}
                        className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors"
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Generate Token */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-sky-600" />
              Generar Token de Enrolamiento
            </h3>

            <form onSubmit={handleCreateToken} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Etiqueta del Token
                </label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Asignar Directamente al Aula (Opcional)
                </label>
                <select
                  value={formData.classroomId}
                  onChange={(e) => setFormData({ ...formData, classroomId: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="">Sin asignación previa de aula</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Límite de Equipos (Max Usos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={formData.maxUses}
                    onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value, 10) || 1 })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vigencia (Horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={formData.expiresInHours}
                    onChange={(e) => setFormData({ ...formData, expiresInHours: parseInt(e.target.value, 10) || 24 })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
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
                  Emitir Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
