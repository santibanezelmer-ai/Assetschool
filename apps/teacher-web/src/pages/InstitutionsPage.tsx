import React, { useState, useEffect } from 'react';
import { School, Plus, Search, Building2, MapPin, Mail, Phone, CheckCircle2, XCircle, Edit2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Institution {
  id: string;
  code: string;
  name: string;
  rut?: string;
  address?: string;
  region?: string;
  comuna?: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
  user_count?: number;
  classroom_count?: number;
  device_count?: number;
  created_at: string;
}

export const InstitutionsPage: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<Institution | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    rut: '',
    address: '',
    region: 'Región Metropolitana',
    comuna: '',
    contactEmail: '',
    contactPhone: '',
  });

  const loadInstitutions = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Institution[]>('/api/v1/institutions');
      setInstitutions(data);
    } catch (err) {
      console.error('Error cargando instituciones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstitutions();
  }, []);

  const handleOpenModal = (inst?: Institution) => {
    if (inst) {
      setEditingInst(inst);
      setFormData({
        name: inst.name,
        code: inst.code,
        rut: inst.rut || '',
        address: inst.address || '',
        region: inst.region || 'Región Metropolitana',
        comuna: inst.comuna || '',
        contactEmail: inst.contact_email,
        contactPhone: inst.contact_phone || '',
      });
    } else {
      setEditingInst(null);
      setFormData({
        name: '',
        code: '',
        rut: '',
        address: '',
        region: 'Región Metropolitana',
        comuna: '',
        contactEmail: '',
        contactPhone: '',
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingInst) {
        await apiFetch(`/api/v1/institutions/${editingInst.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch('/api/v1/institutions', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setModalOpen(false);
      loadInstitutions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/api/v1/institutions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      loadInstitutions();
    } catch (err: any) {
      alert(`Error al cambiar estado: ${err.message}`);
    }
  };

  const filtered = institutions.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code.toLowerCase().includes(search.toLowerCase()) ||
      (i.rut && i.rut.toLowerCase().includes(search.toLowerCase())) ||
      (i.comuna && i.comuna.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <School className="w-6 h-6 text-sky-600" />
            Gestión de Instituciones Educativas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administración multi-colegio, sedes institucionales y aislamiento de datos.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Institución
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Buscar institución por nombre, código, RUT o comuna..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border-0 text-sm focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
        />
      </div>

      {/* Grid of institutions */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando instituciones...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">No se encontraron instituciones registradas.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((inst) => (
            <div
              key={inst.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 px-2 py-1 rounded border border-sky-200 dark:border-sky-800">
                    {inst.code}
                  </span>
                  <button
                    onClick={() => handleToggleStatus(inst.id, inst.is_active)}
                    className="flex items-center gap-1 text-xs font-medium"
                  >
                    {inst.is_active ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Activa
                      </span>
                    ) : (
                      <span className="text-rose-600 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Inactiva
                      </span>
                    )}
                  </button>
                </div>

                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">{inst.name}</h3>
                  {inst.rut && <p className="text-xs font-mono text-slate-500">RUT: {inst.rut}</p>}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{inst.address ? `${inst.address}, ${inst.comuna || ''}` : 'Sin dirección'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{inst.contact_email}</span>
                  </div>
                  {inst.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{inst.contact_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats & Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex gap-3 text-slate-500">
                  <span><strong>{inst.classroom_count ?? 0}</strong> Salas</span>
                  <span><strong>{inst.device_count ?? 0}</strong> Equipos</span>
                  <span><strong>{inst.user_count ?? 0}</strong> Docentes</span>
                </div>
                <button
                  onClick={() => handleOpenModal(inst)}
                  className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Editar Institución"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
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
              <Building2 className="w-5 h-5 text-sky-600" />
              {editingInst ? 'Editar Institución' : 'Registrar Nueva Institución'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre Institucional</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Colegio San Agustín"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Código Único</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingInst}
                    placeholder="ej. CSA-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white uppercase disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">RUT Institucional</label>
                  <input
                    type="text"
                    placeholder="ej. 76.543.210-K"
                    value={formData.rut}
                    onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dirección</label>
                <input
                  type="text"
                  placeholder="ej. Av. Providencia 1234"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Región</label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Comuna</label>
                  <input
                    type="text"
                    placeholder="ej. Santiago"
                    value={formData.comuna}
                    onChange={(e) => setFormData({ ...formData, comuna: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Correo de Contacto TIC</label>
                  <input
                    type="email"
                    required
                    placeholder="tic@colegio.cl"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+56 2 2345 6789"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
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
                  {editingInst ? 'Guardar Cambios' : 'Crear Institución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
